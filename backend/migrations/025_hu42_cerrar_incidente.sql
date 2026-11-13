-- =============================================================================
-- 025 · HU-42: cerrar el incidente con informe (y marcar la persona localizada)
-- Requiere: 017_hu39_asumir_coordinacion.sql (incidentes, treksafe_resultado_coordinacion),
-- 019_hu41_bitacora_incidente.sql (entradas_bitacora_incidente,
-- treksafe_anexar_entrada_bitacora_interna, treksafe_entrada_bitacora_repetida) y, por
-- ellas, 002_hu26_version_y_eventos_plan.sql. Roles de Supabase y perfiles_rescatista del
-- esquema base. Registra la aplicación solo si treksafe_migraciones existe.
-- No es re-ejecutable: CREATE TABLE y CREATE FUNCTION fallan si ya existen. Aplicar una
-- sola vez por entorno. Es SOLO ADITIVA: no hace ningún REVOKE sobre public.incidentes.
--
-- ORDEN: si la 021 (HU-40, transferir coordinación) va a aplicarse, aplicarla ANTES. Su
-- REVOKE UPDATE de tabla sobre incidentes retira también los privilegios de columna que
-- concede esta migración. Recuperación si la 021 se aplicó después de la 025:
--   GRANT UPDATE (estado, cerrado_en, version) ON public.incidentes TO service_role;
--
-- 1) public.informes_cierre_incidente: informe del cierre operativo del rescate. Uno por
--    incidente (UNIQUE incidente_id) e idempotente por comando_id. Solo se anexa: sin
--    UPDATE, sin DELETE directo (solo la cascada del ARCO del senderista: usuarios ->
--    expediciones -> incidentes -> informe), sin TRUNCATE. La hora la fija el servidor.
-- 2) treksafe_cerrar_incidente(...): RPC pública. Bloquea el incidente con FOR UPDATE desde
--    el principio (contrato de HU-41), autoriza contra el responsable vigente, exige el
--    estado 'localizado', anexa la entrada 'cierre' con la función interna de HU-41
--    (operacion_id = comando_id), inserta el informe y cierra con un solo UPDATE de
--    estado + cerrado_en + version (chk_incidentes_cierre). La repetición se resuelve ANTES
--    de autorizar: el reintento tras un error de red funciona aunque haya habido un relevo.
-- 3) treksafe_marcar_incidente_localizado(...): RPC pública. abierto -> localizado, solo el
--    responsable vigente, idempotente por operacion_id. Deja una nota fija en la bitácora.
-- 4) treksafe_leer_ultimo_cierre_incidente(expedicion): lectura del último informe de una
--    expedición (el detalle de la alerta lo necesita porque el incidente ya no está activo).
--
-- NO MODIFICA public.expediciones: el cierre es operativo; el retorno solo lo confirma el
-- senderista (HU-10). La expedición sigue en 'alerta' tras el cierre (CA-3).
--
-- Decisiones provisionales (pendientes de confirmar con Marko; D1 también con Jhon):
--   D1 catálogo de resultados, D2 estados desde los que se cierra, D3 texto de la nota.
--
-- Errores de negocio: RAISE EXCEPTION con el código en MESSAGE.
--   DATOS_INVALIDOS          parámetros nulos, resultado fuera del catálogo, resumen vacío
--                            o de más de 2000 caracteres
--   INCIDENTE_NO_ENCONTRADO  el incidente no existe
--   NO_ES_RESPONSABLE        el actor no es el responsable vigente; DETAIL lleva
--                            {"id": "...", "nombreCompleto": "..."} en JSON
--   INCIDENTE_NO_LOCALIZADO  se intenta cerrar un incidente que aún no está localizado
--   INCIDENTE_CERRADO        el incidente ya está cerrado (otro comando)
--   OPERACION_YA_REGISTRADA  el comando/operación ya se usó con otros datos o en otro tipo
--   INFORME_CIERRE_INMUTABLE (solo SQL, por trigger) UPDATE, DELETE directo o TRUNCATE
-- Ningún dato médico participa en esta migración.
-- =============================================================================
BEGIN;

