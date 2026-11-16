import type { Application } from 'express';
import { crearArranqueApi } from './infrastructure/composicion/arranque.js';
import {
  esEntradaPrincipal,
  registrarSenales,
} from './infrastructure/ejecucion/cicloVida.js';

export type DependenciasArranqueApi = {
  port: number;
  host?: string;
  verificarBase(): Promise<void>;
  crearAplicacion(): Application;
  cerrarRecursos(): Promise<void>;
};

/** Entrada HTTP independiente. No comprueba SMTP ni inicia tareas. */
export async function iniciarApi(
  dependencias: DependenciasArranqueApi = crearArranqueApi(),
) {
  let servidor: ReturnType<Application['listen']>;
  try {
    await dependencias.verificarBase();
    servidor = dependencias
      .crearAplicacion()
      .listen(dependencias.port, dependencias.host ?? '0.0.0.0');
    await new Promise<void>((resolve, reject) => {
      const listo = () => {
        servidor.off('error', fallo);
        resolve();
      };
      const fallo = (error: Error) => {
        servidor.off('listening', listo);
        reject(error);
      };
      servidor.once('listening', listo);
      servidor.once('error', fallo);
    });
  } catch (error) {
    await dependencias.cerrarRecursos();
    throw error;
  }
  let cierre: Promise<void> | undefined;
  const detener = () =>
    (cierre ??= new Promise<void>((resolve, reject) => {
      servidor.close((error) => (error ? reject(error) : resolve()));
    }).finally(dependencias.cerrarRecursos));
  return { servidor, detener };
}

if (esEntradaPrincipal(import.meta.url)) {
  iniciarApi()
    .then(({ detener }) => registrarSenales(detener))
    .catch((error) => {
      console.error('[TrekSafe API] Fallo de arranque:', error);
      process.exitCode = 1;
    });
}
