-- Solo PostgreSQL local desechable; todos los datos de prueba se revierten (ROLLBACK final).
-- HU-27 CA-01: "solo el propietario cancela un plan programado y futuro".
-- Requiere: roles anon, authenticated y service_role, init_schema.sql y las migraciones 000 a 016 y 018
-- (la 018 sustituye la función de la 005 y exige salida futura). Cada caso imprime un aviso "OK n: ..."; el primero que falla
-- aborta el archivo con su mensaje.
--
-- Todo corre en UNA transacción, así que now() es constante, pero la RPC decide con clock_timestamp()
-- (reloj real tomado tras el bloqueo de la fila): una salida igual a now() ya quedó atrás y se rechaza, y las
-- salidas "futuras" se siembran con margen (no con 1 ms) para que la prueba no dependa de la velocidad.
BEGIN;

CREATE SCHEMA hu27_prueba;
GRANT USAGE ON SCHEMA hu27_prueba TO service_role;

-- Ejecuta la RPC como service_role y devuelve {codigo, resultado}.
CREATE FUNCTION hu27_prueba.cancelar(p_exp UUID, p_senderista UUID, p_op UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN
    RETURN jsonb_build_object('codigo', 'OK',
        'resultado', public.treksafe_cancelar_expedicion(p_exp, p_senderista, 'Motivo de prueba', p_op));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('codigo', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION hu27_prueba.cancelar(UUID, UUID, UUID) TO service_role;

-- Datos de prueba (superusuario).
INSERT INTO public.usuarios (id, correo_electronico, hash_contrasena, rol) VALUES
    ('a2700000-0000-4000-8000-000000000001', 'dueno27@example.invalid', 'fixture', 'senderista'),
    ('a2700000-0000-4000-8000-000000000002', 'ajeno27@example.invalid', 'fixture', 'senderista');
INSERT INTO public.perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento) VALUES
    ('a2700000-0000-4000-8000-000000000001', 'Dueño Ficticio', '999999991', '27000001'),
    ('a2700000-0000-4000-8000-000000000002', 'Ajeno Ficticio', '999999992', '27000002');

-- Expediciones: id, estado, hora_inicio.
INSERT INTO public.expediciones (id, senderista_id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, estado)
SELECT id, 'a2700000-0000-4000-8000-000000000001', 'Inicio', 'Destino', hora, hora + interval '1 day', estado::public.estado_expedicion_enum
FROM (VALUES
    ('b2700000-0000-4000-8000-000000000001'::uuid, 'programada', now() + interval '1 day'),           -- futura
    ('b2700000-0000-4000-8000-000000000002'::uuid, 'programada', now() - interval '1 hour'),          -- pasada
    ('b2700000-0000-4000-8000-000000000003'::uuid, 'programada', now()),                              -- exactamente ahora
    ('b2700000-0000-4000-8000-000000000004'::uuid, 'programada', now() + interval '30 seconds'),      -- futura cercana
    ('b2700000-0000-4000-8000-000000000005'::uuid, 'programada', now() + interval '1 day'),           -- para idempotencia
    ('b2700000-0000-4000-8000-000000000006'::uuid, 'programada', now() - interval '2 hours'),         -- pasada, para propietario ajeno
    ('b2700000-0000-4000-8000-000000000007'::uuid, 'en_progreso', now() - interval '1 hour'),         -- estado antes que salida
    ('b2700000-0000-4000-8000-000000000008'::uuid, 'completada', now() - interval '1 day'),
    ('b2700000-0000-4000-8000-000000000009'::uuid, 'programada', now() - interval '3 hours'),         -- operación de otro tipo
    ('b2700000-0000-4000-8000-00000000000a'::uuid, 'programada', now() - interval '4 hours'),         -- defensa: sin comprobación previa
    ('b2700000-0000-4000-8000-00000000000b'::uuid, 'programada', now() - interval '5 hours')          -- defensa: sin previa ni defensa
) AS t (id, estado, hora);

SET LOCAL ROLE service_role;

-- 1) Un plan programado con salida futura se cancela: versión +1 y evento CANCELADA.
DO $$
DECLARE r JSONB;
BEGIN
    r := hu27_prueba.cancelar('b2700000-0000-4000-8000-000000000001', 'a2700000-0000-4000-8000-000000000001',
                              'c2700000-0000-4000-8000-000000000001');
    IF r->>'codigo' <> 'OK' OR r->'resultado'->>'estado' <> 'cancelada' OR (r->'resultado'->>'version')::INT <> 2 THEN
        RAISE EXCEPTION 'Una salida futura debe cancelarse: %', r;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.eventos_plan WHERE operacion_id = 'c2700000-0000-4000-8000-000000000001'
                   AND tipo = 'CANCELADA') THEN
        RAISE EXCEPTION 'Falta el evento CANCELADA';
    END IF;
    RAISE NOTICE 'OK 1: un plan programado con salida futura se cancela, sube la versión y registra su evento';
