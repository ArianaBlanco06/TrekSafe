-- =============================================================================
-- 019 · HU-41: bitácora cronológica del incidente (tabla solo anexada + RPC)
-- Requiere: 017_hu39_asumir_coordinacion.sql (incidentes, treksafe_resultado_coordinacion)
-- y 002_hu26_version_y_eventos_plan.sql (eventos_plan, para la idempotencia entre tipos
-- de operación). Roles de Supabase y perfiles_rescatista del esquema base.
-- No depende de 000: registra la aplicación solo si treksafe_migraciones existe.
-- No es re-ejecutable: CREATE TABLE falla si la tabla ya existe, para no ocultar
-- diferencias de esquema. Aplicar una sola vez por entorno.
--
-- 1) public.entradas_bitacora_incidente: entradas de la bitácora compartida del incidente.
--    Solo se anexan: sin UPDATE, sin DELETE directo (solo la cascada del ARCO del
--    senderista: usuarios -> expediciones -> incidentes -> entradas), sin TRUNCATE.
--    La hora (registrada_en) la fija el servidor con clock_timestamp(); el orden estable
--    es (registrada_en, secuencia). Una corrección es una entrada nueva de tipo
--    'correccion' que apunta a la original; la original no cambia.
--    Tipos: 'nota' y 'correccion' (RPC pública de HU-41) y 'cierre' (reservado para
--    HU-42, con un único cierre por incidente).
--
-- 2) treksafe_agregar_entrada_bitacora(...): RPC pública. Autoriza contra el responsable
--    vigente (incidentes.responsable_id) leído con la fila bloqueada (FOR SHARE), de modo
--    que el relevo (HU-40) o el cierre (HU-42), que hacen UPDATE de esa fila, se
--    serializan con la escritura: no hay carrera entre "soy responsable" y "escribo".
--    Idempotente por operacion_id; la repetición se resuelve ANTES de autorizar para que
--    el reintento tras un error de red funcione aunque haya habido un relevo o un cierre.
--
-- 3) treksafe_anexar_entrada_bitacora_interna(...): REUTILIZABLE POR HU-42 (y HU-40).
--    No valida estado ni responsable: quien la llama ya autorizó y comprobó el estado.
--    Así HU-42 anexa el 'cierre' en la misma transacción que el UPDATE a 'cerrado'.
--    Ver "Contrato para HU-42" en docs/hu-41/diseno.md.
--
-- PRIVILEGIO DE COLUMNA SOBRE incidentes: SELECT ... FOR SHARE exige, además de SELECT,
-- el privilegio UPDATE sobre al menos una columna (documentación de PostgreSQL, ddl-priv).
-- Se concede explícitamente UPDATE (version) a service_role. HU-40 y HU-42: si hacen
-- REVOKE UPDATE de tabla sobre incidentes, deben volver a conceder al menos esta columna.
--
-- Errores de negocio: RAISE EXCEPTION con el código en MESSAGE.
--   DATOS_INVALIDOS          parámetros nulos, texto vacío o de más de 2000 caracteres,
--                            tipo inválido o tipo incoherente con corrige_entrada_id
--   CORRECCION_INVALIDA      la entrada a corregir no existe o es de otro incidente
--   NO_ES_RESPONSABLE        el autor no es el responsable vigente; DETAIL lleva
--                            {"id": "...", "nombreCompleto": "..."} en JSON
--   INCIDENTE_NO_ENCONTRADO  el incidente no existe
--   INCIDENTE_CERRADO        escritura sobre un incidente cerrado
--   OPERACION_YA_REGISTRADA  el operacion_id ya se usó con otro contenido o actor, o en
--                            otro tipo de operación; también un segundo 'cierre'
--   ENTRADA_BITACORA_INMUTABLE (solo SQL, por trigger) UPDATE, DELETE directo o TRUNCATE
-- Resultado JSONB: id, incidenteId, tipo, texto, autor {id, nombreCompleto},
-- registradaEn, corrigeEntradaId y repetido (true si no se escribió nada nuevo).
-- Ningún dato médico participa en esta migración.
-- =============================================================================
BEGIN;

