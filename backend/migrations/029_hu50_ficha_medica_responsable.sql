-- =============================================================================
-- 029 · HU-50: ficha médica solo para el responsable vigente de un incidente abierto
-- Requiere: el esquema base (fichas_medicas, perfiles_rescatista, expediciones), 016
-- (avances_expedicion) y 017 (incidentes). Se recomienda aplicarla DESPUÉS de la 021
-- (HU-40) y de la 025 (HU-42): la 021 hace REVOKE UPDATE de tabla sobre incidentes y
-- retiraría los privilegios de columna que concede esta migración. Registra la aplicación
-- solo si treksafe_migraciones existe.
-- No es re-ejecutable: CREATE TABLE y CREATE FUNCTION fallan si ya existen. Aplicar una
-- sola vez por entorno. Es ADITIVA: no hace ningún REVOKE sobre public.incidentes.
--
-- 1) public.accesos_ficha_medica: auditoría de TODO intento de consultar la ficha médica
--    de un incidente (permitido o denegado). Solo se anexa: sin UPDATE, sin DELETE directo
--    (solo la cascada del ARCO del senderista: usuarios -> accesos), sin TRUNCATE. La hora
--    la fija el servidor. No guarda ningún dato de salud.
-- 2) treksafe_contexto_ficha_medica(incidente, actor): datos para DECIDIR (sin salud).
--    La regla de autorización vive solo en el dominio (AutorizadorFichaIncidente).
-- 3) treksafe_leer_ficha_cifrada_responsable(incidente, actor): guarda de SQL. Bloquea el
--    incidente con FOR SHARE (se serializa con el relevo de HU-40 y el cierre de HU-42) y
--    devuelve el texto cifrado SOLO si el actor sigue siendo el responsable de un incidente
--    no cerrado. NULL en otro caso (el backend lo traduce a CONTEXTO_CAMBIADO).
-- 4) treksafe_registrar_acceso_ficha_medica(...): anexa una fila de auditoría. No hace
--    comprobaciones de negocio; solo coherencia del catálogo.
-- 5) treksafe_anonimizar_notas_avance(...): ARCO. Limpia avances_expedicion.nota (texto
--    libre) de las expediciones completadas o canceladas del senderista. SECURITY DEFINER
--    porque service_role no tiene ningún privilegio sobre avances_expedicion (016): mismo
--    patrón que las RPC de esa migración (search_path = pg_catalog, pg_temp, todo calificado).
--
-- GRANT aditivo: SELECT ... FOR SHARE sobre incidentes exige, además de SELECT, el
-- privilegio UPDATE sobre al menos una columna (aviso de la 019). Se concede (version).
--
-- Errores de negocio: RAISE EXCEPTION con el código en MESSAGE.
--   DATOS_INVALIDOS          parámetros nulos o fuera del catálogo
--   ACCESO_FICHA_INMUTABLE   (solo SQL, por trigger) UPDATE, DELETE directo o TRUNCATE
-- Las RPC 2 y 3 nunca escriben datos de salud. Solo la RPC 3 los devuelve (cifrados).
-- =============================================================================
BEGIN;

DO $$
BEGIN
    IF to_regclass('public.incidentes') IS NULL THEN
        RAISE EXCEPTION '029 requiere la migración 017';
    END IF;
    IF to_regclass('public.avances_expedicion') IS NULL THEN
        RAISE EXCEPTION '029 requiere la migración 016';
    END IF;
    IF to_regclass('public.fichas_medicas') IS NULL THEN
        RAISE EXCEPTION '029 requiere el esquema base';
    END IF;
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.treksafe_migraciones WHERE version = '029') THEN
        RAISE EXCEPTION '029 ya está registrada: no volver a aplicarla';
    END IF;
END
$$;

CREATE TABLE public.accesos_ficha_medica (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    incidente_id   UUID         NOT NULL,
    expedicion_id  UUID,
    senderista_id  UUID,
    actor_id       UUID         NOT NULL,
    resultado      TEXT         NOT NULL,
    motivo         TEXT         NOT NULL,
    registrado_en  TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp(),

    -- CASCADE: el borrado de la cuenta del senderista (ARCO) arrastra su auditoría.
    -- incidente_id, expedicion_id y actor_id no llevan FK: la auditoría no debe impedir
    -- borrar incidentes, expediciones ni perfiles, ni depender de que existan.
    CONSTRAINT fk_accesos_ficha_senderista FOREIGN KEY (senderista_id)
        REFERENCES public.usuarios (id) ON DELETE CASCADE,
    CONSTRAINT chk_accesos_ficha_resultado CHECK (resultado IN ('permitido', 'denegado')),
    CONSTRAINT chk_accesos_ficha_motivo CHECK (motivo IN ('RESPONSABLE_VIGENTE', 'NO_ES_RESCATISTA',
        'INCIDENTE_NO_ENCONTRADO', 'INCIDENTE_CERRADO', 'NO_ES_RESPONSABLE', 'SIN_CONSENTIMIENTO', 'CONTEXTO_CAMBIADO')),
    CONSTRAINT chk_accesos_ficha_coherencia CHECK ((resultado = 'permitido') = (motivo = 'RESPONSABLE_VIGENTE')),
    CONSTRAINT chk_accesos_ficha_permitido_completo
        CHECK (resultado <> 'permitido' OR (expedicion_id IS NOT NULL AND senderista_id IS NOT NULL))
);