END $$;

-- 2) Con la salida pasada no se cancela (PLAN_NO_CANCELABLE) y no se escribe nada.
DO $$
DECLARE r JSONB; v_estado TEXT; v_version INT;
BEGIN
    r := hu27_prueba.cancelar('b2700000-0000-4000-8000-000000000002', 'a2700000-0000-4000-8000-000000000001',
                              'c2700000-0000-4000-8000-000000000002');
    SELECT estado::TEXT, version INTO v_estado, v_version FROM public.expediciones WHERE id = 'b2700000-0000-4000-8000-000000000002';
    IF r->>'codigo' <> 'PLAN_NO_CANCELABLE' THEN
        RAISE EXCEPTION 'Una salida pasada debe responder PLAN_NO_CANCELABLE y llegó %', r;
    END IF;
    IF v_estado <> 'programada' OR v_version <> 1 OR EXISTS (SELECT 1 FROM public.eventos_plan
            WHERE expedicion_id = 'b2700000-0000-4000-8000-000000000002') THEN
        RAISE EXCEPTION 'El rechazo no debe escribir nada (estado %, versión %)', v_estado, v_version;
    END IF;
    RAISE NOTICE 'OK 2: una salida pasada se rechaza con PLAN_NO_CANCELABLE y no escribe nada';
END $$;

-- 3) LÍMITE: con la salida igual a now() (instante de inicio de la transacción, ya pasado para el reloj real)
--    tampoco se cancela (misma regla que HU-26: salida <= ahora ya inició).
DO $$
DECLARE r JSONB;
BEGIN
    r := hu27_prueba.cancelar('b2700000-0000-4000-8000-000000000003', 'a2700000-0000-4000-8000-000000000001',
                              'c2700000-0000-4000-8000-000000000003');
    IF r->>'codigo' <> 'PLAN_NO_CANCELABLE' THEN
        RAISE EXCEPTION 'La salida igual a ahora debe responder PLAN_NO_CANCELABLE y llegó %', r;
    END IF;
    RAISE NOTICE 'OK 3: una salida igual a now() ya no es futura para el reloj real y se rechaza';
END $$;

-- 4) Una salida futura cercana (30 s, con margen) sí se cancela.
DO $$
DECLARE r JSONB;
BEGIN
    r := hu27_prueba.cancelar('b2700000-0000-4000-8000-000000000004', 'a2700000-0000-4000-8000-000000000001',
                              'c2700000-0000-4000-8000-000000000004');
    IF r->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'Una salida futura cercana debe cancelarse: %', r; END IF;
    RAISE NOTICE 'OK 4: una salida futura cercana se cancela';
END $$;

