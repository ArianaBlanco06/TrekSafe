-- Ejecutar como propietario en una base DESECHABLE con ambas migraciones HU-30 aplicadas.
-- Todas las cuentas y listas de prueba se revierten al terminar.
BEGIN;

DO $$
DECLARE
    v_senderista_a UUID := gen_random_uuid();
    v_senderista_b UUID := gen_random_uuid();
    v_rescatista   UUID := gen_random_uuid();
    v_lista_a     UUID;
    v_lista_b     UUID;
    v_lista_fallo UUID := gen_random_uuid();
    v_nombre      TEXT;
    v_obligatorio BOOLEAN;
    v_rol         TEXT;
    v_tabla       TEXT;
    v_permiso     TEXT;
BEGIN
    INSERT INTO public.usuarios (id, correo_electronico, hash_contrasena, rol)
    VALUES
        (v_senderista_a, v_senderista_a::TEXT || '@example.invalid', 'fixture-no-login', 'senderista'),
        (v_senderista_b, v_senderista_b::TEXT || '@example.invalid', 'fixture-no-login', 'senderista'),
        (v_rescatista, v_rescatista::TEXT || '@example.invalid', 'fixture-no-login', 'rescatista');

    INSERT INTO public.perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento)
    VALUES
        (v_senderista_a, 'Senderista A HU-30', '+51900000001', 'HU30-' || LEFT(v_senderista_a::TEXT, 15)),
        (v_senderista_b, 'Senderista B HU-30', '+51900000002', 'HU30-' || LEFT(v_senderista_b::TEXT, 15));

    INSERT INTO public.listas_equipo (senderista_id, nombre)
    VALUES (v_senderista_a, 'Equipo de alta montana') RETURNING id INTO v_lista_a;

    IF EXISTS (SELECT 1 FROM public.items_lista_equipo WHERE lista_equipo_id = v_lista_a) THEN
        RAISE EXCEPTION 'Una lista nueva debe poder existir sin items';
    END IF;

    -- El nombre no es globalmente unico: dos propietarios pueden usar el mismo.
    INSERT INTO public.listas_equipo (senderista_id, nombre)
    VALUES (v_senderista_b, 'Equipo de alta montana') RETURNING id INTO v_lista_b;

    INSERT INTO public.items_lista_equipo (lista_equipo_id, nombre, obligatorio, posicion)
    VALUES (v_lista_a, 'Casco', TRUE, 0), (v_lista_a, 'Bastones', FALSE, 1);

    SELECT obligatorio INTO v_obligatorio
    FROM public.items_lista_equipo WHERE lista_equipo_id = v_lista_a AND nombre = 'Casco';
    IF v_obligatorio IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Debe conservar el indicador obligatorio';
    END IF;

    INSERT INTO public.items_lista_equipo (lista_equipo_id, nombre, posicion)
    VALUES (v_lista_b, 'Camara', 0);
    SELECT obligatorio INTO v_obligatorio
    FROM public.items_lista_equipo WHERE lista_equipo_id = v_lista_b AND nombre = 'Camara';
    IF v_obligatorio IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'El indicador opcional debe persistir y ser el valor inicial';
    END IF;

    FOREACH v_nombre IN ARRAY ARRAY['', '   ', E'\t\n'] LOOP
        BEGIN
            INSERT INTO public.listas_equipo (senderista_id, nombre) VALUES (v_senderista_a, v_nombre);
            RAISE EXCEPTION 'Debe rechazar un nombre de lista vacio';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
        BEGIN
            INSERT INTO public.items_lista_equipo (lista_equipo_id, nombre, posicion) VALUES (v_lista_a, v_nombre, 2);
            RAISE EXCEPTION 'Debe rechazar un nombre de item vacio';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
    END LOOP;

    BEGIN
        INSERT INTO public.items_lista_equipo (lista_equipo_id, nombre, obligatorio, posicion)
        VALUES (v_lista_a, 'Linterna', NULL, 3);
        RAISE EXCEPTION 'Debe rechazar un indicador obligatorio nulo';
    EXCEPTION WHEN not_null_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO public.listas_equipo (senderista_id, nombre) VALUES (v_rescatista, 'Lista ajena al rol');
        RAISE EXCEPTION 'Debe exigir un perfil senderista como propietario';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO public.items_lista_equipo (lista_equipo_id, nombre, posicion)
        VALUES (gen_random_uuid(), 'Item sin lista', 0);
        RAISE EXCEPTION 'Debe rechazar un item sin lista existente';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    -- Verifica el rollback de escrituras agrupadas. No sustituye la futura prueba del DAO/RPC.
    BEGIN
        INSERT INTO public.listas_equipo (id, senderista_id, nombre)
        VALUES (v_lista_fallo, v_senderista_a, 'Operacion que debe revertirse');
        INSERT INTO public.items_lista_equipo (lista_equipo_id, nombre, posicion) VALUES (v_lista_fallo, '', 0);
        RAISE EXCEPTION 'El item invalido debe provocar un error';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    IF EXISTS (SELECT 1 FROM public.listas_equipo WHERE id = v_lista_fallo) THEN
        RAISE EXCEPTION 'Una escritura fallida no debe dejar una lista parcial';
    END IF;

    DELETE FROM public.listas_equipo WHERE id = v_lista_a;
    IF EXISTS (SELECT 1 FROM public.items_lista_equipo WHERE lista_equipo_id = v_lista_a) THEN
        RAISE EXCEPTION 'Eliminar una lista debe eliminar sus items';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.listas_equipo WHERE id = v_lista_b) THEN
        RAISE EXCEPTION 'Eliminar una lista no debe afectar a otras listas';
    END IF;

    DELETE FROM public.usuarios WHERE id = v_senderista_b;
    IF EXISTS (SELECT 1 FROM public.listas_equipo WHERE id = v_lista_b)
        OR EXISTS (SELECT 1 FROM public.items_lista_equipo WHERE lista_equipo_id = v_lista_b) THEN
        RAISE EXCEPTION 'Eliminar la cuenta debe eliminar sus listas e items';
    END IF;

    FOREACH v_tabla IN ARRAY ARRAY['listas_equipo', 'items_lista_equipo'] LOOP
        IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_tabla)::regclass) THEN
            RAISE EXCEPTION 'RLS debe estar activo en %', v_tabla;
        END IF;
        FOREACH v_permiso IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
            FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
                IF has_table_privilege(v_rol, 'public.' || v_tabla, v_permiso) THEN
                    RAISE EXCEPTION '% no debe tener acceso directo % sobre %', v_rol, v_permiso, v_tabla;
                END IF;
            END LOOP;
            IF NOT has_table_privilege('service_role', 'public.' || v_tabla, v_permiso) THEN
                RAISE EXCEPTION 'El backend requiere % sobre %', v_permiso, v_tabla;
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'HU-30: esquema, restricciones, cascadas y permisos comprobados';
END;
$$;

ROLLBACK;
