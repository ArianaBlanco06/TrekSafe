import assert from 'node:assert/strict';
import { it } from 'node:test';
import { destinoTrasLogin } from './destinoTrasLogin';

it('recupera el enlace local al incidente del rol autenticado con sus opciones', () => {
  assert.equal(destinoTrasLogin('rescatista', { from: { pathname: '/rescatista/alertas/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', search: '?seccion=bitacora', hash: '#entrada' } }),
    '/rescatista/alertas/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?seccion=bitacora#entrada');
});
it('rechaza externos, rutas de otro rol, traversal, codificaciones y estados malformados', () => {
  for (const pathname of ['https://externo.example/', '//externo.example/', '/senderista/perfil', '/rescatista/../senderista',
    '/rescatista/%2e%2e/senderista', '/rescatista/alertas\\externo', '/rescatista-malicioso', '/iniciar-sesion']) {
    assert.equal(destinoTrasLogin('rescatista', { from: { pathname } }), '/rescatista');
  }
  assert.equal(destinoTrasLogin('senderista', { from: '//externo.example/' }), '/senderista');
  assert.equal(destinoTrasLogin('senderista', null), '/senderista');
  assert.equal(destinoTrasLogin('rescatista', { from: { pathname: '/rescatista/alertas', search: 'https://externo.example/' } }), '/rescatista');
});
