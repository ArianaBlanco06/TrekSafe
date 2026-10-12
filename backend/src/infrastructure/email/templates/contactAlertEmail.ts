export type DatosCorreoAlertaContacto = {
  nombreContacto: string;
  nombreCompletoSenderista: string;
  lugarFin: string;
  lugarInicio: string;
  horaRetornoEstimada: string;
  fechaLimite: string;
};

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function buildCorreoAlertaContacto(datos: DatosCorreoAlertaContacto): {
  subject: string;
  html: string;
  text: string;
} {
  const etiquetaRetorno = formatearFechaHora(datos.horaRetornoEstimada);
  const etiquetaLimite = formatearFechaHora(datos.fechaLimite);
  const subject = `[TrekSafe] Alerta: ${datos.nombreCompletoSenderista} no confirmó su retorno`;

  const text = [
    `Hola ${datos.nombreContacto},`,
    '',
    `TrekSafe registra una alerta de seguridad para ${datos.nombreCompletoSenderista}.`,
    `No se recibió el check-in de retorno dentro del plazo declarado.`,
    '',
    `Destino: ${datos.lugarFin}`,
    `Punto de inicio: ${datos.lugarInicio}`,
    `Retorno estimado: ${etiquetaRetorno}`,
    `Límite con tolerancia: ${etiquetaLimite}`,
    '',
    'Por favor, intenta contactar al senderista y evalúa escalar la situación.',
    '',
    '— TrekSafe · Sistema de monitoreo pasivo',
  ].join('\n');

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0c1a10;max-width:560px;margin:0 auto;padding:24px;">
  <div style="background:#16a34a;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;">
    <strong style="font-size:18px;">TrekSafe — Alerta de expedición</strong>
  </div>
  <div style="border:1px solid rgba(12,26,16,0.1);border-top:none;padding:24px;border-radius:0 0 12px 12px;background:#fff;">
    <p>Hola <strong>${escaparHtml(datos.nombreContacto)}</strong>,</p>
    <p style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin:16px 0;">
      <strong>${escaparHtml(datos.nombreCompletoSenderista)}</strong> no confirmó su retorno seguro dentro del plazo declarado.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#587060;">Destino</td><td style="padding:8px 0;"><strong>${escaparHtml(datos.lugarFin)}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#587060;">Inicio</td><td style="padding:8px 0;">${escaparHtml(datos.lugarInicio)}</td></tr>
      <tr><td style="padding:8px 0;color:#587060;">Retorno estimado</td><td style="padding:8px 0;">${escaparHtml(etiquetaRetorno)}</td></tr>
      <tr><td style="padding:8px 0;color:#587060;">Límite (con tolerancia)</td><td style="padding:8px 0;">${escaparHtml(etiquetaLimite)}</td></tr>
    </table>
    <p style="margin-top:20px;font-size:14px;color:#587060;">
      Intenta contactar al senderista y evalúa escalar la situación con las autoridades competentes.
    </p>
  </div>
  <p style="font-size:12px;color:#587060;text-align:center;margin-top:16px;">TrekSafe · Monitoreo pasivo de expediciones</p>
</body>
</html>`.trim();

  return { subject, html, text };
}

function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
