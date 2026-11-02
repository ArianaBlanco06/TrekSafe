import assert from 'node:assert/strict';
import { it } from 'node:test';
import { ListasEquipoDAOEnMemoria } from './ListasEquipoDAOEnMemoria.js';
import { verificarContratoListasEquipoDAO } from './contratoListasEquipoDAO.js';

verificarContratoListasEquipoDAO('Contrato IListasEquipoDAO: memoria', () => ({
  dao: new ListasEquipoDAOEnMemoria(),
  senderistaA: 'senderista-a',
  senderistaB: 'senderista-b',
}));

it('el sustituto no recrea una lista eliminada cuando recibe operaciones simultáneas', async () => {
  const dao = new ListasEquipoDAOEnMemoria();
  const lista = await dao.crear('senderista-a', { nombre: 'Montaña', items: [] });
  const [eliminada, editada] = await Promise.all([
    dao.eliminar('senderista-a', lista.id),
    dao.actualizar('senderista-a', lista.id, { nombre: 'Invierno', items: [] }),
  ]);
  assert.equal(eliminada, true);
  assert.equal(editada, null);
  assert.equal(await dao.buscarPorId('senderista-a', lista.id), null);
});
