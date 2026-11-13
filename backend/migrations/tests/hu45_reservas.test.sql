-- Solo base desechable; la sesión superior siempre revierte.
BEGIN;
DO $$
#variable_conflict use_variable
DECLARE id uuid; t1 uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid(); r text; datos jsonb; i integer;
BEGIN
  INSERT INTO public.outbox_notificaciones(clave_evento,tipo_evento,destinatario,asunto,cuerpo)
    VALUES('test-reservas','prueba','ficticio@example.invalid','Prueba','Prueba') RETURNING outbox_notificaciones.id INTO id;
  IF NOT public.treksafe_reservar_outbox(id,t1,1000) OR public.treksafe_reservar_outbox(id,t2,1000) THEN RAISE EXCEPTION 'reserva exclusiva'; END IF;
  -- Reserva sin inicio vencida puede recuperarse; el propietario viejo no puede iniciar.
  UPDATE public.outbox_notificaciones SET bloqueado_hasta=clock_timestamp()-interval '1 second' WHERE outbox_notificaciones.id=id;
  IF NOT public.treksafe_reservar_outbox(id,t2,1000) OR public.treksafe_iniciar_intento_outbox(id,t1) IS NOT NULL THEN RAISE EXCEPTION 'fencing'; END IF;
  datos:=public.treksafe_iniciar_intento_outbox(id,t2);
  IF datos->>'intentos'<>'1' OR public.treksafe_iniciar_intento_outbox(id,t2) IS NOT NULL THEN RAISE EXCEPTION 'inicio único'; END IF;
  IF public.treksafe_finalizar_intento_outbox(id,t1,'enviado','smtp')<>'reserva_perdida' THEN RAISE EXCEPTION 'dueño obsoleto'; END IF;
  -- Simula reinicio tras inicio y potencial aceptación: nunca se reenvía automáticamente.
  UPDATE public.outbox_notificaciones SET bloqueado_hasta=clock_timestamp()-interval '1 second' WHERE outbox_notificaciones.id=id;
  IF public.treksafe_reservar_outbox(id,gen_random_uuid(),1000) THEN RAISE EXCEPTION 'reserva incierta'; END IF;
  IF (SELECT estado FROM public.outbox_notificaciones WHERE outbox_notificaciones.id=id)<>'incierto' THEN RAISE EXCEPTION 'debe requerir revisión'; END IF;
  IF public.treksafe_finalizar_intento_outbox(id,t2,'enviado','smtp')<>'reserva_perdida' THEN RAISE EXCEPTION 'finalización tardía'; END IF;
  IF (SELECT resultado FROM public.intentos_outbox WHERE reserva_id=t2)<>'incierto' THEN RAISE EXCEPTION 'historial perdido'; END IF;

  INSERT INTO public.outbox_notificaciones(clave_evento,tipo_evento,destinatario,asunto,cuerpo)
    VALUES('test-reintentos','prueba','ficticio@example.invalid','Prueba','Prueba') RETURNING outbox_notificaciones.id INTO id;
  FOR i IN 1..3 LOOP
    t1:=gen_random_uuid();
    IF NOT public.treksafe_reservar_outbox(id,t1,1000) THEN RAISE EXCEPTION 'reserva de intento %',i; END IF;
    PERFORM public.treksafe_iniciar_intento_outbox(id,t1);
    r:=public.treksafe_finalizar_intento_outbox(id,t1,'fallido','smtp');
    IF i<3 THEN
      IF r<>'reintentado' OR (SELECT extract(epoch FROM proximo_intento_en-actualizado_en) FROM public.outbox_notificaciones WHERE outbox_notificaciones.id=id)<>(CASE WHEN i=1 THEN 60 ELSE 300 END) THEN RAISE EXCEPTION 'espera creciente'; END IF;
      UPDATE public.outbox_notificaciones SET proximo_intento_en=clock_timestamp() WHERE outbox_notificaciones.id=id;
    ELSIF r<>'fallido' THEN RAISE EXCEPTION 'máximo tres'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.intentos_outbox WHERE notificacion_id=id)<>3 OR public.treksafe_reservar_outbox(id,gen_random_uuid(),1000) THEN RAISE EXCEPTION 'cuarto automático'; END IF;

  INSERT INTO public.outbox_notificaciones(clave_evento,tipo_evento,destinatario,asunto,cuerpo)
    VALUES('test-simulado','prueba','ficticio@example.invalid','Prueba','Prueba') RETURNING outbox_notificaciones.id INTO id;
  t1:=gen_random_uuid(); PERFORM public.treksafe_reservar_outbox(id,t1,1000); PERFORM public.treksafe_iniciar_intento_outbox(id,t1);
  PERFORM public.treksafe_finalizar_intento_outbox(id,t1,'enviado','dev-log');
  IF (SELECT resultado FROM public.intentos_outbox WHERE reserva_id=t1)<>'simulado' THEN RAISE EXCEPTION 'simulación'; END IF;
  IF has_function_privilege('anon','public.treksafe_reservar_outbox(uuid,uuid,integer)','execute') OR has_table_privilege('authenticated','public.intentos_outbox','select') THEN RAISE EXCEPTION 'permisos'; END IF;
END $$;
ROLLBACK;
