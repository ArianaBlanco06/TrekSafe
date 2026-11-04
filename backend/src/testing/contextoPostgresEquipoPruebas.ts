import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import pg from 'pg';
import { RepositorioListasEquipoSupabase } from '../infrastructure/repositories/RepositorioListasEquipoSupabase.js';
import { clienteSupabasePostgresPruebas } from './clienteSupabasePostgresPruebas.js';

export function crearPoolEquipoPruebas(conexion: string): pg.Pool {
  const url = new URL(conexion);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/treksafe_hu30_test') {
    throw new Error('Estas pruebas requieren una base local desechable llamada treksafe_hu30_test.');
  }
  return new pg.Pool({ connectionString: conexion, max: 5 });
}

export async function contextoPostgresEquipoPruebas(pool: pg.Pool, t: TestContext) {
  const senderistaA = randomUUID();
  const senderistaB = randomUUID();
  t.after(async () => {
    await pool.query('DELETE FROM public.usuarios WHERE id = ANY($1::uuid[])', [[senderistaA, senderistaB]]);
  });
  for (const id of [senderistaA, senderistaB]) {
    await pool.query('INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol) VALUES($1,$2,$3,$4)',
      [id, `${id}@example.invalid`, 'fixture-no-login', 'senderista']);
    await pool.query('INSERT INTO public.perfiles_senderista(usuario_id,nombre_completo,telefono,id_documento) VALUES($1,$2,$3,$4)',
      [id, 'Prueba HU-30', '+51900000001', id.slice(0, 20)]);
  }
  const dao = new RepositorioListasEquipoSupabase(clienteSupabasePostgresPruebas(pool));
  return { dao, senderistaA, senderistaB };
}
