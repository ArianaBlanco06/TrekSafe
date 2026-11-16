import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { MensajeOutbox } from '../../domain/entities/OutboxNotificacion.js';
import { prepararMensajeOutbox } from './prepararMensajeOutbox.js';

const id = '45f4f0b0-2795-4f2d-a958-68b409e3d7f1';
const mensaje = {
  tipoEvento: 'ALERTA_RESCATE', destinatario: 'ficticio@example.invalid', asunto: 'Prueba',
  cuerpo: 'Revisar <expedición> & acceso "autorizado"', cuerpoHtml: '<script>no ejecutar</script>',
  metadata: { expedicionId: id, fichaMedica: 'no-incluir', token: 'no-incluir', url: 'https://externo.example.invalid' },
} as unknown as MensajeOutbox;

it('enlaza a la ruta privada existente con UUID validado, sin metadatos extra y HTML escapado', () => {
  const resultado = prepararMensajeOutbox(mensaje, 'https://app.example.invalid');
  assert.match(resultado.cuerpoTexto, new RegExp(`https://app.example.invalid/rescatista/alertas/${id}`));
  assert.match(resultado.cuerpoHtml!, /&lt;expedición&gt; &amp; acceso &quot;autorizado&quot;/);
  assert.doesNotMatch(resultado.cuerpoHtml!, /<script>|no-incluir|externo.example/);
  assert.doesNotMatch(resultado.cuerpoTexto, /no-incluir|externo.example/);
  assert.equal(mensaje.metadata?.expedicionId, id);
});

it('preserva otros tipos y no genera ruta desde identificadores manipulados', () => {
  for (const modificado of [ { ...mensaje, tipoEvento: 'ALERTA_CONTACTO' },
    { ...mensaje, metadata: { expedicionId: '../../login?token=ficticio' } } ]) {
    const resultado = prepararMensajeOutbox(modificado, 'https://app.example.invalid');
    assert.equal(resultado.cuerpoTexto, mensaje.cuerpo);
    assert.equal(resultado.cuerpoHtml, mensaje.cuerpoHtml);
  }
});

it('rechaza origen con credenciales o ruta y no altera la identidad del evento', () => {
  assert.throws(() => prepararMensajeOutbox(mensaje, 'https://usuario:secreto@app.example.invalid'), /ORIGEN_APLICACION_INVALIDO/);
  assert.throws(() => prepararMensajeOutbox(mensaje, 'https://app.example.invalid/ruta'), /ORIGEN_APLICACION_INVALIDO/);
});