DO $$
BEGIN
    IF to_regclass('public.incidentes') IS NULL THEN
        RAISE EXCEPTION '025 requiere la migración 017';
    END IF;
    IF to_regprocedure('public.treksafe_anexar_entrada_bitacora_interna(uuid,uuid,text,text,uuid,uuid)') IS NULL
       OR to_regprocedure('public.treksafe_entrada_bitacora_repetida(uuid,uuid,uuid,text,text,uuid)') IS NULL THEN
        RAISE EXCEPTION '025 requiere la migración 019';
    END IF;
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.treksafe_migraciones WHERE version = '025') THEN
            RAISE EXCEPTION '025 ya está registrada: no volver a aplicarla';
        END IF;
    END IF;
END
$$;

CREATE TABLE public.informes_cierre_incidente (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    incidente_id         UUID         NOT NULL,
    comando_id           UUID         NOT NULL,
    resultado            TEXT         NOT NULL,
    resumen              TEXT         NOT NULL,
    cerrado_por          UUID         NOT NULL,
    entrada_bitacora_id  UUID         NOT NULL,
    cerrado_en           TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp(),

    -- CASCADE: el borrado de la cuenta del senderista (ARCO) arrastra expedición,
    -- incidente, entradas e informe. El trigger solo deja pasar esa cascada.
    CONSTRAINT fk_informes_cierre_incidente
        FOREIGN KEY (incidente_id) REFERENCES public.incidentes (id)
        ON DELETE CASCADE,
    -- RESTRICT: no se pierde la autoría al borrar un perfil.
    CONSTRAINT fk_informes_cierre_autor
        FOREIGN KEY (cerrado_por) REFERENCES public.perfiles_rescatista (usuario_id)
        ON DELETE RESTRICT,
    -- Sin FK hacia entradas_bitacora_incidente: un FK entrante impediría el TRUNCATE de la
    -- bitácora antes de que su trigger lo rechace con ENTRADA_BITACORA_INMUTABLE (019).
    -- entrada_bitacora_id la fija la RPC con el id que devuelve la función interna de HU-41.
    CONSTRAINT uq_informes_cierre_incidente UNIQUE (incidente_id),
    CONSTRAINT uq_informes_cierre_comando UNIQUE (comando_id),
    CONSTRAINT chk_informes_cierre_resultado CHECK (resultado IN
        ('localizado_sin_asistencia', 'asistido_en_terreno', 'evacuado', 'falsa_alarma')),
    CONSTRAINT chk_informes_cierre_resumen
        CHECK (char_length(resumen) BETWEEN 1 AND 2000 AND resumen ~ '\S')
);

COMMENT ON TABLE public.informes_cierre_incidente IS
    'HU-42: informe del cierre operativo del rescate. Uno por incidente; solo se anexa. No confirma el retorno del senderista. No guarda datos médicos.';
COMMENT ON COLUMN public.informes_cierre_incidente.comando_id IS
    'UUID del cliente; hace idempotente el reintento. Es también el operacion_id de la entrada cierre de la bitácora.';
COMMENT ON COLUMN public.informes_cierre_incidente.resultado IS
    'Catálogo provisional (D1, pendiente de confirmar con Marko y Jhon): localizado_sin_asistencia | asistido_en_terreno | evacuado | falsa_alarma. Sin estado de salud.';
COMMENT ON COLUMN public.informes_cierre_incidente.entrada_bitacora_id IS
    'Entrada de tipo cierre de la bitácora del mismo incidente (la fija la RPC). Sin FK: ver el comentario de la tabla.';
COMMENT ON COLUMN public.informes_cierre_incidente.resumen IS
    'Texto libre del rescatista (1 a 2000 caracteres). La interfaz avisa de no incluir datos médicos.';
