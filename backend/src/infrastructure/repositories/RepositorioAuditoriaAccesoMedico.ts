import { getSupabaseAdmin } from '../database/supabase.js';

export class RepositorioAuditoriaAccesoMedico {
  private readonly supabase = getSupabaseAdmin();

  async registrarAcceso(input: {
    senderistaId: string;
    expedicionId?: string;
    idAccesor: string;
    rolAccesor: string;
    tipoAcceso: string;
  }): Promise<void> {
    const { error } = await this.supabase.from('auditoria_acceso_medico').insert({
      senderista_id: input.senderistaId,
      expedicion_id: input.expedicionId ?? null,
      id_accesor: input.idAccesor,
      rol_accesor: input.rolAccesor,
      tipo_acceso: input.tipoAcceso,
    });

    if (error && error.code !== '42P01') {
      console.warn('[Auditoría] fallo al registrar acceso médico:', error.message);
    }
  }
}
