import { crearArranqueWorker } from './infrastructure/composicion/arranque.js';
import {
  esEntradaPrincipal,
  registrarSenales,
} from './infrastructure/ejecucion/cicloVida.js';

export type DependenciasArranqueWorker = {
  habilitado: boolean;
  verificarBase(): Promise<void>;
  verificarCorreo(): Promise<void>;
  iniciarTareas(): () => Promise<void>;
  cerrarRecursos(): Promise<void>;
};

/** Procesador sin servidor HTTP; el trabajo en curso se espera durante el cierre. */
export async function iniciarWorker(
  dependencias: DependenciasArranqueWorker = crearArranqueWorker(),
) {
  let detenerTareas: (() => Promise<void>) | undefined;
  if (dependencias.habilitado) {
    try {
      await dependencias.verificarBase();
      await dependencias.verificarCorreo();
      detenerTareas = dependencias.iniciarTareas();
    } catch (error) {
      await dependencias.cerrarRecursos();
      throw error;
    }
  }
  let cierre: Promise<void> | undefined;
  return {
    detener: () =>
      (cierre ??= (async () => {
        try {
          await detenerTareas?.();
        } finally {
          await dependencias.cerrarRecursos();
        }
      })()),
  };
}

if (esEntradaPrincipal(import.meta.url)) {
  iniciarWorker()
    .then(({ detener }) => registrarSenales(detener))
    .catch((error) => {
      console.error('[TrekSafe Worker] Fallo de arranque:', error);
      process.exitCode = 1;
    });
}
