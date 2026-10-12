import jwt from 'jsonwebtoken';
import { loadEnv } from '../config/env.js';

export type JwtPayload = {
  sub: string;
  rol: 'senderista' | 'rescatista';
};

export function firmarToken(payload: JwtPayload): string {
  const { jwtSecret, jwtExpiresIn } = loadEnv();
  return jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn } as jwt.SignOptions);
}

export function verificarToken(token: string): JwtPayload {
  const { jwtSecret } = loadEnv();
  return jwt.verify(token, jwtSecret) as JwtPayload;
}