CREATE TABLE public.entradas_bitacora_incidente (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    secuencia           BIGINT       GENERATED ALWAYS AS IDENTITY,
    incidente_id        UUID         NOT NULL,
    autor_id            UUID         NOT NULL,
    tipo                TEXT         NOT NULL,
    texto               TEXT         NOT NULL,
    corrige_entrada_id  UUID,
    operacion_id        UUID         NOT NULL,
    registrada_en       TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp(),

    -- CASCADE: el borrado de la cuenta del senderista (ARCO) arrastra expedición,
    -- incidente y entradas. El trigger solo deja pasar esa cascada.
    CONSTRAINT fk_entradas_bitacora_incidente
        FOREIGN KEY (incidente_id) REFERENCES public.incidentes (id)
        ON DELETE CASCADE,
    -- RESTRICT: no se pierde la autoría al borrar un perfil (igual que incidentes.responsable_id).
    CONSTRAINT fk_entradas_bitacora_autor
        FOREIGN KEY (autor_id) REFERENCES public.perfiles_rescatista (usuario_id)
        ON DELETE RESTRICT,
    CONSTRAINT uq_entradas_bitacora_secuencia UNIQUE (secuencia),
    CONSTRAINT uq_entradas_bitacora_operacion UNIQUE (operacion_id),
    CONSTRAINT uq_entradas_bitacora_incidente_id UNIQUE (incidente_id, id),
    -- La corrección pertenece al mismo incidente (MATCH SIMPLE: con NULL no se comprueba).
    CONSTRAINT fk_entradas_bitacora_corrige
        FOREIGN KEY (incidente_id, corrige_entrada_id)
        REFERENCES public.entradas_bitacora_incidente (incidente_id, id),
    CONSTRAINT chk_entradas_bitacora_tipo CHECK (tipo IN ('nota', 'correccion', 'cierre')),
    CONSTRAINT chk_entradas_bitacora_correccion
        CHECK ((tipo = 'correccion') = (corrige_entrada_id IS NOT NULL)),
    CONSTRAINT chk_entradas_bitacora_texto
        CHECK (char_length(texto) BETWEEN 1 AND 2000 AND texto ~ '\S')
);

COMMENT ON TABLE public.entradas_bitacora_incidente IS
    'HU-41: bitácora cronológica compartida del incidente. Solo se anexa; la hora la fija el servidor; orden (registrada_en, secuencia). No guarda datos médicos.';
COMMENT ON COLUMN public.entradas_bitacora_incidente.secuencia IS
    'Desempate estable del orden cronológico cuando registrada_en coincide.';
COMMENT ON COLUMN public.entradas_bitacora_incidente.tipo IS
    'nota | correccion (HU-41) | cierre (reservado para HU-42; un solo cierre por incidente).';
COMMENT ON COLUMN public.entradas_bitacora_incidente.autor_id IS
    'Rescatista que escribió la entrada. No cambia si luego se relevó la coordinación.';
COMMENT ON COLUMN public.entradas_bitacora_incidente.corrige_entrada_id IS
    'Entrada del mismo incidente a la que corrige esta entrada; la original no se modifica.';
COMMENT ON COLUMN public.entradas_bitacora_incidente.operacion_id IS
    'UUID del cliente; hace idempotente el reintento tras un error de red.';
COMMENT ON COLUMN public.entradas_bitacora_incidente.registrada_en IS
    'Hora del servidor (clock_timestamp en el trigger BEFORE INSERT); el cliente no la envía.';

CREATE INDEX idx_entradas_bitacora_orden
    ON public.entradas_bitacora_incidente (incidente_id, registrada_en, secuencia);

-- Un solo cierre por incidente (HU-42; el esquema ya lo garantiza).
CREATE UNIQUE INDEX uq_entradas_bitacora_un_cierre
    ON public.entradas_bitacora_incidente (incidente_id)
    WHERE tipo = 'cierre';

ALTER TABLE public.entradas_bitacora_incidente ENABLE ROW LEVEL SECURITY;

CREATE POLICY treksafe_deny_anon_authenticated ON public.entradas_bitacora_incidente
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- En Supabase service_role recibe privilegios por defecto: se retiran y se concede solo lo necesario.
REVOKE ALL ON public.entradas_bitacora_incidente FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.entradas_bitacora_incidente TO service_role;
REVOKE ALL ON SEQUENCE public.entradas_bitacora_incidente_secuencia_seq
    FROM PUBLIC, anon, authenticated;

-- SELECT ... FOR SHARE sobre incidentes exige UPDATE en al menos una columna.
GRANT UPDATE (version) ON public.incidentes TO service_role;
COMMENT ON COLUMN public.incidentes.version IS
    'Control optimista de concurrencia para relevo y cierre (HU-40, HU-42). Empieza en 1. HU-41: service_role necesita UPDATE (version) para el bloqueo FOR SHARE; si HU-40 o HU-42 hacen REVOKE UPDATE de tabla, deben volver a conceder al menos esta columna.';

