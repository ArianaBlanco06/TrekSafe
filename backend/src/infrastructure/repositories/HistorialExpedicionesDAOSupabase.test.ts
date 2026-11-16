import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { HistorialExpedicionesDAOSupabase } from './HistorialExpedicionesDAOSupabase.js';
import { DAOContactosVigentesSupabase } from './DAOContactosVigentesSupabase.js';

const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const expedicionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const contactoA = '11111111-1111-4111-8111-111111111111';
const contactoB = '22222222-2222-4222-8222-222222222222';

function clienteConRespuesta(datos: unknown, estado = 200) {
  const solicitudes: { url: URL; metodo: string | undefined }[] = [];
  const cliente = createClient('http://127.0.0.1:1', 'clave-ficticia-pruebas-hu28', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      solicitudes.push({ url, metodo: init?.method });
      return Response.json(datos, { status: estado });
    } },
  });
  return { cliente, solicitudes };
}

describe('Lecturas Supabase de HU-28: SDK con transporte sustituido', () => {
  it('filtra por id, propietario y estado completado y selecciona solo datos reutilizables', async () => {
    const { cliente, solicitudes } = clienteConRespuesta([{
      id: expedicionId, senderista_id: actor, estado: 'completada',
      lugar_inicio: 'Cebollapampa', lugar_fin: 'Laguna 69',
      coordenadas_inicio: null, coordenadas_fin: '-9.01050, -77.60420', minutos_tolerancia: 45,
      vinculos_expedicion_contacto: [{ contacto_id: contactoA }],
      acompanantes_expedicion: [{ nombre_acompanante: 'Ana Torres' }],
      ficha_medica: 'dato-ficticio-que-no-debe-devolverse',
      confirmado_en: '2025-01-10T17:00:00Z', hora_inicio: '2025-01-10T08:00:00Z',
    }]);
    const resultado = await new HistorialExpedicionesDAOSupabase(cliente).buscarPorId(actor, expedicionId);
    assert.deepEqual(resultado, {
      id: expedicionId, senderistaId: actor, estado: 'completada',
      lugarInicio: 'Cebollapampa', lugarFin: 'Laguna 69',
      coordenadasInicio: null, coordenadasFin: '-9.01050, -77.60420', minutosTolerancia: 45,
      idsContactos: [contactoA], nombresAcompanantes: ['Ana Torres'],
    });
    assert.equal(solicitudes.length, 1);
    const { url, metodo } = solicitudes[0];
    assert.equal(metodo, 'GET');
    assert.equal(url.pathname, '/rest/v1/expediciones');
    assert.equal(url.searchParams.get('id'), `eq.${expedicionId}`);
    assert.equal(url.searchParams.get('senderista_id'), `eq.${actor}`);
    assert.equal(url.searchParams.get('estado'), 'eq.completada');
    const seleccion = url.searchParams.get('select')!;
    assert.match(seleccion, /vinculos_expedicion_contacto\(contacto_id\)/);
    assert.match(seleccion, /acompanantes_expedicion\(nombre_acompanante\)/);
    assert.doesNotMatch(seleccion, /\*|ficha|alerta|hora_|confirm|correo|telefono/);
  });

  it('devuelve null cuando la consulta no encuentra un origen propio completado', async () => {
    const { cliente } = clienteConRespuesta([]);
    assert.equal(await new HistorialExpedicionesDAOSupabase(cliente).buscarPorId(actor, expedicionId), null);
  });

  it('admite expediciones sin acompañantes ni contactos vinculados', async () => {
    const { cliente } = clienteConRespuesta([{
      id: expedicionId, senderista_id: actor, estado: 'completada',
      lugar_inicio: 'Inicio', lugar_fin: 'Destino', coordenadas_inicio: null, coordenadas_fin: null,
      minutos_tolerancia: 30, vinculos_expedicion_contacto: [], acompanantes_expedicion: [],
    }]);
    const resultado = await new HistorialExpedicionesDAOSupabase(cliente).buscarPorId(actor, expedicionId);
    assert.deepEqual(resultado?.idsContactos, []);
    assert.deepEqual(resultado?.nombresAcompanantes, []);
  });

  it('traduce un error de consulta sin exponer los detalles internos', async () => {
    const { cliente } = clienteConRespuesta({ code: 'XX000', message: 'detalle-interno-de-la-base' }, 500);
    await assert.rejects(new HistorialExpedicionesDAOSupabase(cliente).buscarPorId(actor, expedicionId), {
      codigoEstado: 500, codigo: 'HISTORIAL_NO_DISPONIBLE',
      message: 'No se pudo consultar el historial de expediciones.',
    });
  });

  it('revalida contactos por propietario y conserva el orden sugerido', async () => {
    const inexistente = '33333333-3333-4333-8333-333333333333';
    const { cliente, solicitudes } = clienteConRespuesta([{ id: contactoB }, { id: contactoA }]);
    const resultado = await new DAOContactosVigentesSupabase(cliente)
      .filtrarVigentes(actor, [contactoA, inexistente, contactoB]);
    assert.deepEqual(resultado, [contactoA, contactoB]);
    const { url, metodo } = solicitudes[0];
    assert.equal(metodo, 'GET');
    assert.equal(url.pathname, '/rest/v1/contactos_emergencia');
    assert.equal(url.searchParams.get('select'), 'id');
    assert.equal(url.searchParams.get('senderista_id'), `eq.${actor}`);
    assert.equal(url.searchParams.get('id'), `in.(${contactoA},${inexistente},${contactoB})`);
  });

  it('evita consultas de contactos si no hay sugerencias', async () => {
    const { cliente, solicitudes } = clienteConRespuesta([]);
    assert.deepEqual(await new DAOContactosVigentesSupabase(cliente).filtrarVigentes(actor, []), []);
    assert.equal(solicitudes.length, 0);
  });

  it('propaga el fallo de contactos para impedir que se entregue un borrador sin validar', async () => {
    const { cliente } = clienteConRespuesta({ code: 'XX000', message: 'fallo-ficticio-de-contactos' }, 500);
    await assert.rejects(new DAOContactosVigentesSupabase(cliente).filtrarVigentes(actor, [contactoA]));
  });
});