CREATE INDEX idx_accesos_ficha_incidente  ON public.accesos_ficha_medica (incidente_id, registrado_en DESC);
CREATE INDEX idx_accesos_ficha_senderista ON public.accesos_ficha_medica (senderista_id, registrado_en DESC);
CREATE INDEX idx_accesos_ficha_actor      ON public.accesos_ficha_medica (actor_id, registrado_en DESC);

COMMENT ON TABLE public.accesos_ficha_medica IS
    'HU-50: accesos permitidos y denegados a la ficha médica. Sin datos de salud. Solo anexado.';
COMMENT ON COLUMN public.accesos_ficha_medica.incidente_id IS
    'HU-50: incidente consultado. Sin FK: se audita también un incidente inexistente.';
COMMENT ON COLUMN public.accesos_ficha_medica.expedicion_id IS
    'HU-50: expedición del incidente; NULL si el incidente no existía. Sin FK.';
COMMENT ON COLUMN public.accesos_ficha_medica.senderista_id IS
    'HU-50: dueño de la ficha; NULL si el incidente no existía. FK con ON DELETE CASCADE (ARCO).';
COMMENT ON COLUMN public.accesos_ficha_medica.actor_id IS
    'HU-50: usuario que consultó (sale del JWT). Sin FK.';
COMMENT ON COLUMN public.accesos_ficha_medica.resultado IS
    'HU-50: permitido | denegado.';
COMMENT ON COLUMN public.accesos_ficha_medica.motivo IS
    'HU-50: RESPONSABLE_VIGENTE para permitido; para denegado, el motivo de la regla del dominio o CONTEXTO_CAMBIADO.';
COMMENT ON COLUMN public.accesos_ficha_medica.registrado_en IS
    'HU-50: hora del servidor (clock_timestamp en el trigger BEFORE INSERT).';

ALTER TABLE public.accesos_ficha_medica ENABLE ROW LEVEL SECURITY;

CREATE POLICY treksafe_deny_anon_authenticated ON public.accesos_ficha_medica
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON public.accesos_ficha_medica FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.accesos_ficha_medica TO service_role;

-- Aditivo (sin REVOKE): FOR SHARE sobre incidentes exige UPDATE en alguna columna (aviso de la 019).
GRANT UPDATE (version) ON public.incidentes TO service_role;

-- ---------------------------------------------------------------------------
-- Triggers: hora del servidor y solo anexado (patrón de la 025).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.treksafe_accesos_ficha_antes_de_insertar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    NEW.registrado_en := clock_timestamp();
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.treksafe_accesos_ficha_solo_anexado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'ACCESO_FICHA_INMUTABLE';
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- En la cascada del ARCO la cuenta del senderista ya no es visible; en un DELETE
        -- directo sí (o el senderista es NULL: esa fila no se borra nunca).
        IF OLD.senderista_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = OLD.senderista_id) THEN
            RETURN OLD;
        END IF;
        RAISE EXCEPTION 'ACCESO_FICHA_INMUTABLE';
    END IF;

    -- TRUNCATE
    RAISE EXCEPTION 'ACCESO_FICHA_INMUTABLE';
END;
$$;

CREATE TRIGGER trg_accesos_ficha_antes_de_insertar
    BEFORE INSERT ON public.accesos_ficha_medica
    FOR EACH ROW EXECUTE FUNCTION public.treksafe_accesos_ficha_antes_de_insertar();

CREATE TRIGGER trg_accesos_ficha_solo_anexado
    BEFORE UPDATE ON public.accesos_ficha_medica
    FOR EACH ROW EXECUTE FUNCTION public.treksafe_accesos_ficha_solo_anexado();

CREATE TRIGGER trg_accesos_ficha_sin_borrado
    BEFORE DELETE ON public.accesos_ficha_medica
    FOR EACH ROW EXECUTE FUNCTION public.treksafe_accesos_ficha_solo_anexado();

