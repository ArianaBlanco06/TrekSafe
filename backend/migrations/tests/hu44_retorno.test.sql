BEGIN;
DO $$
DECLARE actor uuid:=gen_random_uuid(); contacto uuid:=gen_random_uuid(); e jsonb; r jsonb; resp uuid; otro text; n integer; extra uuid:=gen_random_uuid(); cred text;
BEGIN
  INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol) VALUES(actor,actor||'@example.invalid','fixture','senderista');
  INSERT INTO public.perfiles_senderista VALUES(actor,'Persona ficticia','999999999',left(actor::text,20));
  INSERT INTO public.contactos_emergencia(id,senderista_id,nombre_completo,parentesco,telefono,correo_electronico)
    VALUES(contacto,actor,'Contacto ficticio','amistad','999999999','contacto@example.invalid');
  e:=public.treksafe_crear_expedicion(actor,jsonb_build_object('lugarInicio','Inicio ficticio','lugarFin','Destino ficticio',
    'horaInicio',clock_timestamp()+interval '30 seconds','horaRetornoEstimada',clock_timestamp()+interval '1 hour',
    'minutosTolerancia',30,'idsContactos',jsonb_build_array(contacto),'nombresAcompanantes',jsonb_build_array('Persona ficticia')));
  UPDATE public.expediciones SET estado='alerta' WHERE id=(e->>'id')::uuid;
  SELECT usuario_id INTO resp FROM public.perfiles_rescatista ORDER BY usuario_id LIMIT 1;
  cred:='HU44-'||extra;
  otro:=extra||'@example.invalid';
  INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol) VALUES(extra,otro,'fixture','rescatista');
  INSERT INTO public.registros_institucionales_rescatista(institucion,numero_credencial,nombre_completo,fecha_nacimiento) VALUES('AGMP',cred,'Rescatista ficticio','1990-01-01');
  INSERT INTO public.perfiles_rescatista(usuario_id,numero_credencial,nombre_completo,fecha_nacimiento) VALUES(extra,cred,'Rescatista ficticio','1990-01-01');
  PERFORM public.treksafe_asumir_coordinacion((e->>'id')::uuid,resp,gen_random_uuid());
  INSERT INTO public.despachos_correo(expedicion_id,tipo_despacho,clave_destinatario) VALUES((e->>'id')::uuid,'alerta_rescate',otro);
  INSERT INTO public.outbox_notificaciones(clave_evento,tipo_evento,destinatario,asunto,cuerpo,estado,modo_envio,metadata)
    VALUES('alerta-previa','ALERTA_CONTACTO','contacto@example.invalid','Prueba','Prueba','enviado','smtp',jsonb_build_object('expedicionId',e->>'id'));
  r:=public.treksafe_confirmar_retorno_con_outbox((e->>'id')::uuid,actor);
  IF r->>'estado'<>'completada' THEN RAISE EXCEPTION 'retorno no completado'; END IF;
  SELECT count(*) INTO n FROM public.outbox_notificaciones WHERE clave_evento='RETORNO_SEGURO:'||(e->>'id');
  IF n<>3 THEN RAISE EXCEPTION 'faltan contacto, responsable o rescatista notificado: %',n; END IF;
  PERFORM public.treksafe_confirmar_retorno_con_outbox((e->>'id')::uuid,actor);
  IF (SELECT count(*) FROM public.outbox_notificaciones WHERE clave_evento='RETORNO_SEGURO:'||(e->>'id'))<>n THEN RAISE EXCEPTION 'retorno duplicado'; END IF;
  IF EXISTS(SELECT 1 FROM public.outbox_notificaciones WHERE clave_evento='RETORNO_SEGURO:'||(e->>'id') AND (cuerpo NOT LIKE '%Inicio ficticio%' OR cuerpo NOT LIKE '%Retorno confirmado%' OR cuerpo ~* 'alergia|tipo.sangre|medicamento')) THEN RAISE EXCEPTION 'contenido'; END IF;
END $$;
CREATE FUNCTION public.hu44_fallo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FALLO_HU44'; END $$;
CREATE TRIGGER hu44_fallo BEFORE INSERT ON public.outbox_notificaciones FOR EACH ROW WHEN (NEW.tipo_evento='RETORNO_CONFIRMADO') EXECUTE FUNCTION public.hu44_fallo();
DO $$
DECLARE actor uuid; contacto uuid; e jsonb;
BEGIN
  SELECT senderista_id,id INTO actor,contacto FROM public.contactos_emergencia WHERE correo_electronico='contacto@example.invalid' LIMIT 1;
  e:=public.treksafe_crear_expedicion(actor,jsonb_build_object('lugarInicio','Inicio rollback','lugarFin','Destino rollback',
    'horaInicio',clock_timestamp()+interval '30 seconds','horaRetornoEstimada',clock_timestamp()+interval '1 hour',
    'minutosTolerancia',30,'idsContactos',jsonb_build_array(contacto),'nombresAcompanantes',jsonb_build_array('Persona ficticia')));
  BEGIN
    PERFORM public.treksafe_confirmar_retorno_con_outbox((e->>'id')::uuid,actor);
    RAISE EXCEPTION 'NO_SE_DETECTO_FALLO';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'FALLO_HU44' THEN RAISE; END IF;
  END;
  IF (SELECT estado FROM public.expediciones WHERE id=(e->>'id')::uuid)<>'en_progreso' OR EXISTS(SELECT 1 FROM public.retornos_confirmados WHERE expedicion_id=(e->>'id')::uuid) THEN RAISE EXCEPTION 'retorno parcial'; END IF;
  IF has_function_privilege('authenticated','public.treksafe_confirmar_retorno_con_outbox(uuid,uuid)','execute') OR has_table_privilege('anon','public.retornos_confirmados','select') THEN RAISE EXCEPTION 'permisos'; END IF;
END $$;
ROLLBACK;
