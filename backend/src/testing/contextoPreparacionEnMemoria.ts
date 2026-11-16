import type { DatosListaEquipo, ListaEquipo } from '../domain/entities/ListaEquipo.js';
import { ListasEquipoDAOEnMemoria } from './ListasEquipoDAOEnMemoria.js';
import { PreparacionExpedicionDAOEnMemoria, type ExpedicionEquipoEnMemoria } from './PreparacionExpedicionDAOEnMemoria.js';

/** Datos ficticios y controles exclusivos de pruebas; reutiliza el DAO de HU-30. */
export async function crearContextoPreparacionEnMemoria(
  opciones: { generarId?: () => string; ahora?: () => string } = {},
) {
  const senderistaA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const senderistaB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const expedicionA = '11111111-1111-4111-8111-111111111111';
  const otraExpedicionA = '22222222-2222-4222-8222-222222222222';
  const expedicionB = '33333333-3333-4333-8333-333333333333';
  const expediciones = new Map<string, ExpedicionEquipoEnMemoria>([
    [expedicionA, Object.freeze({ id: expedicionA, senderistaId: senderistaA, estado: 'programada' })],
    [otraExpedicionA, Object.freeze({ id: otraExpedicionA, senderistaId: senderistaA, estado: 'programada' })],
    [expedicionB, Object.freeze({ id: expedicionB, senderistaId: senderistaB, estado: 'programada' })],
  ]);
  const listasDAO = new ListasEquipoDAOEnMemoria();
  const listaA = await listasDAO.crear(senderistaA, {
    nombre: '  Montaña  ',
    items: [
      { nombre: ' Casco ', obligatorio: true },
      { nombre: 'Cámara', obligatorio: false },
      { nombre: 'Agua', obligatorio: true },
    ],
  });
  const listaB = await listasDAO.crear(senderistaB, {
    nombre: 'Equipo de B', items: [{ nombre: 'Botas', obligatorio: true }],
  });
  const listaVaciaA = await listasDAO.crear(senderistaA, { nombre: 'Vacía', items: [] });
  const listas = new Map<string, ListaEquipo>([listaA, listaB, listaVaciaA].map((lista) => [lista.id, lista]));
  const dao = new PreparacionExpedicionDAOEnMemoria({ expediciones, listas, ...opciones });

  return {
    dao, senderistaA, senderistaB, expedicionA, otraExpedicionA, expedicionB,
    listaA, listaB, listaVaciaA, expediciones, listas,
    cambiarEstado(expedicionId: string, estado: string): void {
      const expedicion = expediciones.get(expedicionId);
      if (!expedicion) throw new Error('Expedición ficticia no encontrada.');
      expediciones.set(expedicionId, Object.freeze({ ...expedicion, estado }));
    },
    async actualizarLista(senderistaId: string, listaId: string, datos: DatosListaEquipo): Promise<void> {
      const lista = await listasDAO.actualizar(senderistaId, listaId, datos);
      if (!lista) throw new Error('Lista ficticia no encontrada.');
      listas.set(listaId, lista);
    },
    async eliminarLista(senderistaId: string, listaId: string): Promise<void> {
      if (!(await listasDAO.eliminar(senderistaId, listaId))) throw new Error('Lista ficticia no encontrada.');
      listas.delete(listaId);
    },
  };
}
