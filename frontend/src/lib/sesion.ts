import { eliminarDatosPrivados } from './privacidadCache';

const CLAVE_TOKEN = 'treksafe:token';
const CLAVE_USUARIO = 'treksafe:usuario';
const CLAVE_AMBITO = 'treksafe:offline-scope';

const CLAVE_TOKEN_LEGACY = 'treksafe_token';
const CLAVE_USUARIO_LEGACY = 'treksafe_user';

export type UsuarioSesion = {
  id: string;
  correoElectronico: string;
  rol: 'senderista' | 'rescatista';
  nombreCompleto?: string | null;
};

function migrarSesionLegacy(): void {
  try {
    const tokenAntiguo = sessionStorage.getItem(CLAVE_TOKEN_LEGACY);
    if (tokenAntiguo) {
      sessionStorage.setItem(CLAVE_TOKEN, tokenAntiguo);
      sessionStorage.removeItem(CLAVE_TOKEN_LEGACY);
    }
    const usuarioAntiguo = sessionStorage.getItem(CLAVE_USUARIO_LEGACY);
    if (usuarioAntiguo) {
      try {
        const u = JSON.parse(usuarioAntiguo) as {
          id?: string;
          email?: string;
          correoElectronico?: string;
          role?: string;
          rol?: string;
        };
        const migrado: UsuarioSesion = {
          id: u.id ?? '',
          correoElectronico: u.correoElectronico ?? u.email ?? '',
          rol: ((u.rol ?? u.role) as UsuarioSesion['rol']) ?? 'senderista',
          nombreCompleto: (u as { nombreCompleto?: string }).nombreCompleto ?? null,
        };
        sessionStorage.setItem(CLAVE_USUARIO, JSON.stringify(migrado));
        sessionStorage.removeItem(CLAVE_USUARIO_LEGACY);
      } catch {
        /* formato inválido, ignorar */
      }
    }
  } catch {
    /* storage bloqueado */
  }
}

migrarSesionLegacy();

export function guardarSesion(token: string, usuario: UsuarioSesion): void {
  sessionStorage.removeItem(CLAVE_AMBITO);
  sessionStorage.setItem(CLAVE_TOKEN, token);
  sessionStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
}

export function limpiarSesion(): Promise<void> {
  sessionStorage.removeItem(CLAVE_TOKEN);
  sessionStorage.removeItem(CLAVE_USUARIO);
  sessionStorage.removeItem(CLAVE_TOKEN_LEGACY);
  sessionStorage.removeItem(CLAVE_USUARIO_LEGACY);
  sessionStorage.removeItem(CLAVE_AMBITO);
  return eliminarDatosPrivados();
}

/** Ambito opaco de cuenta/sesion; sobrevive a una recarga, no al logout. */
export function getSessionScope(): string | null {
  const usuario = getSessionUser();
  if (!getToken() || !usuario?.id) return null;
  let scope = sessionStorage.getItem(CLAVE_AMBITO);
  if (!scope) {
    scope = crypto.randomUUID();
    sessionStorage.setItem(CLAVE_AMBITO, scope);
  }
  return `${usuario.id}-${scope}`;
}

export function getToken(): string | null {
  return sessionStorage.getItem(CLAVE_TOKEN);
}

export function getSessionUser(): UsuarioSesion | null {
  const raw = sessionStorage.getItem(CLAVE_USUARIO);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UsuarioSesion;
  } catch {
    return null;
  }
}
