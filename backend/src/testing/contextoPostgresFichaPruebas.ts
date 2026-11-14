import type { TestContext } from 'node:test';
import type pg from 'pg';
import { FichaMedicaIncidenteDAOSupabase } from '../infrastructure/repositories/FichaMedicaIncidenteDAOSupabase.js';
import { encriptarCargaUtilMedica } from '../infrastructure/security/encryption.js';
import type { CargaUtilMedica } from '../domain/value-objects/CargaUtilMedica.js';
import { clienteSupabaseFichaPostgresPruebas } from './clienteSupabaseFichaPostgresPruebas.js';
import { contextoPostgresBitacoraPruebas } from './contextoPostgresBitacoraPruebas.js';
import type { ContextoContratoFicha } from './contratoFichaMedicaIncidenteDAO.js';

export { crearPoolBitacoraPruebas as crearPoolFichaPruebas } from './contextoPostgresBitacoraPruebas.js';

export const CARGA_PRUEBA: CargaUtilMedica = {
  alergias: 'penicilina-ficticia',
  condiciones: 'asma-ficticia',
  medicamentos: 'salbutamol-ficticio',
};

/**
 * Reutiliza el contexto de HU-41 (dos rescatistas, un senderista por incidente compatible con
 * DEP-04 y los incidentes abiertos con la RPC real de HU-39) y añade el DAO de la ficha, la
 * ficha cifrada de cada senderista (con el cifrador real) y las operaciones de relevo, cierre
 * y revocación. El relevo (HU-40) y el cierre (HU-42) se simulan como superusuario.
 * Por defecto la ficha lleva el cifrado real de CARGA_PRUEBA; el contrato solo exige que el DAO
 * devuelva exactamente lo guardado.
 */
export async function contextoPostgresFichaPruebas(pool: pg.Pool, t: TestContext): Promise<ContextoContratoFicha> {
  const base = await contextoPostgresBitacoraPruebas(pool, t);
  const dao = new FichaMedicaIncidenteDAOSupabase(clienteSupabaseFichaPostgresPruebas(pool));

  return {
    dao,
    responsableA: base.responsableA,
    rescatistaB: base.rescatistaB,
    async crearIncidente(responsable) {
      const incidenteId = await base.crearIncidente(responsable);
      const { rows } = await pool.query(
        'SELECT e.senderista_id FROM public.incidentes i JOIN public.expediciones e ON e.id = i.expedicion_id WHERE i.id = $1',
        [incidenteId],
      );
      const senderistaId = rows[0].senderista_id as string;
      const ficha = { tipoSangre: 'AB-', cargaCifrada: encriptarCargaUtilMedica(CARGA_PRUEBA) };
      await pool.query(
        'INSERT INTO public.fichas_medicas (senderista_id, tipo_sangre, condiciones_encriptadas, consentimiento_firmado) VALUES ($1,$2,$3,TRUE)',
        [senderistaId, ficha.tipoSangre, ficha.cargaCifrada],
      );
      return { incidenteId, senderistaId, ficha };
    },
    relevar: base.relevar,
    marcarLocalizado: base.marcarLocalizado,
    cerrar: base.cerrar,
    async revocarConsentimiento(senderistaId) {
      await pool.query('DELETE FROM public.fichas_medicas WHERE senderista_id = $1', [senderistaId]);
    },
  };
}
