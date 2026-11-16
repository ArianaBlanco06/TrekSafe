import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import { ServicioPuntosRuta } from './servicioPuntosRuta.js';
import type { IConsultaPuntosRuta, IGuardadoPuntosRuta, OrdenGuardarPuntos } from '../ports/puntosRuta.js';
import { puntoFixture, rutaFixture, senderistaFixture } from '../../testing/puntosRuta/fixtures.js';

describe('ServicioPuntosRuta', () => {
  it('inyecta lectura y escritura sin construir infraestructura y normaliza la entrada', async () => {
    const ruta = rutaFixture();
    let orden: OrdenGuardarPuntos | undefined;
    const lectura: IConsultaPuntosRuta = {
      async consultarPropia(actor, id) {
        assert.equal(actor, senderistaFixture);
        assert.equal(id, ruta.expedicion.id);
        return ruta;
      },
    };
    const escritura: IGuardadoPuntosRuta = {
      async guardarColeccionPropia(value) { orden = value; return { tipo: 'guardado', ruta }; },
    };
    const servicio = new ServicioPuntosRuta(lectura, escritura);
    assert.equal(await servicio.consultar(senderistaFixture, ruta.expedicion.id.toUpperCase()), ruta);
    const punto = puntoFixture(1, { nombre: '\t Mirador \u3000', latitud: -9.030126 });
    await servicio.guardar(senderistaFixture, ruta.expedicion.id, {
      versionEsperada: 1, puntos: [{ ...punto, id: punto.id.toUpperCase() }],
    });
    assert.equal(orden!.senderistaId, senderistaFixture);
    assert.equal(orden!.puntos[0].nombre, 'Mirador');
    assert.equal(orden!.puntos[0].id, punto.id);
    assert.equal(orden!.puntos[0].latitud, -9.030126); // La base controla el redondeo.
  });

  const invalidos: Array<[string, () => unknown]> = [
    ['propietario agregado al cuerpo', () => ({ versionEsperada: 1, puntos: [], senderistaId: 'otro' })],
    ['coleccion omitida', () => ({ versionEsperada: 1 })],
    ['version superior a INTEGER', () => ({ versionEsperada: 2_147_483_648, puntos: [] })],
    ['version cero', () => ({ versionEsperada: 0, puntos: [] })],
    ['version negativa', () => ({ versionEsperada: -1, puntos: [] })],
    ['version fraccionaria', () => ({ versionEsperada: 1.5, puntos: [] })],
    ['version como cadena', () => ({ versionEsperada: '1', puntos: [] })],
    ['coordenada como cadena', () => ({ versionEsperada: 1, puntos: [{ ...puntoFixture(), latitud: '-9' }] })],
    ['coordenada infinita', () => ({ versionEsperada: 1, puntos: [puntoFixture(1, { longitud: Infinity })] })],
    ['nombre con NUL', () => ({ versionEsperada: 1, puntos: [puntoFixture(1, { nombre: 'x\0' })] })],
    ['sustituto Unicode aislado', () => ({ versionEsperada: 1, puntos: [puntoFixture(1, { nombre: '\ud800' })] })],
    ['ID repetido en mayusculas', () => {
      const p = puntoFixture();
      return { versionEsperada: 1, puntos: [p, { ...p, id: p.id.toUpperCase(), orden: 2 }] };
    }],
  ];
  for (const [caso, crear] of invalidos) {
    it(`rechaza ${caso} antes de llamar a persistencia`, async () => {
      let escrituras = 0;
      const servicio = new ServicioPuntosRuta({ consultarPropia: async () => null }, {
        async guardarColeccionPropia() { escrituras++; return { tipo: 'no_encontrado' }; },
      });
      await assert.rejects(servicio.guardar(senderistaFixture, rutaFixture().expedicion.id, crear()), ZodError);
      assert.equal(escrituras, 0);
    });
  }
  it('rechaza un ID de expedicion invalido antes de acceder a datos', async () => {
    const servicio = new ServicioPuntosRuta({ consultarPropia: async () => { throw new Error('No debe llamarse'); } }, {
      guardarColeccionPropia: async () => { throw new Error('No debe llamarse'); },
    });
    await assert.rejects(servicio.consultar(senderistaFixture, 'invalido'), ZodError);
  });
});
