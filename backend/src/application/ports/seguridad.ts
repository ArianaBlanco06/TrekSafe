export type VerificarContrasena = (
  plana: string,
  hash: string,
) => Promise<boolean>;
export interface ISeguridadAutenticacion {
  hashearContrasena(plana: string): Promise<string>;
  verificarContrasena: VerificarContrasena;
  firmarToken(payload: {
    sub: string;
    rol: 'senderista' | 'rescatista';
  }): string;
}
