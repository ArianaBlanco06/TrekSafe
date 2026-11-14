import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ESTADOS_INCIDENTE_CON_ACCESO_FICHA,
  MOTIVO_PERMITIDO_FICHA,
  MOTIVOS_DENEGACION_FICHA,
} from './accesoFichaMedica.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const migracion = readFileSync(path.join(raiz, 'backend/migrations/030_hu50_ficha_medica_responsable.sql'), 'utf8');
const frontend = readFileSync(path.join(raiz, 'frontend/src/lib/fichaMedicaIncidente.ts'), 'utf8');

const TODOS = [MOTIVO_PERMITIDO_FICHA, ...MOTIVOS_DENEGACION_FICHA];

/** Texto de una sentencia de la migración desde `inicio` hasta el primer `$$;` posterior. */
function bloque(inicio: string, fin = '$$;'): string {
  const i = migracion.indexOf(inicio);
  assert.ok(i >= 0, `no se encontró ${inicio}`);
  return migracion.slice(i, migracion.indexOf(fin, i));
}

describe('catálogo de motivos de acceso a la ficha (HU-50)', () => {
  it('el catálogo tiene un motivo permitido y seis de denegación sin repetidos', () => {
    assert.equal(MOTIVOS_DENEGACION_FICHA.length, 6);
    assert.equal(new Set(TODOS).size, 7);
  });

  it('cada motivo figura en el CHECK de la migración 030', () => {
    const check = bloque('CONSTRAINT chk_accesos_ficha_motivo', 'CONSTRAINT chk_accesos_ficha_coherencia');
    for (const motivo of TODOS) assert.ok(check.includes(`'${motivo}'`), `falta ${motivo} en el CHECK`);
  });

  it('cada motivo figura en la validación de la RPC de registro de la migración 030', () => {
    const rpc = bloque('CREATE FUNCTION public.treksafe_registrar_acceso_ficha_medica');
    for (const motivo of TODOS) assert.ok(rpc.includes(`'${motivo}'`), `falta ${motivo} en la RPC`);
  });

  it('cada motivo de denegación tiene su mensaje en el frontend', () => {
    for (const motivo of MOTIVOS_DENEGACION_FICHA) assert.ok(frontend.includes(motivo), `falta ${motivo} en el frontend`);
  });

  it('abierto incluye localizado pero no cerrado (D1)', () => {
    assert.deepEqual([...ESTADOS_INCIDENTE_CON_ACCESO_FICHA], ['abierto', 'localizado']);
  });

  it('la migración 030 no modifica expediciones ni fichas_medicas', () => {
    assert.ok(!/UPDATE\s+public\.expediciones/i.test(migracion));
    assert.ok(!/UPDATE\s+public\.fichas_medicas/i.test(migracion));
    assert.ok(!/(INSERT\s+INTO|DELETE\s+FROM)\s+public\.(expediciones|fichas_medicas)/i.test(migracion));
  });
});
