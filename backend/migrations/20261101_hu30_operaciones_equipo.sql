-- HU-30, fase 5. Aplicar después de 20261101_hu30_listas_equipo.sql.
BEGIN;

-- Mantiene el orden del formulario sin depender del orden físico de PostgreSQL.
ALTER TABLE public.items_lista_equipo ADD COLUMN posicion INTEGER;
WITH posiciones AS (
    SELECT id, (ROW_NUMBER() OVER (PARTITION BY lista_equipo_id ORDER BY id) - 1)::INTEGER AS valor
    FROM public.items_lista_equipo
)
UPDATE public.items_lista_equipo AS item
SET posicion = posiciones.valor FROM posiciones WHERE posiciones.id = item.id;
ALTER TABLE public.items_lista_equipo
    ALTER COLUMN posicion SET NOT NULL,
    ADD CONSTRAINT chk_items_lista_equipo_posicion CHECK (posicion >= 0),
    ADD CONSTRAINT uq_items_lista_equipo_posicion UNIQUE (lista_equipo_id, posicion)
        DEFERRABLE INITIALLY DEFERRED;

-- Validación compartida de las escrituras. No lee datos ni otorga privilegios.
CREATE FUNCTION public.treksafe_validar_datos_lista_equipo(p_datos JSONB, p_permitir_ids BOOLEAN)
RETURNS VOID LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    v_item JSONB;
    v_id UUID;
    v_ids UUID[] := ARRAY[]::UUID[];
BEGIN
    IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object'
        OR jsonb_typeof(p_datos->'nombre') IS DISTINCT FROM 'string'
        OR (p_datos->>'nombre') !~ '[^[:space:]]' THEN
        RAISE EXCEPTION USING MESSAGE = 'El nombre de la lista es obligatorio.', DETAIL = 'NOMBRE_LISTA_INVALIDO';
    END IF;
    IF jsonb_typeof(p_datos->'items') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION USING MESSAGE = 'Los items deben ser una coleccion.', DETAIL = 'ITEMS_INVALIDOS';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_datos->'items') LOOP
        IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION USING MESSAGE = 'El item debe ser un objeto.', DETAIL = 'ITEM_INVALIDO';
        END IF;
        IF jsonb_typeof(v_item->'nombre') IS DISTINCT FROM 'string'
            OR (v_item->>'nombre') !~ '[^[:space:]]' THEN
            RAISE EXCEPTION USING MESSAGE = 'El nombre del item es obligatorio.', DETAIL = 'NOMBRE_ITEM_INVALIDO';
        END IF;
        IF jsonb_typeof(v_item->'obligatorio') IS DISTINCT FROM 'boolean' THEN
            RAISE EXCEPTION USING MESSAGE = 'El indicador obligatorio debe ser booleano.', DETAIL = 'OBLIGATORIO_INVALIDO';
        END IF;
        IF v_item ? 'id' THEN
            IF NOT p_permitir_ids THEN
                RAISE EXCEPTION USING MESSAGE = 'Los items nuevos no pueden incluir ids.', DETAIL = 'ITEM_ID_NO_PERMITIDO';
            END IF;
            IF jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string' THEN
                RAISE EXCEPTION USING MESSAGE = 'El id del item no es valido.', DETAIL = 'ID_ITEM_INVALIDO';
            END IF;
            BEGIN
                v_id := (v_item->>'id')::UUID;
            EXCEPTION WHEN invalid_text_representation THEN
                RAISE EXCEPTION USING MESSAGE = 'El id del item no es valido.', DETAIL = 'ID_ITEM_INVALIDO';
            END;
            IF v_id = ANY(v_ids) THEN
                RAISE EXCEPTION USING MESSAGE = 'El id del item esta repetido.', DETAIL = 'ITEM_DUPLICADO';
            END IF;
            v_ids := array_append(v_ids, v_id);
        END IF;
    END LOOP;
END;
$$;

CREATE FUNCTION public.treksafe_obtener_lista_equipo(p_senderista_id UUID, p_lista_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT jsonb_build_object(
        'id', lista.id, 'senderistaId', lista.senderista_id, 'nombre', lista.nombre,
        'creadoEn', lista.creado_en, 'actualizadoEn', lista.actualizado_en,
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', item.id, 'nombre', item.nombre,
                'obligatorio', item.obligatorio) ORDER BY item.posicion, item.id)
            FROM public.items_lista_equipo item WHERE item.lista_equipo_id = lista.id
        ), '[]'::JSONB)
    ) FROM public.listas_equipo lista
    WHERE lista.id = p_lista_id AND lista.senderista_id = p_senderista_id;
$$;

CREATE FUNCTION public.treksafe_listar_listas_equipo(p_senderista_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT COALESCE(jsonb_agg(public.treksafe_obtener_lista_equipo(p_senderista_id, lista.id)
        ORDER BY lista.creado_en, lista.id), '[]'::JSONB)
    FROM public.listas_equipo lista WHERE lista.senderista_id = p_senderista_id;
$$;

CREATE FUNCTION public.treksafe_crear_lista_equipo(p_senderista_id UUID, p_datos JSONB)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    v_lista_id UUID;
BEGIN
    PERFORM public.treksafe_validar_datos_lista_equipo(p_datos, FALSE);
    INSERT INTO public.listas_equipo (senderista_id, nombre)
    VALUES (p_senderista_id, regexp_replace(p_datos->>'nombre', '^[[:space:]]+|[[:space:]]+$', '', 'g'))
    RETURNING id INTO v_lista_id;
    INSERT INTO public.items_lista_equipo (lista_equipo_id, nombre, obligatorio, posicion)
    SELECT v_lista_id, regexp_replace(item->>'nombre', '^[[:space:]]+|[[:space:]]+$', '', 'g'),
        (item->>'obligatorio')::BOOLEAN, (posicion - 1)::INTEGER
    FROM jsonb_array_elements(p_datos->'items') WITH ORDINALITY AS entrada(item, posicion);
    RETURN public.treksafe_obtener_lista_equipo(p_senderista_id, v_lista_id);
END;
$$;

CREATE FUNCTION public.treksafe_actualizar_lista_equipo(p_senderista_id UUID, p_lista_id UUID, p_datos JSONB)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
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
$$;

CREATE FUNCTION public.treksafe_eliminar_lista_equipo(p_senderista_id UUID, p_lista_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
    DELETE FROM public.listas_equipo WHERE id = p_lista_id AND senderista_id = p_senderista_id;
    RETURN FOUND;
END;
$$;

-- Sin SECURITY DEFINER: los permisos del ejecutor siguen siendo necesarios.
REVOKE ALL ON FUNCTION public.treksafe_validar_datos_lista_equipo(JSONB, BOOLEAN),
    public.treksafe_obtener_lista_equipo(UUID, UUID), public.treksafe_listar_listas_equipo(UUID),
    public.treksafe_crear_lista_equipo(UUID, JSONB), public.treksafe_actualizar_lista_equipo(UUID, UUID, JSONB),
    public.treksafe_eliminar_lista_equipo(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treksafe_validar_datos_lista_equipo(JSONB, BOOLEAN),
    public.treksafe_obtener_lista_equipo(UUID, UUID), public.treksafe_listar_listas_equipo(UUID),
    public.treksafe_crear_lista_equipo(UUID, JSONB), public.treksafe_actualizar_lista_equipo(UUID, UUID, JSONB),
    public.treksafe_eliminar_lista_equipo(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
