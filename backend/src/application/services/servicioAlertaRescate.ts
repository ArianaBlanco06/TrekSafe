import { buildCorreoAlertaRescate } from '../mensajes/rescueAlertEmail.js';
import type { ICorreo } from '../ports/correo.js';
import type { IRepositorioAlerta } from '../ports/RepositorioAlerta.js';
import type { IRepositorioDespachoCorreo } from '../ports/RepositorioDespachoCorreo.js';
import type { IRepositorioRescate } from '../ports/RepositorioRescate.js';
import type { IRepositorioOutbox } from '../../domain/repositories/IRepositorioOutbox.js';

export type ResultadoAlertaRescate = {
  expedicionId: string;
  enviados: number;
  registrados: number;
  fallidos: number;
  omitidos: number;
};

export class ServicioAlertaRescate {
  constructor(
    private readonly repoAlerta: IRepositorioAlerta,
    private readonly repoRescate: IRepositorioRescate,
    private readonly correo: ICorreo,
    private readonly repoDespacho: IRepositorioDespachoCorreo,
    private readonly repoOutbox?: IRepositorioOutbox,
  ) {}

  async notificarEquiposRescate(expedicionId: string): Promise<ResultadoAlertaRescate> {
    const contexto = await this.repoAlerta.buscarContextoAlertaRescate(expedicionId);
    if (!contexto) {
      return { expedicionId, enviados: 0, registrados: 0, fallidos: 0, omitidos: 0 };
    }

    const rescatistas = await this.repoRescate.listarCorreosRescatistasValidados();
    if (rescatistas.length === 0) {
      console.warn(`[Rescate] expedición ${expedicionId}: sin rescatistas registrados`);
      return { expedicionId, enviados: 0, registrados: 0, fallidos: 0, omitidos: 0 };
    }

    let enviados = 0;
    let registrados = 0;
    let fallidos = 0;
    let omitidos = 0;

    for (const rescatista of rescatistas) {
      if (await this.repoDespacho.yaFueEnviado(expedicionId, 'alerta_rescate', rescatista.correoElectronico)) {
        omitidos++;
        continue;
      }

      const { subject, html, text } = buildCorreoAlertaRescate({
        nombreRescatista: rescatista.nombreCompleto,
        nombreCompletoSenderista: contexto.nombreCompletoSenderista,
        telefonoSenderista: contexto.telefonoSenderista,
        lugarInicio: contexto.lugarInicio,
        lugarFin: contexto.lugarFin,
        horaInicio: contexto.horaInicio,
        horaRetornoEstimada: contexto.horaRetornoEstimada,
        fechaLimite: contexto.fechaLimite,
        acompanantes: contexto.acompanantes,
        contactosEmergencia: contexto.contactosEmergencia,
      });

      if (this.repoOutbox) {
        try {
          await this.repoOutbox.guardar({
            claveEvento: `ALERTA_RESCATE:${expedicionId}`,
            canal: 'correo',
            tipoEvento: 'ALERTA_RESCATE',
            destinatario: rescatista.correoElectronico,
            asunto: subject,
            cuerpo: text,
            cuerpoHtml: html,
            metadata: { expedicionId, tipoDespacho: 'alerta_rescate' },
          });
          registrados++;
          // Encolar no equivale a enviar; la outbox conserva el resultado.
        } catch (err) {
          fallidos++;
          console.error('[Notificaciones] Operación fallida; revisar persistencia o transporte');
        }
      } else {
        try {
          const resultado = await this.correo.enviar({ to: rescatista.correoElectronico, subject, html, text });
          if (resultado === 'enviado') {
            enviados++;
            await this.repoDespacho.registrarEnvio(expedicionId, 'alerta_rescate', rescatista.correoElectronico);
          } else {
            registrados++;
          }
        } catch (err) {
          fallidos++;
          console.error('[Notificaciones] Operación fallida; revisar persistencia o transporte');
        }
      }
    }

    const modo = this.correo?.getModoTransporte ? this.correo.getModoTransporte() : 'outbox';
    console.log(
      `[Rescate] expedición ${expedicionId}: rescatistas enviados=${enviados} registrados=${registrados} fallidos=${fallidos} omitidos=${omitidos} modo=${modo}`,
    );

    return { expedicionId, enviados, registrados, fallidos, omitidos };
  }
}