-- ---------------------------------------------------------------------------
-- Triggers: hora del servidor y solo anexado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.treksafe_entradas_bitacora_antes_de_insertar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    -- clock_timestamp() se toma después de obtener el bloqueo del incidente, por lo que se
    -- acerca al orden de commit; la secuencia desempata de forma determinista.
    NEW.registrada_en := clock_timestamp();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.treksafe_entradas_bitacora_solo_anexado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'ENTRADA_BITACORA_INMUTABLE';
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- En la cascada el incidente ya no es visible; en DELETE directo sí.
        -- Supuesto: la función es SECURITY INVOKER. Si algún día un rol con DELETE sobre
        -- la tabla no pudiera ver el incidente por RLS, este EXISTS daría falso y el
        -- borrado pasaría. Hoy no ocurre: nadie tiene DELETE salvo el dueño de la tabla.
        IF EXISTS (SELECT 1 FROM public.incidentes WHERE id = OLD.incidente_id) THEN
            RAISE EXCEPTION 'ENTRADA_BITACORA_INMUTABLE';
        END IF;
        RETURN OLD;
    END IF;

    -- TRUNCATE
    RAISE EXCEPTION 'ENTRADA_BITACORA_INMUTABLE';
END;
$$;

CREATE TRIGGER trg_entradas_bitacora_antes_de_insertar
    BEFORE INSERT ON public.entradas_bitacora_incidente
    FOR EACH ROW EXECUTE FUNCTION public.treksafe_entradas_bitacora_antes_de_insertar();

CREATE TRIGGER trg_entradas_bitacora_solo_anexado
    BEFORE UPDATE ON public.entradas_bitacora_incidente
    FOR EACH ROW EXECUTE FUNCTION public.treksafe_entradas_bitacora_solo_anexado();

CREATE TRIGGER trg_entradas_bitacora_sin_borrado
    BEFORE DELETE ON public.entradas_bitacora_incidente
    FOR EACH ROW EXECUTE FUNCTION public.treksafe_entradas_bitacora_solo_anexado();

CREATE TRIGGER trg_entradas_bitacora_sin_truncate
    BEFORE TRUNCATE ON public.entradas_bitacora_incidente
    FOR EACH STATEMENT EXECUTE FUNCTION public.treksafe_entradas_bitacora_solo_anexado();

REVOKE ALL ON FUNCTION public.treksafe_entradas_bitacora_antes_de_insertar()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.treksafe_entradas_bitacora_solo_anexado()
    FROM PUBLIC, anon, authenticated;

COMMENT ON TRIGGER trg_entradas_bitacora_antes_de_insertar ON public.entradas_bitacora_incidente IS
    'HU-41: fija registrada_en = clock_timestamp() (hora del servidor).';
COMMENT ON TRIGGER trg_entradas_bitacora_solo_anexado ON public.entradas_bitacora_incidente IS
    'HU-41: rechaza todo UPDATE.';
COMMENT ON TRIGGER trg_entradas_bitacora_sin_borrado ON public.entradas_bitacora_incidente IS
    'HU-41: rechaza DELETE mientras el incidente exista; permite la cascada desde incidentes.';
COMMENT ON TRIGGER trg_entradas_bitacora_sin_truncate ON public.entradas_bitacora_incidente IS
    'HU-41: rechaza TRUNCATE.';

-- ---------------------------------------------------------------------------
-- Funciones auxiliares.
-- ---------------------------------------------------------------------------
-- Arma el resultado de la RPC a partir de una entrada.
CREATE OR REPLACE FUNCTION public.treksafe_resultado_entrada_bitacora(
    p_entrada   public.entradas_bitacora_incidente,
    p_repetido  BOOLEAN
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'id', p_entrada.id,
        'incidenteId', p_entrada.incidente_id,
        'tipo', p_entrada.tipo,
        'texto', p_entrada.texto,
        'autor', jsonb_build_object(
            'id', p_entrada.autor_id,
            'nombreCompleto', (
                SELECT pr.nombre_completo FROM public.perfiles_rescatista pr
                WHERE pr.usuario_id = p_entrada.autor_id
            )
        ),
        'registradaEn', p_entrada.registrada_en,
        'corrigeEntradaId', p_entrada.corrige_entrada_id,
        'repetido', p_repetido
    );
$$;

