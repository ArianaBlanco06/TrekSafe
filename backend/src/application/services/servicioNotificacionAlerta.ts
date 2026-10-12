import { buildCorreoAlertaContacto } from '../../infrastructure/email/templates/contactAlertEmail.js';
import { ServicioCorreo } from '../../infrastructure/email/ServicioCorreo.js';
import { RepositorioAlerta } from '../../infrastructure/repositories/RepositorioAlerta.js';
import { RepositorioDespachoCorreo } from '../../infrastructure/repositories/RepositorioDespachoCorreo.js';

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
    private readonly correo = new ServicioCorreo(),
    private readonly repoDespacho = new RepositorioDespachoCorreo(),
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
    let enviados = 0;
    let registrados = 0;
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
        const resultado = await this.correo.enviar({ to: contacto.correoElectronico, subject, html, text });
        if (resultado === 'enviado') {
          enviados++;
          await this.repoDespacho.registrarEnvio(expedicionId, 'alerta_contacto', contacto.correoElectronico);
        } else {
          registrados++;
        }
      } catch (err) {
        fallidos++;
        console.error(`[Alerta] fallo envío a ${contacto.correoElectronico}:`, err);
      }
    }

    const modo = this.correo.getModoTransporte();
    console.log(
      `[Alerta] expedición ${expedicionId}: contactos enviados=${enviados} registrados=${registrados} fallidos=${fallidos} omitidos=${omitidos} modo=${modo}`,
    );

    return { expedicionId, enviados, registrados, fallidos, omitidos };
  }
}
