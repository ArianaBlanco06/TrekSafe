import { ListaEquipo, type DatosListaEquipo } from '../domain/entities/ListaEquipo.js';
import { ErrorValidacionEquipo } from '../domain/errors/ErrorValidacionEquipo.js';
import type { IListasEquipoDAO } from '../domain/repositories/IListasEquipoDAO.js';
import { randomUUID } from 'node:crypto';

/** Sustituto para pruebas aisladas. No se conecta al ensamblaje de producción. */
export class ListasEquipoDAOEnMemoria implements IListasEquipoDAO {
  private readonly listas = new Map<string, ListaEquipo>();

  async listar(senderistaId: string): Promise<readonly ListaEquipo[]> {
    return Object.freeze([...this.listas.values()].filter((lista) => lista.senderistaId === senderistaId));
  }

  async buscarPorId(senderistaId: string, listaId: string): Promise<ListaEquipo | null> {
    const lista = this.listas.get(listaId);
    return lista?.senderistaId === senderistaId ? lista : null;
  }

  async crear(senderistaId: string, entrada: DatosListaEquipo): Promise<ListaEquipo> {
    const datos = ListaEquipo.normalizarContenido(entrada);
    if (datos.items.some((item) => item.id !== undefined)) {
      throw new ErrorValidacionEquipo('ITEM_ID_NO_PERMITIDO', 'Los ítems nuevos no pueden incluir identificadores.');
    }
    const ahora = new Date().toISOString();
    const lista = this.materializar(this.siguienteId(), senderistaId, datos, ahora);
    this.listas.set(lista.id, lista);
    return lista;
  }

  async actualizar(senderistaId: string, listaId: string, entrada: DatosListaEquipo): Promise<ListaEquipo | null> {
    const actual = this.listas.get(listaId);
    if (!actual || actual.senderistaId !== senderistaId) return null;
    const datos = ListaEquipo.normalizarContenido(entrada);
    const idsActuales = new Set(actual.items.map((item) => item.id));
    if (datos.items.some((item) => item.id !== undefined && !idsActuales.has(item.id))) {
      throw new ErrorValidacionEquipo('ITEM_NO_PERTENECE', 'El ítem no pertenece a la lista.');
    }
    const lista = this.materializar(listaId, senderistaId, datos, actual.creadoEn);
    this.listas.set(lista.id, lista);
    return lista;
  }

  async eliminar(senderistaId: string, listaId: string): Promise<boolean> {
    if (this.listas.get(listaId)?.senderistaId !== senderistaId) return false;
    return this.listas.delete(listaId);
  }

  private siguienteId(): string {
    return randomUUID();
  }

  private materializar(id: string, senderistaId: string, datos: DatosListaEquipo, creadoEn: string): ListaEquipo {
    return new ListaEquipo({
      id,
      senderistaId,
      nombre: datos.nombre,
      items: datos.items.map((item) => ({ ...item, id: item.id ?? this.siguienteId() })),
      creadoEn,
      actualizadoEn: new Date().toISOString(),
    });
  }
}
