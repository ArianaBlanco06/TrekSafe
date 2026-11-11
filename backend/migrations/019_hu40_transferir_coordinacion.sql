-- =============================================================================
-- 019 · HU-40: transferir la coordinación de una alerta (relevo propuesto y aceptado)
-- Requiere: 017_hu39_asumir_coordinacion.sql (tabla incidentes) y, por ella, 002.
-- No depende de 000: registra la aplicación solo si treksafe_migraciones existe.
-- No es re-ejecutable: CREATE TABLE falla si la tabla ya existe, para no ocultar
-- diferencias de esquema. Aplicar una sola vez por entorno.
-- La 015 está reservada para HU-45, la 017 es de HU-39 y la 018 de HU-27.
--
-- 1) public.relevos_coordinacion: estado del relevo (pendiente | aceptado | rechazado |
--    cancelado) e historial de quién lo resolvió y cuándo. El índice único parcial
--    uq_relevo_pendiente_por_incidente impide dos relevos pendientes a la vez; al
--    rechazarse o cancelarse el relevo sale del índice y se puede proponer otro.
-- 2) public.transferencias_coordinacion: evento de transferencia, solo anexar (una fila
--    por relevo aplicado, con ambos responsables, motivo, versiones y hora).
-- 3) incidentes: service_role recibe UPDATE únicamente sobre responsable_id, version y
--    asumido_en. anon y authenticated siguen sin ningún acceso (RLS de la 017).
--    asumido_en pasa a significar "desde cuándo coordina el responsable actual".
-- 4) treksafe_proponer_relevo, treksafe_aceptar_relevo, treksafe_rechazar_relevo y
--    treksafe_cancelar_relevo: una transacción cada una, con la fila del incidente
--    bloqueada (FOR UPDATE), idempotentes por operacion_id. Rechazar y cancelar comparten
--    treksafe_resolver_relevo y no cambian ni el responsable ni la versión.
--
-- Rechazar lo hace solo el destinatario; cancelar, solo quien propuso. Ambos exigen que el
-- relevo siga pendiente y el incidente no esté cerrado. Sin vencimiento automático.
-- Al cerrar el incidente el relevo pendiente NO se escribe: queda inerte porque proponer,
-- aceptar, rechazar y cancelar devuelven INCIDENTE_CERRADO (estado derivado; sin trigger,
-- sin tocar el cierre de HU-42). Un caso reabierto haría revivir ese relevo pendiente: quien
-- implemente reabrir debe decidirlo (ver docs/hu-40/diseno.md).
--
-- Regla de versión: proponer compara la versión del cliente con la del incidente
-- (VERSION_DESACTUALIZADA); aceptar no compara versión: exige que el relevo siga
-- pendiente, que quien acepta sea el destinatario, que el incidente no esté cerrado y
-- que el destinatario siga siendo un rescatista validado. Aceptar sube la versión.
--
-- Errores de negocio: RAISE EXCEPTION con el código en MESSAGE.
--   DATOS_INVALIDOS           algún p_* nulo, motivo vacío o de más de 280 caracteres,
--                             versión menor que 1, o la operación ya se usó en otro tipo
--                             de operación
--   INCIDENTE_NO_ENCONTRADO   la expedición no tiene incidente; también una operación
--                             que pertenece a otro actor u otra expedición
--   RELEVO_NO_ENCONTRADO      el relevo no existe o no es de esa expedición; también una
--                             operación que pertenece a otro actor o relevo
--   NO_ES_RESCATISTA          el actor no tiene perfil de rescatista validado
--   INCIDENTE_CERRADO         el caso está cerrado (también si se cerró tras proponer)
--   NO_ES_RESPONSABLE         propone alguien que no es el responsable vigente
--   DESTINATARIO_INVALIDO     el destinatario es el propio actor
--   DESTINATARIO_NO_VALIDADO  el destinatario no tiene perfil de rescatista
--   VERSION_DESACTUALIZADA    solo al proponer; DETAIL {"versionActual": n}
--   RELEVO_PENDIENTE          ya hay un relevo pendiente; DETAIL con el relevo (sin motivo)
--   NO_ES_DESTINATARIO        acepta o rechaza alguien que no es el destinatario
--   NO_ES_PROPONENTE          cancela alguien que no propuso el relevo
--   RELEVO_YA_RESUELTO        el relevo ya no está pendiente y la operación es distinta;
--                             DETAIL {"estado": "aceptado" | "rechazado" | "cancelado"}
-- Resultado JSONB: el de treksafe_resultado_coordinacion (id, expedicionId, estado,
-- version, responsable, asumidoEn, repetido) más "relevo" con ambos responsables, motivo,
-- solicitadoEn, resueltoEn, resueltoPorId y versionIncidente. Ningún dato médico participa
-- aquí.
-- =============================================================================
BEGIN;

