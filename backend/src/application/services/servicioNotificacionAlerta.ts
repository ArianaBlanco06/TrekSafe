import { buildCorreoAlertaContacto } from '../../infrastructure/email/templates/contactAlertEmail.js';
import { RepositorioAlerta } from '../../infrastructure/repositories/RepositorioAlerta.js';
import { RepositorioDespachoCorreo } from '../../infrastructure/repositories/RepositorioDespachoCorreo.js';
import { RepositorioOutboxSupabase } from '../../infrastructure/repositories/RepositorioOutboxSupabase.js';
import type { IRepositorioOutbox } from '../../domain/repositories/IRepositorioOutbox.js';

export type ResultadoAlertaContacto = {
  expedicionId: string;
  enviados: number;
  registrados: number;
  fallidos: number;
  omitidos: number;
};

export class ServicioNotificacionAlerta {
  constructor(
    private readonly repoAlerta = new RepositorioAlerta(),
    private readonly repoDespacho = new RepositorioDespachoCorreo(),
    private readonly repoOutbox: IRepositorioOutbox = new RepositorioOutboxSupabase(),
  ) {}

  async notificarContactosEmergencia(expedicionId: string): Promise<ResultadoAlertaContacto> {
    const contexto = await this.repoAlerta.buscarContextoAlerta(expedicionId);
    if (!contexto) {
      return { expedicionId, enviados: 0, registrados: 0, fallidos: 0, omitidos: 0 };
    }

    if (contexto.contactos.length === 0) {
      console.warn(`[Alerta] expedición ${expedicionId}: sin contactos vinculados`);
      return { expedicionId, enviados: 0, registrados: 0, fallidos: 0, omitidos: 0 };
    }

    const correosVistos = new Set<string>();
    let encolados = 0;
    let fallidos = 0;
    let omitidos = 0;

    for (const contacto of contexto.contactos) {
      if (correosVistos.has(contacto.correoElectronico)) continue;
      correosVistos.add(contacto.correoElectronico);

      if (await this.repoDespacho.yaFueEnviado(expedicionId, 'alerta_contacto', contacto.correoElectronico)) {
        omitidos++;
        continue;
      }

      const { subject, html, text } = buildCorreoAlertaContacto({
        nombreContacto: contacto.nombreCompleto,
        nombreCompletoSenderista: contexto.nombreCompletoSenderista,
        lugarFin: contexto.lugarFin,
        lugarInicio: contexto.lugarInicio,
        horaRetornoEstimada: contexto.horaRetornoEstimada,
        fechaLimite: contexto.fechaLimite,
      });

      try {
        await this.repoOutbox.guardar({
          tipoEvento: 'ALERTA_CONTACTO',
          destinatario: contacto.correoElectronico,
          asunto: subject,
          cuerpo: text,
          cuerpoHtml: html,
          metadata: {
            expedicionId,
            tipoDespacho: 'alerta_contacto',
            nombreContacto: contacto.nombreCompleto,
          },
        });
        encolados++;
      } catch (err) {
        fallidos++;
        console.error(`[Alerta] fallo al encolar en outbox para ${contacto.correoElectronico}:`, err);
      }
    }

    console.log(
      `[Alerta] expedición ${expedicionId}: contactos encolados=${encolados} fallidos=${fallidos} omitidos=${omitidos}`,
    );

    // enviados=encolados para compatibilidad con las métricas del cron
    return { expedicionId, enviados: encolados, registrados: encolados, fallidos, omitidos };
  }
}
