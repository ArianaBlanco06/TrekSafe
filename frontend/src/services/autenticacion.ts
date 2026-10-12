import { api } from './clienteApi';

export type RespuestaAuth = {
  mensaje: string;
  token: string;
  usuario: {
    id: string;
    correoElectronico: string;
    rol: 'senderista' | 'rescatista';
    nombreCompleto?: string | null;
  };
};

export type PayloadRegistroSenderista = {
  nombreCompleto: string;
  idDocumento: string;
  correoElectronico: string;
  telefono: string;
  contrasena: string;
  consentimientoPrivacidad: true;
};

export type PayloadRegistroRescatista = {
  nombreCompleto: string;
  correoElectronico: string;
  contrasena: string;
  institucion: 'AGMP' | 'MINCETUR';
  numeroCredencial: string;
  fechaNacimiento: string;
};

export type PayloadIniciarSesion = {
  correoElectronico: string;
  contrasena: string;
};

export function registrarSenderista(datos: PayloadRegistroSenderista) {
  return api.post<RespuestaAuth>('/auth/registrar-senderista', datos);
}

export function iniciarSesion(datos: PayloadIniciarSesion) {
  return api.post<RespuestaAuth>('/auth/iniciar-sesion', datos);
}

export function registrarRescatista(datos: PayloadRegistroRescatista) {
  return api.post<RespuestaAuth>('/auth/registrar-rescatista', datos);
}
