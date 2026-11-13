import { limpiarSesion } from '@/lib/sesion';

type ManejadorNoAutorizado = () => void;

let onNoAutorizado: ManejadorNoAutorizado | null = null;

export function setUnauthorizedHandler(handler: ManejadorNoAutorizado | null) {
  onNoAutorizado = handler;
}

export function handleUnauthorized():Promise<void> {
  // Invalida antes de navegar; ninguna respuesta tardía puede escribir en el ámbito anterior.
  const limpieza=limpiarSesion();
  if(onNoAutorizado) onNoAutorizado();
  return limpieza;
}
