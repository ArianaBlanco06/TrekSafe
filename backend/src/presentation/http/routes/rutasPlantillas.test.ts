import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Valores ficticios solo si no existen; nunca se usa el cliente Supabase en esta prueba.
process.env.SUPABASE_URL ??= 'https://ejemplo.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'clave-ficticia-solo-para-pruebas-sin-red';
process.env.JWT_SECRET ??= 'secreto-ficticio-de-prueba-con-mas-de-32-caracteres';
process.env.MEDICAL_ENCRYPTION_KEY ??= 'clave-medica-ficticia-de-prueba-con-mas-de-32-caracteres';

const { default: express } = await import('express');
const { firmarToken } = await import('../../../infrastructure/security/jwt.js');
const { errorHandler } = await import('../../../shared/errors/errorHandler.js');
const { crearRutasPlantillas } = await import('./rutasPlantillas.js');
const { ServicioPlantillas } = await import('../../../application/services/servicioPlantillas.js');
const { CreadorDesdePlantilla } = await import('../../../application/creacion-plan/CreadorDesdePlantilla.js');
const { DAOPlantillasMemoria } = await import('../../../infrastructure/repositories/memoria/DAOPlantillasMemoria.js');
const { ContactosVigentesMemoria } = await import(
  '../../../infrastructure/repositories/memoria/ContactosVigentesMemoria.js'
);

const A = randomUUID();
const B = randomUUID();
const RESCATISTA = randomUUID();
const contactoA1 = randomUUID();
const contactoA2 = randomUUID();
const contactoB1 = randomUUID();

const contactos = new ContactosVigentesMemoria();
contactos.agregar(A, contactoA1, contactoA2);
contactos.agregar(B, contactoB1);
const dao = new DAOPlantillasMemoria();

const tokenA1 = firmarToken({ sub: A, rol: 'senderista' });
const tokenA2 = firmarToken({ sub: A, rol: 'senderista' });
const tokenB = firmarToken({ sub: B, rol: 'senderista' });
const tokenRescatista = firmarToken({ sub: RESCATISTA, rol: 'rescatista' });

let servidor: Server;
let base = '';

async function pedir(metodo: string, ruta: string, token?: string, cuerpo?: unknown) {
  const res = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await res.text();
  return { estado: res.status, cuerpo: texto ? JSON.parse(texto) : null, texto };
}

const entradaValida = (nombre: string, extra: Record<string, unknown> = {}) => ({
  nombre,
  lugarInicio: 'Cebollapampa',
  lugarFin: 'Laguna 69',
  coordenadasFin: '-9.0105, -77.6042',
  idsContactos: [contactoA1, contactoA2],
  nombresAcompanantes: ['Ana Torres'],
  ...extra,
});