COMMENT ON COLUMN public.informes_cierre_incidente.cerrado_en IS
    'Hora del servidor (clock_timestamp en el trigger BEFORE INSERT); es la misma que incidentes.cerrado_en.';

ALTER TABLE public.informes_cierre_incidente ENABLE ROW LEVEL SECURITY;

CREATE POLICY treksafe_deny_anon_authenticated ON public.informes_cierre_incidente
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON public.informes_cierre_incidente FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.informes_cierre_incidente TO service_role;

-- Aditivo (sin REVOKE): el cierre y "localizado" escriben estado, cerrado_en y version.
-- Conserva UPDATE (version) de la 019 y lo que conceda la 021.
GRANT UPDATE (estado, cerrado_en, version) ON public.incidentes TO service_role;

-- ---------------------------------------------------------------------------
-- Triggers: hora del servidor y solo anexado.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.treksafe_informes_cierre_antes_de_insertar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    NEW.cerrado_en := clock_timestamp();
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.treksafe_informes_cierre_solo_anexado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'INFORME_CIERRE_INMUTABLE';
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- En la cascada el incidente ya no es visible; en DELETE directo sí.
        IF EXISTS (SELECT 1 FROM public.incidentes WHERE id = OLD.incidente_id) THEN
            RAISE EXCEPTION 'INFORME_CIERRE_INMUTABLE';
        END IF;
        RETURN OLD;
    END IF;

    -- TRUNCATE
    RAISE EXCEPTION 'INFORME_CIERRE_INMUTABLE';
END;
$$;

CREATE TRIGGER trg_informes_cierre_antes_de_insertar
    BEFORE INSERT ON public.informes_cierre_incidente
    FOR EACH ROW EXECUTE FUNCTION public.treksafe_informes_cierre_antes_de_insertar();

CREATE TRIGGER trg_informes_cierre_solo_anexado
    BEFORE UPDATE ON public.informes_cierre_incidente
    FOR EACH ROW EXECUTE FUNCTION public.treksafe_informes_cierre_solo_anexado();

CREATE TRIGGER trg_informes_cierre_sin_borrado
    BEFORE DELETE ON public.informes_cierre_incidente
    FOR EACH ROW EXECUTE FUNCTION public.treksafe_informes_cierre_solo_anexado();

CREATE TRIGGER trg_informes_cierre_sin_truncate
    BEFORE TRUNCATE ON public.informes_cierre_incidente
    FOR EACH STATEMENT EXECUTE FUNCTION public.treksafe_informes_cierre_solo_anexado();

REVOKE ALL ON FUNCTION public.treksafe_informes_cierre_antes_de_insertar()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.treksafe_informes_cierre_solo_anexado()
    FROM PUBLIC, anon, authenticated;

COMMENT ON TRIGGER trg_informes_cierre_antes_de_insertar ON public.informes_cierre_incidente IS
    'HU-42: fija cerrado_en = clock_timestamp() (hora del servidor).';
COMMENT ON TRIGGER trg_informes_cierre_solo_anexado ON public.informes_cierre_incidente IS
    'HU-42: rechaza todo UPDATE.';
COMMENT ON TRIGGER trg_informes_cierre_sin_borrado ON public.informes_cierre_incidente IS
    'HU-42: rechaza DELETE mientras el incidente exista; permite la cascada desde incidentes.';
COMMENT ON TRIGGER trg_informes_cierre_sin_truncate ON public.informes_cierre_incidente IS
    'HU-42: rechaza TRUNCATE.';