-- 1) Estado del relevo y su historial.
CREATE TABLE public.relevos_coordinacion (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    incidente_id             UUID         NOT NULL,
    estado                   TEXT         NOT NULL DEFAULT 'pendiente',
    responsable_anterior_id  UUID         NOT NULL,
    destinatario_id          UUID         NOT NULL,
    motivo                   TEXT         NOT NULL,
    solicitado_en            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resuelto_en              TIMESTAMPTZ,
    version_incidente        INTEGER      NOT NULL,
    operacion_id             UUID         NOT NULL,
    resuelto_por_id          UUID,
    operacion_resolucion_id  UUID,

    CONSTRAINT fk_relevos_incidente
        FOREIGN KEY (incidente_id) REFERENCES public.incidentes (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_relevos_anterior
        FOREIGN KEY (responsable_anterior_id) REFERENCES public.perfiles_rescatista (usuario_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_relevos_destinatario
        FOREIGN KEY (destinatario_id) REFERENCES public.perfiles_rescatista (usuario_id)
        ON DELETE RESTRICT,
    CONSTRAINT uq_relevos_operacion UNIQUE (operacion_id),
    CONSTRAINT fk_relevos_resuelto_por
        FOREIGN KEY (resuelto_por_id) REFERENCES public.perfiles_rescatista (usuario_id)
        ON DELETE RESTRICT,
    CONSTRAINT uq_relevos_operacion_resolucion UNIQUE (operacion_resolucion_id),
    CONSTRAINT chk_relevos_estado CHECK (estado IN ('pendiente', 'aceptado', 'rechazado', 'cancelado')),
    CONSTRAINT chk_relevos_distintos CHECK (responsable_anterior_id <> destinatario_id),
    CONSTRAINT chk_relevos_motivo CHECK (char_length(btrim(motivo)) BETWEEN 1 AND 280),
    CONSTRAINT chk_relevos_version CHECK (version_incidente >= 1),
    CONSTRAINT chk_relevos_resuelto_en CHECK ((estado <> 'pendiente') = (resuelto_en IS NOT NULL)),
    CONSTRAINT chk_relevos_resuelto_por CHECK ((estado <> 'pendiente') = (resuelto_por_id IS NOT NULL)),
    CONSTRAINT chk_relevos_op_resolucion CHECK ((estado <> 'pendiente') = (operacion_resolucion_id IS NOT NULL)),
    -- Quién resuelve: el destinatario acepta o rechaza; quien propuso cancela.
    CONSTRAINT chk_relevos_quien_resuelve CHECK (
        estado = 'pendiente'
        OR (estado IN ('aceptado', 'rechazado') AND resuelto_por_id = destinatario_id)
        OR (estado = 'cancelado' AND resuelto_por_id = responsable_anterior_id)
    )
);

COMMENT ON TABLE public.relevos_coordinacion IS
    'HU-40: relevo de la coordinación de un incidente. A lo sumo uno pendiente por incidente. Las filas resueltas (aceptado, rechazado, cancelado) son el historial: quién resolvió y cuándo. Un relevo pendiente de un incidente cerrado es inerte (estado derivado). Estado de trabajo, no contrato para otras HU.';
COMMENT ON COLUMN public.relevos_coordinacion.motivo IS
    'Texto libre de 1 a 280 caracteres. Solo lo ven el responsable y el destinatario. No debe contener datos médicos.';
COMMENT ON COLUMN public.relevos_coordinacion.version_incidente IS
    'Versión del incidente en la que se propuso. Es de auditoría: aceptar no la compara.';

CREATE UNIQUE INDEX uq_relevo_pendiente_por_incidente
    ON public.relevos_coordinacion (incidente_id)
    WHERE estado = 'pendiente';

CREATE INDEX idx_relevos_destinatario_pendiente
    ON public.relevos_coordinacion (destinatario_id)
    WHERE estado = 'pendiente';

ALTER TABLE public.relevos_coordinacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY treksafe_deny_anon_authenticated ON public.relevos_coordinacion
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- REVOKE de tabla también retira los permisos de columna y los que Supabase concede por
-- defecto a service_role. Después solo se concede lo necesario.
REVOKE ALL ON public.relevos_coordinacion FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.relevos_coordinacion TO service_role;
GRANT UPDATE (estado, resuelto_en, resuelto_por_id, operacion_resolucion_id)
    ON public.relevos_coordinacion TO service_role;

-- 2) Evento de transferencia: solo anexar.
CREATE TABLE public.transferencias_coordinacion (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    incidente_id             UUID         NOT NULL,
    relevo_id                UUID         NOT NULL,
    responsable_anterior_id  UUID         NOT NULL,
    responsable_nuevo_id     UUID         NOT NULL,
    motivo                   TEXT         NOT NULL,
    version_anterior         INTEGER      NOT NULL,
    version_nueva            INTEGER      NOT NULL,
    ocurrido_en              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_transferencias_incidente
        FOREIGN KEY (incidente_id) REFERENCES public.incidentes (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_transferencias_relevo
        FOREIGN KEY (relevo_id) REFERENCES public.relevos_coordinacion (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_transferencias_anterior
        FOREIGN KEY (responsable_anterior_id) REFERENCES public.perfiles_rescatista (usuario_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_transferencias_nuevo
        FOREIGN KEY (responsable_nuevo_id) REFERENCES public.perfiles_rescatista (usuario_id)
        ON DELETE RESTRICT,
    CONSTRAINT uq_transferencias_relevo UNIQUE (relevo_id),
    CONSTRAINT chk_transferencias_distintos CHECK (responsable_anterior_id <> responsable_nuevo_id),
    CONSTRAINT chk_transferencias_version CHECK (version_anterior >= 1 AND version_nueva = version_anterior + 1)
);

COMMENT ON TABLE public.transferencias_coordinacion IS
    'HU-40: una fila por relevo aplicado (responsable anterior y nuevo, motivo, versiones, hora). Solo anexar.';

CREATE INDEX idx_transferencias_incidente
    ON public.transferencias_coordinacion (incidente_id, ocurrido_en);

CREATE OR REPLACE FUNCTION public.treksafe_transferencias_solo_anexado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- En la cascada (borrado del incidente o de su expedición) el incidente ya no es
        -- visible; en un DELETE directo sí lo es y se rechaza.
        IF EXISTS (SELECT 1 FROM public.incidentes WHERE id = OLD.incidente_id) THEN
            RAISE EXCEPTION 'TRANSFERENCIA_INMUTABLE';
        END IF;
        RETURN OLD;
    END IF;
    -- UPDATE y TRUNCATE: siempre se rechazan.
    RAISE EXCEPTION 'TRANSFERENCIA_INMUTABLE';
END;
$$;

CREATE TRIGGER trg_transferencias_sin_actualizar
    BEFORE UPDATE ON public.transferencias_coordinacion
    FOR EACH ROW EXECUTE FUNCTION public.treksafe_transferencias_solo_anexado();
CREATE TRIGGER trg_transferencias_sin_borrado
    BEFORE DELETE ON public.transferencias_coordinacion
    FOR EACH ROW EXECUTE FUNCTION public.treksafe_transferencias_solo_anexado();
CREATE TRIGGER trg_transferencias_sin_truncate
    BEFORE TRUNCATE ON public.transferencias_coordinacion
    FOR EACH STATEMENT EXECUTE FUNCTION public.treksafe_transferencias_solo_anexado();

ALTER TABLE public.transferencias_coordinacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY treksafe_deny_anon_authenticated ON public.transferencias_coordinacion
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON public.transferencias_coordinacion FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.transferencias_coordinacion TO service_role;

REVOKE ALL ON FUNCTION public.treksafe_transferencias_solo_anexado()
    FROM PUBLIC, anon, authenticated;

-- 3) Permisos sobre incidentes: UPDATE solo de las columnas que cambia un relevo.
--    estado y cerrado_en (cierre, HU-42) no se abren aquí. REVOKE primero porque Supabase
--    concede ALL a service_role por defecto y el REVOKE de tabla retira las columnas.
REVOKE ALL ON public.incidentes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.incidentes TO service_role;
GRANT UPDATE (responsable_id, version, asumido_en) ON public.incidentes TO service_role;

COMMENT ON COLUMN public.incidentes.asumido_en IS
    'Desde cuándo coordina el responsable actual: la asunción (HU-39) o el último relevo aceptado (HU-40).';

-- 4) Resultados de la RPC.
-- Relevo sin motivo: es lo que cualquier rescatista autorizado puede ver (DETAIL de
-- RELEVO_PENDIENTE y lecturas de la consola).
CREATE OR REPLACE FUNCTION public.treksafe_relevo_publico(p_relevo public.relevos_coordinacion)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'relevoId', p_relevo.id,
        'destinatarioId', p_relevo.destinatario_id,
        'nombreDestinatario', (
            SELECT pr.nombre_completo FROM public.perfiles_rescatista pr
            WHERE pr.usuario_id = p_relevo.destinatario_id
        ),
        'solicitadoEn', p_relevo.solicitado_en
    );
$$;

-- Resultado de las dos RPC: la coordinación vigente (misma forma que la de HU-39) más el
-- relevo completo. Solo lo reciben las partes del relevo.
CREATE OR REPLACE FUNCTION public.treksafe_resultado_relevo(
    p_incidente  public.incidentes,
    p_relevo     public.relevos_coordinacion,
    p_repetido   BOOLEAN
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT public.treksafe_resultado_coordinacion(p_incidente, p_repetido) || jsonb_build_object(
        'relevo', jsonb_build_object(
            'id', p_relevo.id,
            'estado', p_relevo.estado,
            'responsableAnterior', jsonb_build_object(
                'id', p_relevo.responsable_anterior_id,
                'nombreCompleto', (
                    SELECT pr.nombre_completo FROM public.perfiles_rescatista pr
                    WHERE pr.usuario_id = p_relevo.responsable_anterior_id
                )
            ),
            'destinatario', jsonb_build_object(
                'id', p_relevo.destinatario_id,
                'nombreCompleto', (
                    SELECT pr.nombre_completo FROM public.perfiles_rescatista pr
                    WHERE pr.usuario_id = p_relevo.destinatario_id
                )
            ),
            'motivo', p_relevo.motivo,
            'solicitadoEn', p_relevo.solicitado_en,
            'resueltoEn', p_relevo.resuelto_en,
            'resueltoPorId', p_relevo.resuelto_por_id,
            'versionIncidente', p_relevo.version_incidente
        )
    );
$$;

REVOKE ALL ON FUNCTION public.treksafe_relevo_publico(public.relevos_coordinacion)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_relevo_publico(public.relevos_coordinacion)
    TO service_role;
REVOKE ALL ON FUNCTION public.treksafe_resultado_relevo(public.incidentes, public.relevos_coordinacion, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_resultado_relevo(public.incidentes, public.relevos_coordinacion, BOOLEAN)
    TO service_role;

-- 5) Proponer un relevo.
CREATE OR REPLACE FUNCTION public.treksafe_proponer_relevo(
    p_expedicion_id      UUID,
    p_actor_id           UUID,
    p_destinatario_id    UUID,
    p_motivo             TEXT,
    p_version_incidente  INTEGER,
    p_operacion_id       UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_inc         public.incidentes%ROWTYPE;
    v_rel         public.relevos_coordinacion%ROWTYPE;
    v_motivo      TEXT;
    v_constraint  TEXT;
BEGIN
    -- 1) Datos obligatorios.
    IF p_expedicion_id IS NULL OR p_actor_id IS NULL OR p_destinatario_id IS NULL
       OR p_motivo IS NULL OR p_version_incidente IS NULL OR p_version_incidente < 1
       OR p_operacion_id IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;
    v_motivo := btrim(p_motivo);
    IF char_length(v_motivo) NOT BETWEEN 1 AND 280 THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 2) Operación ya registrada: mismo actor y expedición → mismo resultado sin escribir.
    --    De otro actor u otra expedición → no se revela nada ajeno.
    SELECT * INTO v_rel FROM public.relevos_coordinacion WHERE operacion_id = p_operacion_id;
    IF FOUND THEN
        SELECT * INTO v_inc FROM public.incidentes WHERE id = v_rel.incidente_id;
        IF v_rel.responsable_anterior_id = p_actor_id AND v_inc.expedicion_id = p_expedicion_id THEN
            RETURN public.treksafe_resultado_relevo(v_inc, v_rel, TRUE);
        END IF;
        RAISE EXCEPTION 'INCIDENTE_NO_ENCONTRADO';
    END IF;

    -- 3) La operación ya se usó en otro tipo de operación.
    IF EXISTS (SELECT 1 FROM public.eventos_plan WHERE operacion_id = p_operacion_id)
       OR EXISTS (SELECT 1 FROM public.incidentes WHERE operacion_id = p_operacion_id)
       OR EXISTS (SELECT 1 FROM public.relevos_coordinacion WHERE operacion_resolucion_id = p_operacion_id) THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 4) El actor debe ser un rescatista validado.
    IF NOT EXISTS (SELECT 1 FROM public.perfiles_rescatista WHERE usuario_id = p_actor_id) THEN
        RAISE EXCEPTION 'NO_ES_RESCATISTA';
    END IF;

    -- 5) Bloqueo del incidente no cerrado: serializa propuestas, aceptaciones y cierres.
    SELECT * INTO v_inc
    FROM public.incidentes
    WHERE expedicion_id = p_expedicion_id AND estado <> 'cerrado'
    FOR UPDATE;

    IF NOT FOUND THEN
        IF EXISTS (SELECT 1 FROM public.incidentes WHERE expedicion_id = p_expedicion_id) THEN
            RAISE EXCEPTION 'INCIDENTE_CERRADO';
        END IF;
        RAISE EXCEPTION 'INCIDENTE_NO_ENCONTRADO';
    END IF;

    -- 5b) La misma operación pudo registrarse mientras se esperaba el bloqueo (dos envíos
    --     simultáneos del mismo comando): es una repetición segura, no un relevo duplicado.
    SELECT * INTO v_rel FROM public.relevos_coordinacion WHERE operacion_id = p_operacion_id;
    IF FOUND THEN
        IF v_rel.responsable_anterior_id = p_actor_id AND v_rel.incidente_id = v_inc.id THEN
            RETURN public.treksafe_resultado_relevo(v_inc, v_rel, TRUE);
        END IF;
        RAISE EXCEPTION 'INCIDENTE_NO_ENCONTRADO';
    END IF;

    -- 6) Solo el responsable vigente propone.
    IF v_inc.responsable_id <> p_actor_id THEN
        RAISE EXCEPTION 'NO_ES_RESPONSABLE';
    END IF;

    -- 7) y 8) Destinatario: distinto del actor y rescatista validado.
    IF p_destinatario_id = p_actor_id THEN
        RAISE EXCEPTION 'DESTINATARIO_INVALIDO';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.perfiles_rescatista WHERE usuario_id = p_destinatario_id) THEN
        RAISE EXCEPTION 'DESTINATARIO_NO_VALIDADO';
    END IF;

    -- 9) Control optimista: el cliente decide sobre el estado que ve.
    IF p_version_incidente <> v_inc.version THEN
        RAISE EXCEPTION 'VERSION_DESACTUALIZADA'
            USING DETAIL = jsonb_build_object('versionActual', v_inc.version)::text;
    END IF;

    -- 10) Un solo relevo pendiente por incidente.
    SELECT * INTO v_rel
    FROM public.relevos_coordinacion
    WHERE incidente_id = v_inc.id AND estado = 'pendiente';
    IF FOUND THEN
        RAISE EXCEPTION 'RELEVO_PENDIENTE'
            USING DETAIL = public.treksafe_relevo_publico(v_rel)::text;
    END IF;

    -- 11) Inserción. Si salta una restricción única (otra vía escribió sin bloquear el
    --     incidente, o la misma operación llegó por dos sesiones), se resuelve releyendo.
    BEGIN
        INSERT INTO public.relevos_coordinacion
            (incidente_id, responsable_anterior_id, destinatario_id, motivo,
             version_incidente, operacion_id)
        VALUES
            (v_inc.id, p_actor_id, p_destinatario_id, v_motivo, v_inc.version, p_operacion_id)
        RETURNING * INTO v_rel;
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF v_constraint = 'uq_relevos_operacion' THEN
            SELECT * INTO v_rel FROM public.relevos_coordinacion WHERE operacion_id = p_operacion_id;
            IF FOUND AND v_rel.responsable_anterior_id = p_actor_id AND v_rel.incidente_id = v_inc.id THEN
                RETURN public.treksafe_resultado_relevo(v_inc, v_rel, TRUE);
            END IF;
            RAISE EXCEPTION 'INCIDENTE_NO_ENCONTRADO';
        END IF;
        SELECT * INTO v_rel
        FROM public.relevos_coordinacion
        WHERE incidente_id = v_inc.id AND estado = 'pendiente';
        RAISE EXCEPTION 'RELEVO_PENDIENTE'
            USING DETAIL = public.treksafe_relevo_publico(v_rel)::text;
    END;

    RETURN public.treksafe_resultado_relevo(v_inc, v_rel, FALSE);
