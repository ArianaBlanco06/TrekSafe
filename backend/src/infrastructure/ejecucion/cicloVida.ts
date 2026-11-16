import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function esEntradaPrincipal(url: string): boolean {
  return (
    Boolean(process.argv[1]) &&
    pathToFileURL(path.resolve(process.argv[1])).href === url
  );
}

/** Las señales solo se registran al ejecutar una entrada, nunca al importarla. */
export function registrarSenales(detener: () => Promise<void>): () => void {
  let pendiente: Promise<void> | undefined;
  const finalizar = () => {
    pendiente ??= detener()
      .catch((error) => {
        console.error('[TrekSafe] Error durante el cierre:', error);
        process.exitCode = 1;
      })
      .finally(limpiar);
  };
  const limpiar = () => {
    process.off('SIGINT', finalizar);
    process.off('SIGTERM', finalizar);
  };
  process.once('SIGINT', finalizar);
  process.once('SIGTERM', finalizar);
  return limpiar;
}
