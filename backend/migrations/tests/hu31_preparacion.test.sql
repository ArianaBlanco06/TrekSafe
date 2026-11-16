-- Solo PostgreSQL local desechable; todos los datos y permisos de prueba se revierten.
BEGIN;
DO $$
DECLARE
    v_tabla REGCLASS;
    v_funcion REGPROCEDURE;
    v_rol TEXT;
    v_privilegio TEXT;
    v_actor UUID := gen_random_uuid();
    v_expedicion UUID := gen_random_uuid();
    v_preparacion UUID;
BEGIN
    FOREACH v_tabla IN ARRAY ARRAY[
        'public.preparaciones_expedicion'::REGCLASS,
        'public.items_preparacion_expedicion'::REGCLASS
    ] LOOP
        IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = v_tabla) THEN
            RAISE EXCEPTION 'Falta RLS en %', v_tabla;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = v_tabla AND polname = 'treksafe_deny_anon_authenticated') THEN
            RAISE EXCEPTION 'Falta politica privada en %', v_tabla;
        END IF;
        FOREACH v_privilegio IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
            FOREACH v_rol IN ARRAY ARRAY['anon','authenticated'] LOOP
                IF has_table_privilege(v_rol, v_tabla, v_privilegio) THEN
                    RAISE EXCEPTION 'Permiso directo inesperado: % % %', v_rol, v_tabla, v_privilegio;
                END IF;
            END LOOP;
            IF NOT has_table_privilege('service_role', v_tabla, v_privilegio) THEN
                RAISE EXCEPTION 'Falta permiso backend: % %', v_tabla, v_privilegio;
            END IF;
        END LOOP;
    END LOOP;
    FOREACH v_funcion IN ARRAY ARRAY[
        'public.treksafe_obtener_preparacion(uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_asociar_lista_expedicion(uuid,uuid,uuid)'::REGPROCEDURE,
        'public.treksafe_establecer_item_preparado(uuid,uuid,uuid,boolean)'::REGPROCEDURE
    ] LOOP
        IF (SELECT prosecdef FROM pg_proc WHERE oid = v_funcion) THEN
            RAISE EXCEPTION 'La RPC debe ser SECURITY INVOKER: %', v_funcion;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) c
            WHERE p.oid = v_funcion AND c = 'search_path=""') THEN
            RAISE EXCEPTION 'La RPC debe tener search_path vacio: %', v_funcion;
        END IF;
        FOREACH v_rol IN ARRAY ARRAY['anon','authenticated'] LOOP
            IF has_function_privilege(v_rol, v_funcion, 'EXECUTE') THEN
                RAISE EXCEPTION 'RPC expuesta al cliente: % %', v_funcion, v_rol;
            END IF;
        END LOOP;
        IF NOT has_function_privilege('service_role', v_funcion, 'EXECUTE') THEN
            RAISE EXCEPTION 'Falta permiso backend: %', v_funcion;
        END IF;
    END LOOP;

    INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol)
    VALUES(v_actor,v_actor::TEXT || '@example.invalid','fixture','senderista');
    INSERT INTO public.perfiles_senderista(usuario_id,nombre_completo,telefono,id_documento)
    VALUES(v_actor,'Prueba esquema HU-31','+51900000001',LEFT(v_actor::TEXT,20));
    INSERT INTO public.expediciones(id,senderista_id,lugar_inicio,lugar_fin,hora_inicio,hora_retorno_estimada)
    VALUES(v_expedicion,v_actor,'Inicio','Fin',NOW(),NOW()+INTERVAL '1 day');
    INSERT INTO public.preparaciones_expedicion(expedicion_id,nombre_lista)
    VALUES(v_expedicion,'Equipo') RETURNING id INTO v_preparacion;
    BEGIN
        INSERT INTO public.preparaciones_expedicion(expedicion_id,nombre_lista) VALUES(v_expedicion,'Duplicada');
        RAISE EXCEPTION 'Debe rechazar dos preparaciones de la misma expedicion';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.items_preparacion_expedicion(preparacion_id,nombre,obligatorio,posicion)
        VALUES(v_preparacion,' ',TRUE,0);
        RAISE EXCEPTION 'Debe rechazar nombres vacios';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.items_preparacion_expedicion(preparacion_id,nombre,obligatorio,posicion)
        VALUES(v_preparacion,'Casco',TRUE,-1);
        RAISE EXCEPTION 'Debe rechazar posiciones negativas';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    INSERT INTO public.items_preparacion_expedicion(preparacion_id,nombre,obligatorio,posicion)
    VALUES(v_preparacion,'Casco',TRUE,0);
    IF (SELECT preparado FROM public.items_preparacion_expedicion WHERE preparacion_id = v_preparacion) IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'La marca inicial debe ser falsa';
    END IF;
    RAISE NOTICE 'HU-31: esquema, unicidad, nombres, posiciones, RLS y permisos comprobados';
END;
$$;
ROLLBACK;
