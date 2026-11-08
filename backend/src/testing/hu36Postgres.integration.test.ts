import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type pg from 'pg';
import { ConsultarHistorialCambios } from '../application/use-cases/ConsultarHistorialCambios.js';
import {
  comoServiceRole,
  contextoPostgresEventosPlanPruebas,
  crearPoolEventosPlanPruebas,
} from './contextoPostgresEventosPlanPruebas.js';
import { verificarContratoLectorEventosPlan } from './contratoLectorEventosPlan.js';

const conexion = process.env.HU36_TEST_DATABASE_URL;

describe('HU-36 PostgreSQL local desechable', { skip: !conexion }, () => {
  let pool: pg.Pool;
  before(() => { pool = crearPoolEventosPlanPruebas(conexion!); });
  after(async () => { await pool?.end(); });

  verificarContratoLectorEventosPlan('Contrato ILectorEventosPlan: SDK y PostgreSQL real mediante puente fetch',
    (t) => contextoPostgresEventosPlanPruebas(pool, t));

  it('lee el evento CANCELADA que registra la RPC real de HU-27', async (t) => {
    const c = await contextoPostgresEventosPlanPruebas(pool, t);
    await comoServiceRole(pool, async (cliente) => {
      await cliente.query('SELECT public.treksafe_cancelar_expedicion($1,$2,$3,$4)',
        [c.expedicionA, c.senderistaA, 'Mal clima', randomUUID()]);
    });
    const [evento] = await c.lector.listarPorExpedicion(c.senderistaA, c.expedicionA);
    assert.equal(evento.tipo, 'CANCELADA');
    assert.deepEqual(evento.cambios, { estado: { antes: 'programada', despues: 'cancelada' } });
    assert.equal(evento.motivo, 'Mal clima');
    assert.equal(evento.anonimizado, false);
    assert.equal(new Date(evento.ocurridoEn).toISOString(), evento.ocurridoEn);
  });

  it('la anonimización ARCO real como service_role deja el evento anonimizado', async (t) => {
    const c = await contextoPostgresEventosPlanPruebas(pool, t);
    await c.sembrar([[{
      expedicionId: c.expedicionA, senderistaId: c.senderistaA, tipo: 'EDITADA', actorId: c.senderistaA,
      versionResultante: 2, cambios: { lugarFin: { antes: 'A', despues: 'B' } }, motivo: null, operacionId: randomUUID(),
    }]]);
    await comoServiceRole(pool, async (cliente) => {
      await cliente.query("UPDATE public.eventos_plan SET cambios = '{}'::jsonb, motivo = NULL WHERE expedicion_id = $1", [c.expedicionA]);
    });
    const [evento] = await c.lector.listarPorExpedicion(c.senderistaA, c.expedicionA);
    assert.deepEqual(evento.cambios, {});
    assert.equal(evento.anonimizado, true);
  });

  it('ConsultarHistorialCambios con adaptadores reales: el propietario ve sus eventos y el ajeno recibe 404', async (t) => {
    const c = await contextoPostgresEventosPlanPruebas(pool, t);
    await c.sembrar([[{
      expedicionId: c.expedicionA, senderistaId: c.senderistaA, tipo: 'EDITADA', actorId: c.senderistaA,
      versionResultante: 2, cambios: { minutosTolerancia: { antes: 30, despues: 45 } }, motivo: null, operacionId: randomUUID(),
    }]]);
    const caso = new ConsultarHistorialCambios(c.propiedad, c.lector);
    const historial = await caso.ejecutar(c.senderistaA, c.expedicionA);
    assert.equal(historial.expedicionId, c.expedicionA);
    assert.deepEqual(historial.cambios.map((e) => e.cambios), [[{ campo: 'minutosTolerancia', antes: 30, despues: 45 }]]);
    assert.deepEqual(historial.cambios[0].autor, { esPropietario: true });
    await assert.rejects(caso.ejecutar(c.senderistaB, c.expedicionA), { codigoEstado: 404, codigo: 'EXPEDICION_NO_ENCONTRADA' });
  });
});
