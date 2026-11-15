import type { MensajeOutbox } from '../../domain/entities/OutboxNotificacion.js';
import type { DatosEnvioCorreo } from '../../domain/services/ITransporteCorreo.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escaparHtml = (texto: string) => texto.replace(/[&<>"']/g, (caracter) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[caracter]!);

/** Enlace a una ruta privada existente; nunca incorpora credenciales ni autoriza acceso. */
export function prepararMensajeOutbox(mensaje: MensajeOutbox, origenAplicacion?: string): DatosEnvioCorreo {
  const base: DatosEnvioCorreo = {
    destinatario: mensaje.destinatario, asunto: mensaje.asunto,
    cuerpoTexto: mensaje.cuerpo, cuerpoHtml: mensaje.cuerpoHtml,
  };
  const id = mensaje.metadata?.expedicionId;
  if (mensaje.tipoEvento !== 'ALERTA_RESCATE' || typeof id !== 'string' || !uuid.test(id) || !origenAplicacion) {
    return base;
  }
  const origen = new URL(origenAplicacion);
  if (!['https:', 'http:'].includes(origen.protocol) || origen.username || origen.password ||
    origen.pathname !== '/' || origen.search || origen.hash) throw new Error('ORIGEN_APLICACION_INVALIDO');
  const enlace = new URL(`/rescatista/alertas/${id}`, origen.origin).href;
  return {
    ...base,
    cuerpoTexto: `${mensaje.cuerpo}\n\nAbrir alerta en TrekSafe: ${enlace}`,
    cuerpoHtml: `<p>${escaparHtml(mensaje.cuerpo).replaceAll('\n', '<br>')}</p>` +
      `<p><a href="${escaparHtml(enlace)}">Abrir alerta en TrekSafe</a></p>`,
  };
}
