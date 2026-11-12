-- DEP-04: un aviso in-app se confirma junto con el evento que lo origina.
-- Requiere 012 y 013. No agrega tipos al historial HU-36 ni modifica filas previas.
BEGIN;
CREATE FUNCTION public.treksafe_aviso_desde_evento_plan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
    v_tipo TEXT;
    v_titulo TEXT;
    v_mensaje TEXT;
    v_hora TEXT;
BEGIN
    CASE NEW.tipo
    WHEN 'EDITADA' THEN
        v_tipo := 'edicion'; v_titulo := 'Plan de expedición modificado';
        v_mensaje := 'Se actualizaron los datos de tu plan.';
    WHEN 'CANCELADA' THEN
        v_tipo := 'cancelacion'; v_titulo := 'Expedición cancelada';
        v_mensaje := 'La expedición ha sido cancelada. Motivo: ' || coalesce(NEW.motivo, 'sin motivo');
    WHEN 'RETORNO_AMPLIADO' THEN
        v_tipo := 'ampliacion'; v_titulo := 'Plazo de retorno ampliado';
        v_hora := NEW.cambios->'horaRetornoEstimada'->>'despues';
        IF v_hora IS NOT NULL THEN
            v_hora := to_char(v_hora::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
        END IF;
        v_mensaje := 'Se ha extendido el tiempo límite de retorno hasta: ' || coalesce(v_hora, 'nueva hora límite') || '.';
    ELSE RAISE EXCEPTION 'TIPO_EVENTO_PLAN_INVALIDO';
    END CASE;
    INSERT INTO public.avisos_usuario (
        usuario_id, expedicion_id, evento_id, clave_evento, tipo, titulo, mensaje
    ) VALUES (NEW.senderista_id, NEW.expedicion_id, NEW.id, NEW.id::text, v_tipo, v_titulo, v_mensaje)
    ON CONFLICT (usuario_id, clave_evento) DO NOTHING;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.treksafe_aviso_desde_evento_plan() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_aviso_desde_evento_plan() TO service_role;
CREATE TRIGGER treksafe_evento_plan_crear_aviso
    AFTER INSERT ON public.eventos_plan FOR EACH ROW
    EXECUTE FUNCTION public.treksafe_aviso_desde_evento_plan();
CREATE INDEX IF NOT EXISTS idx_avisos_expedicion ON public.avisos_usuario(expedicion_id);
INSERT INTO public.treksafe_migraciones(version, nombre, hu)
VALUES ('023', 'dep108_avisos_transaccionales', 'DEP-04');
COMMIT;