CREATE TRIGGER trg_accesos_ficha_sin_truncate
    BEFORE TRUNCATE ON public.accesos_ficha_medica
    FOR EACH STATEMENT EXECUTE FUNCTION public.treksafe_accesos_ficha_solo_anexado();

REVOKE ALL ON FUNCTION public.treksafe_accesos_ficha_antes_de_insertar()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.treksafe_accesos_ficha_solo_anexado()
    FROM PUBLIC, anon, authenticated;

COMMENT ON TRIGGER trg_accesos_ficha_antes_de_insertar ON public.accesos_ficha_medica IS
    'HU-50: fija registrado_en = clock_timestamp() (hora del servidor).';
COMMENT ON TRIGGER trg_accesos_ficha_solo_anexado ON public.accesos_ficha_medica IS
    'HU-50: rechaza todo UPDATE.';
COMMENT ON TRIGGER trg_accesos_ficha_sin_borrado ON public.accesos_ficha_medica IS
    'HU-50: rechaza DELETE mientras exista la cuenta del senderista; permite la cascada del ARCO.';
COMMENT ON TRIGGER trg_accesos_ficha_sin_truncate ON public.accesos_ficha_medica IS
    'HU-50: rechaza TRUNCATE.';

-- ---------------------------------------------------------------------------
-- RPC 1: contexto de decisión (sin datos de salud).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.treksafe_contexto_ficha_medica(
    p_incidente_id  UUID,
    p_actor_id      UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_rescatista  BOOLEAN;
    v_inc         public.incidentes%ROWTYPE;
    v_senderista  UUID;
    v_consent     BOOLEAN;
BEGIN
    IF p_incidente_id IS NULL OR p_actor_id IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    v_rescatista := EXISTS (SELECT 1 FROM public.perfiles_rescatista WHERE usuario_id = p_actor_id);

    -- Sin bloqueo: la guarda de la RPC 2 es la que serializa con relevo y cierre.
    SELECT * INTO v_inc FROM public.incidentes WHERE id = p_incidente_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'actorEsRescatista', v_rescatista,
            'incidente', NULL,
            'consentimientoVigente', FALSE
        );
    END IF;

    SELECT e.senderista_id INTO v_senderista FROM public.expediciones e WHERE e.id = v_inc.expedicion_id;
    v_consent := EXISTS (
        SELECT 1 FROM public.fichas_medicas f
        WHERE f.senderista_id = v_senderista AND f.consentimiento_firmado
    );

    -- NUNCA devuelve tipo_sangre ni condiciones_encriptadas.
    RETURN jsonb_build_object(
        'actorEsRescatista', v_rescatista,
        'consentimientoVigente', v_consent,
        'incidente', jsonb_build_object(
            'id', v_inc.id,
            'expedicionId', v_inc.expedicion_id,
            'senderistaId', v_senderista,
            'estado', v_inc.estado,
            'responsableId', v_inc.responsable_id
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.treksafe_contexto_ficha_medica(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_contexto_ficha_medica(UUID, UUID)
    TO service_role;
COMMENT ON FUNCTION public.treksafe_contexto_ficha_medica(UUID, UUID) IS
    'HU-50: contexto para decidir el acceso a la ficha (rescatista, incidente, responsable, consentimiento). Nunca devuelve datos de salud.';

-- ---------------------------------------------------------------------------
-- RPC 2: guarda de SQL. Texto cifrado solo si el actor sigue siendo el responsable.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.treksafe_leer_ficha_cifrada_responsable(
    p_incidente_id  UUID,
    p_actor_id      UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_inc    public.incidentes%ROWTYPE;
    v_ficha  public.fichas_medicas%ROWTYPE;
BEGIN
    IF p_incidente_id IS NULL OR p_actor_id IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- FOR SHARE: espera al relevo (HU-40) o al cierre (HU-42) en curso y lee la fila ya
    -- confirmada (READ COMMITTED reevalúa la fila bloqueada).
    SELECT * INTO v_inc FROM public.incidentes WHERE id = p_incidente_id FOR SHARE;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    IF v_inc.estado = 'cerrado' OR v_inc.responsable_id IS DISTINCT FROM p_actor_id THEN
        RETURN NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.perfiles_rescatista WHERE usuario_id = p_actor_id) THEN
        RETURN NULL;
    END IF;

    SELECT f.* INTO v_ficha
    FROM public.fichas_medicas f
    JOIN public.expediciones e ON e.senderista_id = f.senderista_id
    WHERE e.id = v_inc.expedicion_id AND f.consentimiento_firmado;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object('tipoSangre', v_ficha.tipo_sangre, 'cargaCifrada', v_ficha.condiciones_encriptadas);
END;
$$;

REVOKE ALL ON FUNCTION public.treksafe_leer_ficha_cifrada_responsable(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_leer_ficha_cifrada_responsable(UUID, UUID)
    TO service_role;
COMMENT ON FUNCTION public.treksafe_leer_ficha_cifrada_responsable(UUID, UUID) IS
    'HU-50: texto cifrado de la ficha solo si el actor es el responsable vigente de un incidente no cerrado (fila bloqueada FOR SHARE). NULL en otro caso. El descifrado ocurre fuera de la base.';

-- ---------------------------------------------------------------------------
-- RPC 3: auditoría del acceso.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.treksafe_registrar_acceso_ficha_medica(
    p_incidente_id  UUID,
    p_actor_id      UUID,
    p_resultado     TEXT,
    p_motivo        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_exp   UUID;
    v_sen   UUID;
    v_fila  public.accesos_ficha_medica%ROWTYPE;
BEGIN
    IF p_incidente_id IS NULL OR p_actor_id IS NULL OR p_resultado IS NULL OR p_motivo IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;
    IF p_resultado NOT IN ('permitido', 'denegado')
       OR p_motivo NOT IN ('RESPONSABLE_VIGENTE', 'NO_ES_RESCATISTA', 'INCIDENTE_NO_ENCONTRADO',
                           'INCIDENTE_CERRADO', 'NO_ES_RESPONSABLE', 'SIN_CONSENTIMIENTO', 'CONTEXTO_CAMBIADO')
       OR (p_resultado = 'permitido') <> (p_motivo = 'RESPONSABLE_VIGENTE') THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    SELECT i.expedicion_id, e.senderista_id INTO v_exp, v_sen
    FROM public.incidentes i
    JOIN public.expediciones e ON e.id = i.expedicion_id
    WHERE i.id = p_incidente_id;

    INSERT INTO public.accesos_ficha_medica (incidente_id, expedicion_id, senderista_id, actor_id, resultado, motivo)
    VALUES (p_incidente_id, v_exp, v_sen, p_actor_id, p_resultado, p_motivo)
    RETURNING * INTO v_fila;

    RETURN jsonb_build_object(
        'id', v_fila.id,
        'incidenteId', v_fila.incidente_id,
        'expedicionId', v_fila.expedicion_id,
        'senderistaId', v_fila.senderista_id,
        'actorId', v_fila.actor_id,
        'resultado', v_fila.resultado,
        'motivo', v_fila.motivo,
        'registradoEn', v_fila.registrado_en
    );
END;
$$;

REVOKE ALL ON FUNCTION public.treksafe_registrar_acceso_ficha_medica(UUID, UUID, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_registrar_acceso_ficha_medica(UUID, UUID, TEXT, TEXT)
    TO service_role;
COMMENT ON FUNCTION public.treksafe_registrar_acceso_ficha_medica(UUID, UUID, TEXT, TEXT) IS
    'HU-50: anexa una fila de auditoría (permitido o denegado) con la hora del servidor. No decide: el dominio decide.';

-- ---------------------------------------------------------------------------
-- RPC 4 (ARCO): anonimizar las notas de avance de las expediciones cerradas.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: service_role no tiene ningún privilegio sobre avances_expedicion (016).
-- Mismo patrón que las RPC de la 016: search_path = pg_catalog, pg_temp y nombres calificados.
CREATE FUNCTION public.treksafe_anonimizar_notas_avance(
    p_senderista_id   UUID,
    p_expedicion_ids  UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_n INTEGER;
BEGIN
    IF p_senderista_id IS NULL OR p_expedicion_ids IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    UPDATE public.avances_expedicion a
       SET nota = NULL
      FROM public.expediciones e
     WHERE a.expedicion_id = e.id
       AND a.senderista_id = p_senderista_id
       AND e.senderista_id = p_senderista_id
       AND e.id = ANY (p_expedicion_ids)
       AND e.estado::text IN ('completada', 'cancelada')
       AND a.nota IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.treksafe_anonimizar_notas_avance(UUID, UUID[])
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.treksafe_anonimizar_notas_avance(UUID, UUID[])
    TO service_role;
COMMENT ON FUNCTION public.treksafe_anonimizar_notas_avance(UUID, UUID[]) IS
    'HU-50 (ARCO): deja en NULL la nota libre de los avances del senderista en sus expediciones completadas o canceladas. Devuelve cuántas limpió.';

COMMENT ON TABLE public.auditoria_acceso_medico IS
    'Legado (HU-18). Desde HU-50 los accesos se registran en accesos_ficha_medica; esta tabla ya no se escribe.';

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('029', 'hu50_ficha_medica_responsable', 'HU-50')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;