-- ---------------------------------------------------------------------------
-- Funciones auxiliares.
-- ---------------------------------------------------------------------------
-- Resultado JSONB de un informe. Lee expediciones.estado; nunca lo escribe.
CREATE FUNCTION public.treksafe_resultado_cierre_incidente(
    p_informe   public.informes_cierre_incidente,
    p_repetido  BOOLEAN
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'id', p_informe.id,
        'incidenteId', p_informe.incidente_id,
        'expedicionId', i.expedicion_id,
        'resultado', p_informe.resultado,
        'resumen', p_informe.resumen,
        'cerradoPor', jsonb_build_object(
            'id', p_informe.cerrado_por,
            'nombreCompleto', pr.nombre_completo
        ),
        'cerradoEn', p_informe.cerrado_en,
        'entradaBitacoraId', p_informe.entrada_bitacora_id,
        'estadoExpedicion', e.estado::text,
        'repetido', p_repetido
    )
    FROM public.incidentes i
    JOIN public.expediciones e ON e.id = i.expedicion_id
    LEFT JOIN public.perfiles_rescatista pr ON pr.usuario_id = p_informe.cerrado_por
    WHERE i.id = p_informe.incidente_id;
$$;

REVOKE ALL ON FUNCTION public.treksafe_resultado_cierre_incidente(public.informes_cierre_incidente, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_resultado_cierre_incidente(public.informes_cierre_incidente, BOOLEAN)
    TO service_role;
COMMENT ON FUNCTION public.treksafe_resultado_cierre_incidente(public.informes_cierre_incidente, BOOLEAN) IS
    'HU-42: arma el resultado JSONB de un informe de cierre. Solo lee la expedición.';

-- Resuelve la repetición de un cierre. p_resumen ya viene recortado. Devuelve el resultado
-- original (repetido = true), NULL si el comando es nuevo, o lanza OPERACION_YA_REGISTRADA
-- si el comando ya se usó con otros datos u otro actor.
CREATE FUNCTION public.treksafe_cierre_incidente_repetido(
    p_comando_id     UUID,
    p_incidente_id   UUID,
    p_rescatista_id  UUID,
    p_resultado      TEXT,
    p_resumen        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_inf  public.informes_cierre_incidente%ROWTYPE;
BEGIN
    SELECT * INTO v_inf FROM public.informes_cierre_incidente WHERE comando_id = p_comando_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    IF v_inf.incidente_id = p_incidente_id
       AND v_inf.cerrado_por = p_rescatista_id
       AND v_inf.resultado = p_resultado
       AND v_inf.resumen = p_resumen THEN
        RETURN public.treksafe_resultado_cierre_incidente(v_inf, TRUE);
    END IF;
    RAISE EXCEPTION 'OPERACION_YA_REGISTRADA';
END;
$$;

REVOKE ALL ON FUNCTION public.treksafe_cierre_incidente_repetido(UUID, UUID, UUID, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_cierre_incidente_repetido(UUID, UUID, UUID, TEXT, TEXT)
    TO service_role;
COMMENT ON FUNCTION public.treksafe_cierre_incidente_repetido(UUID, UUID, UUID, TEXT, TEXT) IS
    'HU-42: resuelve la repetición de un cierre por comando_id (resultado original, NULL u OPERACION_YA_REGISTRADA).';

-- ---------------------------------------------------------------------------
-- RPC pública: cerrar el incidente (CA-1, CA-2, CA-3).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.treksafe_cerrar_incidente(
    p_incidente_id   UUID,
    p_rescatista_id  UUID,
    p_resultado      TEXT,
    p_resumen        TEXT,
    p_comando_id     UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_inc      public.incidentes%ROWTYPE;
    v_inf      public.informes_cierre_incidente%ROWTYPE;
    v_resumen  TEXT;
    v_res      JSONB;
    v_ent      JSONB;
BEGIN
    IF p_incidente_id IS NULL OR p_rescatista_id IS NULL OR p_resultado IS NULL
       OR p_resumen IS NULL OR p_comando_id IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;
    IF p_resultado NOT IN ('localizado_sin_asistencia', 'asistido_en_terreno', 'evacuado', 'falsa_alarma') THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;
    v_resumen := btrim(p_resumen, E' \t\r\n');
    IF char_length(v_resumen) NOT BETWEEN 1 AND 2000 OR v_resumen !~ '\S' THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 1) Repetición antes de autorizar (sobrevive a un relevo posterior).
    v_res := public.treksafe_cierre_incidente_repetido(
        p_comando_id, p_incidente_id, p_rescatista_id, p_resultado, v_resumen);
    IF v_res IS NOT NULL THEN
        RETURN v_res;
    END IF;

    -- 2) FOR UPDATE desde el inicio (contrato de HU-41: no subir desde FOR SHARE).
    --    Solo se bloquea la fila del incidente, nunca expediciones.
    SELECT * INTO v_inc FROM public.incidentes WHERE id = p_incidente_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'INCIDENTE_NO_ENCONTRADO';
    END IF;
    IF v_inc.estado = 'cerrado' THEN
        -- Carrera con el mismo comando: la otra transacción ya confirmó (instantánea nueva
        -- por sentencia en READ COMMITTED).
        v_res := public.treksafe_cierre_incidente_repetido(
            p_comando_id, p_incidente_id, p_rescatista_id, p_resultado, v_resumen);
        IF v_res IS NOT NULL THEN
            RETURN v_res;
        END IF;
        RAISE EXCEPTION 'INCIDENTE_CERRADO';
    END IF;
    IF v_inc.responsable_id <> p_rescatista_id THEN
        RAISE EXCEPTION 'NO_ES_RESPONSABLE'
            USING DETAIL = (public.treksafe_resultado_coordinacion(v_inc, TRUE)->'responsable')::text;
    END IF;
    IF v_inc.estado <> 'localizado' THEN  -- D2
        RAISE EXCEPTION 'INCIDENTE_NO_LOCALIZADO';
    END IF;

    -- 3) Entrada 'cierre' (operacion_id = comando_id): unicidad entre tipos y un cierre por incidente.
    v_ent := public.treksafe_anexar_entrada_bitacora_interna(
        p_incidente_id, p_rescatista_id, 'cierre', v_resumen, NULL, p_comando_id);
    IF (v_ent->>'repetido')::BOOLEAN THEN
        -- Estado inconsistente: no había informe pero sí una entrada igual. Se rechaza.
        RAISE EXCEPTION 'OPERACION_YA_REGISTRADA';
    END IF;

    -- 4) Informe (cerrado_en lo fija el trigger).
    BEGIN
        INSERT INTO public.informes_cierre_incidente
            (incidente_id, comando_id, resultado, resumen, cerrado_por, entrada_bitacora_id)
        VALUES
            (p_incidente_id, p_comando_id, p_resultado, v_resumen, p_rescatista_id, (v_ent->>'id')::UUID)
        RETURNING * INTO v_inf;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'OPERACION_YA_REGISTRADA';
    END;

    -- 5) Un solo UPDATE (chk_incidentes_cierre). NO se toca public.expediciones.
    UPDATE public.incidentes
       SET estado = 'cerrado', cerrado_en = v_inf.cerrado_en, version = version + 1
     WHERE id = p_incidente_id;

    RETURN public.treksafe_resultado_cierre_incidente(v_inf, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.treksafe_cerrar_incidente(UUID, UUID, TEXT, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_cerrar_incidente(UUID, UUID, TEXT, TEXT, UUID)
    TO service_role;
COMMENT ON FUNCTION public.treksafe_cerrar_incidente(UUID, UUID, TEXT, TEXT, UUID) IS
    'HU-42: el responsable vigente cierra un incidente localizado con un informe. Una transacción, fila bloqueada FOR UPDATE, idempotente por comando_id. No modifica expediciones.';

-- ---------------------------------------------------------------------------
-- RPC pública: marcar la persona localizada (abierto -> localizado). D2 y D3.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.treksafe_marcar_incidente_localizado(
    p_incidente_id   UUID,
    p_rescatista_id  UUID,
    p_operacion_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    c_texto CONSTANT TEXT := 'Persona localizada. El incidente pasa a estado localizado.';  -- D3
    v_inc   public.incidentes%ROWTYPE;
    v_res   JSONB;
BEGIN
    IF p_incidente_id IS NULL OR p_rescatista_id IS NULL OR p_operacion_id IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- Repetición (por la entrada de la bitácora). Lanza OPERACION_YA_REGISTRADA si el UUID
    -- ya se usó con otro contenido, otro actor o en otro tipo de operación.
    v_res := public.treksafe_entrada_bitacora_repetida(
        p_operacion_id, p_incidente_id, p_rescatista_id, 'nota', c_texto, NULL);
    IF v_res IS NOT NULL THEN
        SELECT * INTO v_inc FROM public.incidentes WHERE id = p_incidente_id;
        RETURN public.treksafe_resultado_coordinacion(v_inc, TRUE);
    END IF;
    IF EXISTS (SELECT 1 FROM public.informes_cierre_incidente WHERE comando_id = p_operacion_id) THEN
        RAISE EXCEPTION 'OPERACION_YA_REGISTRADA';
    END IF;

    SELECT * INTO v_inc FROM public.incidentes WHERE id = p_incidente_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'INCIDENTE_NO_ENCONTRADO';
    END IF;
    IF v_inc.estado = 'cerrado' THEN
        RAISE EXCEPTION 'INCIDENTE_CERRADO';
    END IF;
    IF v_inc.responsable_id <> p_rescatista_id THEN
        RAISE EXCEPTION 'NO_ES_RESPONSABLE'
            USING DETAIL = (public.treksafe_resultado_coordinacion(v_inc, TRUE)->'responsable')::text;
    END IF;
    IF v_inc.estado = 'localizado' THEN
        RETURN public.treksafe_resultado_coordinacion(v_inc, TRUE);
    END IF;

    PERFORM public.treksafe_anexar_entrada_bitacora_interna(
        p_incidente_id, p_rescatista_id, 'nota', c_texto, NULL, p_operacion_id);
    UPDATE public.incidentes
       SET estado = 'localizado', version = version + 1
     WHERE id = p_incidente_id
    RETURNING * INTO v_inc;

    RETURN public.treksafe_resultado_coordinacion(v_inc, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.treksafe_marcar_incidente_localizado(UUID, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_marcar_incidente_localizado(UUID, UUID, UUID)
    TO service_role;
COMMENT ON FUNCTION public.treksafe_marcar_incidente_localizado(UUID, UUID, UUID) IS
    'HU-42: el responsable vigente marca la persona localizada (abierto -> localizado) y deja una nota fija en la bitácora. Idempotente por operacion_id.';

-- ---------------------------------------------------------------------------
-- Lectura: último cierre de una expedición (detalle de la alerta tras el cierre).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.treksafe_leer_ultimo_cierre_incidente(p_expedicion_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_inf  public.informes_cierre_incidente%ROWTYPE;
BEGIN
    IF p_expedicion_id IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;
    SELECT f.* INTO v_inf
    FROM public.informes_cierre_incidente f
    JOIN public.incidentes i ON i.id = f.incidente_id
    WHERE i.expedicion_id = p_expedicion_id
    ORDER BY f.cerrado_en DESC, f.id DESC
    LIMIT 1;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    RETURN public.treksafe_resultado_cierre_incidente(v_inf, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.treksafe_leer_ultimo_cierre_incidente(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_leer_ultimo_cierre_incidente(UUID)
    TO service_role;
COMMENT ON FUNCTION public.treksafe_leer_ultimo_cierre_incidente(UUID) IS
    'HU-42: informe de cierre más reciente de una expedición, o NULL.';

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('025', 'hu42_cerrar_incidente', 'HU-42')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;
