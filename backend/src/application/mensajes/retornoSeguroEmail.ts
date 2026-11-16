export type DatosCorreoRetornoSeguro = {
  nombreContacto: string;
  nombreCompletoSenderista: string;
  lugarInicio: string;
  lugarFin: string;
  horaRetornoConfirmada: string;
  fueAlertaPrevia?: boolean;
};

export function buildCorreoRetornoSeguro(datos: DatosCorreoRetornoSeguro): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `[TrekSafe] Retorno seguro confirmado: ${datos.nombreCompletoSenderista}`;

  const avisoAlerta = datos.fueAlertaPrevia
    ? `<div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 12px; margin-bottom: 16px; border-radius: 4px;">
        <strong style="color: #065f46;">Actualización de estado:</strong> La expedición que se encontraba en observación o alerta ha concluido con éxito. El senderista ha confirmado encontrarse a salvo.
       </div>`
    : '';

  const avisoAlertaTexto = datos.fueAlertaPrevia
    ? `Actualización de estado: La expedición previa en alerta ha concluido con éxito. El senderista está a salvo.\n\n`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 20px; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <div style="background-color: #059669; color: #ffffff; padding: 24px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px; font-weight: bold;">TrekSafe — Retorno Seguro Confirmado</h1>
    </div>
    <div style="padding: 24px;">
      <p style="margin-top: 0;">Hola <strong>${datos.nombreContacto}</strong>,</p>
      
      ${avisoAlerta}

      <p>Te informamos que <strong>${datos.nombreCompletoSenderista}</strong> ha confirmado oficialmente su retorno seguro de su expedición.</p>
      
      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #374151; font-size: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Detalles de la Expedición</h3>
        <p style="margin: 6px 0;"><strong>Ruta / Origen:</strong> ${datos.lugarInicio}</p>
        <p style="margin: 6px 0;"><strong>Destino / Punto de retorno:</strong> ${datos.lugarFin}</p>
        <p style="margin: 6px 0;"><strong>Hora de confirmación:</strong> ${datos.horaRetornoConfirmada}</p>
      </div>

      <p style="color: #4b5563; font-size: 14px;">
        Esta expedición ha sido finalizada en la plataforma. No se requiere ninguna acción adicional de tu parte.
      </p>

      <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
        Este es un mensaje automático de TrekSafe Perú en cumplimiento con las políticas de privacidad y seguridad para senderistas (Ley N° 29733). Por tu privacidad y la del senderista, este correo no contiene información médica confidencial.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
TrekSafe — Retorno Seguro Confirmado
===================================

Hola ${datos.nombreContacto},

${avisoAlertaTexto}Te informamos que ${datos.nombreCompletoSenderista} ha confirmado su retorno seguro de la expedición.

Detalles de la expedición:
- Ruta / Origen: ${datos.lugarInicio}
- Destino / Retorno: ${datos.lugarFin}
- Hora de confirmación: ${datos.horaRetornoConfirmada}

La expedición ha sido finalizada y no se requiere ninguna acción adicional.

--
TrekSafe Perú (Ley N° 29733 - Sin datos médicos sensibles)
  `.trim();

  return { subject, html, text };
}
