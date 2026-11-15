-- Solo lectura DEV; capturada para comparar; NO ejecutar como migración.
CREATE OR REPLACE FUNCTION public.treksafe_actualizar_lista_equipo(p_senderista_id uuid, p_lista_id uuid, p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_item JSONB;
    v_posicion BIGINT;
BEGIN
    -- El bloqueo serializa edición y eliminación sobre la misma lista.
    PERFORM 1 FROM public.listas_equipo
    WHERE id = p_lista_id AND senderista_id = p_senderista_id FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    PERFORM public.treksafe_validar_datos_lista_equipo(p_datos, TRUE);
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_datos->'items') AS entrada(item)
        WHERE item ? 'id' AND NOT EXISTS (
            SELECT 1 FROM public.items_lista_equipo existente
            WHERE existente.id = (item->>'id')::UUID AND existente.lista_equipo_id = p_lista_id
        )
    ) THEN
        RAISE EXCEPTION USING MESSAGE = 'El item no pertenece a esta lista.', DETAIL = 'ITEM_NO_PERTENECE';
    END IF;

    UPDATE public.listas_equipo
    SET nombre = regexp_replace(p_datos->>'nombre', '^[[:space:]]+|[[:space:]]+$', '', 'g'),
        actualizado_en = clock_timestamp()
    WHERE id = p_lista_id AND senderista_id = p_senderista_id;

    DELETE FROM public.items_lista_equipo existente
    WHERE existente.lista_equipo_id = p_lista_id AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_datos->'items') AS entrada(item)
        WHERE item ? 'id' AND (item->>'id')::UUID = existente.id
    );
    FOR v_item, v_posicion IN
        SELECT item, posicion FROM jsonb_array_elements(p_datos->'items')
        WITH ORDINALITY AS entrada(item, posicion)
    LOOP
        IF v_item ? 'id' THEN
            UPDATE public.items_lista_equipo
            SET nombre = regexp_replace(v_item->>'nombre', '^[[:space:]]+|[[:space:]]+$', '', 'g'),
                obligatorio = (v_item->>'obligatorio')::BOOLEAN, posicion = (v_posicion - 1)::INTEGER
            WHERE id = (v_item->>'id')::UUID AND lista_equipo_id = p_lista_id;
        ELSE
            INSERT INTO public.items_lista_equipo (lista_equipo_id, nombre, obligatorio, posicion)
            VALUES (p_lista_id, regexp_replace(v_item->>'nombre', '^[[:space:]]+|[[:space:]]+$', '', 'g'),
                (v_item->>'obligatorio')::BOOLEAN, (v_posicion - 1)::INTEGER);
        END IF;
    END LOOP;
    RETURN public.treksafe_obtener_lista_equipo(p_senderista_id, p_lista_id);
END;
$function$

