import type { TestContext } from 'node:test';
import type pg from 'pg';
import { CierreIncidenteDAOSupabase } from '../infrastructure/repositories/CierreIncidenteDAOSupabase.js';
import { clienteSupabaseCierrePostgresPruebas } from './clienteSupabaseCierrePostgresPruebas.js';
import { contextoPostgresBitacoraPruebas } from './contextoPostgresBitacoraPruebas.js';
import type { ContextoContratoCierre } from './contratoCierreIncidenteDAO.js';

export { crearPoolBitacoraPruebas as crearPoolCierrePruebas } from './contextoPostgresBitacoraPruebas.js';

/**
 * Reutiliza el contexto de HU-41 (dos rescatistas, un senderista por incidente compatible con
 * DEP-04 y los incidentes abiertos con la RPC real de HU-39) y añade el DAO de cierre, la
 * expedición del incidente y su estado. El relevo (HU-40) se simula como superusuario.
 */
export async function contextoPostgresCierrePruebas(pool: pg.Pool, t: TestContext): Promise<ContextoContratoCierre> {
  const base = await contextoPostgresBitacoraPruebas(pool, t);
  const dao = new CierreIncidenteDAOSupabase(clienteSupabaseCierrePostgresPruebas(pool));

  return {
    dao,
    bitacora: base.dao,
    responsableA: base.responsableA,
    rescatistaB: base.rescatistaB,
    crearIncidente: base.crearIncidente,
    relevar: base.relevar,
    async expedicionDe(incidenteId) {
      const { rows } = await pool.query('SELECT expedicion_id FROM public.incidentes WHERE id = $1', [incidenteId]);
      return rows[0].expedicion_id as string;
    },
    async estadoExpedicion(expedicionId) {
      const { rows } = await pool.query('SELECT estado::text AS estado FROM public.expediciones WHERE id = $1', [expedicionId]);
      return rows[0].estado as string;
    },
  };
}
