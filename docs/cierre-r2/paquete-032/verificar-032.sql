-- SOLO LECTURA. Confirmar el proyecto en la conexión antes de ejecutar.
SELECT current_database() AS base_actual, statement_timestamp() AS consultado_en;
SELECT version,nombre,aplicada_en,aplicada_por FROM public.treksafe_migraciones
WHERE version IN ('015','022','024','029','030','031','032') ORDER BY version;
SELECT to_regclass('public.estado_worker') AS tabla,
  to_regprocedure('public.treksafe_registrar_estado_worker(text,text,text,text)') AS registro,
  to_regprocedure('public.treksafe_consultar_disponibilidad_worker(bigint,bigint)') AS consulta;
SELECT c.relname,c.relrowsecurity,
  has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
  has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
  has_table_privilege('service_role',c.oid,'SELECT') AS backend_select
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='estado_worker';
SELECT p.oid::regprocedure AS firma,p.prosecdef AS security_definer,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS backend_execute,
  pg_get_functiondef(p.oid) AS fuente
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
  ('treksafe_registrar_estado_worker','treksafe_consultar_disponibilidad_worker');
