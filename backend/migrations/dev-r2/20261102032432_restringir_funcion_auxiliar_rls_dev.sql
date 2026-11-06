-- Aplicada en Supabase DEV (treksafe-dev-r2, ibnwggvqgjpeqcretjak) con la CLI/MCP de Supabase.
-- Versión Supabase: 20261102032432. Registrada en supabase_migrations.schema_migrations.
-- rls_auto_enable() es SECURITY DEFINER; se retira el EXECUTE para clientes.
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
