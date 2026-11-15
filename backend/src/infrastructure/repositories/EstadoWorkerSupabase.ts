import type { SupabaseClient } from '@supabase/supabase-js';
import type { IEstadoWorker } from '../../application/ports/IEstadoWorker.js';
import { getSupabaseAdmin } from '../database/supabase.js';

export class EstadoWorkerSupabase implements IEstadoWorker {
  constructor(private readonly supabase: SupabaseClient = getSupabaseAdmin()) {}

  private async registrar(instanciaId: string, evento: string, resultado: string | null = null,
    codigoError: string | null = null): Promise<void> {
    const { error } = await this.supabase.rpc('treksafe_registrar_estado_worker', {
      p_instancia_id: instanciaId, p_evento: evento, p_resultado: resultado,
      p_codigo_error: codigoError,
    });
    if (error) throw new Error('ESTADO_WORKER_NO_REGISTRADO');
  }

  registrarInicio(instanciaId: string): Promise<void> {
    return this.registrar(instanciaId, 'inicio');
  }

  registrarCiclo(entrada: Parameters<IEstadoWorker['registrarCiclo']>[0]): Promise<void> {
    // Solo códigos, nunca mensajes del proveedor, destinatarios o credenciales.
    const codigo = entrada.resultado === 'error'
      ? (/^[A-Z][A-Z0-9_]{0,79}$/.test(entrada.codigoError ?? '')
        ? entrada.codigoError! : 'ERROR_CICLO')
      : null;
    return this.registrar(entrada.instanciaId, entrada.ciclo, entrada.resultado, codigo);
  }

  registrarParada(instanciaId: string): Promise<void> {
    return this.registrar(instanciaId, 'parada');
  }

  async consultarDisponibilidad(opciones: Parameters<IEstadoWorker['consultarDisponibilidad']>[0]): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.rpc('treksafe_consultar_disponibilidad_worker', {
        p_max_heartbeat_ms: opciones.maxAntiguedadHeartbeatMs,
        p_max_pendientes_ms: opciones.maxAntiguedadPendientesMs,
      });
      return !error && data === true;
    } catch {
      return false;
    }
  }
}
