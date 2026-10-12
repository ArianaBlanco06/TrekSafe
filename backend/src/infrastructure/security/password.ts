import bcrypt from 'bcrypt';

const RONDAS_SAL = 10;

export async function hashearContrasena(plana: string): Promise<string> {
  return bcrypt.hash(plana, RONDAS_SAL);
}

export async function verificarContrasena(plana: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plana, hash);
}
