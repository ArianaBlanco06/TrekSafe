import assert from 'node:assert/strict';
import { it } from 'node:test';
import { leerConfiguracionPublicada } from './configuracion';

const base = {
  TREKSAFE_PUBLICADO_ENTORNO: 'academico',
  TREKSAFE_PUBLICADO_FRONTEND_URL: 'https://treksafe.example.com',
  TREKSAFE_PUBLICADO_API_URL: 'https://api.treksafe.example.com/api',
  TREKSAFE_PUBLICADO_COMMIT: 'a'.repeat(40),
  TREKSAFE_PUBLICADO_ESQUEMA: 'registro-fixture',
  TREKSAFE_PUBLICADO_MODO: 'lectura',
};
it('falla al arrancar cuando no se identifica el destino publicado', () => {
  assert.throws(() => leerConfiguracionPublicada({}), /Falta TREKSAFE_PUBLICADO_ENTORNO/);
  assert.throws(() => leerConfiguracionPublicada({ ...base, TREKSAFE_PUBLICADO_API_URL: '' }), /API_URL/);
});
it('rechaza HTTP, localhost, IP, secretos en URL y dominios no públicos', () => {
  for (const url of ['http://treksafe.example.com', 'https://localhost', 'https://127.0.0.1', 'https://10.0.0.1',
    'https://user:password@treksafe.example.com', 'https://treksafe.example.com?token=ficticio', 'https://equipo.local']) {
    assert.throws(() => leerConfiguracionPublicada({ ...base, TREKSAFE_PUBLICADO_FRONTEND_URL: url }), /dominio HTTPS público/);
  }
});
it('exige identificación académica y SHA completo', () => {
  assert.throws(() => leerConfiguracionPublicada({ ...base, TREKSAFE_PUBLICADO_ENTORNO: 'dev' }), /entorno=academico/);
  assert.throws(() => leerConfiguracionPublicada({ ...base, TREKSAFE_PUBLICADO_COMMIT: 'abc1234' }), /SHA completo/);
});
it('smoke de lectura no necesita credenciales y no habilita prueba autenticada', () => {
  const config = leerConfiguracionPublicada(base);
  assert.equal(config.modo, 'lectura');
  assert.equal(config.cuentas, undefined);
});
it('prueba autenticada requiere ambos opt-ins y tres cuentas ficticias por entorno', () => {
  const env = { ...base, TREKSAFE_PUBLICADO_MODO: 'aceptacion' };
  assert.throws(() => leerConfiguracionPublicada(env), /opt-ins/);
  assert.throws(() => leerConfiguracionPublicada({ ...env, TREKSAFE_PUBLICADO_PERMITIR_ESCRITURAS: '1', TREKSAFE_PUBLICADO_CUENTAS_FICTICIAS: '1' }), /credenciales ficticias SENDERISTA_A/);
  const completo = { ...env, TREKSAFE_PUBLICADO_PERMITIR_ESCRITURAS: '1', TREKSAFE_PUBLICADO_CUENTAS_FICTICIAS: '1',
    TREKSAFE_PUBLICADO_SENDERISTA_A_CORREO: 'a@example.invalid', TREKSAFE_PUBLICADO_SENDERISTA_A_CLAVE: 'fixture-a',
    TREKSAFE_PUBLICADO_SENDERISTA_B_CORREO: 'b@example.invalid', TREKSAFE_PUBLICADO_SENDERISTA_B_CLAVE: 'fixture-b',
    TREKSAFE_PUBLICADO_RESCATISTA_CORREO: 'r@example.invalid', TREKSAFE_PUBLICADO_RESCATISTA_CLAVE: 'fixture-r' };
  assert.equal(leerConfiguracionPublicada(completo).cuentas?.senderistaA.correo, 'a@example.invalid');
  assert.throws(() => leerConfiguracionPublicada({ ...completo, TREKSAFE_PUBLICADO_SENDERISTA_B_CORREO: 'a@example.invalid' }), /deben ser distintas/);
});
it('un manifiesto ausente falla sin imprimir el contenido ni valores secretos', () => {
  assert.throws(() => leerConfiguracionPublicada({ TREKSAFE_PUBLICADO_MANIFIESTO: 'no-existe-manifiesto-publicado.json' }), /JSON válido y accesible/);
});
