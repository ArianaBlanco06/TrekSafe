import { ListaEquipo, type DatosListaEquipo } from '../../domain/entities/ListaEquipo.js';
import { ErrorValidacionEquipo } from '../../domain/errors/ErrorValidacionEquipo.js';
import type { IListasEquipoDAO } from '../../domain/repositories/IListasEquipoDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

/** Coordina las listas personales; no depende de Supabase ni genera ids. */
export class ServicioListasEquipo {
  constructor(private readonly dao: IListasEquipoDAO) {}

  async listarListas(senderistaId: string): Promise<readonly ListaEquipo[]> {
    this.validarActor(senderistaId);
    return this.dao.listar(senderistaId);
  }

  async obtenerLista(senderistaId: string, listaId: string): Promise<ListaEquipo> {
    this.validarActor(senderistaId);
    const lista = await this.dao.buscarPorId(senderistaId, listaId);
    if (!lista || lista.senderistaId !== senderistaId) throw this.noEncontrada();
    return lista;
  }

  async crearLista(senderistaId: string, entrada: DatosListaEquipo): Promise<ListaEquipo> {
    this.validarActor(senderistaId);
    const datos = ListaEquipo.normalizarContenido(entrada);
    if (datos.items.some((item) => item.id !== undefined)) {
      throw new ErrorValidacionEquipo('ITEM_ID_NO_PERMITIDO', 'Los ítems nuevos reciben su identificador al guardarse.');
    }
    return this.dao.crear(senderistaId, datos);
  }

  async actualizarLista(
    senderistaId: string,
    listaId: string,
    entrada: DatosListaEquipo,
  ): Promise<ListaEquipo> {
    const actual = await this.obtenerLista(senderistaId, listaId);
    const datos = ListaEquipo.normalizarContenido(entrada);
    const idsActuales = new Set(actual.items.map((item) => item.id));

    if (datos.items.some((item) => item.id !== undefined && !idsActuales.has(item.id))) {
      throw new ErrorValidacionEquipo('ITEM_NO_PERTENECE', 'Uno o más ítems no pertenecen a esta lista.');
    }

    // El DAO vuelve a comprobar propiedad y pertenencia dentro de la escritura atómica.
    const actualizada = await this.dao.actualizar(senderistaId, listaId, datos);
    if (!actualizada) throw this.noEncontrada();
    return actualizada;
  }

  async eliminarLista(senderistaId: string, listaId: string): Promise<void> {
    this.validarActor(senderistaId);
    if (!(await this.dao.eliminar(senderistaId, listaId))) throw this.noEncontrada();
  }

  private validarActor(senderistaId: string): void {
    if (typeof senderistaId !== 'string' || !senderistaId.trim()) {
      throw new ErrorAplicacion(401, 'Se requiere un senderista autenticado.', 'NO_AUTORIZADO');
    }
  }

  private noEncontrada(): ErrorAplicacion {
    return new ErrorAplicacion(404, 'Lista de equipo no encontrada.', 'LISTA_EQUIPO_NO_ENCONTRADA');
  }
}
