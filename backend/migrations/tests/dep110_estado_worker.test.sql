-- Solo bases desechables del runner DEP108. No afecta DEV; todo se revierte.
BEGIN;
DO $$
DECLARE ready boolean; t timestamptz; current_id text := 'prueba-estado-worker';
BEGIN
  -- Aislar pendientes de fixtures previas sin modificar datos fuera de esta transacción.
  UPDATE public.outbox_notificaciones SET estado='enviado';
  SET LOCAL ROLE service_role;
  IF public.treksafe_consultar_disponibilidad_worker(60000,60000) THEN
    RAISE EXCEPTION 'Sin worker no puede estar disponible';
  END IF;
  PERFORM public.treksafe_registrar_estado_worker(current_id,'inicio');
  IF public.treksafe_consultar_disponibilidad_worker(60000,60000) THEN
    RAISE EXCEPTION 'Arranque solo no acredita ciclos';
  END IF;
  PERFORM public.treksafe_registrar_estado_worker(current_id,'plazos','ok');
  IF public.treksafe_consultar_disponibilidad_worker(60000,60000) THEN
    RAISE EXCEPTION 'Falta ciclo outbox';
  END IF;
  PERFORM public.treksafe_registrar_estado_worker(current_id,'outbox','ok');
  IF NOT public.treksafe_consultar_disponibilidad_worker(60000,60000) THEN
    RAISE EXCEPTION 'Dos ciclos sanos deberían estar disponibles';
  END IF;
  PERFORM public.treksafe_registrar_estado_worker(current_id,'outbox','error','ERROR_CONTROLADO');
  IF public.treksafe_consultar_disponibilidad_worker(60000,60000) THEN
    RAISE EXCEPTION 'Último ciclo fallido debe degradar';
  END IF;
  PERFORM public.treksafe_registrar_estado_worker(current_id,'outbox','ok');
  UPDATE public.estado_worker SET plazos_en=clock_timestamp()-interval '2 minutes'
    WHERE instancia_id=current_id;
  IF public.treksafe_consultar_disponibilidad_worker(60000,60000) THEN
    RAISE EXCEPTION 'Heartbeat reciente no sustituye ciclo plazos vencido';
  END IF;
  PERFORM public.treksafe_registrar_estado_worker(current_id,'plazos','ok');
  INSERT INTO public.outbox_notificaciones(clave_evento,tipo_evento,destinatario,asunto,cuerpo,proximo_intento_en)
    VALUES('heartbeat-test','prueba','prueba@example.invalid','Prueba','Prueba',clock_timestamp()-interval '2 minutes');
  IF public.treksafe_consultar_disponibilidad_worker(60000,60000) THEN
    RAISE EXCEPTION 'Pendiente demasiado antiguo debe degradar';
  END IF;
  UPDATE public.outbox_notificaciones SET estado='incierto' WHERE clave_evento='heartbeat-test';
  IF public.treksafe_consultar_disponibilidad_worker(60000,60000) THEN
    RAISE EXCEPTION 'Incierto debe degradar';
  END IF;
  UPDATE public.outbox_notificaciones SET estado='fallido' WHERE clave_evento='heartbeat-test';
  IF public.treksafe_consultar_disponibilidad_worker(60000,60000) THEN
    RAISE EXCEPTION 'Fallido debe degradar';
  END IF;
  UPDATE public.outbox_notificaciones SET estado='enviado' WHERE clave_evento='heartbeat-test';
  IF NOT public.treksafe_consultar_disponibilidad_worker(60000,60000) THEN
    RAISE EXCEPTION 'Resolver pendiente recupera disponibilidad';
  END IF;
  INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol)
    VALUES ('f1100000-0000-4000-8000-000000000001','estado-worker@example.invalid','hash-ficticio','senderista');
  INSERT INTO public.perfiles_senderista(usuario_id,nombre_completo,telefono,id_documento)
    VALUES ('f1100000-0000-4000-8000-000000000001','Persona ficticia','999999999','estado-worker');
  INSERT INTO public.expediciones(id,senderista_id,lugar_inicio,lugar_fin,hora_inicio,hora_retorno_estimada,estado)
    VALUES ('f1100000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000001',
      'Prueba','Prueba',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour','alerta');
  IF public.treksafe_consultar_disponibilidad_worker(60000,60000) THEN
    RAISE EXCEPTION 'Alerta sin pendiente duradero debe degradar';
  END IF;
  INSERT INTO public.outbox_notificaciones(clave_evento,tipo_evento,destinatario,asunto,cuerpo)
    VALUES('ALERTA_CONTACTO:f1100000-0000-4000-8000-000000000002','prueba','prueba@example.invalid','Prueba','Prueba');
  IF NOT public.treksafe_consultar_disponibilidad_worker(60000,60000) THEN
    RAISE EXCEPTION 'Alerta conciliada con pendiente reciente debe recuperar';
  END IF;
  PERFORM public.treksafe_registrar_estado_worker(current_id,'parada');
  IF public.treksafe_consultar_disponibilidad_worker(60000,60000) THEN
    RAISE EXCEPTION 'Worker detenido debe degradar';
  END IF;
  BEGIN
    PERFORM public.treksafe_registrar_estado_worker(current_id,'outbox','ok');
    RAISE EXCEPTION 'No se rechazó instancia detenida';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'INSTANCIA_WORKER_INACTIVA' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.treksafe_consultar_disponibilidad_worker(0,60000);
    RAISE EXCEPTION 'No se rechazó umbral inválido';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'UMBRALES_WORKER_INVALIDOS' THEN RAISE; END IF;
  END;
  RESET ROLE;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.estado_worker'::regclass) THEN
    RAISE EXCEPTION 'Falta RLS';
  END IF;
  IF has_table_privilege('anon','public.estado_worker','SELECT') OR
     has_table_privilege('authenticated','public.estado_worker','UPDATE') OR
     has_function_privilege('anon','public.treksafe_registrar_estado_worker(text,text,text,text)','EXECUTE') OR
     has_function_privilege('authenticated','public.treksafe_consultar_disponibilidad_worker(bigint,bigint)','EXECUTE') THEN
    RAISE EXCEPTION 'Señales expuestas a clientes';
  END IF;
  RAISE NOTICE 'OK: inicio, ambos ciclos, error, caducidad, pendientes, inciertos, fallidos, recuperación, parada y permisos';
END $$;
ROLLBACK;
