-- =============================================================================
-- 017 · HU-39: asumir la coordinación de una alerta (tabla incidentes + RPC)
-- Requiere: esquema de init_schema.sql (expediciones, perfiles_rescatista, roles de
-- Supabase) y 002_hu26_version_y_eventos_plan.sql (la RPC consulta eventos_plan).
-- No depende de 000: registra la aplicación solo si treksafe_migraciones existe.
-- No es re-ejecutable: CREATE TABLE falla si la tabla ya existe, para no ocultar
-- diferencias de esquema. Aplicar una sola vez por entorno.
--
-- 1) public.incidentes: un incidente por alerta atendida. Contrato compartido con
--    HU-40 (relevo), HU-41 (bitácora), HU-42 (cierre), HU-43, HU-46 y HU-50.
--    El índice único parcial uq_incidentes_expedicion_no_cerrado garantiza un solo
--    incidente no cerrado por expedición: es la restricción del CA-02.
--    "Alerta sin responsable" = expedición en estado 'alerta' sin incidente no cerrado.
--    Las transiciones de estado (localizado, cerrado) y el relevo las implementan
--    HU-40 y HU-42; aquí solo existen los valores y las columnas. Esas HU añadirán el
--    permiso UPDATE que necesiten.
--    RESTRICCIÓN QUE HU-40 Y HU-42 DEBEN RESPETAR: chk_incidentes_cierre exige
--    (estado = 'cerrado') = (cerrado_en IS NOT NULL). Cerrar un incidente es un solo
--    UPDATE que fija estado = 'cerrado' y cerrado_en a la vez; reabrir exige limpiar
--    cerrado_en en el mismo UPDATE.
--
-- 2) treksafe_asumir_coordinacion(p_expedicion_id, p_rescatista_id, p_operacion_id):
--    una transacción, con la expedición bloqueada (FOR UPDATE).
--
-- Errores de negocio: RAISE EXCEPTION con el código en MESSAGE.
--   DATOS_INVALIDOS         algún p_* nulo, o la operación ya se usó en otro tipo de
--                           operación (eventos del plan)
--   ALERTA_NO_ENCONTRADA    expedición inexistente o que ya no está en 'alerta'; también
--                           una operación que pertenece a otro rescatista o expedición
--                           (no se revela nada ajeno)
--   NO_ES_RESCATISTA        el actor no tiene perfil de rescatista validado
--   COORDINACION_YA_ASUMIDA otro rescatista es el responsable vigente; DETAIL lleva
--                           {"id": "...", "nombreCompleto": "..."} en JSON
-- Resultado JSONB: id, expedicionId, estado, version, responsable {id,
-- nombreCompleto}, asumidoEn y repetido (true si no se escribió nada nuevo).
-- Ningún dato médico participa en esta migración.
-- =============================================================================
BEGIN;

CREATE TABLE public.incidentes (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    expedicion_id   UUID            NOT NULL,
    estado          TEXT            NOT NULL DEFAULT 'abierto',
    responsable_id  UUID            NOT NULL,
    version         INTEGER         NOT NULL DEFAULT 1,
    asumido_en      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    abierto_en      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    cerrado_en      TIMESTAMPTZ,
    operacion_id    UUID            NOT NULL,

    CONSTRAINT fk_incidentes_expedicion
        FOREIGN KEY (expedicion_id) REFERENCES public.expediciones (id)
        ON DELETE CASCADE,
    -- Un rescatista validado es quien tiene perfil en perfiles_rescatista.
    -- RESTRICT: no se pierde el historial de coordinación al borrar un perfil.
    CONSTRAINT fk_incidentes_responsable
        FOREIGN KEY (responsable_id) REFERENCES public.perfiles_rescatista (usuario_id)
        ON DELETE RESTRICT,
    CONSTRAINT uq_incidentes_operacion UNIQUE (operacion_id),
    CONSTRAINT chk_incidentes_estado CHECK (estado IN ('abierto', 'localizado', 'cerrado')),
    CONSTRAINT chk_incidentes_version CHECK (version >= 1),
    CONSTRAINT chk_incidentes_cierre CHECK ((estado = 'cerrado') = (cerrado_en IS NOT NULL))
);

COMMENT ON TABLE public.incidentes IS
    'HU-39: coordinación de una alerta. Un solo incidente no cerrado por expedición. No guarda datos médicos.';
COMMENT ON COLUMN public.incidentes.responsable_id IS
    'Rescatista responsable vigente. El relevo (HU-40) lo cambia con la fila bloqueada.';
COMMENT ON COLUMN public.incidentes.version IS
    'Control optimista de concurrencia para relevo y cierre (HU-40, HU-42). Empieza en 1.';
COMMENT ON COLUMN public.incidentes.operacion_id IS
    'UUID del cliente que abrió el incidente; hace idempotente la asunción.';

CREATE UNIQUE INDEX uq_incidentes_expedicion_no_cerrado
    ON public.incidentes (expedicion_id)
    WHERE estado <> 'cerrado';

CREATE INDEX idx_incidentes_responsable
    ON public.incidentes (responsable_id);

ALTER TABLE public.incidentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY treksafe_deny_anon_authenticated ON public.incidentes
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON public.incidentes FROM PUBLIC, anon, authenticated;
-- SELECT: lectura de coordinaciones para la consola (leerCoordinaciones).
-- INSERT: la RPC es SECURITY INVOKER y corre con el rol del backend.
GRANT SELECT, INSERT ON public.incidentes TO service_role;

