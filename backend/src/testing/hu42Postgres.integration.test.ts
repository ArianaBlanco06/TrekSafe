import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type pg from 'pg';
import { ComandoCerrarIncidente } from '../application/commands/ComandoCerrarIncidente.js';
import { ComandoMarcarIncidenteLocalizado } from '../application/commands/ComandoMarcarIncidenteLocalizado.js';
import { CerrarIncidente } from '../application/use-cases/CerrarIncidente.js';
import { ConsultarCierreIncidente } from '../application/use-cases/ConsultarCierreIncidente.js';
import { MarcarIncidenteLocalizado } from '../application/use-cases/MarcarIncidenteLocalizado.js';
import { ErrorAplicacion } from '../shared/errors/ErrorAplicacion.js';
import { contextoPostgresCierrePruebas, crearPoolCierrePruebas } from './contextoPostgresCierrePruebas.js';
import { verificarContratoCierreIncidenteDAO } from './contratoCierreIncidenteDAO.js';

const conexion = process.env.HU42_TEST_DATABASE_URL;

describe('HU-42 PostgreSQL local desechable', { skip: !conexion }, () => {
  let pool: pg.Pool;
  before(() => {
    pool = crearPoolCierrePruebas(conexion!);
  });
  after(async () => {
    await pool?.end();
  });

  verificarContratoCierreIncidenteDAO('Contrato ICierreIncidenteDAO: SDK y PostgreSQL real mediante puente fetch',
    (t) => contextoPostgresCierrePruebas(pool, t));

  it('casos de uso reales: localizar, cerrar, leer el informe por expedición y la expedición sigue en alerta', async (t) => {
    const c = await contextoPostgresCierrePruebas(pool, t);
    const incidente = await c.crearIncidente();
    const expedicion = await c.expedicionDe(incidente);
    const marcar = new MarcarIncidenteLocalizado(c.dao);
    const cerrar = new CerrarIncidente(c.dao);
    const consultar = new ConsultarCierreIncidente(c.dao);

    const localizado = await marcar.ejecutar(ComandoMarcarIncidenteLocalizado.crear(c.responsableA, incidente, { operacionId: randomUUID() }));
    assert.equal(localizado.incidente.estado, 'localizado');

    const comandoId = randomUUID();
    const cuerpo = { comandoId, resultado: 'evacuado', resumen: 'Evacuada al refugio' };
    const primero = await cerrar.ejecutar(ComandoCerrarIncidente.crear(c.responsableA, incidente, cuerpo));
    assert.equal(primero.tipo, 'cerrado');
    const repetido = await cerrar.ejecutar(ComandoCerrarIncidente.crear(c.responsableA, incidente, cuerpo));
    assert.equal(repetido.tipo, 'ya_cerrado_mismo_comando');
    assert.equal(repetido.informe.id, primero.informe.id);

    const vista = await consultar.ejecutar(c.rescatistaB, expedicion);
    assert.equal(vista?.tipoCierre, 'operativo');
    assert.equal(vista?.resultado, 'evacuado');
    assert.equal(vista?.cerradoPor.esMio, false);
    assert.equal(vista?.retornoConfirmadoPorSenderista, false);
    assert.equal(await c.estadoExpedicion(expedicion), 'alerta');
  });

  it('casos de uso reales: 403 NO_ES_RESPONSABLE con el vigente y 409 INCIDENTE_NO_LOCALIZADO e INCIDENTE_CERRADO', async (t) => {
    const c = await contextoPostgresCierrePruebas(pool, t);
    const cerrar = new CerrarIncidente(c.dao);
    const cuerpo = () => ({ comandoId: randomUUID(), resultado: 'falsa_alarma', resumen: 'Sin novedad' });
    const incidente = await c.crearIncidente();

    await assert.rejects(cerrar.ejecutar(ComandoCerrarIncidente.crear(c.responsableA, incidente, cuerpo())), (e: unknown) => {
      assert.ok(e instanceof ErrorAplicacion);
      assert.equal(e.codigoEstado, 409);
      assert.equal(e.codigo, 'INCIDENTE_NO_LOCALIZADO');
      return true;
    });
    await assert.rejects(cerrar.ejecutar(ComandoCerrarIncidente.crear(c.rescatistaB, incidente, cuerpo())), (e: unknown) => {
      assert.ok(e instanceof ErrorAplicacion);
      assert.equal(e.codigoEstado, 403);
      assert.equal(e.codigo, 'NO_ES_RESPONSABLE');
      assert.deepEqual(e.extras, { responsableVigente: { responsableId: c.responsableA, nombreResponsable: 'Ana Rescate' } });
      return true;
    });

    await c.dao.marcarLocalizado({ operacionId: randomUUID(), incidenteId: incidente, rescatistaId: c.responsableA });
    await cerrar.ejecutar(ComandoCerrarIncidente.crear(c.responsableA, incidente, cuerpo()));
    await assert.rejects(cerrar.ejecutar(ComandoCerrarIncidente.crear(c.responsableA, incidente, cuerpo())), (e: unknown) => {
      assert.ok(e instanceof ErrorAplicacion);
      assert.equal(e.codigoEstado, 409);
      assert.equal(e.codigo, 'INCIDENTE_CERRADO');
      return true;
    });
  });
});
