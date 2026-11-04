import { limpiarSesion } from '@/lib/sesion';

type ManejadorNoAutorizado = () => void;

let onNoAutorizado: ManejadorNoAutorizado | null = null;

export function setUnauthorizedHandler(handler: ManejadorNoAutorizado | null) {
  onNoAutorizado = handler;
}

export function handleUnauthorized() {
  if (onNoAutorizado) onNoAutorizado();
  else void limpiarSesion().catch(() => console.error('No se pudo completar la limpieza local de la sesión.'));
}
