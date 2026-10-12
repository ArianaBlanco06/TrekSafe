import type { CargaUtilMedica } from '../../domain/value-objects/CargaUtilMedica.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { getSupabaseAdmin } from '../database/supabase.js';
import {
  desencriptarCargaUtilMedica,
  encriptarCargaUtilMedica,
} from '../security/encryption.js';

export type ContactoResumen = {
  id: string;
  nombreCompleto: string;
  parentesco: string;
  telefono: string;
  correoElectronico: string;
};

export class RepositorioUsuario {
  private readonly supabase = getSupabaseAdmin();

  async verificarEsSenderista(usuarioId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('perfiles_senderista')
      .select('usuario_id')
      .eq('usuario_id', usuarioId)
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, error.message);
    if (!data) throw new ErrorAplicacion(403, 'Perfil de senderista requerido', 'NO_ES_SENDERISTA');
  }

  async actualizarFichaMedica(
    senderistaId: string,
    tipoSangre: string,
    condicionesEncriptadas: string,
  ): Promise<void> {
    const { data: existing } = await this.supabase
      .from('fichas_medicas')
      .select('senderista_id')
      .eq('senderista_id', senderistaId)
      .maybeSingle();

    if (existing) {
      const { error } = await this.supabase
        .from('fichas_medicas')
        .update({
          tipo_sangre: tipoSangre,
          condiciones_encriptadas: condicionesEncriptadas,
          consentimiento_firmado: true,
        })
        .eq('senderista_id', senderistaId);
      if (error) throw new ErrorAplicacion(500, error.message);
      return;
    }

    const { error } = await this.supabase.from('fichas_medicas').insert({
      senderista_id: senderistaId,
      tipo_sangre: tipoSangre,
      condiciones_encriptadas: condicionesEncriptadas,
      consentimiento_firmado: true,
    });
    if (error) throw new ErrorAplicacion(500, error.message);
  }

  async obtenerFichaMedica(senderistaId: string): Promise<{
    tipoSangre: string;
    carga: CargaUtilMedica;
    consentimientoFirmado: boolean;
  } | null> {
    const { data, error } = await this.supabase
      .from('fichas_medicas')
      .select('tipo_sangre, condiciones_encriptadas, consentimiento_firmado')
      .eq('senderista_id', senderistaId)
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, error.message);
    if (!data) return null;

    return {
      tipoSangre: data.tipo_sangre,
      carga: desencriptarCargaUtilMedica(data.condiciones_encriptadas),
      consentimientoFirmado: data.consentimiento_firmado,
    };
  }

  encriptarCarga(carga: CargaUtilMedica): string {
    return encriptarCargaUtilMedica(carga);
  }

  async listarContactos(senderistaId: string): Promise<ContactoResumen[]> {
    const { data, error } = await this.supabase
      .from('contactos_emergencia')
      .select('id, nombre_completo, parentesco, telefono, correo_electronico')
      .eq('senderista_id', senderistaId)
      .order('nombre_completo');

    if (error) throw new ErrorAplicacion(500, error.message);
    return (data ?? []).map((row) => ({
      id: row.id,
      nombreCompleto: row.nombre_completo,
      parentesco: row.parentesco,
      telefono: row.telefono,
      correoElectronico: row.correo_electronico,
    }));
  }

  async crearContacto(
    senderistaId: string,
    contacto: { nombreCompleto: string; parentesco: string; telefono: string; correoElectronico: string },
  ): Promise<ContactoResumen> {
    const { data, error } = await this.supabase
      .from('contactos_emergencia')
      .insert({
        senderista_id: senderistaId,
        nombre_completo: contacto.nombreCompleto,
        parentesco: contacto.parentesco,
        telefono: contacto.telefono,
        correo_electronico: contacto.correoElectronico.toLowerCase(),
      })
      .select('id, nombre_completo, parentesco, telefono, correo_electronico')
      .single();

    if (error) throw new ErrorAplicacion(500, error.message);
    return {
      id: data.id,
      nombreCompleto: data.nombre_completo,
      parentesco: data.parentesco,
      telefono: data.telefono,
      correoElectronico: data.correo_electronico,
    };
  }

  async eliminarContacto(senderistaId: string, contactoId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('contactos_emergencia')
      .delete()
      .eq('id', contactoId)
      .eq('senderista_id', senderistaId)
      .select('id');

    if (error) throw new ErrorAplicacion(500, error.message);
    if (!data?.length) throw new ErrorAplicacion(404, 'Contacto no encontrado', 'NO_ENCONTRADO');
  }

  async tieneExpedicionBloqueante(senderistaId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('expediciones')
      .select('id')
      .eq('senderista_id', senderistaId)
      .in('estado', ['en_progreso', 'alerta'])
      .limit(1);

    if (error) throw new ErrorAplicacion(500, error.message);
    return (data?.length ?? 0) > 0;
  }

  async eliminarDatosPersonales(senderistaId: string): Promise<{
    fichaMedicaEliminada: boolean;
    contactosEliminados: number;
    expedicionesEliminadas: number;
    cuentaEliminada: boolean;
  }> {
    if (await this.tieneExpedicionBloqueante(senderistaId)) {
      throw new ErrorAplicacion(
        409,
        'No puedes revocar datos mientras tengas una expedición en curso o en alerta',
        'EXPEDICION_ACTIVA_BLOQUEA_REVOCACION',
      );
    }

    const { error: errorFicha } = await this.supabase
      .from('fichas_medicas')
      .delete()
      .eq('senderista_id', senderistaId);
    if (errorFicha) throw new ErrorAplicacion(500, errorFicha.message);

    const { data: contactos, error: errorConsultaContactos } = await this.supabase
      .from('contactos_emergencia')
      .select('id')
      .eq('senderista_id', senderistaId);
    if (errorConsultaContactos) throw new ErrorAplicacion(500, errorConsultaContactos.message);

    const { error: errorContactos } = await this.supabase
      .from('contactos_emergencia')
      .delete()
      .eq('senderista_id', senderistaId);
    if (errorContactos) throw new ErrorAplicacion(500, errorContactos.message);

    const { data: expediciones, error: errorConsultaExp } = await this.supabase
      .from('expediciones')
      .select('id')
      .eq('senderista_id', senderistaId)
      .in('estado', ['completada', 'programada']);
    if (errorConsultaExp) throw new ErrorAplicacion(500, errorConsultaExp.message);

    const idsExpediciones = (expediciones ?? []).map((e) => e.id);
    if (idsExpediciones.length > 0) {
      const { error: errorElimExp } = await this.supabase
        .from('expediciones')
        .delete()
        .in('id', idsExpediciones);
      if (errorElimExp) throw new ErrorAplicacion(500, errorElimExp.message);
    }

    const { error: errorCuenta } = await this.supabase
      .from('usuarios')
      .delete()
      .eq('id', senderistaId);
    if (errorCuenta) throw new ErrorAplicacion(500, errorCuenta.message);

    return {
      fichaMedicaEliminada: true,
      contactosEliminados: contactos?.length ?? 0,
      expedicionesEliminadas: idsExpediciones.length,
      cuentaEliminada: true,
    };
  }

  async anonimizarHistorialRutas(senderistaId: string): Promise<{ expedicionesAnonimizadas: number }> {
    if (await this.tieneExpedicionBloqueante(senderistaId)) {
      throw new ErrorAplicacion(
        409,
        'No puedes anonimizar rutas mientras tengas una expedición en curso o en alerta',
        'EXPEDICION_ACTIVA_BLOQUEA_REVOCACION',
      );
    }

    const { data: expediciones, error: errorConsulta } = await this.supabase
      .from('expediciones')
      .select('id')
      .eq('senderista_id', senderistaId)
      .eq('estado', 'completada');
    if (errorConsulta) throw new ErrorAplicacion(500, errorConsulta.message);

    const ids = (expediciones ?? []).map((e) => e.id);
    if (ids.length === 0) return { expedicionesAnonimizadas: 0 };

    const ahora = new Date().toISOString();
    const { error: errorActualizar } = await this.supabase
      .from('expediciones')
      .update({
        lugar_inicio: '[Anonimizado]',
        lugar_fin: '[Anonimizado]',
        coordenadas_inicio: null,
        coordenadas_fin: null,
        actualizado_en: ahora,
      })
      .in('id', ids);
    if (errorActualizar) throw new ErrorAplicacion(500, errorActualizar.message);

    const { error: errorAcompanantes } = await this.supabase
      .from('acompanantes_expedicion')
      .delete()
      .in('expedicion_id', ids);
    if (errorAcompanantes) throw new ErrorAplicacion(500, errorAcompanantes.message);

    return { expedicionesAnonimizadas: ids.length };
  }
}