END;
$$;

COMMENT ON FUNCTION public.treksafe_proponer_relevo(UUID, UUID, UUID, TEXT, INTEGER, UUID) IS
    'HU-40: el responsable vigente propone el relevo a otro rescatista validado. No cambia el responsable ni la versión. Una transacción, un solo pendiente, idempotente por operacion_id.';

REVOKE ALL ON FUNCTION public.treksafe_proponer_relevo(UUID, UUID, UUID, TEXT, INTEGER, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_proponer_relevo(UUID, UUID, UUID, TEXT, INTEGER, UUID)
    TO service_role;

-- 6) Aceptar un relevo.
CREATE OR REPLACE FUNCTION public.treksafe_aceptar_relevo(
    p_expedicion_id  UUID,
    p_actor_id       UUID,
    p_relevo_id      UUID,
    p_operacion_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_inc     public.incidentes%ROWTYPE;
    v_rel     public.relevos_coordinacion%ROWTYPE;
    v_inc_id  UUID;
BEGIN
    -- 1) Datos obligatorios.
    IF p_expedicion_id IS NULL OR p_actor_id IS NULL OR p_relevo_id IS NULL
       OR p_operacion_id IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 2) Operación de resolución ya registrada: mismo destinatario y relevo → mismo
    --    resultado sin escribir. De otro actor o relevo → no se revela nada ajeno. Si la
    --    operación resolvió el relevo de otra manera (rechazo), es de otro tipo.
    SELECT * INTO v_rel FROM public.relevos_coordinacion WHERE operacion_resolucion_id = p_operacion_id;
    IF FOUND THEN
        SELECT * INTO v_inc FROM public.incidentes WHERE id = v_rel.incidente_id;
        IF v_rel.destinatario_id = p_actor_id AND v_rel.id = p_relevo_id
           AND v_inc.expedicion_id = p_expedicion_id THEN
            IF v_rel.estado = 'aceptado' THEN
                RETURN public.treksafe_resultado_relevo(v_inc, v_rel, TRUE);
            END IF;
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;
        RAISE EXCEPTION 'RELEVO_NO_ENCONTRADO';
    END IF;

    -- 3) La operación ya se usó como propuesta o en otro tipo de operación.
    IF EXISTS (SELECT 1 FROM public.eventos_plan WHERE operacion_id = p_operacion_id)
       OR EXISTS (SELECT 1 FROM public.incidentes WHERE operacion_id = p_operacion_id)
       OR EXISTS (SELECT 1 FROM public.relevos_coordinacion WHERE operacion_id = p_operacion_id) THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 4) El actor debe ser un rescatista validado.
    IF NOT EXISTS (SELECT 1 FROM public.perfiles_rescatista WHERE usuario_id = p_actor_id) THEN
        RAISE EXCEPTION 'NO_ES_RESCATISTA';
    END IF;

    -- 5) El relevo debe existir y ser de esa expedición. Lectura sin bloqueo: el
    --    incidente de un relevo no cambia nunca.
    SELECT r.incidente_id INTO v_inc_id
    FROM public.relevos_coordinacion r
    JOIN public.incidentes i ON i.id = r.incidente_id
    WHERE r.id = p_relevo_id AND i.expedicion_id = p_expedicion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'RELEVO_NO_ENCONTRADO';
    END IF;

    -- 6) Bloqueo del incidente y relectura del relevo: pudo cambiar mientras se esperaba.
    SELECT * INTO v_inc FROM public.incidentes WHERE id = v_inc_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'RELEVO_NO_ENCONTRADO';
    END IF;
    SELECT * INTO v_rel FROM public.relevos_coordinacion WHERE id = p_relevo_id;

    -- 7) Solo el destinatario acepta.
    IF v_rel.destinatario_id <> p_actor_id THEN
        RAISE EXCEPTION 'NO_ES_DESTINATARIO';
    END IF;

    -- 8) Relevo ya resuelto (aceptado, rechazado o cancelado). La misma operación (otra
    --    sesión que ya aplicó) es una repetición segura; cualquier otra no se confirma en
    --    silencio y el DETAIL dice cómo quedó.
    IF v_rel.estado <> 'pendiente' THEN
        IF v_rel.operacion_resolucion_id = p_operacion_id AND v_rel.estado = 'aceptado' THEN
            RETURN public.treksafe_resultado_relevo(v_inc, v_rel, TRUE);
        END IF;
        RAISE EXCEPTION 'RELEVO_YA_RESUELTO'
            USING DETAIL = jsonb_build_object('estado', v_rel.estado)::text;
    END IF;

    -- 9) Caso cerrado (también si se cerró después de la propuesta).
    IF v_inc.estado = 'cerrado' THEN
        RAISE EXCEPTION 'INCIDENTE_CERRADO';
    END IF;

    -- 9b) El destinatario sigue siendo un rescatista validado.
    IF NOT EXISTS (
        SELECT 1 FROM public.perfiles_rescatista WHERE usuario_id = v_rel.destinatario_id
    ) THEN
        RAISE EXCEPTION 'DESTINATARIO_NO_VALIDADO';
    END IF;

    -- 10) Aplicación, todo en esta transacción. Aceptar no compara versión.
    UPDATE public.incidentes
    SET responsable_id = v_rel.destinatario_id,
        version = version + 1,
        asumido_en = NOW()
    WHERE id = v_inc.id
    RETURNING * INTO v_inc;

    UPDATE public.relevos_coordinacion
    SET estado = 'aceptado',
        resuelto_en = NOW(),
        resuelto_por_id = p_actor_id,
        operacion_resolucion_id = p_operacion_id
    WHERE id = v_rel.id
    RETURNING * INTO v_rel;

    INSERT INTO public.transferencias_coordinacion
        (incidente_id, relevo_id, responsable_anterior_id, responsable_nuevo_id, motivo,
         version_anterior, version_nueva, ocurrido_en)
    VALUES
        (v_inc.id, v_rel.id, v_rel.responsable_anterior_id, v_rel.destinatario_id, v_rel.motivo,
         v_inc.version - 1, v_inc.version, v_rel.resuelto_en);

    RETURN public.treksafe_resultado_relevo(v_inc, v_rel, FALSE);
