BEGIN;
DO $$
DECLARE actor uuid:=gen_random_uuid(); contacto uuid:=gen_random_uuid(); e jsonb; owner uuid; ajeno uuid:=gen_random_uuid();
  cred text; msg uuid; msg2 uuid; clave text:=gen_random_uuid()::text; a jsonb; b jsonb; tok uuid; i integer;
BEGIN
  INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol) VALUES(actor,actor||'@example.invalid','fixture','senderista');
  INSERT INTO public.perfiles_senderista VALUES(actor,'Persona ficticia','999999999',left(actor::text,20));
  INSERT INTO public.contactos_emergencia(id,senderista_id,nombre_completo,parentesco,telefono,correo_electronico) VALUES(contacto,actor,'Contacto ficticio','amistad','999999999','contacto@example.invalid');
  e:=public.treksafe_crear_expedicion(actor,jsonb_build_object('lugarInicio','Inicio ficticio','lugarFin','Destino ficticio','horaInicio',clock_timestamp()+interval '30 seconds','horaRetornoEstimada',clock_timestamp()+interval '1 hour','minutosTolerancia',30,'idsContactos',jsonb_build_array(contacto),'nombresAcompanantes',jsonb_build_array('Persona ficticia')));
  UPDATE public.expediciones SET estado='alerta' WHERE id=(e->>'id')::uuid;
  SELECT usuario_id INTO owner FROM public.perfiles_rescatista ORDER BY usuario_id LIMIT 1;
  PERFORM public.treksafe_asumir_coordinacion((e->>'id')::uuid,owner,gen_random_uuid());
  cred:='HU46-'||ajeno;
  INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol) VALUES(ajeno,ajeno||'@example.invalid','fixture','rescatista');
  INSERT INTO public.registros_institucionales_rescatista(institucion,numero_credencial,nombre_completo,fecha_nacimiento) VALUES('AGMP',cred,'Rescatista ficticio','1990-01-01');
  INSERT INTO public.perfiles_rescatista(usuario_id,numero_credencial,nombre_completo,fecha_nacimiento) VALUES(ajeno,cred,'Rescatista ficticio','1990-01-01');
  INSERT INTO public.outbox_notificaciones(clave_evento,tipo_evento,destinatario,asunto,cuerpo,metadata) VALUES('hu46','prueba','ficticio@example.invalid','Prueba','Prueba',jsonb_build_object('expedicionId',e->>'id')) RETURNING id INTO msg;
  FOR i IN 1..3 LOOP
    tok:=gen_random_uuid();PERFORM public.treksafe_reservar_outbox(msg,tok,1000);PERFORM public.treksafe_iniciar_intento_outbox(msg,tok);PERFORM public.treksafe_finalizar_intento_outbox(msg,tok,'fallido','smtp');
    UPDATE public.outbox_notificaciones SET proximo_intento_en=clock_timestamp() WHERE id=msg;
  END LOOP;
  BEGIN
    PERFORM public.treksafe_despachos_autorizados(ajeno,(e->>'id')::uuid);RAISE EXCEPTION 'ACCESO_PERMITIDO';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NO_ES_RESPONSABLE' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.treksafe_reintentar_despacho(ajeno,(e->>'id')::uuid,msg,clave);RAISE EXCEPTION 'ACCESO_PERMITIDO';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NO_ES_RESPONSABLE' THEN RAISE; END IF; END;
  a:=public.treksafe_reintentar_despacho(owner,(e->>'id')::uuid,msg,clave);
  b:=public.treksafe_reintentar_despacho(owner,(e->>'id')::uuid,msg,clave);
  IF a<>b OR (SELECT count(*) FROM public.solicitudes_reintento_outbox WHERE mensaje_id=msg)<>1 THEN RAISE EXCEPTION 'idempotencia'; END IF;
  IF (SELECT intentos FROM public.outbox_notificaciones WHERE id=msg)<>3 THEN RAISE EXCEPTION 'historial reiniciado'; END IF;
  tok:=gen_random_uuid();PERFORM public.treksafe_reservar_outbox(msg,tok,1000);PERFORM public.treksafe_iniciar_intento_outbox(msg,tok);PERFORM public.treksafe_finalizar_intento_outbox(msg,tok,'fallido','smtp');
  IF (SELECT intentos FROM public.outbox_notificaciones WHERE id=msg)<>4 OR (SELECT estado FROM public.outbox_notificaciones WHERE id=msg)<>'fallido' THEN RAISE EXCEPTION 'un intento manual'; END IF;
  PERFORM public.treksafe_reintentar_despacho(owner,(e->>'id')::uuid,msg,clave);
  IF (SELECT estado FROM public.outbox_notificaciones WHERE id=msg)<>'fallido' THEN RAISE EXCEPTION 'clave antigua reencolada'; END IF;
  INSERT INTO public.outbox_notificaciones(clave_evento,tipo_evento,destinatario,asunto,cuerpo,estado,metadata) VALUES('hu46-ajeno','prueba','ficticio@example.invalid','Prueba','Prueba','fallido','{}') RETURNING id INTO msg2;
  BEGIN
    PERFORM public.treksafe_reintentar_despacho(owner,(e->>'id')::uuid,msg2,clave);RAISE EXCEPTION 'CLAVE_PERMITIDA';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CLAVE_REUTILIZADA' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.treksafe_reintentar_despacho(owner,(e->>'id')::uuid,msg2,gen_random_uuid()::text);RAISE EXCEPTION 'AJENO_PERMITIDO';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'DESPACHO_AJENO' THEN RAISE; END IF; END;
  UPDATE public.outbox_notificaciones SET estado='enviado' WHERE id=msg;
  BEGIN
    PERFORM public.treksafe_reintentar_despacho(owner,(e->>'id')::uuid,msg,gen_random_uuid()::text);RAISE EXCEPTION 'REENVIO_PERMITIDO';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'AVISO_YA_ENVIADO' THEN RAISE; END IF; END;
  UPDATE public.outbox_notificaciones SET estado='incierto' WHERE id=msg;
  BEGIN
    PERFORM public.treksafe_reintentar_despacho(owner,(e->>'id')::uuid,msg,gen_random_uuid()::text);RAISE EXCEPTION 'INCIERTO_PERMITIDO';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ESTADO_INCIERTO_REQUIERE_REVISION' THEN RAISE; END IF; END;
  IF has_table_privilege('anon','public.solicitudes_reintento_outbox','select') OR has_function_privilege('authenticated','public.treksafe_reintentar_despacho(uuid,uuid,uuid,text)','execute') THEN RAISE EXCEPTION 'permisos'; END IF;
  -- Relevo real HU-40: el anterior deja de consultar/reintentar incluso su clave ya registrada.
  a:=public.treksafe_proponer_relevo((e->>'id')::uuid,owner,ajeno,'Relevo de prueba',
    (SELECT version FROM public.incidentes WHERE expedicion_id=(e->>'id')::uuid AND estado<>'cerrado'),gen_random_uuid());
  PERFORM public.treksafe_aceptar_relevo((e->>'id')::uuid,ajeno,(a#>>'{relevo,id}')::uuid,gen_random_uuid());
  BEGIN
    PERFORM public.treksafe_reintentar_despacho(owner,(e->>'id')::uuid,msg,clave);RAISE EXCEPTION 'RESPONSABLE_ANTERIOR_PERMITIDO';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NO_ES_RESPONSABLE' THEN RAISE; END IF; END;
  PERFORM public.treksafe_despachos_autorizados(ajeno,(e->>'id')::uuid);
END $$;
ROLLBACK;
