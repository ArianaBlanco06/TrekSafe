import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AVISO_FICHA_MEDICA_CORREO, buildCorreoAlertaRescate, type DatosCorreoAlertaRescate } from './rescueAlertEmail.js';

const DATOS: DatosCorreoAlertaRescate = {
  nombreRescatista: 'Rescatista Ficticio',
  nombreCompletoSenderista: 'Senderista Ficticio',
  telefonoSenderista: '999999999',
  lugarInicio: 'Inicio',
  lugarFin: 'Destino',
  horaInicio: '2030-01-15T08:00:00.000Z',
  horaRetornoEstimada: '2030-01-15T14:00:00.000Z',
  fechaLimite: '2030-01-15T14:30:00.000Z',
  acompanantes: ['Acompañante Uno'],
  contactosEmergencia: [{ nombreCompleto: 'Contacto Uno', telefono: '988888888', parentesco: 'Hermana' }],
};

// Etiquetas y valores médicos que el correo nunca debe contener (CA-03 de HU-50).
const PATRON_MEDICO = /Tipo de sangre|Alergias|Condiciones|Medicaci[oó]n|descifrada|O\+|penicilina/i;

describe('Correo de alerta a rescatistas sin datos médicos (HU-50, CA-03)', () => {
  const { subject, html, text } = buildCorreoAlertaRescate(DATOS);

  it('ni el asunto, ni el HTML ni el texto plano contienen etiquetas ni valores médicos', () => {
    for (const parte of [subject, html, text]) assert.doesNotMatch(parte, PATRON_MEDICO);
  });

  it('el HTML y el texto llevan el aviso fijo y no dicen si existe una ficha', () => {
    assert.equal(
      AVISO_FICHA_MEDICA_CORREO,
      'La ficha médica no se envía por correo. Solo el responsable vigente del incidente puede consultarla en TrekSafe.',
    );
    assert.ok(text.includes(AVISO_FICHA_MEDICA_CORREO));
    assert.ok(html.includes(AVISO_FICHA_MEDICA_CORREO));
    assert.ok(html.includes('<h3 style="font-size:15px;margin:20px 0 8px;">Información médica</h3>'));
    assert.doesNotMatch(`${html}${text}`, /no registrada|no está registrada|registrada en el sistema/i);
  });

  it('el correo es idéntico exista o no una ficha: el tipo no admite datos médicos', () => {
    // @ts-expect-error HU-50: DatosCorreoAlertaRescate ya no tiene el campo fichaMedica.
    const conFicha = buildCorreoAlertaRescate({ ...DATOS, fichaMedica: { tipoSangre: 'O+', alergias: 'penicilina', condiciones: 'asma', medicamentos: 'x' } });
    assert.deepEqual(conFicha, { subject, html, text });
  });

  it('conserva los datos operativos: senderista, teléfono, lugares, cordada y contactos', () => {
    for (const valor of ['Senderista Ficticio', '999999999', 'Destino', 'Acompañante Uno', 'Contacto Uno', '988888888']) {
      assert.ok(text.includes(valor), `falta ${valor} en el texto`);
      assert.ok(html.includes(valor), `falta ${valor} en el HTML`);
    }
  });
});
