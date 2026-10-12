import { limpiarSesion } from '@/lib/sesion';

type ManejadorNoAutorizado = () => void;

let onNoAutorizado: ManejadorNoAutorizado | null = null;

export function setUnauthorizedHandler(handler: ManejadorNoAutorizado | null) {
  onNoAutorizado = handler;
}

export function handleUnauthorized() {
  limpiarSesion();
  onNoAutorizado?.();
}
