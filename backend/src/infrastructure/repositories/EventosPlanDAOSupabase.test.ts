import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { EventosPlanDAOSupabase } from './EventosPlanDAOSupabase.js';

const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const expedicionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const operacionId = '99999999-9999-4999-8999-999999999999';

type Solicitud = { url: URL; metodo: string | undefined; prefer: string | null; cuerpo: unknown };

function clienteConRespuesta(datos: unknown, estado = 200) {
  const solicitudes: Solicitud[] = [];
  const cliente = createClient('http://127.0.0.1:1', 'clave-ficticia-pruebas-hu36', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      const cabeceras = new Headers(init?.headers);
      solicitudes.push({
        url, metodo: init?.method, prefer: cabeceras.get('prefer'),
        cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      return Response.json(datos, { status: estado });
    } },
  });
  return { cliente, solicitudes };
}

function fila(datos: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111', expedicion_id: expedicionId, senderista_id: actor,
    tipo: 'EDITADA', actor_id: actor, ocurrido_en: '2026-11-01T10:00:00+00:00', version_resultante: 2,
    cambios: { lugarFin: { antes: 'Laguna 69', despues: 'Nevado Ishinca' } }, motivo: null,
    operacion_id: operacionId, ...datos,
  };
}

describe('Eventos del plan en Supabase (HU-36): SDK con transporte sustituido', () => {
  it('filtra por expedición y propietario, ordena por fecha e id y selecciona columnas explícitas', async () => {
    const { cliente, solicitudes } = clienteConRespuesta([fila()]);
    const eventos = await new EventosPlanDAOSupabase(cliente).listarPorExpedicion(actor, expedicionId);
    assert.deepEqual(eventos, [{
      id: '11111111-1111-4111-8111-111111111111', expedicionId, senderistaId: actor, tipo: 'EDITADA',
      actorId: actor, ocurridoEn: '2026-11-01T10:00:00+00:00', versionResultante: 2,
      cambios: { lugarFin: { antes: 'Laguna 69', despues: 'Nevado Ishinca' } }, motivo: null, operacionId,
    }]);
    assert.equal(solicitudes.length, 1);
    const { url, metodo } = solicitudes[0];
    assert.equal(metodo, 'GET');
    assert.equal(url.pathname, '/rest/v1/eventos_plan');
    assert.equal(url.searchParams.get('expedicion_id'), `eq.${expedicionId}`);
    assert.equal(url.searchParams.get('senderista_id'), `eq.${actor}`);
    assert.equal(url.searchParams.get('order'), 'ocurrido_en.asc,id.asc');
    const seleccion = url.searchParams.get('select')!;
    assert.doesNotMatch(seleccion, /\*/);
    assert.deepEqual(seleccion.split(','), ['id', 'expedicion_id', 'senderista_id', 'tipo', 'actor_id',
      'ocurrido_en', 'version_resultante', 'cambios', 'motivo', 'operacion_id']);
  });

  it('quita claves inyectadas en cambios y descarta tipos desconocidos', async () => {
    const { cliente } = clienteConRespuesta([
      fila({ cambios: { lugarFin: { antes: 'A', despues: 'B', extra: 'x' }, contrasena: { antes: 'a', despues: 'b' } } }),
      fila({ id: '22222222-2222-4222-8222-222222222222', tipo: 'DESCONOCIDO' }),
      fila({ id: '33333333-3333-4333-8333-333333333333', cambios: 'no-es-objeto' }),
    ]);
    const eventos = await new EventosPlanDAOSupabase(cliente).listarPorExpedicion(actor, expedicionId);
    assert.deepEqual(eventos.map((evento) => evento.cambios), [{ lugarFin: { antes: 'A', despues: 'B' } }, {}]);
    assert.doesNotMatch(JSON.stringify(eventos), /contrasena|extra|DESCONOCIDO/);
  });

  it('devuelve una lista vacía si no hay eventos', async () => {
    const { cliente } = clienteConRespuesta([]);
    assert.deepEqual(await new EventosPlanDAOSupabase(cliente).listarPorExpedicion(actor, expedicionId), []);
  });

  it('traduce un error de consulta sin exponer los detalles internos', async () => {
    const { cliente } = clienteConRespuesta({ code: 'XX000', message: 'detalle-interno-de-la-base' }, 500);
    await assert.rejects(new EventosPlanDAOSupabase(cliente).listarPorExpedicion(actor, expedicionId), {
      codigoEstado: 500, codigo: 'HISTORIAL_CAMBIOS_NO_DISPONIBLE',
      message: 'No se pudo consultar el historial de cambios.',
    });
  });

  it('registra con un POST simple, sin upsert ni fecha o id del cliente', async () => {
    const { cliente, solicitudes } = clienteConRespuesta(fila());
    const registrado = await new EventosPlanDAOSupabase(cliente).registrar({
      expedicionId, senderistaId: actor, tipo: 'EDITADA', actorId: actor, versionResultante: 2,
      cambios: { lugarFin: { antes: 'Laguna 69', despues: 'Nevado Ishinca' } }, motivo: null, operacionId,
    });
    assert.equal(registrado.operacionId, operacionId);
    const { url, metodo, prefer, cuerpo } = solicitudes[0];
    assert.equal(metodo, 'POST');
    assert.equal(url.pathname, '/rest/v1/eventos_plan');
    assert.equal(url.searchParams.get('on_conflict'), null);
    assert.doesNotMatch(prefer ?? '', /resolution|merge-duplicates|ignore-duplicates/);
    assert.deepEqual(Object.keys(cuerpo as object).sort(), ['actor_id', 'cambios', 'expedicion_id', 'motivo',
      'operacion_id', 'senderista_id', 'tipo', 'version_resultante']);
  });

  it('traduce un operacion_id duplicado a 409 y otros fallos a 500', async () => {
    const nuevo = {
      expedicionId, senderistaId: actor, tipo: 'CANCELADA' as const, actorId: actor, versionResultante: 3,
      cambios: {}, motivo: null, operacionId,
    };
    const duplicado = clienteConRespuesta({ code: '23505', message: 'duplicate key value' }, 409);
    await assert.rejects(new EventosPlanDAOSupabase(duplicado.cliente).registrar(nuevo), {
      codigoEstado: 409, codigo: 'OPERACION_YA_REGISTRADA',
    });
    const fallo = clienteConRespuesta({ code: 'P0001', message: 'EVENTO_PLAN_INMUTABLE' }, 400);
    await assert.rejects(new EventosPlanDAOSupabase(fallo.cliente).registrar(nuevo), {
      codigoEstado: 500, codigo: 'HISTORIAL_CAMBIOS_NO_DISPONIBLE',
    });
  });
});
