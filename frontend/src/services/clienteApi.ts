import { getToken, limpiarSesion } from '@/lib/sesion';
import { handleUnauthorized } from '@/lib/eventosAuth';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

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

export class ErrorClienteApi extends Error {
  constructor(
    message: string,
    public status: number,
    public codigo?: string,
    public detalles?: CuerpoErrorApi['detalles'],
  ) {
    super(message);
    this.name = 'ErrorClienteApi';
  }
}

export async function peticionApi<T>(
  path: string,
  options: RequestInit = {},
  auth = false,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (auth) {
    const token = getToken();
    if (!token) throw new ErrorClienteApi('Sesión expirada', 401);
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ErrorClienteApi(
      'No se pudo conectar con el servidor. Verifica que el backend esté corriendo.',
      0,
    );
  }

  if (res.status === 401 && auth) {
    handleUnauthorized();
    throw new ErrorClienteApi('Sesión expirada. Inicia sesión nuevamente.', 401, 'UNAUTHORIZED');
  }

  if (!res.ok) {
    const err = await parsearError(res);
    throw new ErrorClienteApi(
      err.mensaje ?? 'Error en la solicitud',
      res.status,
      err.codigo,
      err.detalles,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
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
