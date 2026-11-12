import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { PropiedadExpedicionSupabase } from './PropiedadExpedicionSupabase.js';

const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const expedicionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function clienteConRespuesta(datos: unknown, estado = 200) {
  const solicitudes: { url: URL; metodo: string | undefined }[] = [];
  const cliente = createClient('http://127.0.0.1:1', 'clave-ficticia-pruebas-hu36', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      solicitudes.push({ url, metodo: init?.method });
      return Response.json(datos, { status: estado });
    } },
  });
  return { cliente, solicitudes };
}

describe('Propiedad de expedición en Supabase (HU-36)', () => {
  it('consulta solo el id filtrando por expedición y propietario', async () => {
    const { cliente, solicitudes } = clienteConRespuesta([{ id: expedicionId }]);
    assert.equal(await new PropiedadExpedicionSupabase(cliente).esPropietario(actor, expedicionId), true);
    const { url, metodo } = solicitudes[0];
    assert.equal(metodo, 'GET');
    assert.equal(url.pathname, '/rest/v1/expediciones');
    assert.equal(url.searchParams.get('select'), 'id');
    assert.equal(url.searchParams.get('id'), `eq.${expedicionId}`);
    assert.equal(url.searchParams.get('senderista_id'), `eq.${actor}`);
  });

  it('devuelve false si la expedición no existe o es ajena', async () => {
    const { cliente } = clienteConRespuesta([]);
    assert.equal(await new PropiedadExpedicionSupabase(cliente).esPropietario(actor, expedicionId), false);
  });

  it('traduce un error sin exponer detalles', async () => {
    const { cliente } = clienteConRespuesta({ code: 'XX000', message: 'detalle-interno' }, 500);
    await assert.rejects(new PropiedadExpedicionSupabase(cliente).esPropietario(actor, expedicionId), {
      codigoEstado: 500, codigo: 'HISTORIAL_CAMBIOS_NO_DISPONIBLE',
    });
  });
});
