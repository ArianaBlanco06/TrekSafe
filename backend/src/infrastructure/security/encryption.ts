import crypto from 'node:crypto';
import type { CargaUtilMedica } from '../../domain/value-objects/CargaUtilMedica.js';
import { loadEnv } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function derivarClave(): Buffer {
  const { medicalEncryptionKey } = loadEnv();
  if (!medicalEncryptionKey) {
    throw new Error('MEDICAL_ENCRYPTION_KEY no configurada');
  }
  return crypto.scryptSync(medicalEncryptionKey, 'treksafe-medical-v1', 32);
}

export function encriptarCargaUtilMedica(carga: CargaUtilMedica): string {
  const clave = derivarClave();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, clave, iv);

  const textoPlano = JSON.stringify({
    alergias: carga.alergias,
    condiciones: carga.condiciones,
    medicamentos: carga.medicamentos,
  });
  const cifrado = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, cifrado]).toString('base64');
}

export function desencriptarCargaUtilMedica(textoCifrado: string): CargaUtilMedica {
  const clave = derivarClave();
  const datos = Buffer.from(textoCifrado, 'base64');

  const iv = datos.subarray(0, IV_LENGTH);
  const authTag = datos.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const cifrado = datos.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, clave, iv);
  decipher.setAuthTag(authTag);

  const descifrado = Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8');

  return JSON.parse(descifrado) as CargaUtilMedica;
}
