type Rol = 'senderista' | 'rescatista';

/** Solo conserva una ruta local del rol autenticado, nunca un destino externo. */
export function destinoTrasLogin(rol: Rol, estado: unknown): string {
  const inicio = `/${rol}`;
  if (!estado || typeof estado !== 'object') return inicio;
  const from = (estado as { from?: unknown }).from;
  if (!from || typeof from !== 'object') return inicio;
  const { pathname, search = '', hash = '' } = from as { pathname?: unknown; search?: unknown; hash?: unknown };
  if (typeof pathname !== 'string' || typeof search !== 'string' || typeof hash !== 'string') return inicio;
  if (!new RegExp(`^/${rol}(?:/[A-Za-z0-9_-]+)*/?$`).test(pathname)) return inicio;
  if ((search && !search.startsWith('?')) || (hash && !hash.startsWith('#'))
    || /[\\\u0000-\u001f\u007f]/.test(pathname + search + hash)) return inicio;
  return pathname + search + hash;
}
