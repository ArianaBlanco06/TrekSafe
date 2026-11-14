import { getToken, getSessionScope, limpiarSesion } from '@/lib/sesion';
import { handleUnauthorized } from '@/lib/eventosAuth';

const API_URL = import.meta.env?.VITE_API_URL ?? '/api';

export type CuerpoErrorApi = {
  error?: string;
  mensaje?: string;
  codigo?: string;
  detalles?: Record<string, string[]>;
};

async function parsearError(res: Response): Promise<CuerpoErrorApi> {
  try {
    return (await res.json()) as CuerpoErrorApi;
  } catch {
    return { mensaje: res.statusText };
  }
}

const CAMPOS_ESTANDAR_ERROR = new Set(['error', 'mensaje', 'codigo', 'detalles']);

/** Campos del cuerpo del error que no son los estándar; `undefined` si no hay ninguno. */
function extrasDelCuerpo(cuerpo: CuerpoErrorApi): Record<string, unknown> | undefined {
  const extras = Object.fromEntries(
    Object.entries(cuerpo as Record<string, unknown>).filter(([clave]) => !CAMPOS_ESTANDAR_ERROR.has(clave)),
  );
  return Object.keys(extras).length > 0 ? extras : undefined;
}

export class ErrorClienteApi extends Error {
  constructor(
    message: string,
    public status: number,
    public codigo?: string,
    public detalles?: CuerpoErrorApi['detalles'],
    /** Resto de campos del cuerpo del error (por ejemplo, datos del conflicto). Sin validar. */
    public extras?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ErrorClienteApi';
  }
}

async function solicitarRespuestaApi(
  path: string,
  options: RequestInit = {},
  auth = false,
): Promise<{ respuesta: Response; comprobarSesion: () => void }> {
  const scope = auth ? getSessionScope() : null;
  const token = auth ? getToken() : null;
  const comprobarSesion = () => {
    if (auth && (scope !== getSessionScope() || token !== getToken())) {
      throw new ErrorClienteApi('La sesión cambió durante la solicitud.', 401, 'SESSION_CHANGED');
    }
  };
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (auth) {
    if (!token) throw new ErrorClienteApi('Sesión expirada', 401);
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers, cache: 'no-store' });
  } catch {
    throw new ErrorClienteApi(
      'No se pudo conectar con el servidor. Verifica que el backend esté corriendo.',
      0,
    );
  }

  comprobarSesion();
  if (res.status === 401 && auth) {
    await handleUnauthorized();
    throw new ErrorClienteApi('Sesión expirada. Inicia sesión nuevamente.', 401, 'UNAUTHORIZED');
  }

  if (!res.ok) {
    const err = await parsearError(res);
    comprobarSesion();
    throw new ErrorClienteApi(
      err.mensaje ?? 'Error en la solicitud',
      res.status,
      err.codigo,
      err.detalles,
      extrasDelCuerpo(err),
    );
  }

  return { respuesta: res, comprobarSesion };
}

export async function peticionApi<T>(path: string, options: RequestInit = {}, auth = false): Promise<T> {
  const { respuesta, comprobarSesion } = await solicitarRespuestaApi(path, options, auth);
  if (respuesta.status === 204) return undefined as T;
  const data = await respuesta.json() as T;
  comprobarSesion();
  return data;
}

/** Consume el cuerpo completo antes de exponer el archivo a la interfaz. */
export async function peticionArchivoApi(path: string, options: RequestInit = {}, auth = false): Promise<Blob> {
  const { respuesta, comprobarSesion } = await solicitarRespuestaApi(path, options, auth);
  let archivo: Blob;
  try { archivo = await respuesta.blob(); }
  catch {
    comprobarSesion();
    throw new ErrorClienteApi('No se pudo completar la descarga del archivo.', 0, 'DESCARGA_INCOMPLETA');
  }
  comprobarSesion();
  if (options.signal?.aborted) throw new ErrorClienteApi('Descarga cancelada.', 0, 'SOLICITUD_CANCELADA');
  return archivo;
}

export const api = {
  get: <T>(path: string, auth = false) => peticionApi<T>(path, { method: 'GET' }, auth),
  post: <T>(path: string, body: unknown, auth = false) =>
    peticionApi<T>(path, { method: 'POST', body: JSON.stringify(body) }, auth),
  put: <T>(path: string, body: unknown, auth = false) =>
    peticionApi<T>(path, { method: 'PUT', body: JSON.stringify(body) }, auth),
  patch: <T>(path: string, body: unknown, auth = false) =>
    peticionApi<T>(path, { method: 'PATCH', body: JSON.stringify(body) }, auth),
  delete: <T>(path: string, auth = false) => peticionApi<T>(path, { method: 'DELETE' }, auth),
};

export { limpiarSesion };
