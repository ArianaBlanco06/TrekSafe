import assert from 'node:assert/strict';
import { randomFillSync } from 'node:crypto';
import { describe, it } from 'node:test';
import { generarUuid } from './uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Ejecuta `fn` con Math.random prohibido: cualquier uso hace fallar la prueba. */
function sinMathRandom<T>(fn: () => T): T {
  const original = Math.random;
  Math.random = () => {
    throw new Error('No se debe usar Math.random para generar identificadores');
  };
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

describe('generarUuid', () => {
  it('usa crypto.randomUUID cuando está disponible', () => {
    const uuid = generarUuid({ randomUUID: () => '11111111-1111-4111-8111-111111111111' });
    assert.equal(uuid, '11111111-1111-4111-8111-111111111111');
  });

  it('sin randomUUID arma un UUID v4 con getRandomValues', () => {
    const uuid = sinMathRandom(() =>
      generarUuid({
        getRandomValues: (bytes) => {
          bytes.fill(0xff);
          return bytes;
        },
      }),
    );
    // El nibble de versión es 4 y los dos bits altos de la variante son 10.
    assert.equal(uuid, 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('fija versión y variante también con bytes en cero', () => {
    const uuid = generarUuid({ getRandomValues: (bytes) => bytes });
    assert.equal(uuid, '00000000-0000-4000-8000-000000000000');
  });

  it('el respaldo produce UUID v4 válidos y distintos, sin Math.random', () => {
    // Bytes aleatorios reales de Node como sustituto de crypto.getRandomValues del navegador.
    const cripto = { getRandomValues: (bytes: Uint8Array) => randomFillSync(bytes) };
    const vistos = new Set<string>();
    sinMathRandom(() => {
      for (let i = 0; i < 200; i += 1) {
        const uuid = generarUuid(cripto);
        assert.match(uuid, UUID_V4);
        vistos.add(uuid);
      }
    });
    assert.equal(vistos.size, 200);
  });

  it('prefiere randomUUID aunque getRandomValues también exista', () => {
    let usoRandomValues = false;
    const uuid = generarUuid({
      randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      getRandomValues: (bytes) => {
        usoRandomValues = true;
        return bytes;
      },
    });
    assert.equal(uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    assert.equal(usoRandomValues, false);
  });

  it('sin ninguna de las dos funciones falla en lugar de generar un identificador predecible', () => {
    sinMathRandom(() => {
      assert.throws(() => generarUuid({}), /identificadores seguros/);
      assert.throws(() => generarUuid({ randomUUID: undefined, getRandomValues: undefined }), /identificadores seguros/);
    });
  });

  it('con la API Web Crypto real devuelve un UUID v4', () => {
    assert.match(generarUuid(), UUID_V4);
  });
});
