import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ContactosVigentesMemoria } from '../../infrastructure/repositories/memoria/ContactosVigentesMemoria.js';
import { DAOPlantillasMemoria } from '../../infrastructure/repositories/memoria/DAOPlantillasMemoria.js';
import { CreadorDesdePlantilla } from './CreadorDesdePlantilla.js';
import { CreadorPlan } from './CreadorPlan.js';
import { verificarContratoCreadorPlan } from './contratoCreadorPlan.js';

async function escenario() {
  const senderistaId = randomUUID();
  const otroId = randomUUID();
  const vigentes = [randomUUID(), randomUUID()];
  const noVigentes = [randomUUID()];
  const contactos = new ContactosVigentesMemoria();
  contactos.agregar(senderistaId, ...vigentes);
  const dao = new DAOPlantillasMemoria();

  const propia = await dao.crear(senderistaId, {
    nombre: 'Laguna 69',
    lugarInicio: 'Cebollapampa',
    lugarFin: 'Laguna 69',
    coordenadasInicio: null,
    coordenadasFin: '-9.01050, -77.60420',
    minutosTolerancia: 45,
    idsContactos: [vigentes[0]!, noVigentes[0]!, vigentes[1]!],
    nombresAcompanantes: ['Ana Torres', 'Luis Rojas'],
  });
  const ajena = await dao.crear(otroId, {
    nombre: 'Ajena',
    lugarInicio: 'Otro inicio',
    lugarFin: 'Otro fin',
    coordenadasInicio: null,
    coordenadasFin: null,
    minutosTolerancia: 30,
    idsContactos: [],
    nombresAcompanantes: [],
  });
  if (propia.tipo !== 'ok' || ajena.tipo !== 'ok') throw new Error('preparación fallida');

  return {
    creador: new CreadorDesdePlantilla(contactos, dao),
    senderistaId,
    origenIdPropio: propia.plantilla.id,
    origenIdAjeno: ajena.plantilla.id,
    idsContactosVigentes: vigentes,
    idsContactosNoVigentes: noVigentes,
    contactos,
  };
}

verificarContratoCreadorPlan('CreadorDesdePlantilla', escenario);

describe('CreadorDesdePlantilla', () => {
  it('es un CreadorPlan (Factory Method) y describe el origen', async () => {
    const e = await escenario();
    assert.ok(e.creador instanceof CreadorPlan);
    const borrador = await e.creador.prepararBorrador(e.senderistaId, e.origenIdPropio);
    assert.equal(borrador.origen, 'plantilla');
    assert.equal(borrador.descripcionOrigen, 'Plantilla «Laguna 69»');
    assert.equal(borrador.lugarFin, 'Laguna 69');
    assert.equal(borrador.minutosTolerancia, 45);
    assert.deepEqual(borrador.nombresAcompanantes, ['Ana Torres', 'Luis Rojas']);
  });

  it('preserva el orden de contactos de la plantilla', async () => {
    const e = await escenario();
    const borrador = await e.creador.prepararBorrador(e.senderistaId, e.origenIdPropio);
    assert.deepEqual(borrador.idsContactos, e.idsContactosVigentes);
  });

  it('revalida los contactos en cada borrador (un contacto borrado después pasa a no vigente)', async () => {
    const e = await escenario();
    e.contactos.quitar(e.senderistaId, e.idsContactosVigentes[0]!);
    const borrador = await e.creador.prepararBorrador(e.senderistaId, e.origenIdPropio);
    assert.deepEqual(borrador.idsContactos, [e.idsContactosVigentes[1]]);
    assert.equal(borrador.cantidadContactosNoVigentes, 2);
  });
});
