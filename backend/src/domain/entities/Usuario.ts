import type { RolUsuario } from '../value-objects/enums.js';

export type Usuario = {
  id: string;
  correoElectronico: string;
  hashContrasena: string;
  rol: RolUsuario;
  creadoEn?: string;
};