-- 5) ORDEN: la idempotencia va antes que la salida. Tras cancelar, la salida "pasa" y el reintento
--    (misma operación u otra) devuelve lo mismo, sin otro evento ni otra versión.
RESET ROLE;
DO $$
DECLARE a JSONB; b JSONB; c JSONB;
BEGIN
    SET LOCAL ROLE service_role;
    a := hu27_prueba.cancelar('b2700000-0000-4000-8000-000000000005', 'a2700000-0000-4000-8000-000000000001',
                              'c2700000-0000-4000-8000-000000000005');
    RESET ROLE;
    IF a->>'codigo' <> 'OK' THEN RAISE EXCEPTION 'No se pudo cancelar el plan futuro: %', a; END IF;
    UPDATE public.expediciones SET hora_inicio = now() - interval '1 hour' WHERE id = 'b2700000-0000-4000-8000-000000000005';
    SET LOCAL ROLE service_role;
    b := hu27_prueba.cancelar('b2700000-0000-4000-8000-000000000005', 'a2700000-0000-4000-8000-000000000001',
                              'c2700000-0000-4000-8000-000000000005');
    c := hu27_prueba.cancelar('b2700000-0000-4000-8000-000000000005', 'a2700000-0000-4000-8000-000000000001',
                              'c2700000-0000-4000-8000-000000000015');
    RESET ROLE;
    IF b <> a OR c->>'codigo' <> 'OK' OR c->'resultado' <> a->'resultado' THEN
        RAISE EXCEPTION 'El reintento con la salida ya pasada debe devolver lo mismo: a=% b=% c=%', a, b, c;
    END IF;
    IF (SELECT count(*) FROM public.eventos_plan WHERE expedicion_id = 'b2700000-0000-4000-8000-000000000005') <> 1 THEN
        RAISE EXCEPTION 'No debe registrarse otro evento al repetir';
    END IF;
    RAISE NOTICE 'OK 5: repetir una cancelación ya hecha devuelve lo mismo aunque la salida ya haya pasado';
END $$;

SET LOCAL ROLE service_role;

-- 6) ORDEN: el propietario se evalúa antes que la salida.
DO $$
DECLARE r JSONB;
BEGIN
    r := hu27_prueba.cancelar('b2700000-0000-4000-8000-000000000006', 'a2700000-0000-4000-8000-000000000002',
                              'c2700000-0000-4000-8000-000000000006');
    IF r->>'codigo' <> 'EXPEDICION_NO_ENCONTRADA' THEN
        RAISE EXCEPTION 'Un ajeno con salida pasada debe recibir EXPEDICION_NO_ENCONTRADA y llegó %', r;
    END IF;
    RAISE NOTICE 'OK 6: el propietario se comprueba antes que la salida (404, no revela la fecha)';
END $$;

-- 7) ORDEN: el estado se evalúa antes que la salida.
DO $$
DECLARE r JSONB; v_id UUID;
BEGIN
    FOREACH v_id IN ARRAY ARRAY['b2700000-0000-4000-8000-000000000007'::uuid, 'b2700000-0000-4000-8000-000000000008'::uuid] LOOP
        r := hu27_prueba.cancelar(v_id, 'a2700000-0000-4000-8000-000000000001', gen_random_uuid());
        IF r->>'codigo' <> 'PLAN_NO_CANCELABLE' THEN
            RAISE EXCEPTION 'Un plan que no está programado debe responder PLAN_NO_CANCELABLE y llegó % (%)', r, v_id;
        END IF;
    END LOOP;
    RAISE NOTICE 'OK 7: el estado se comprueba antes que la salida (PLAN_NO_CANCELABLE)';
END $$;

-- 8) ORDEN: una operación usada por otro tipo de operación responde DATOS_INVALIDOS antes que la salida.
RESET ROLE;
INSERT INTO public.eventos_plan (expedicion_id, senderista_id, tipo, actor_id, version_resultante, cambios, operacion_id)
VALUES ('b2700000-0000-4000-8000-000000000009', 'a2700000-0000-4000-8000-000000000001', 'EDITADA',
        'a2700000-0000-4000-8000-000000000001', 2, '{}'::jsonb, 'c2700000-0000-4000-8000-000000000009');