-- Arma el resultado de la RPC a partir de una fila de incidentes.
CREATE OR REPLACE FUNCTION public.treksafe_resultado_coordinacion(
    p_incidente  public.incidentes,
    p_repetido   BOOLEAN
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'id', p_incidente.id,
        'expedicionId', p_incidente.expedicion_id,
        'estado', p_incidente.estado,
        'version', p_incidente.version,
        'responsable', jsonb_build_object(
            'id', p_incidente.responsable_id,
            'nombreCompleto', (
                SELECT pr.nombre_completo FROM public.perfiles_rescatista pr
                WHERE pr.usuario_id = p_incidente.responsable_id
            )
        ),
        'asumidoEn', p_incidente.asumido_en,
        'repetido', p_repetido
    );
$$;

REVOKE ALL ON FUNCTION public.treksafe_resultado_coordinacion(public.incidentes, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_resultado_coordinacion(public.incidentes, BOOLEAN)
    TO service_role;

CREATE OR REPLACE FUNCTION public.treksafe_asumir_coordinacion(
    p_expedicion_id  UUID,
    p_rescatista_id  UUID,
    p_operacion_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_inc       public.incidentes%ROWTYPE;
    v_estado    public.estado_expedicion_enum;
    v_usada     BOOLEAN := FALSE;
BEGIN
    IF p_expedicion_id IS NULL OR p_rescatista_id IS NULL OR p_operacion_id IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 1) Operación ya registrada: mismo rescatista y expedición → mismo resultado sin
    --    escribir. De otro rescatista u otra expedición → no se revela nada ajeno.
    SELECT * INTO v_inc FROM public.incidentes WHERE operacion_id = p_operacion_id;
    IF FOUND THEN
        IF v_inc.responsable_id = p_rescatista_id AND v_inc.expedicion_id = p_expedicion_id THEN
            RETURN public.treksafe_resultado_coordinacion(v_inc, TRUE);
        END IF;
        RAISE EXCEPTION 'ALERTA_NO_ENCONTRADA';
    END IF;

    -- La operación ya se usó en otro tipo de operación (eventos del plan: HU-26/27/35).
    SELECT EXISTS (
        SELECT 1 FROM public.eventos_plan WHERE operacion_id = p_operacion_id
    ) INTO v_usada;
    IF v_usada THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 2) El actor debe ser un rescatista validado.
    IF NOT EXISTS (
        SELECT 1 FROM public.perfiles_rescatista WHERE usuario_id = p_rescatista_id
    ) THEN
        RAISE EXCEPTION 'NO_ES_RESCATISTA';
    END IF;

    -- 3) Bloqueo de la expedición: serializa las asunciones concurrentes.
    SELECT estado INTO v_estado
    FROM public.expediciones
    WHERE id = p_expedicion_id
    FOR UPDATE;

    IF NOT FOUND OR v_estado <> 'alerta'::public.estado_expedicion_enum THEN
        RAISE EXCEPTION 'ALERTA_NO_ENCONTRADA';
    END IF;

    -- 4) Incidente no cerrado vigente: repetición segura del mismo actor o conflicto.
    SELECT * INTO v_inc
    FROM public.incidentes
    WHERE expedicion_id = p_expedicion_id AND estado <> 'cerrado';

    IF FOUND THEN
        IF v_inc.responsable_id = p_rescatista_id THEN
            RETURN public.treksafe_resultado_coordinacion(v_inc, TRUE);
        END IF;
        RAISE EXCEPTION 'COORDINACION_YA_ASUMIDA'
            USING DETAIL = (public.treksafe_resultado_coordinacion(v_inc, TRUE)->'responsable')::text;
    END IF;

    -- 5) Inserción. Si el índice único salta (otra vía escribió sin bloquear la
    --    expedición), se relee el incidente y se responde con el responsable vigente.
    BEGIN
        INSERT INTO public.incidentes (expedicion_id, responsable_id, operacion_id)
        VALUES (p_expedicion_id, p_rescatista_id, p_operacion_id)
        RETURNING * INTO v_inc;
    EXCEPTION WHEN unique_violation THEN
        SELECT * INTO v_inc
        FROM public.incidentes
        WHERE expedicion_id = p_expedicion_id AND estado <> 'cerrado';

        IF NOT FOUND THEN
            -- La colisión fue de operacion_id: otra transacción registró esa operación.
            SELECT * INTO v_inc FROM public.incidentes WHERE operacion_id = p_operacion_id;
            IF FOUND AND v_inc.responsable_id = p_rescatista_id
               AND v_inc.expedicion_id = p_expedicion_id THEN
                RETURN public.treksafe_resultado_coordinacion(v_inc, TRUE);
            END IF;
            RAISE EXCEPTION 'ALERTA_NO_ENCONTRADA';
        END IF;

        IF v_inc.responsable_id = p_rescatista_id THEN
            RETURN public.treksafe_resultado_coordinacion(v_inc, TRUE);
        END IF;
        RAISE EXCEPTION 'COORDINACION_YA_ASUMIDA'
            USING DETAIL = (public.treksafe_resultado_coordinacion(v_inc, TRUE)->'responsable')::text;
    END;

    -- 6) Resultado.
    RETURN public.treksafe_resultado_coordinacion(v_inc, FALSE);
END;
$$;

COMMENT ON FUNCTION public.treksafe_asumir_coordinacion(UUID, UUID, UUID) IS
    'HU-39: un rescatista validado asume una alerta sin responsable. Una transacción, un solo responsable, idempotente por operacion_id.';

REVOKE ALL ON FUNCTION public.treksafe_asumir_coordinacion(UUID, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_asumir_coordinacion(UUID, UUID, UUID)
    TO service_role;

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('017', 'hu39_asumir_coordinacion', 'HU-39')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;
