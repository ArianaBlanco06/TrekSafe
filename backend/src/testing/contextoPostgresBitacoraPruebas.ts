import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import pg from 'pg';
import { BitacoraIncidenteDAOSupabase } from '../infrastructure/repositories/BitacoraIncidenteDAOSupabase.js';
import { clienteSupabaseBitacoraPostgresPruebas } from './clienteSupabaseBitacoraPostgresPruebas.js';
import type { ContextoContratoBitacora } from './contratoBitacoraIncidenteDAO.js';

/** Solo una base local desechable: 127.0.0.1 o localhost y un nombre que contenga "desechable". */
export function crearPoolBitacoraPruebas(conexion: string): pg.Pool {
  const url = new URL(conexion);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.includes('desechable')) {
    throw new Error('Estas pruebas requieren una base local desechable (el nombre debe contener "desechable").');
  }
  return new pg.Pool({ connectionString: conexion, max: 8 });
}

/**
 * Dos rescatistas (usuarios, registros institucionales y perfiles) y un senderista por incidente. Cada incidente
 * vive en una expedición en alerta propia, abierto con `treksafe_asumir_coordinacion` (RPC real de
 * HU-39). El relevo y el cierre (HU-40 y HU-42) se simulan como superusuario con UPDATE directos.
 */
export async function contextoPostgresBitacoraPruebas(pool: pg.Pool, t: TestContext) {
  const senderista = randomUUID();
  const senderistas = [senderista];
  const responsableA = randomUUID();
  const rescatistaB = randomUUID();
  const expediciones: string[] = [];

  // Borrar las expediciones arrastra incidentes y entradas (cascada permitida por la 019);
  // después se borran los usuarios (los perfiles caen por cascada y ya no hay entradas).
  t.after(async () => {
    if (expediciones.length > 0) await pool.query('DELETE FROM public.expediciones WHERE id = ANY($1::uuid[])', [expediciones]);
    await pool.query('DELETE FROM public.usuarios WHERE id = ANY($1::uuid[])', [[...senderistas, responsableA, rescatistaB]]);
    await pool.query('DELETE FROM public.registros_institucionales_rescatista WHERE numero_credencial LIKE $1', [`CRED-H41-${senderista.slice(0, 8)}%`]);
  });

  await pool.query('INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol) VALUES($1,$2,$3,$4)',
    [senderista, `${senderista}@example.invalid`, 'fixture-no-login', 'senderista']);
  await pool.query('INSERT INTO public.perfiles_senderista(usuario_id,nombre_completo,telefono,id_documento) VALUES($1,$2,$3,$4)',
    [senderista, 'Senderista HU-41', '+51900000041', senderista.slice(0, 20)]);
  for (const [id, nombre, sufijo] of [[responsableA, 'Ana Rescate', 'A'], [rescatistaB, 'Beto Rescate', 'B']] as const) {
    const credencial = `CRED-H41-${senderista.slice(0, 8)}${sufijo}`;
    await pool.query('INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol) VALUES($1,$2,$3,$4)',
      [id, `${id}@example.invalid`, 'fixture-no-login', 'rescatista']);
    await pool.query(
      'INSERT INTO public.registros_institucionales_rescatista(institucion,numero_credencial,nombre_completo,fecha_nacimiento) VALUES($1,$2,$3,$4)',
      ['AGMP', credencial, nombre, '1990-01-01']);
    await pool.query(
      'INSERT INTO public.perfiles_rescatista(usuario_id,numero_credencial,nombre_completo,fecha_nacimiento) VALUES($1,$2,$3,$4)',
      [id, credencial, nombre, '1990-01-01']);
  }

  const cliente = clienteSupabaseBitacoraPostgresPruebas(pool);
  const dao = new BitacoraIncidenteDAOSupabase(cliente);

  async function crearIncidente(responsable: string = responsableA): Promise<string> {
    // Una alerta bloquea al propietario: los casos con varios incidentes necesitan
    // senderistas distintos, conservando los responsables de coordinación/bitácora.
    const propietario = expediciones.length === 0 ? senderista : randomUUID();
    if (propietario !== senderista) {
      senderistas.push(propietario);
      await pool.query('INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol) VALUES($1,$2,$3,$4)',
        [propietario, `${propietario}@example.invalid`, 'fixture-no-login', 'senderista']);
      await pool.query('INSERT INTO public.perfiles_senderista(usuario_id,nombre_completo,telefono,id_documento) VALUES($1,$2,$3,$4)',
        [propietario, 'Senderista HU-41', '+51900000041', propietario.slice(0, 20)]);
    }
    const expedicion = randomUUID();
    expediciones.push(expedicion);
    await pool.query(
      `INSERT INTO public.expediciones (id,senderista_id,lugar_inicio,lugar_fin,hora_inicio,hora_retorno_estimada,estado)
       VALUES($1,$2,'Inicio ficticio','Destino ficticio',NOW()-INTERVAL '5 hours',NOW()-INTERVAL '2 hours','alerta')`,
      [expedicion, propietario]);
    const conexion = await pool.connect();
    try {
      await conexion.query('BEGIN');
      await conexion.query('SET LOCAL ROLE service_role');
      const { rows } = await conexion.query('SELECT public.treksafe_asumir_coordinacion($1,$2,$3) AS r', [expedicion, responsable, randomUUID()]);
      await conexion.query('COMMIT');
      return (rows[0].r as { id: string }).id;
    } catch (error) {
      await conexion.query('ROLLBACK');
      throw error;
    } finally {
      conexion.release();
    }
  }

  const contexto: ContextoContratoBitacora = {
    dao,
    responsableA,
    rescatistaB,
    crearIncidente,
    async relevar(incidenteId, nuevo) {
      await pool.query('UPDATE public.incidentes SET responsable_id = $2, version = version + 1 WHERE id = $1', [incidenteId, nuevo]);
    },
    async marcarLocalizado(incidenteId) {
      await pool.query("UPDATE public.incidentes SET estado = 'localizado', version = version + 1 WHERE id = $1", [incidenteId]);
    },
    async cerrar(incidenteId) {
      await pool.query("UPDATE public.incidentes SET estado = 'cerrado', cerrado_en = now(), version = version + 1 WHERE id = $1", [incidenteId]);
    },
  };
  return contexto;
}