SET LOCAL ROLE service_role;
DO $$
DECLARE r JSONB;
BEGIN
    r := hu27_prueba.cancelar('b2700000-0000-4000-8000-000000000009', 'a2700000-0000-4000-8000-000000000001',
                              'c2700000-0000-4000-8000-000000000009');
    IF r->>'codigo' <> 'DATOS_INVALIDOS' THEN
        RAISE EXCEPTION 'Una operación de otro tipo debe responder DATOS_INVALIDOS y llegó %', r;
    END IF;
    RAISE NOTICE 'OK 8: la operación de otro tipo se rechaza antes que la salida (DATOS_INVALIDOS)';
END $$;

-- 9) Ningún código de negocio de la cancelación es 401 ni distinto de los contratados.
DO $$
DECLARE r JSONB; v_codigos TEXT[] := ARRAY['OK', 'PLAN_NO_CANCELABLE', 'EXPEDICION_NO_ENCONTRADA', 'DATOS_INVALIDOS'];
BEGIN
    FOR r IN SELECT hu27_prueba.cancelar(e.id, 'a2700000-0000-4000-8000-000000000001', gen_random_uuid())
             FROM public.expediciones e WHERE e.id::text LIKE 'b2700000-%' LOOP
        IF NOT (r->>'codigo' = ANY (v_codigos)) THEN
            RAISE EXCEPTION 'Código no contratado: %', r;
        END IF;
    END LOOP;
    RAISE NOTICE 'OK 9: todos los códigos devueltos pertenecen al contrato de la cancelación';
END $$;

-- 10) DEFENSA: el UPDATE condicionado (AND hora_inicio > v_ahora) no cancela una salida pasada aunque la
--     comprobación previa (paso e) se salte. Se prueba con copias de la función creadas a partir de su
--     definición real en la base: una SIN la comprobación previa y otra SIN la comprobación previa NI la
--     defensa (esta última demuestra que la prueba distingue: sin la defensa, la salida pasada se cancelaría).
RESET ROLE;
DO $$
DECLARE
    v_def           TEXT;
    v_sin_previa    TEXT;
    v_sin_ambas     TEXT;
    a               JSONB;
    b               JSONB;
    v_estado_a      TEXT;
    v_estado_b      TEXT;
    v_dueno CONSTANT UUID := 'a2700000-0000-4000-8000-000000000001';
