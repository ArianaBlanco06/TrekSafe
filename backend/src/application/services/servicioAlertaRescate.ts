import { buildCorreoAlertaRescate } from '../../infrastructure/email/templates/rescueAlertEmail.js';
import { RepositorioAlerta } from '../../infrastructure/repositories/RepositorioAlerta.js';
import { RepositorioDespachoCorreo } from '../../infrastructure/repositories/RepositorioDespachoCorreo.js';
import { RepositorioRescate } from '../../infrastructure/repositories/RepositorioRescate.js';
import { RepositorioUsuario } from '../../infrastructure/repositories/RepositorioUsuario.js';
import { RepositorioOutboxSupabase } from '../../infrastructure/repositories/RepositorioOutboxSupabase.js';
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
    private readonly repoAlerta = new RepositorioAlerta(),
    private readonly repoRescate = new RepositorioRescate(),
    private readonly repoUsuario = new RepositorioUsuario(),
    private readonly repoDespacho = new RepositorioDespachoCorreo(),
    private readonly repoOutbox: IRepositorioOutbox = new RepositorioOutboxSupabase(),
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

    const registroMedico = await this.repoUsuario.obtenerFichaMedica(contexto.senderistaId);
    const fichaMedica =
      registroMedico?.consentimientoFirmado
        ? {
            tipoSangre: registroMedico.tipoSangre,
            alergias: registroMedico.carga.alergias,
            condiciones: registroMedico.carga.condiciones,
            medicamentos: registroMedico.carga.medicamentos,
          }
        : null;

    let encolados = 0;
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
        fichaMedica,
      });

      try {
        await this.repoOutbox.guardar({
          tipoEvento: 'ALERTA_RESCATE',
          destinatario: rescatista.correoElectronico,
          asunto: subject,
          cuerpo: text,
          cuerpoHtml: html,
          metadata: {
            expedicionId,
            tipoDespacho: 'alerta_rescate',
            nombreRescatista: rescatista.nombreCompleto,
          },
        });
        encolados++;
      } catch (err) {
        fallidos++;
        console.error(`[Rescate] fallo al encolar en outbox para ${rescatista.correoElectronico}:`, err);
      }
    }

    console.log(
      `[Rescate] expedición ${expedicionId}: rescatistas encolados=${encolados} fallidos=${fallidos} omitidos=${omitidos}`,
    );

    return { expedicionId, enviados: encolados, registrados: encolados, fallidos, omitidos };
  }
}
