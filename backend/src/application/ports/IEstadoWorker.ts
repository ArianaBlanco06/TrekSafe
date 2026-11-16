export type CicloWorker = 'plazos' | 'outbox';

/** Señales duraderas del procesador; los relojes y el estado se conservan en DB. */
export interface IEstadoWorker {
  registrarInicio(instanciaId: string): Promise<void>;
  registrarCiclo(entrada: {
    instanciaId: string;
    ciclo: CicloWorker;
    resultado: 'ok' | 'error';
    codigoError?: string;
  }): Promise<void>;
  registrarParada(instanciaId: string): Promise<void>;
  consultarDisponibilidad(opciones: {
    maxAntiguedadHeartbeatMs: number;
    maxAntiguedadPendientesMs: number;
  }): Promise<boolean>;
}
