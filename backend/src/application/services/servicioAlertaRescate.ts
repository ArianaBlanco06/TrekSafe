import { buildCorreoAlertaRescate } from '../../infrastructure/email/templates/rescueAlertEmail.js';
import { ServicioCorreo } from '../../infrastructure/email/ServicioCorreo.js';
import { RepositorioAlerta } from '../../infrastructure/repositories/RepositorioAlerta.js';
import { RepositorioDespachoCorreo } from '../../infrastructure/repositories/RepositorioDespachoCorreo.js';
import { RepositorioRescate } from '../../infrastructure/repositories/RepositorioRescate.js';
import { RepositorioUsuario } from '../../infrastructure/repositories/RepositorioUsuario.js';

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
    private readonly correo = new ServicioCorreo(),
    private readonly repoDespacho = new RepositorioDespachoCorreo(),
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
        fichaMedica,
      });

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
        console.error(`[Rescate] fallo envío a ${rescatista.correoElectronico}:`, err);
      }
    }

    const modo = this.correo.getModoTransporte();
    console.log(
      `[Rescate] expedición ${expedicionId}: rescatistas enviados=${enviados} registrados=${registrados} fallidos=${fallidos} omitidos=${omitidos} modo=${modo}`,
    );

    return { expedicionId, enviados, registrados, fallidos, omitidos };
  }
}
