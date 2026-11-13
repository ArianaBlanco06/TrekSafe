import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type pg from 'pg';

// El cifrador real lee la clave al usarse; se fija una clave ficticia antes de usarlo.
process.env.MEDICAL_ENCRYPTION_KEY ??= 'secreto-medico-ficticio-hu50-postgres-000';
Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_SECRET: 'secreto-ficticio-hu50-postgres-0000000000',
  SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture',
});

const { FachadaFichaMedicaIncidente } = await import('../application/services/FachadaFichaMedicaIncidente.js');
const { DescifradorFichaMedicaAesGcm } = await import('../infrastructure/security/DescifradorFichaMedicaAesGcm.js');
const { ErrorAplicacion } = await import('../shared/errors/ErrorAplicacion.js');
const { CARGA_PRUEBA, contextoPostgresFichaPruebas, crearPoolFichaPruebas } = await import('./contextoPostgresFichaPruebas.js');
const { verificarContratoFichaMedicaIncidenteDAO } = await import('./contratoFichaMedicaIncidenteDAO.js');

const conexion = process.env.HU50_TEST_DATABASE_URL;

describe('HU-50 PostgreSQL local desechable', { skip: !conexion }, () => {
  let pool: pg.Pool;
  before(() => {
    pool = crearPoolFichaPruebas(conexion!);
  });
  after(async () => {
    await pool?.end();
  });

  verificarContratoFichaMedicaIncidenteDAO('Contrato IFichaMedicaIncidenteDAO: SDK y PostgreSQL real mediante puente fetch',
    (t) => contextoPostgresFichaPruebas(pool, t));

  const accesos = async (incidenteId: string) =>
    (await pool.query(
      'SELECT actor_id, resultado, motivo, registrado_en FROM public.accesos_ficha_medica WHERE incidente_id = $1 ORDER BY registrado_en, id',
      [incidenteId],
    )).rows as { actor_id: string; resultado: string; motivo: string; registrado_en: Date }[];

  async function fachadaReal(t: Parameters<typeof contextoPostgresFichaPruebas>[1]) {
    const c = await contextoPostgresFichaPruebas(pool, t);
    return { c, fachada: new FachadaFichaMedicaIncidente(c.dao, c.dao, c.dao, new DescifradorFichaMedicaAesGcm()) };
  }

  const denegado = (estado: number, codigo: string, motivo: string) => (e: unknown) => {
    assert.ok(e instanceof ErrorAplicacion, String(e));
    assert.equal(e.codigoEstado, estado);
    assert.equal(e.codigo, codigo);
    assert.deepEqual(e.extras, { motivo });
    return true;
  };

  it('fachada real: el responsable recibe la ficha descifrada y queda una fila permitida con la hora del servidor', async (t) => {
    const { c, fachada } = await fachadaReal(t);
    const { incidenteId } = await c.crearIncidente();
    const r = await fachada.consultar(c.responsableA, incidenteId);
    assert.deepEqual(r.fichaMedica, { tipoSangre: 'AB-', ...CARGA_PRUEBA });
    assert.equal(r.acceso.incidenteId, incidenteId);
    const filas = await accesos(incidenteId);
    assert.deepEqual(filas.map((f) => [f.actor_id, f.resultado, f.motivo]), [[c.responsableA, 'permitido', 'RESPONSABLE_VIGENTE']]);
    assert.equal(filas[0]?.registrado_en.toISOString(), r.acceso.registradoEn);
  });

  it('fachada real: otro rescatista recibe 403 NO_ES_RESPONSABLE, sin datos, y queda una fila denegada', async (t) => {
    const { c, fachada } = await fachadaReal(t);
    const { incidenteId } = await c.crearIncidente();
    await assert.rejects(fachada.consultar(c.rescatistaB, incidenteId), denegado(403, 'ACCESO_FICHA_DENEGADO', 'NO_ES_RESPONSABLE'));
    assert.deepEqual((await accesos(incidenteId)).map((f) => [f.actor_id, f.resultado, f.motivo]), [[c.rescatistaB, 'denegado', 'NO_ES_RESPONSABLE']]);
  });

  it('fachada real: incidente inexistente da 404 y deja una fila denegada con expedición y senderista nulos', async (t) => {
    const { c, fachada } = await fachadaReal(t);
    const inexistente = '55555555-5555-4555-8555-555555555555';
    await assert.rejects(fachada.consultar(c.responsableA, inexistente), denegado(404, 'INCIDENTE_NO_ENCONTRADO', 'INCIDENTE_NO_ENCONTRADO'));
    const { rows } = await pool.query(
      'SELECT expedicion_id, senderista_id, motivo FROM public.accesos_ficha_medica WHERE incidente_id = $1', [inexistente]);
    assert.equal(rows.length >= 1, true);
    assert.deepEqual(rows[0], { expedicion_id: null, senderista_id: null, motivo: 'INCIDENTE_NO_ENCONTRADO' });
  });

  it('fachada real: tras el relevo el anterior recibe 403 y el nuevo, la ficha', async (t) => {
    const { c, fachada } = await fachadaReal(t);
    const { incidenteId } = await c.crearIncidente();
    await c.relevar(incidenteId, c.rescatistaB);
    await assert.rejects(fachada.consultar(c.responsableA, incidenteId), denegado(403, 'ACCESO_FICHA_DENEGADO', 'NO_ES_RESPONSABLE'));
    assert.deepEqual((await fachada.consultar(c.rescatistaB, incidenteId)).fichaMedica.alergias, CARGA_PRUEBA.alergias);
    assert.deepEqual((await accesos(incidenteId)).map((f) => `${f.resultado}:${f.motivo}`), ['denegado:NO_ES_RESPONSABLE', 'permitido:RESPONSABLE_VIGENTE']);
  });

  it('fachada real: localizado sigue permitido; cerrado da 403 INCIDENTE_CERRADO', async (t) => {
    const { c, fachada } = await fachadaReal(t);
    const { incidenteId } = await c.crearIncidente();
    await c.marcarLocalizado(incidenteId);
    assert.equal((await fachada.consultar(c.responsableA, incidenteId)).fichaMedica.tipoSangre, 'AB-');
    await c.cerrar(incidenteId);
    await assert.rejects(fachada.consultar(c.responsableA, incidenteId), denegado(403, 'ACCESO_FICHA_DENEGADO', 'INCIDENTE_CERRADO'));
  });

  it('fachada real: con el consentimiento revocado el responsable recibe 403 SIN_CONSENTIMIENTO y otro rescatista, NO_ES_RESPONSABLE', async (t) => {
    const { c, fachada } = await fachadaReal(t);
    const { incidenteId, senderistaId } = await c.crearIncidente();
    await c.revocarConsentimiento(senderistaId);
    await assert.rejects(fachada.consultar(c.responsableA, incidenteId), denegado(403, 'ACCESO_FICHA_DENEGADO', 'SIN_CONSENTIMIENTO'));
    await assert.rejects(fachada.consultar(c.rescatistaB, incidenteId), denegado(403, 'ACCESO_FICHA_DENEGADO', 'NO_ES_RESPONSABLE'));
  });

  it('la auditoría no contiene datos de salud: ninguna fila del incidente incluye el tipo de sangre ni el texto cifrado', async (t) => {
    const { c, fachada } = await fachadaReal(t);
    const { incidenteId, ficha } = await c.crearIncidente();
    await fachada.consultar(c.responsableA, incidenteId);
    await assert.rejects(fachada.consultar(c.rescatistaB, incidenteId));
    const { rows } = await pool.query(
      'SELECT to_jsonb(a)::text AS fila FROM public.accesos_ficha_medica a WHERE incidente_id = $1', [incidenteId]);
    assert.equal(rows.length, 2);
    for (const { fila } of rows as { fila: string }[]) {
      assert.ok(!fila.includes(ficha.cargaCifrada) && !fila.includes('"AB-"'));
    }
  });
});
