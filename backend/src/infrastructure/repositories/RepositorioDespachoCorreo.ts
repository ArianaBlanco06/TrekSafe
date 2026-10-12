import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { getSupabaseAdmin } from '../database/supabase.js';

export type TipoDespachoCorreo = 'alerta_contacto' | 'alerta_rescate';

export class RepositorioDespachoCorreo {
  private readonly supabase = getSupabaseAdmin();

  async yaFueEnviado(
    expedicionId: string,
    tipoDespacho: TipoDespachoCorreo,
    claveDestinatario: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('despachos_correo')
      .select('expedicion_id')
      .eq('expedicion_id', expedicionId)
      .eq('tipo_despacho', tipoDespacho)
      .eq('clave_destinatario', claveDestinatario.toLowerCase())
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') return false;
      throw new ErrorAplicacion(500, error.message);
    }
    return data !== null;
  }

  async registrarEnvio(
    expedicionId: string,
    tipoDespacho: TipoDespachoCorreo,
    claveDestinatario: string,
  ): Promise<void> {
    const { error } = await this.supabase.from('despachos_correo').insert({
      expedicion_id: expedicionId,
      tipo_despacho: tipoDespacho,
      clave_destinatario: claveDestinatario.toLowerCase(),
    });

    if (error && error.code !== '23505') {
      if (error.code === '42P01') return;
      throw new ErrorAplicacion(500, error.message);
    }
  }
}
