import type { IRepositorioOutbox } from '../../domain/repositories/IRepositorioOutbox.js';
import type { IRepositorioAlerta } from '../ports/RepositorioAlerta.js';
import type { IRepositorioDespachoCorreo } from '../ports/RepositorioDespachoCorreo.js';
import { buildCorreoRetornoSeguro } from '../mensajes/retornoSeguroEmail.js';

export type ResultadoNotificacionRetorno = {
  expedicionId: string;
  contactosNotificados: number;
  mensajesOutboxCreados: number;
  omitidosPorDuplicado: number;
};

export class ServicioNotificacionRetornoSeguro {
  constructor(
    private readonly repoOutbox: IRepositorioOutbox,
    private readonly repoAlerta: IRepositorioAlerta,
    private readonly repoDespacho?: IRepositorioDespachoCorreo,
  ) {}

  /**
   * Genera los mensajes outbox para notificar a los contactos de emergencia
   * tras la confirmación de retorno seguro del senderista.
   * - Incluye ruta y hora.
   * - Excluye expresamente cualquier ficha médica (Ley N° 29733 / HU-50).
   * - Evita duplicar despachos lógicos hacia el mismo destinatario para la misma expedición.
   */
  async notificarRetornoSeguro(
    expedicionId: string,
    confirmadoEnIso: string,
    fueAlertaPrevia = false,
  ): Promise<ResultadoNotificacionRetorno> {
    console.log(`[RetornoSeguro] Iniciando notificación para expedición ${expedicionId}...`);
    const contexto = await this.repoAlerta.buscarContextoAlerta(expedicionId, true);
    if (!contexto) {
      console.warn(`[RetornoSeguro] No se encontró contexto o datos de expedición ${expedicionId}`);
      return {
        expedicionId,
        contactosNotificados: 0,
        mensajesOutboxCreados: 0,
        omitidosPorDuplicado: 0,
      };
    }

    if (contexto.contactos.length === 0) {
      console.warn(`[RetornoSeguro] La expedición ${expedicionId} no tiene contactos de emergencia vinculados.`);
      return {
        expedicionId,
        contactosNotificados: 0,
        mensajesOutboxCreados: 0,
        omitidosPorDuplicado: 0,
      };
    }

    const correosVistos = new Set<string>();
    let creados = 0;
    let omitidos = 0;

    for (const contacto of contexto.contactos) {
      const email = contacto.correoElectronico.toLowerCase().trim();
      if (correosVistos.has(email)) continue;
      correosVistos.add(email);

      // Deduplicación lógica: Comprobar si ya fue despachado o registrado para este evento
      if (this.repoDespacho) {
        const yaDespachado = await this.repoDespacho.yaFueEnviado(
          expedicionId,
          'alerta_contacto',
          email,
        );
        if (yaDespachado) {
          omitidos++;
          continue;
        }
      }

      // Generar plantilla sin datos médicos
      const { subject, html, text } = buildCorreoRetornoSeguro({
        nombreContacto: contacto.nombreCompleto,
        nombreCompletoSenderista: contexto.nombreCompletoSenderista,
        lugarInicio: contexto.lugarInicio,
        lugarFin: contexto.lugarFin,
        horaRetornoConfirmada: new Date(confirmadoEnIso).toLocaleString('es-PE', {
          timeZone: 'America/Lima',
        }),
        fueAlertaPrevia,
      });

      // Crear entrada outbox garantizando trazabilidad y reintentos futuros
      const guardado = await this.repoOutbox.guardar({
        claveEvento: `RETORNO_SEGURO:${expedicionId}`,
        canal: 'correo',
        tipoEvento: 'RETORNO_SEGURO_CONTACTO',
        destinatario: email,
        asunto: subject,
        cuerpo: text,
        cuerpoHtml: html,
        metadata: {
          expedicionId,
          nombreContacto: contacto.nombreCompleto,
          fueAlertaPrevia,
          horaConfirmacion: confirmadoEnIso,
        },
      });

      console.log(
        `[RetornoSeguro] Notificación de retorno encolada en Outbox [${guardado.id}] para ${email} (${contacto.nombreCompleto})`,
      );

      creados++;
    }

    return {
      expedicionId,
      contactosNotificados: correosVistos.size,
      mensajesOutboxCreados: creados,
      omitidosPorDuplicado: omitidos,
    };
  }
}