describe('API /plantillas (HTTP real, DAO en memoria)', () => {
  let idPlantillaA = '';

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api/plantillas',
      crearRutasPlantillas({
        servicio: new ServicioPlantillas(dao, contactos),
        creadorDesdePlantilla: new CreadorDesdePlantilla(contactos, dao),
      }),
    );
    app.use(errorHandler);
    await new Promise<void>((resolver) => {
      servidor = app.listen(0, '127.0.0.1', () => resolver());
    });
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/plantillas`;
  });

  after(async () => {
    await new Promise<void>((resolver) => servidor.close(() => resolver()));
  });

  it('401 sin token y 403 para un rescatista', async () => {
    assert.equal((await pedir('GET', '')).estado, 401);
    assert.equal((await pedir('GET', '', tokenRescatista)).estado, 403);
    assert.equal((await pedir('POST', '', tokenRescatista, entradaValida('X'))).estado, 403);
  });

  it('C1: guarda (201), renombra (200) y valida el cuerpo (400)', async () => {
    const creada = await pedir('POST', '', tokenA1, entradaValida('Laguna 69'));
    assert.equal(creada.estado, 201);
    assert.equal(creada.cuerpo.plantilla.version, 1);
    assert.equal(creada.cuerpo.plantilla.senderistaId, undefined);
    idPlantillaA = creada.cuerpo.plantilla.id;

    const invalida = await pedir('POST', '', tokenA1, { ...entradaValida('Mala'), lugarInicio: 'ab' });
    assert.equal(invalida.estado, 400);

    const ajeno = await pedir('POST', '', tokenA1, entradaValida('Con ajeno', { idsContactos: [contactoB1] }));
    assert.equal(ajeno.estado, 400);
    assert.equal(ajeno.cuerpo.codigo, 'CONTACTOS_INVALIDOS');

    const duplicada = await pedir('POST', '', tokenA1, entradaValida('LAGUNA 69'));
    assert.equal(duplicada.estado, 409);
    assert.equal(duplicada.cuerpo.codigo, 'NOMBRE_DUPLICADO');

    const renombrada = await pedir('PATCH', `/${idPlantillaA}`, tokenA1, {
      nombre: 'Laguna 69 fin de semana',
      versionEsperada: 1,
    });
    assert.equal(renombrada.estado, 200);
    assert.equal(renombrada.cuerpo.plantilla.version, 2);
  });

  it('C2: una segunda sesión del mismo usuario obtiene la plantilla guardada', async () => {
    const lista = await pedir('GET', '', tokenA2);
    assert.equal(lista.estado, 200);
    assert.equal(lista.cuerpo.plantillas.length, 1);
    assert.equal(lista.cuerpo.plantillas[0].id, idPlantillaA);
    assert.equal(lista.cuerpo.plantillas[0].nombre, 'Laguna 69 fin de semana');
  });

  it('409 VERSION_OBSOLETA cuando la segunda sesión renombra con una versión vieja', async () => {
    const r = await pedir('PATCH', `/${idPlantillaA}`, tokenA2, { nombre: 'Desde sesión 2', versionEsperada: 1 });
    assert.equal(r.estado, 409);
    assert.equal(r.cuerpo.codigo, 'VERSION_OBSOLETA');
  });

  it('C3: el borrador pide fechas nuevas y marca contactos no vigentes', async () => {
    contactos.quitar(A, contactoA2);
    const r = await pedir('GET', `/${idPlantillaA}/borrador`, tokenA1);
    assert.equal(r.estado, 200);
    const borrador = r.cuerpo.borrador;
    assert.equal(borrador.horaInicio, null);
    assert.equal(borrador.horaRetornoEstimada, null);
    assert.equal(borrador.requiereFechasNuevas, true);
    assert.deepEqual(borrador.idsContactos, [contactoA1]);
    assert.equal(borrador.cantidadContactosNoVigentes, 1);
    assert.equal(borrador.descripcionOrigen, 'Plantilla «Laguna 69 fin de semana»');
    contactos.agregar(A, contactoA2);
  });

  it('aislamiento: 20 peticiones de B sobre la plantilla de A responden 404 sin datos de A', async () => {
    const antes = await pedir('GET', '', tokenA1);
    let respuestasConDatosAjenos = 0;
    for (let i = 0; i < 20; i++) {
      const peticion =
        i % 4 === 0
          ? pedir('GET', `/${idPlantillaA}/borrador`, tokenB)
          : i % 4 === 1
            ? pedir('PATCH', `/${idPlantillaA}`, tokenB, { nombre: 'Robada', versionEsperada: 2 })
            : i % 4 === 2
              ? pedir('DELETE', `/${idPlantillaA}`, tokenB)
              : pedir('GET', '', tokenB);
      const r = await peticion;
      if (i % 4 === 3) {
        assert.equal(r.estado, 200);
        assert.deepEqual(r.cuerpo.plantillas, []);
      } else {
        assert.equal(r.estado, 404);
        assert.equal(r.cuerpo.codigo, 'PLANTILLA_NO_ENCONTRADA');
      }
      if (/Laguna|Cebollapampa/.test(r.texto)) respuestasConDatosAjenos++;
    }
    assert.equal(respuestasConDatosAjenos, 0);
    assert.deepEqual((await pedir('GET', '', tokenA1)).cuerpo, antes.cuerpo);
  });

  it('un id que no es UUID responde 404 en PATCH, DELETE y borrador', async () => {
    for (const [metodo, ruta, cuerpo] of [
      ['PATCH', '/no-es-uuid', { nombre: 'X', versionEsperada: 1 }],
      ['DELETE', '/no-es-uuid', undefined],
      ['GET', '/no-es-uuid/borrador', undefined],
    ] as const) {
      const r = await pedir(metodo, ruta, tokenA1, cuerpo);
      assert.equal(r.estado, 404, `${metodo} ${ruta}`);
      assert.equal(r.cuerpo.codigo, 'PLANTILLA_NO_ENCONTRADA');
    }
  });

  it('DELETE responde 204 y un segundo borrado 404', async () => {
    assert.equal((await pedir('DELETE', `/${idPlantillaA}`, tokenA1)).estado, 204);
    const segundo = await pedir('DELETE', `/${idPlantillaA}`, tokenA1);
    assert.equal(segundo.estado, 404);
    assert.equal((await pedir('GET', '', tokenA2)).cuerpo.plantillas.length, 0);
    assert.equal((await pedir('GET', `/${idPlantillaA}/borrador`, tokenA1)).estado, 404);
  });
});
