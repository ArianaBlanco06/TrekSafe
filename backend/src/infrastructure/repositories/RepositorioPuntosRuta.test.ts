import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RepositorioPuntosRuta } from './RepositorioPuntosRuta.js';
import { rutaFixture, puntoFixture, senderistaFixture } from '../../testing/puntosRuta/fixtures.js';

describe('RepositorioPuntosRuta: frontera RPC', () => {
  it('usa nombres y parametros SQL exactos y normaliza timestamps', async () => {
    const ruta = rutaFixture();
    ruta.expedicion.horaInicio = '2099-01-01T07:00:00-05:00';
    const calls: Array<{ nombre: string; parametros: Record<string, unknown> }> = [];
    const repo = new RepositorioPuntosRuta({
      async rpc(nombre, parametros) {
        calls.push({ nombre, parametros });
        return { error: null, data: nombre === 'treksafe_consultar_puntos_ruta' ? ruta : { tipo: 'guardado', ruta } };
      },
    });
    const read = (await repo.consultarPropia(senderistaFixture, ruta.expedicion.id))!;
    assert.equal(read.expedicion.horaInicio, '2099-01-01T12:00:00.000Z');
    const puntos = [puntoFixture()];
    await repo.guardarColeccionPropia({ senderistaId: senderistaFixture, expedicionId: ruta.expedicion.id, versionEsperada: 1, puntos });
    assert.deepEqual(calls, [
      { nombre: 'treksafe_consultar_puntos_ruta', parametros: { p_senderista_id: senderistaFixture, p_expedicion_id: ruta.expedicion.id } },
      { nombre: 'treksafe_guardar_puntos_ruta', parametros: {
        p_senderista_id: senderistaFixture, p_expedicion_id: ruta.expedicion.id, p_version_esperada: 1, p_puntos: puntos,
      } },
    ]);
  });
  it('consulta null no se convierte en un error tecnico', async () => {
    const repo = new RepositorioPuntosRuta({ rpc: async () => ({ data: null, error: null }) });
    assert.equal(await repo.consultarPropia(senderistaFixture, rutaFixture().expedicion.id), null);
  });
  it('conserva todos los rechazos de negocio de SQL', async () => {
    for (const resultado of [
      { tipo: 'no_encontrado' }, { tipo: 'expedicion_no_editable' }, { tipo: 'expedicion_ya_iniciada' },
      { tipo: 'version_obsoleta' }, { tipo: 'datos_invalidos', detalles: { 'puntos.0.id': ['No disponible'] } },
    ]) {
      const repo = new RepositorioPuntosRuta({ rpc: async () => ({ data: resultado, error: null }) });
      assert.deepEqual(await repo.guardarColeccionPropia({ senderistaId: senderistaFixture,
        expedicionId: rutaFixture().expedicion.id, versionEsperada: 1, puntos: [] }), resultado);
    }
  });
  it('rechaza errores y respuestas inesperadas sin filtrar el contenido externo', async () => {
    for (const respuesta of [
      { data: null, error: { message: 'DETALLE_SQL_FICTICIO' } },
      { data: { tipo: 'guardado', ruta: null }, error: null },
      { data: { tipo: 'desconocido' }, error: null },
    ]) {
      const repo = new RepositorioPuntosRuta({ rpc: async () => respuesta });
      await assert.rejects(repo.guardarColeccionPropia({ senderistaId: senderistaFixture,
        expedicionId: rutaFixture().expedicion.id, versionEsperada: 1, puntos: [] }), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(!error.message.includes('DETALLE_SQL_FICTICIO'));
        return true;
      });
    }
  });
});