REVOKE ALL ON FUNCTION public.treksafe_resultado_entrada_bitacora(public.entradas_bitacora_incidente, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_resultado_entrada_bitacora(public.entradas_bitacora_incidente, BOOLEAN)
    TO service_role;

-- Resuelve la repetición de una operación. p_texto ya viene normalizado (recortado).
-- Devuelve el resultado original (repetido = true), NULL si la operación es nueva, o
-- lanza OPERACION_YA_REGISTRADA si el UUID ya se usó con otro contenido, otro actor o
-- en otro tipo de operación (incidentes, eventos del plan). No revela nada ajeno.
-- HU-42 puede hacer CREATE OR REPLACE de esta función para rechazar también los UUID de
-- su tabla de informes.
CREATE OR REPLACE FUNCTION public.treksafe_entrada_bitacora_repetida(
    p_operacion_id        UUID,
    p_incidente_id        UUID,
    p_autor_id            UUID,
    p_tipo                TEXT,
    p_texto               TEXT,
    p_corrige_entrada_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_ent  public.entradas_bitacora_incidente%ROWTYPE;
BEGIN
    SELECT * INTO v_ent
    FROM public.entradas_bitacora_incidente
    WHERE operacion_id = p_operacion_id;

    IF FOUND THEN
        IF v_ent.incidente_id = p_incidente_id
           AND v_ent.autor_id = p_autor_id
           AND v_ent.tipo = p_tipo
           AND v_ent.texto = p_texto
           AND v_ent.corrige_entrada_id IS NOT DISTINCT FROM p_corrige_entrada_id THEN
            RETURN public.treksafe_resultado_entrada_bitacora(v_ent, TRUE);
        END IF;
        RAISE EXCEPTION 'OPERACION_YA_REGISTRADA';
    END IF;

    -- El UUID ya se usó en otro tipo de operación.
    IF EXISTS (SELECT 1 FROM public.incidentes WHERE operacion_id = p_operacion_id)
       OR EXISTS (SELECT 1 FROM public.eventos_plan WHERE operacion_id = p_operacion_id) THEN
        RAISE EXCEPTION 'OPERACION_YA_REGISTRADA';
    END IF;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.treksafe_entrada_bitacora_repetida(UUID, UUID, UUID, TEXT, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_entrada_bitacora_repetida(UUID, UUID, UUID, TEXT, TEXT, UUID)
    TO service_role;

-- ---------------------------------------------------------------------------
-- Función interna reutilizable (HU-42 anexa el cierre en su misma transacción).
-- PRECONDICIÓN: quien la llama ya autorizó al autor y comprobó el estado del incidente.
-- Esta función NO valida estado ni responsable.
-- Si ya existe un 'cierre' para el incidente, el índice único parcial lanza
-- unique_violation y la función responde OPERACION_YA_REGISTRADA.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.treksafe_anexar_entrada_bitacora_interna(
    p_incidente_id        UUID,
    p_autor_id            UUID,
    p_tipo                TEXT,
    p_texto               TEXT,
    p_corrige_entrada_id  UUID,
    p_operacion_id        UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_texto  TEXT;
    v_res    JSONB;
    v_ent    public.entradas_bitacora_incidente%ROWTYPE;
BEGIN
    IF p_incidente_id IS NULL OR p_autor_id IS NULL OR p_tipo IS NULL
       OR p_texto IS NULL OR p_operacion_id IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;
    IF p_tipo NOT IN ('nota', 'correccion', 'cierre') THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;
    IF (p_tipo = 'correccion') <> (p_corrige_entrada_id IS NOT NULL) THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    v_texto := btrim(p_texto, E' \t\r\n');
    IF char_length(v_texto) NOT BETWEEN 1 AND 2000 OR v_texto !~ '\S' THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    v_res := public.treksafe_entrada_bitacora_repetida(
        p_operacion_id, p_incidente_id, p_autor_id, p_tipo, v_texto, p_corrige_entrada_id);
    IF v_res IS NOT NULL THEN
        RETURN v_res;
    END IF;

    -- FOR SHARE: se serializa con cualquier UPDATE de la fila (relevo, cierre). Si quien
    -- llama ya tiene FOR UPDATE en esta transacción, no pasa nada.
    PERFORM 1 FROM public.incidentes WHERE id = p_incidente_id FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'INCIDENTE_NO_ENCONTRADO';
    END IF;

    IF p_corrige_entrada_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.entradas_bitacora_incidente
        WHERE id = p_corrige_entrada_id AND incidente_id = p_incidente_id
    ) THEN
        RAISE EXCEPTION 'CORRECCION_INVALIDA';
    END IF;

    BEGIN
        INSERT INTO public.entradas_bitacora_incidente
            (incidente_id, autor_id, tipo, texto, corrige_entrada_id, operacion_id)
        VALUES
            (p_incidente_id, p_autor_id, p_tipo, v_texto, p_corrige_entrada_id, p_operacion_id)
        RETURNING * INTO v_ent;
    EXCEPTION WHEN unique_violation THEN
        -- Carrera por el mismo operacion_id: la otra transacción ya confirmó; se relee.
        v_res := public.treksafe_entrada_bitacora_repetida(
            p_operacion_id, p_incidente_id, p_autor_id, p_tipo, v_texto, p_corrige_entrada_id);
        IF v_res IS NOT NULL THEN
            RETURN v_res;
        END IF;
        -- Segundo 'cierre' del mismo incidente (índice uq_entradas_bitacora_un_cierre).
        RAISE EXCEPTION 'OPERACION_YA_REGISTRADA';
    END;

    RETURN public.treksafe_resultado_entrada_bitacora(v_ent, FALSE);
END;
$$;

COMMENT ON FUNCTION public.treksafe_anexar_entrada_bitacora_interna(UUID, UUID, TEXT, TEXT, UUID, UUID) IS
    'HU-41 (reutilizable por HU-42/HU-40): anexa una entrada sin validar estado ni responsable; el llamador ya autorizó. Permite el tipo cierre.';

REVOKE ALL ON FUNCTION public.treksafe_anexar_entrada_bitacora_interna(UUID, UUID, TEXT, TEXT, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_anexar_entrada_bitacora_interna(UUID, UUID, TEXT, TEXT, UUID, UUID)
    TO service_role;

-- ---------------------------------------------------------------------------
-- RPC pública: el responsable vigente añade una nota o una corrección.
-- El tipo se deduce de p_corrige_entrada_id; el cliente nunca lo envía.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.treksafe_agregar_entrada_bitacora(
    p_incidente_id        UUID,
    p_autor_id            UUID,
    p_texto               TEXT,
    p_corrige_entrada_id  UUID,
    p_operacion_id        UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_inc    public.incidentes%ROWTYPE;
    v_tipo   TEXT;
    v_texto  TEXT;
    v_res    JSONB;
BEGIN
    IF p_incidente_id IS NULL OR p_autor_id IS NULL OR p_texto IS NULL OR p_operacion_id IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    v_tipo := CASE WHEN p_corrige_entrada_id IS NULL THEN 'nota' ELSE 'correccion' END;
    v_texto := btrim(p_texto, E' \t\r\n');
    IF char_length(v_texto) NOT BETWEEN 1 AND 2000 OR v_texto !~ '\S' THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 1) Repetición: se resuelve antes de autorizar para que el reintento funcione aunque
    --    haya habido un relevo o un cierre entre el intento y el reintento.
    v_res := public.treksafe_entrada_bitacora_repetida(
        p_operacion_id, p_incidente_id, p_autor_id, v_tipo, v_texto, p_corrige_entrada_id);
    IF v_res IS NOT NULL THEN
        RETURN v_res;
    END IF;

    -- 2) Responsable vigente con la fila bloqueada: el relevo y el cierre esperan a que
    --    termine esta transacción, y si ellos llegaron primero se lee su resultado.
    SELECT * INTO v_inc FROM public.incidentes WHERE id = p_incidente_id FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'INCIDENTE_NO_ENCONTRADO';
    END IF;
    IF v_inc.estado = 'cerrado' THEN
        RAISE EXCEPTION 'INCIDENTE_CERRADO';
    END IF;
    IF v_inc.responsable_id <> p_autor_id THEN
        RAISE EXCEPTION 'NO_ES_RESPONSABLE'
            USING DETAIL = (public.treksafe_resultado_coordinacion(v_inc, TRUE)->'responsable')::text;
    END IF;

    -- 3) Inserción en la misma transacción (con el bloqueo ya tomado).
    RETURN public.treksafe_anexar_entrada_bitacora_interna(
        p_incidente_id, p_autor_id, v_tipo, p_texto, p_corrige_entrada_id, p_operacion_id);
END;
$$;

COMMENT ON FUNCTION public.treksafe_agregar_entrada_bitacora(UUID, UUID, TEXT, UUID, UUID) IS
    'HU-41: el responsable vigente añade una nota o corrección a la bitácora del incidente. Una transacción, fila bloqueada FOR SHARE, idempotente por operacion_id.';

REVOKE ALL ON FUNCTION public.treksafe_agregar_entrada_bitacora(UUID, UUID, TEXT, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_agregar_entrada_bitacora(UUID, UUID, TEXT, UUID, UUID)
    TO service_role;

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('019', 'hu41_bitacora_incidente', 'HU-41')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;