BEGIN
    v_def := replace(
        pg_get_functiondef('public.treksafe_cancelar_expedicion(uuid,uuid,text,uuid)'::regprocedure),
        'public.treksafe_cancelar_expedicion(', 'hu27_prueba.NOMBRE_FN(');
    v_sin_previa := replace(v_def, 'IF v_exp.hora_inicio <= v_ahora THEN', 'IF false THEN');
    IF v_sin_previa = v_def THEN
        RAISE EXCEPTION 'No se encontró la comprobación previa de la salida en la función';
    END IF;
    v_sin_ambas := replace(v_sin_previa, 'AND hora_inicio > v_ahora', '');
    IF v_sin_ambas = v_sin_previa THEN
        RAISE EXCEPTION 'No se encontró el UPDATE defensivo en la función';
    END IF;
    EXECUTE replace(v_sin_previa, 'NOMBRE_FN', 'cancelar_sin_previa');
    EXECUTE replace(v_sin_ambas, 'NOMBRE_FN', 'cancelar_sin_previa_ni_defensa');
    GRANT EXECUTE ON FUNCTION hu27_prueba.cancelar_sin_previa(uuid, uuid, text, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION hu27_prueba.cancelar_sin_previa_ni_defensa(uuid, uuid, text, uuid) TO service_role;

    SET LOCAL ROLE service_role;
    BEGIN
        PERFORM hu27_prueba.cancelar_sin_previa('b2700000-0000-4000-8000-00000000000a', v_dueno, 'Motivo', gen_random_uuid());
        a := jsonb_build_object('codigo', 'OK');
    EXCEPTION WHEN OTHERS THEN
        a := jsonb_build_object('codigo', SQLERRM);
    END;
    BEGIN
        PERFORM hu27_prueba.cancelar_sin_previa_ni_defensa('b2700000-0000-4000-8000-00000000000b', v_dueno, 'Motivo', gen_random_uuid());
        b := jsonb_build_object('codigo', 'OK');
    EXCEPTION WHEN OTHERS THEN
        b := jsonb_build_object('codigo', SQLERRM);
    END;
    RESET ROLE;

    SELECT estado::TEXT INTO v_estado_a FROM public.expediciones WHERE id = 'b2700000-0000-4000-8000-00000000000a';
    SELECT estado::TEXT INTO v_estado_b FROM public.expediciones WHERE id = 'b2700000-0000-4000-8000-00000000000b';

    IF a->>'codigo' <> 'PLAN_NO_CANCELABLE' OR v_estado_a <> 'programada' OR EXISTS (
            SELECT 1 FROM public.eventos_plan WHERE expedicion_id = 'b2700000-0000-4000-8000-00000000000a') THEN
        RAISE EXCEPTION 'El UPDATE defensivo no debe cancelar una salida pasada (codigo %, estado %)', a, v_estado_a;
    END IF;
    IF b->>'codigo' <> 'OK' OR v_estado_b <> 'cancelada' THEN
        RAISE EXCEPTION 'Sin la comprobación previa ni la defensa la salida pasada debería cancelarse (la prueba no distingue): % / %', b, v_estado_b;
    END IF;
    RAISE NOTICE 'OK 10: el UPDATE defensivo (AND hora_inicio > v_ahora) no cancela una salida pasada aunque se salte la comprobación previa';
END $$;

-- 11) RELOJ (una sola sesión): la salida pasa DENTRO de la transacción de la RPC. now() queda fijo en el
--     inicio de la transacción (salida aún "futura" para now()), pero el reloj real ya la rebasó:
--     debe responder PLAN_NO_CANCELABLE y no escribir nada (ni estado, ni versión, ni evento).
--     Con now() en la RPC (018 anterior a la corrección) este caso cancelaba el plan.
RESET ROLE;
DO $$
DECLARE
    r         JSONB;
    v_estado  TEXT;
    v_version INT;
    v_exp CONSTANT UUID := 'b2700000-0000-4000-8000-00000000000c';
BEGIN
    INSERT INTO public.expediciones (id, senderista_id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, estado)
    VALUES (v_exp, 'a2700000-0000-4000-8000-000000000001', 'Inicio', 'Destino',
            clock_timestamp() + interval '500 milliseconds', now() + interval '1 day', 'programada');
    IF NOT (SELECT hora_inicio > now() FROM public.expediciones WHERE id = v_exp) THEN
        RAISE EXCEPTION 'Preparación inválida: la salida debía ser posterior a now()';
    END IF;
    PERFORM pg_sleep(1);
    SET LOCAL ROLE service_role;
    r := hu27_prueba.cancelar(v_exp, 'a2700000-0000-4000-8000-000000000001', 'c2700000-0000-4000-8000-00000000000c');
    RESET ROLE;
    SELECT estado::TEXT, version INTO v_estado, v_version FROM public.expediciones WHERE id = v_exp;
    IF r->>'codigo' <> 'PLAN_NO_CANCELABLE' THEN
        RAISE EXCEPTION 'Una salida que pasó durante la transacción debe responder PLAN_NO_CANCELABLE y llegó %', r;
    END IF;
    IF v_estado <> 'programada' OR v_version <> 1 OR EXISTS (SELECT 1 FROM public.eventos_plan WHERE expedicion_id = v_exp) THEN
        RAISE EXCEPTION 'El rechazo no debe escribir nada (estado %, versión %)', v_estado, v_version;
    END IF;
    RAISE NOTICE 'OK 11: la salida que pasa dentro de la transacción se rechaza (la decisión usa clock_timestamp, no now)';
END $$;

RESET ROLE;
ROLLBACK;
