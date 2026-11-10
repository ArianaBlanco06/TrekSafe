import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ErrorClienteApi, api } from './clienteApi';

const fetchOriginal = globalThis.fetch;

function respuestaFalsa(estado: number, cuerpo: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(cuerpo), {
      status: estado,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
}

async function capturar(promesa: Promise<unknown>): Promise<ErrorClienteApi> {
  try {
    await promesa;
  } catch (e) {
    assert.ok(e instanceof ErrorClienteApi);
    return e;
  }
  throw new Error('Se esperaba un rechazo');
}

describe('ErrorClienteApi.extras', () => {
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  it('conserva los campos del cuerpo que no son estándar, sin nombrarlos', async () => {
    respuestaFalsa(409, {
      error: 'ErrorAplicacion',
      mensaje: 'Otro rescatista ya coordina esta alerta',
      codigo: 'COORDINACION_YA_ASUMIDA',
      responsableVigente: { responsableId: 'r1', nombreResponsable: 'Ana' },
    });

    const error = await capturar(api.post('/rescate/x', {}));

    assert.equal(error.status, 409);
    assert.equal(error.codigo, 'COORDINACION_YA_ASUMIDA');
    assert.equal(error.message, 'Otro rescatista ya coordina esta alerta');
    assert.deepEqual(error.extras, { responsableVigente: { responsableId: 'r1', nombreResponsable: 'Ana' } });
  });

  it('es retrocompatible: sin campos extra, extras queda indefinido', async () => {
    respuestaFalsa(400, {
      error: 'ErrorValidacion',
      mensaje: 'Datos de entrada inválidos',
      detalles: { operacionId: ['Identificador de operación inválido'] },
    });

    const error = await capturar(api.post('/rescate/x', {}));

    assert.equal(error.status, 400);
    assert.deepEqual(error.detalles, { operacionId: ['Identificador de operación inválido'] });
    assert.equal(error.extras, undefined);
  });

  it('el constructor sigue aceptando la firma anterior', () => {
    const error = new ErrorClienteApi('hola', 500, 'X', { campo: ['m'] });
    assert.equal(error.extras, undefined);
  });
});