END;
$$;

COMMENT ON FUNCTION public.treksafe_aceptar_relevo(UUID, UUID, UUID, UUID) IS
    'HU-40: el destinatario acepta el relevo pendiente. Cambia el responsable, sube la versión, resuelve el relevo (quién y cuándo) y registra la transferencia en una transacción. No compara versión.';

REVOKE ALL ON FUNCTION public.treksafe_aceptar_relevo(UUID, UUID, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_aceptar_relevo(UUID, UUID, UUID, UUID)
    TO service_role;

-- 7) Rechazar o cancelar un relevo pendiente. Una sola implementación; las dos RPC públicas
--    solo fijan el estado final. No cambian el responsable ni la versión del incidente.
CREATE OR REPLACE FUNCTION public.treksafe_resolver_relevo(
    p_expedicion_id  UUID,
    p_actor_id       UUID,
    p_relevo_id      UUID,
    p_operacion_id   UUID,
    p_estado_final   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_inc     public.incidentes%ROWTYPE;
    v_rel     public.relevos_coordinacion%ROWTYPE;
    v_inc_id  UUID;
BEGIN
    -- 1) Datos obligatorios.
    IF p_expedicion_id IS NULL OR p_actor_id IS NULL OR p_relevo_id IS NULL
       OR p_operacion_id IS NULL OR p_estado_final IS NULL
       OR p_estado_final NOT IN ('rechazado', 'cancelado') THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 2) Operación de resolución ya registrada: mismo actor, relevo y tipo → mismo
    --    resultado sin escribir. De otro actor o relevo → no se revela nada ajeno. De otro
    --    tipo (la operación aceptó o resolvió de otra manera) → DATOS_INVALIDOS.
    SELECT * INTO v_rel FROM public.relevos_coordinacion WHERE operacion_resolucion_id = p_operacion_id;
    IF FOUND THEN
        SELECT * INTO v_inc FROM public.incidentes WHERE id = v_rel.incidente_id;
        IF v_rel.resuelto_por_id = p_actor_id AND v_rel.id = p_relevo_id
           AND v_inc.expedicion_id = p_expedicion_id THEN
            IF v_rel.estado = p_estado_final THEN
                RETURN public.treksafe_resultado_relevo(v_inc, v_rel, TRUE);
            END IF;
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;
        RAISE EXCEPTION 'RELEVO_NO_ENCONTRADO';
    END IF;

    -- 3) La operación ya se usó como propuesta o en otro tipo de operación.
    IF EXISTS (SELECT 1 FROM public.eventos_plan WHERE operacion_id = p_operacion_id)
       OR EXISTS (SELECT 1 FROM public.incidentes WHERE operacion_id = p_operacion_id)
       OR EXISTS (SELECT 1 FROM public.relevos_coordinacion WHERE operacion_id = p_operacion_id) THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 4) El actor debe ser un rescatista validado.
    IF NOT EXISTS (SELECT 1 FROM public.perfiles_rescatista WHERE usuario_id = p_actor_id) THEN
        RAISE EXCEPTION 'NO_ES_RESCATISTA';
    END IF;

    -- 5) El relevo debe existir y ser de esa expedición (lectura sin bloqueo).
    SELECT r.incidente_id INTO v_inc_id
    FROM public.relevos_coordinacion r
    JOIN public.incidentes i ON i.id = r.incidente_id
    WHERE r.id = p_relevo_id AND i.expedicion_id = p_expedicion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'RELEVO_NO_ENCONTRADO';
    END IF;

    -- 6) Bloqueo del incidente y relectura del relevo: pudo cambiar mientras se esperaba.
    SELECT * INTO v_inc FROM public.incidentes WHERE id = v_inc_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'RELEVO_NO_ENCONTRADO';
    END IF;
    SELECT * INTO v_rel FROM public.relevos_coordinacion WHERE id = p_relevo_id;

    -- 7) Quién puede: el destinatario rechaza; quien propuso cancela.
    IF p_estado_final = 'rechazado' AND v_rel.destinatario_id <> p_actor_id THEN
        RAISE EXCEPTION 'NO_ES_DESTINATARIO';
    END IF;
    IF p_estado_final = 'cancelado' AND v_rel.responsable_anterior_id <> p_actor_id THEN
        RAISE EXCEPTION 'NO_ES_PROPONENTE';
    END IF;

    -- 8) Relevo ya resuelto por otra operación (aceptado, rechazado o cancelado). La misma
    --    operación (otra sesión que ya aplicó) es una repetición segura.
    IF v_rel.estado <> 'pendiente' THEN
        IF v_rel.operacion_resolucion_id = p_operacion_id AND v_rel.estado = p_estado_final THEN
            RETURN public.treksafe_resultado_relevo(v_inc, v_rel, TRUE);
        END IF;
        RAISE EXCEPTION 'RELEVO_YA_RESUELTO'
            USING DETAIL = jsonb_build_object('estado', v_rel.estado)::text;
    END IF;

    -- 9) Caso cerrado: el relevo pendiente queda inerte, no se escribe nada.
    IF v_inc.estado = 'cerrado' THEN
        RAISE EXCEPTION 'INCIDENTE_CERRADO';
    END IF;

    -- 10) Resolución: solo el relevo; el incidente no cambia.
    UPDATE public.relevos_coordinacion
    SET estado = p_estado_final,
        resuelto_en = NOW(),
        resuelto_por_id = p_actor_id,
        operacion_resolucion_id = p_operacion_id
    WHERE id = v_rel.id
    RETURNING * INTO v_rel;

    RETURN public.treksafe_resultado_relevo(v_inc, v_rel, FALSE);
