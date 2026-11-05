-- Aplicar una vez despues de 004_hu31_preparacion_expedicion.sql.
BEGIN;

CREATE FUNCTION public.treksafe_obtener_preparacion(p_senderista_id UUID, p_expedicion_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    v_resultado JSONB;
BEGIN
    -- STABLE: propiedad, cabecera e items se consultan con una misma instantanea.
    PERFORM 1 FROM public.expediciones
    WHERE id = p_expedicion_id AND senderista_id = p_senderista_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING MESSAGE = 'Expedicion no encontrada.', DETAIL = 'EXPEDICION_NO_ENCONTRADA';
    END IF;
    SELECT jsonb_build_object(
        'id', p.id, 'expedicionId', p.expedicion_id, 'senderistaId', p_senderista_id,
        'listaOrigenId', p.lista_origen_id, 'nombreLista', p.nombre_lista,
        'creadoEn', p.creado_en, 'actualizadoEn', p.actualizado_en,
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', i.id, 'nombre', i.nombre, 'obligatorio', i.obligatorio, 'preparado', i.preparado
            ) ORDER BY i.posicion, i.id)
            FROM public.items_preparacion_expedicion i WHERE i.preparacion_id = p.id
        ), '[]'::JSONB)
    ) INTO v_resultado FROM public.preparaciones_expedicion p
    WHERE p.expedicion_id = p_expedicion_id;
    RETURN v_resultado;
END;
$$;

CREATE FUNCTION public.treksafe_asociar_lista_expedicion(
    p_senderista_id UUID, p_expedicion_id UUID, p_lista_id UUID
)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    v_estado TEXT;
    v_nombre TEXT;
    v_preparacion_id UUID;
BEGIN
    -- Orden de bloqueo: expedicion, lista base. Serializa asociaciones y cambios de estado.
    SELECT estado::TEXT INTO v_estado FROM public.expediciones
    WHERE id = p_expedicion_id AND senderista_id = p_senderista_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING MESSAGE = 'Expedicion no encontrada.', DETAIL = 'EXPEDICION_NO_ENCONTRADA';
    END IF;
    -- HU-30 tambien bloquea esta cabecera al editar: no se mezclan versiones de items.
    SELECT nombre INTO v_nombre FROM public.listas_equipo
    WHERE id = p_lista_id AND senderista_id = p_senderista_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING MESSAGE = 'Lista de equipo no encontrada.', DETAIL = 'LISTA_EQUIPO_NO_ENCONTRADA';
    END IF;
    IF v_estado NOT IN ('programada', 'en_progreso') THEN
        RAISE EXCEPTION USING MESSAGE = 'La preparacion no admite cambios en este estado.', DETAIL = 'PREPARACION_NO_EDITABLE';
    END IF;
    IF EXISTS (SELECT 1 FROM public.preparaciones_expedicion WHERE expedicion_id = p_expedicion_id) THEN
        RAISE EXCEPTION USING MESSAGE = 'La expedicion ya tiene una lista asociada.', DETAIL = 'PREPARACION_YA_ASOCIADA';
    END IF;

    INSERT INTO public.preparaciones_expedicion(expedicion_id, lista_origen_id, nombre_lista)
    VALUES (p_expedicion_id, p_lista_id, v_nombre) RETURNING id INTO v_preparacion_id;
    INSERT INTO public.items_preparacion_expedicion(preparacion_id, nombre, obligatorio, preparado, posicion)
    SELECT v_preparacion_id, nombre, obligatorio, FALSE, posicion
    FROM public.items_lista_equipo WHERE lista_equipo_id = p_lista_id ORDER BY posicion;

    RETURN public.treksafe_obtener_preparacion(p_senderista_id, p_expedicion_id);
END;
$$;

CREATE FUNCTION public.treksafe_establecer_item_preparado(
    p_senderista_id UUID, p_expedicion_id UUID, p_item_id UUID, p_preparado BOOLEAN
)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    v_estado TEXT;
    v_preparacion_id UUID;
    v_preparado BOOLEAN;
BEGIN
    SELECT estado::TEXT INTO v_estado FROM public.expediciones
    WHERE id = p_expedicion_id AND senderista_id = p_senderista_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING MESSAGE = 'Expedicion no encontrada.', DETAIL = 'EXPEDICION_NO_ENCONTRADA';
    END IF;
    SELECT p.id, i.preparado INTO v_preparacion_id, v_preparado
    FROM public.preparaciones_expedicion p
    JOIN public.items_preparacion_expedicion i ON i.preparacion_id = p.id
    WHERE p.expedicion_id = p_expedicion_id AND i.id = p_item_id
    FOR UPDATE OF p, i;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING MESSAGE = 'Item de preparacion no encontrado.', DETAIL = 'ITEM_PREPARACION_NO_ENCONTRADO';
    END IF;
    IF v_estado NOT IN ('programada', 'en_progreso') THEN
        RAISE EXCEPTION USING MESSAGE = 'La preparacion no admite cambios en este estado.', DETAIL = 'PREPARACION_NO_EDITABLE';
    END IF;
    IF p_preparado IS NULL THEN
        RAISE EXCEPTION USING MESSAGE = 'La marca debe ser booleana.', DETAIL = 'PREPARADO_INVALIDO';
    END IF;
    IF v_preparado IS DISTINCT FROM p_preparado THEN
        UPDATE public.items_preparacion_expedicion SET preparado = p_preparado WHERE id = p_item_id;
        UPDATE public.preparaciones_expedicion SET actualizado_en = clock_timestamp() WHERE id = v_preparacion_id;
    END IF;
    RETURN public.treksafe_obtener_preparacion(p_senderista_id, p_expedicion_id);
END;
$$;

REVOKE ALL ON FUNCTION public.treksafe_obtener_preparacion(UUID, UUID),
    public.treksafe_asociar_lista_expedicion(UUID, UUID, UUID),
    public.treksafe_establecer_item_preparado(UUID, UUID, UUID, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_obtener_preparacion(UUID, UUID),
    public.treksafe_asociar_lista_expedicion(UUID, UUID, UUID),
    public.treksafe_establecer_item_preparado(UUID, UUID, UUID, BOOLEAN) TO service_role;

COMMIT;
