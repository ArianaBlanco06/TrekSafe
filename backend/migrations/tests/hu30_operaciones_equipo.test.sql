-- Prueba directa de las RPC: evita que una validación previa de TypeScript oculte defectos SQL.
BEGIN;
DO $$
DECLARE
    v_actor UUID := gen_random_uuid();
    v_otro UUID := gen_random_uuid();
    v_lista JSONB;
    v_ajena JSONB;
    v_id UUID;
    v_antes JSONB;
    v_codigo TEXT;
    v_funcion REGPROCEDURE;
    v_rol TEXT;
BEGIN
    INSERT INTO public.usuarios (id, correo_electronico, hash_contrasena, rol)
    VALUES (v_actor, v_actor::TEXT || '@example.invalid', 'fixture', 'senderista'),
           (v_otro, v_otro::TEXT || '@example.invalid', 'fixture', 'senderista');
    INSERT INTO public.perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento)
    VALUES (v_actor, 'RPC A', '+51900000001', LEFT(v_actor::TEXT, 20)),
           (v_otro, 'RPC B', '+51900000002', LEFT(v_otro::TEXT, 20));

    v_lista := public.treksafe_crear_lista_equipo(v_actor,
        '{"nombre":" Montaña ","items":[{"nombre":"Casco","obligatorio":true},{"nombre":"Cámara","obligatorio":false}]}');
    v_id := (v_lista->>'id')::UUID;
    IF v_lista->>'nombre' <> 'Montaña' OR v_lista->'items'->0->>'nombre' <> 'Casco' THEN
        RAISE EXCEPTION 'Debe normalizar y conservar el orden de entrada';
    END IF;
    v_ajena := public.treksafe_crear_lista_equipo(v_otro,
        '{"nombre":"Otra","items":[{"nombre":"Abrigo","obligatorio":true}]}');
    IF public.treksafe_obtener_lista_equipo(v_otro, v_id) IS NOT NULL
        OR public.treksafe_actualizar_lista_equipo(v_otro, v_id, '{"nombre":"Intrusion","items":[]}') IS NOT NULL
        OR public.treksafe_eliminar_lista_equipo(v_otro, v_id) THEN
        RAISE EXCEPTION 'Las RPC no deben operar sobre listas ajenas';
    END IF;

    v_antes := public.treksafe_obtener_lista_equipo(v_actor, v_id);
    BEGIN
        PERFORM public.treksafe_actualizar_lista_equipo(v_actor, v_id,
            jsonb_build_object('nombre', 'Intrusion', 'items', v_ajena->'items'));
        RAISE EXCEPTION 'Debe rechazar ids de otra lista';
    EXCEPTION WHEN raise_exception THEN
        GET STACKED DIAGNOSTICS v_codigo = PG_EXCEPTION_DETAIL;
        IF v_codigo IS DISTINCT FROM 'ITEM_NO_PERTENECE' THEN RAISE; END IF;
    END;
    BEGIN
        PERFORM public.treksafe_actualizar_lista_equipo(v_actor, v_id,
            '{"nombre":"Cambio parcial","items":[{"nombre":"Valido","obligatorio":true},{"nombre":"","obligatorio":false}]}');
        RAISE EXCEPTION 'Debe rechazar un item invalido';
    EXCEPTION WHEN raise_exception THEN
        GET STACKED DIAGNOSTICS v_codigo = PG_EXCEPTION_DETAIL;
        IF v_codigo IS DISTINCT FROM 'NOMBRE_ITEM_INVALIDO' THEN RAISE; END IF;
    END;
    IF public.treksafe_obtener_lista_equipo(v_actor, v_id) <> v_antes THEN
        RAISE EXCEPTION 'El error no debe cambiar nombre, items ni fecha';
    END IF;

    -- Un intercambio de posiciones no debe chocar con la unicidad transitoria.
    v_lista := public.treksafe_actualizar_lista_equipo(v_actor, v_id,
        jsonb_build_object('nombre', 'Invierno', 'items',
            jsonb_build_array(v_lista->'items'->1, v_lista->'items'->0)));
    IF v_lista->'items'->0->>'nombre' <> 'Cámara' THEN RAISE EXCEPTION 'Debe conservar el nuevo orden'; END IF;
    SET CONSTRAINTS uq_items_lista_equipo_posicion IMMEDIATE;

    FOREACH v_funcion IN ARRAY ARRAY[
        'public.treksafe_validar_datos_lista_equipo(jsonb,boolean)'::REGPROCEDURE,
        'public.treksafe_obtener_lista_equipo(uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_listar_listas_equipo(uuid)'::REGPROCEDURE,
        'public.treksafe_crear_lista_equipo(uuid,jsonb)'::REGPROCEDURE,
        'public.treksafe_actualizar_lista_equipo(uuid,uuid,jsonb)'::REGPROCEDURE,
        'public.treksafe_eliminar_lista_equipo(uuid,uuid)'::REGPROCEDURE
    ] LOOP
        FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF has_function_privilege(v_rol, v_funcion, 'EXECUTE') THEN
                RAISE EXCEPTION 'No debe exponerse la RPC % al rol %', v_funcion, v_rol;
            END IF;
        END LOOP;
        IF NOT has_function_privilege('service_role', v_funcion, 'EXECUTE') THEN
            RAISE EXCEPTION 'Falta permiso del backend para %', v_funcion;
        END IF;
    END LOOP;
    RAISE NOTICE 'HU-30: RPC, orden, aislamiento, rollback y permisos comprobados';
END;
$$;
ROLLBACK;
