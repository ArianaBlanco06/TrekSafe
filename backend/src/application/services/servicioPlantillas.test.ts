import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ContactosVigentesMemoria } from '../../infrastructure/repositories/memoria/ContactosVigentesMemoria.js';
import { DAOPlantillasMemoria } from '../../infrastructure/repositories/memoria/DAOPlantillasMemoria.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { guardarPlantillaSchema } from '../dto/plantilla.dto.js';
import { ServicioPlantillas } from './servicioPlantillas.js';

function preparar() {
  const A = randomUUID();
  const B = randomUUID();
  const contactoA = randomUUID();
  const contactoB = randomUUID();
  const contactos = new ContactosVigentesMemoria();
  contactos.agregar(A, contactoA);
  contactos.agregar(B, contactoB);
  const servicio = new ServicioPlantillas(new DAOPlantillasMemoria(), contactos);
  const entrada = (nombre: string, extra: Record<string, unknown> = {}) =>
    guardarPlantillaSchema.parse({
      nombre,
      lugarInicio: 'Cebollapampa',
      lugarFin: 'Laguna 69',
      coordenadasFin: '-9.0105, -77.6042',
      idsContactos: [contactoA],
      nombresAcompanantes: ['Ana Torres'],
      ...extra,
    });
  return { A, B, contactoA, contactoB, servicio, entrada };
}

const conCodigo = (estado: number, codigo: string) => (err: unknown) =>
  err instanceof ErrorAplicacion && err.codigoEstado === estado && err.codigo === codigo;

describe('ServicioPlantillas', () => {
  it('C1: guarda, lista, renombra y elimina en la cuenta del propietario', async () => {
    const { A, servicio, entrada } = preparar();
    const creada = await servicio.guardar(A, entrada('Laguna 69'));
    assert.equal(creada.version, 1);
    assert.equal(creada.coordenadasFin, '-9.01050, -77.60420');
    assert.equal(creada.coordenadasInicio, null);

    assert.deepEqual((await servicio.listar(A)).map((p) => p.nombre), ['Laguna 69']);

    const renombrada = await servicio.renombrar(A, creada.id, { nombre: 'Laguna 69 fin de semana', versionEsperada: 1 });
    assert.equal(renombrada.nombre, 'Laguna 69 fin de semana');
    assert.equal(renombrada.version, 2);

    await servicio.eliminar(A, creada.id);
    assert.deepEqual(await servicio.listar(A), []);
  });

  it('rechaza guardar con contactos ajenos o inexistentes (400 CONTACTOS_INVALIDOS)', async () => {
    const { A, contactoB, servicio, entrada } = preparar();
    await assert.rejects(
      () => servicio.guardar(A, entrada('Con ajeno', { idsContactos: [contactoB] })),
      conCodigo(400, 'CONTACTOS_INVALIDOS'),
    );
    await assert.rejects(
      () => servicio.guardar(A, entrada('Con inexistente', { idsContactos: [randomUUID()] })),
      conCodigo(400, 'CONTACTOS_INVALIDOS'),
    );
    assert.deepEqual(await servicio.listar(A), []);
  });

  it('mapea nombre duplicado a 409 NOMBRE_DUPLICADO al guardar y al renombrar', async () => {
    const { A, servicio, entrada } = preparar();
    await servicio.guardar(A, entrada('Laguna 69'));
    await assert.rejects(() => servicio.guardar(A, entrada('laguna 69')), conCodigo(409, 'NOMBRE_DUPLICADO'));
    const otra = await servicio.guardar(A, entrada('Otra'));
    await assert.rejects(
      () => servicio.renombrar(A, otra.id, { nombre: 'LAGUNA 69', versionEsperada: 1 }),
      conCodigo(409, 'NOMBRE_DUPLICADO'),
    );
  });

  it('mapea versión obsoleta a 409 VERSION_OBSOLETA', async () => {
    const { A, servicio, entrada } = preparar();
    const creada = await servicio.guardar(A, entrada('Laguna 69'));
    await servicio.renombrar(A, creada.id, { nombre: 'Primera', versionEsperada: 1 });
    await assert.rejects(
      () => servicio.renombrar(A, creada.id, { nombre: 'Segunda', versionEsperada: 1 }),
      conCodigo(409, 'VERSION_OBSOLETA'),
    );
  });

  it('plantilla ajena o inexistente: 404 PLANTILLA_NO_ENCONTRADA al renombrar y eliminar', async () => {
    const { A, B, servicio, entrada } = preparar();
    const creada = await servicio.guardar(A, entrada('Privada'));
    await assert.rejects(
      () => servicio.renombrar(B, creada.id, { nombre: 'Robada', versionEsperada: 1 }),
      conCodigo(404, 'PLANTILLA_NO_ENCONTRADA'),
    );
    await assert.rejects(() => servicio.eliminar(B, creada.id), conCodigo(404, 'PLANTILLA_NO_ENCONTRADA'));
    await assert.rejects(() => servicio.eliminar(A, randomUUID()), conCodigo(404, 'PLANTILLA_NO_ENCONTRADA'));
    assert.equal((await servicio.listar(A)).length, 1);
  });

  it('eliminar la plantilla no toca los contactos vigentes del propietario', async () => {
    const { A, contactoA, servicio, entrada } = preparar();
    const creada = await servicio.guardar(A, entrada('Laguna 69'));
    await servicio.eliminar(A, creada.id);
    const nuevo = await servicio.guardar(A, entrada('Otra vez', { idsContactos: [contactoA] }));
    assert.deepEqual(nuevo.idsContactos, [contactoA]);
  });
});

describe('guardarPlantillaSchema', () => {
  const base = {
    nombre: 'X',
    lugarInicio: 'Inicio',
    lugarFin: 'Destino',
  };

  it('aplica valores por defecto', () => {
    const r = guardarPlantillaSchema.parse(base);
    assert.equal(r.minutosTolerancia, 30);
    assert.deepEqual(r.idsContactos, []);
    assert.deepEqual(r.nombresAcompanantes, []);
  });

  it('rechaza contactos repetidos, más de 10 contactos, nombre largo y coordenadas fuera de Perú', () => {
    const id = randomUUID();
    assert.equal(guardarPlantillaSchema.safeParse({ ...base, idsContactos: [id, id] }).success, false);
    const once = Array.from({ length: 11 }, () => randomUUID());
    assert.equal(guardarPlantillaSchema.safeParse({ ...base, idsContactos: once }).success, false);
    assert.equal(guardarPlantillaSchema.safeParse({ ...base, nombre: 'a'.repeat(81) }).success, false);
    assert.equal(guardarPlantillaSchema.safeParse({ ...base, coordenadasFin: '40.0, -3.0' }).success, false);
    assert.equal(guardarPlantillaSchema.safeParse({ ...base, minutosTolerancia: 481 }).success, false);
  });
});