END;
$$;

COMMENT ON FUNCTION public.treksafe_resolver_relevo(UUID, UUID, UUID, UUID, TEXT) IS
    'HU-40: implementación común de rechazar y cancelar. Solo cambia el relevo pendiente; no cambia el responsable ni la versión. Una transacción, idempotente por operacion_id.';

CREATE OR REPLACE FUNCTION public.treksafe_rechazar_relevo(
    p_expedicion_id  UUID,
    p_actor_id       UUID,
    p_relevo_id      UUID,
    p_operacion_id   UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT public.treksafe_resolver_relevo(p_expedicion_id, p_actor_id, p_relevo_id, p_operacion_id, 'rechazado');
$$;

COMMENT ON FUNCTION public.treksafe_rechazar_relevo(UUID, UUID, UUID, UUID) IS
    'HU-40: el destinatario rechaza el relevo pendiente. El responsable actual conserva la coordinación y se puede proponer otro relevo.';

CREATE OR REPLACE FUNCTION public.treksafe_cancelar_relevo(
    p_expedicion_id  UUID,
    p_actor_id       UUID,
    p_relevo_id      UUID,
    p_operacion_id   UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT public.treksafe_resolver_relevo(p_expedicion_id, p_actor_id, p_relevo_id, p_operacion_id, 'cancelado');
$$;

COMMENT ON FUNCTION public.treksafe_cancelar_relevo(UUID, UUID, UUID, UUID) IS
    'HU-40: quien propuso cancela el relevo pendiente. Conserva la coordinación y se puede proponer otro relevo.';

REVOKE ALL ON FUNCTION public.treksafe_resolver_relevo(UUID, UUID, UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_resolver_relevo(UUID, UUID, UUID, UUID, TEXT)
    TO service_role;
REVOKE ALL ON FUNCTION public.treksafe_rechazar_relevo(UUID, UUID, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_rechazar_relevo(UUID, UUID, UUID, UUID)
    TO service_role;
REVOKE ALL ON FUNCTION public.treksafe_cancelar_relevo(UUID, UUID, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_cancelar_relevo(UUID, UUID, UUID, UUID)
    TO service_role;

DO $$
BEGIN
    IF to_regclass('public.treksafe_migraciones') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO public.treksafe_migraciones (version, nombre, hu)
            VALUES ('019', 'hu40_transferir_coordinacion', 'HU-40')
            ON CONFLICT (version) DO NOTHING
        $sql$;
    END IF;
END
$$;

COMMIT;
