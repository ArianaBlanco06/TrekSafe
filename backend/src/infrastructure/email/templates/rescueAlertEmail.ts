export type InfoMedicaRescate = {
  tipoSangre: string;
  alergias: string;
  condiciones: string;
  medicamentos: string;
};

export type DatosCorreoAlertaRescate = {
  nombreRescatista: string;
  nombreCompletoSenderista: string;
  telefonoSenderista: string;
  lugarInicio: string;
  lugarFin: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  fechaLimite: string;
  acompanantes: string[];
  contactosEmergencia: { nombreCompleto: string; telefono: string; parentesco: string }[];
  fichaMedica: InfoMedicaRescate | null;
};

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bloqueInfoMedica(fichaMedica: InfoMedicaRescate | null): { html: string; text: string } {
  if (!fichaMedica) {
    return {
      html: '<p style="color:#587060;font-size:14px;">Ficha médica no registrada en el sistema.</p>',
      text: 'Ficha médica: no registrada.',
    };
  }

  const filas = [
    ['Tipo de sangre', fichaMedica.tipoSangre],
    ['Alergias', fichaMedica.alergias || 'No declaradas'],
    ['Condiciones', fichaMedica.condiciones || 'No declaradas'],
    ['Medicación', fichaMedica.medicamentos || 'No declarada'],
  ];

  const html = `
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${filas
        .map(
          ([etiqueta, valor]) =>
            `<tr><td style="padding:6px 0;color:#587060;width:40%;">${escaparHtml(etiqueta)}</td>` +
            `<td style="padding:6px 0;"><strong>${escaparHtml(valor)}</strong></td></tr>`,
        )
        .join('')}
    </table>`;

  const text = filas.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`).join('\n');

  return { html, text };
}

export function buildCorreoAlertaRescate(datos: DatosCorreoAlertaRescate): {
  subject: string;
  html: string;
  text: string;
} {
  const etiquetaSalida = formatearFechaHora(datos.horaInicio);
  const etiquetaRetorno = formatearFechaHora(datos.horaRetornoEstimada);
  const etiquetaLimite = formatearFechaHora(datos.fechaLimite);
  const subject = `[TrekSafe URGENTE] Ficha de búsqueda — ${datos.nombreCompletoSenderista}`;

  const textoAcompanantes =
    datos.acompanantes.length > 0 ? datos.acompanantes.join(', ') : 'Sin acompañantes declarados';
  const textoContactos =
    datos.contactosEmergencia.length > 0
      ? datos.contactosEmergencia
          .map((c) => `${c.nombreCompleto} (${c.parentesco}) — ${c.telefono}`)
          .join('\n')
      : 'Sin contactos vinculados';

  const med = bloqueInfoMedica(datos.fichaMedica);

  const text = [
    `Estimado/a ${datos.nombreRescatista},`,
    '',
    'ALERTA DE EXPEDICIÓN — TrekSafe',
    '',
    `Senderista: ${datos.nombreCompletoSenderista}`,
    `Teléfono: ${datos.telefonoSenderista}`,
    `Inicio: ${datos.lugarInicio}`,
    `Destino: ${datos.lugarFin}`,
    `Salida: ${etiquetaSalida}`,
    `Retorno estimado: ${etiquetaRetorno}`,
    `Límite con tolerancia: ${etiquetaLimite}`,
    '',
    `Cordada: ${textoAcompanantes}`,
    '',
    'Contactos de emergencia vinculados:',
    textoContactos,
    '',
    'Ficha médica (descifrada para emergencia):',
    med.text,
    '',
    '— TrekSafe · Despacho institucional de alerta',
  ].join('\n');

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>${escaparHtml(subject)}</title></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0c1a10;max-width:640px;margin:0 auto;padding:24px;">
  <div style="background:#dc2626;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;">
    <strong style="font-size:18px;">TrekSafe — Ficha técnica de búsqueda</strong>
    <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">Prioridad alta · Expedición en alerta</p>
  </div>
  <div style="border:1px solid rgba(12,26,16,0.1);border-top:none;padding:24px;border-radius:0 0 12px 12px;background:#fff;">
    <p>Estimado/a <strong>${escaparHtml(datos.nombreRescatista)}</strong>,</p>
    <p style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin:16px 0;">
      El senderista <strong>${escaparHtml(datos.nombreCompletoSenderista)}</strong> no confirmó su retorno dentro del plazo declarado.
    </p>

    <h3 style="font-size:15px;margin:20px 0 8px;">Datos del senderista</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 0;color:#587060;">Nombre</td><td style="padding:6px 0;"><strong>${escaparHtml(datos.nombreCompletoSenderista)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#587060;">Teléfono</td><td style="padding:6px 0;">${escaparHtml(datos.telefonoSenderista)}</td></tr>
      <tr><td style="padding:6px 0;color:#587060;">Inicio</td><td style="padding:6px 0;">${escaparHtml(datos.lugarInicio)}</td></tr>
      <tr><td style="padding:6px 0;color:#587060;">Destino</td><td style="padding:6px 0;"><strong>${escaparHtml(datos.lugarFin)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#587060;">Salida</td><td style="padding:6px 0;">${escaparHtml(etiquetaSalida)}</td></tr>
      <tr><td style="padding:6px 0;color:#587060;">Retorno estimado</td><td style="padding:6px 0;">${escaparHtml(etiquetaRetorno)}</td></tr>
      <tr><td style="padding:6px 0;color:#587060;">Límite</td><td style="padding:6px 0;">${escaparHtml(etiquetaLimite)}</td></tr>
    </table>

    <h3 style="font-size:15px;margin:20px 0 8px;">Cordada</h3>
    <p style="font-size:14px;margin:0;">${escaparHtml(textoAcompanantes)}</p>

    <h3 style="font-size:15px;margin:20px 0 8px;">Contactos de emergencia</h3>
    <p style="font-size:14px;margin:0;white-space:pre-line;">${escaparHtml(textoContactos)}</p>

    <h3 style="font-size:15px;margin:20px 0 8px;">Ficha médica (emergencia)</h3>
    ${med.html}
  </div>
  <p style="font-size:12px;color:#587060;text-align:center;margin-top:16px;">TrekSafe · Uso exclusivo institucional de rescate</p>
</body>
</html>`.trim();

  return { subject, html, text };
}
