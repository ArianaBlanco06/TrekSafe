import type { IEstadoWorker } from '../ports/IEstadoWorker.js';

/** Agrupa consultas concurrentes y limita el costo de una sonda pública. */
export class ConsultarDisponibilidad {
  private cache: { valor: boolean; hasta: number } | undefined;
  private pendiente: Promise<boolean> | undefined;

  constructor(
    private readonly estado: Pick<IEstadoWorker, 'consultarDisponibilidad'>,
    private readonly opciones: {
      maxAntiguedadHeartbeatMs: number;
      maxAntiguedadPendientesMs: number;
      cacheMs?: number;
      timeoutMs?: number;
      ahora?: () => number;
    },
  ) {}

  ejecutar(): Promise<boolean> {
    const ahora = this.opciones.ahora ?? Date.now;
    if (this.cache && this.cache.hasta > ahora()) return Promise.resolve(this.cache.valor);
    if (this.pendiente) return this.pendiente;
    this.pendiente = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let valor = false;
      try {
        valor = await Promise.race([
          this.estado.consultarDisponibilidad({
            maxAntiguedadHeartbeatMs: this.opciones.maxAntiguedadHeartbeatMs,
            maxAntiguedadPendientesMs: this.opciones.maxAntiguedadPendientesMs,
          }),
          new Promise<false>((resolve) => {
            timer = setTimeout(() => resolve(false), this.opciones.timeoutMs ?? 3000);
          }),
        ]);
      } catch {
        valor = false;
      } finally {
        if (timer) clearTimeout(timer);
      }
      this.cache = { valor, hasta: ahora() + (this.opciones.cacheMs ?? 10000) };
      return valor;
    })().finally(() => { this.pendiente = undefined; });
    return this.pendiente;
  }
}
