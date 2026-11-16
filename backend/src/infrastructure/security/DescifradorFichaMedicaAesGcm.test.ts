import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// La clave se lee al cifrar o descifrar; se fija antes de importar el módulo de cifrado.
Object.assign(process.env, {
  NODE_ENV: 'test',
  MEDICAL_ENCRYPTION_KEY: 'secreto-medico-ficticio-descifrador-0000',
  JWT_SECRET: 'secreto-ficticio-descifrador-0000000000',
  SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture',
});

const { encriptarCargaUtilMedica } = await import('./encryption.js');
const { DescifradorFichaMedicaAesGcm } = await import('./DescifradorFichaMedicaAesGcm.js');

describe('DescifradorFichaMedicaAesGcm', () => {
  const carga = { alergias: 'penicilina-ficticia', condiciones: 'asma-ficticia', medicamentos: 'salbutamol-ficticio' };

  it('descifra lo cifrado con encriptarCargaUtilMedica (ida y vuelta, mismo algoritmo y clave)', () => {
    const cifrada = encriptarCargaUtilMedica(carga);
    assert.ok(!cifrada.includes('penicilina'));
    assert.deepEqual(new DescifradorFichaMedicaAesGcm().descifrar(cifrada), carga);
  });

  it('un texto alterado lanza error (la autenticación GCM falla) en lugar de devolver datos', () => {
    const cifrada = Buffer.from(encriptarCargaUtilMedica(carga), 'base64');
    cifrada[cifrada.length - 1] ^= 0xff;
    assert.throws(() => new DescifradorFichaMedicaAesGcm().descifrar(cifrada.toString('base64')));
  });
});
