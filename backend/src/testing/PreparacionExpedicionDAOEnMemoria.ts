import { randomUUID } from 'node:crypto';
import type { ListaEquipo } from '../domain/entities/ListaEquipo.js';
import { ItemPreparacion } from '../domain/entities/ItemPreparacion.js';
import { PreparacionExpedicion } from '../domain/entities/PreparacionExpedicion.js';
import { ErrorPreparacionExpedicion, validarEstadoPreparacionEditable } from '../domain/errors/ErrorPreparacionExpedicion.js';
import type { IPreparacionExpedicionDAO } from '../domain/repositories/IPreparacionExpedicionDAO.js';

export type ExpedicionEquipoEnMemoria = {
  readonly id: string;
  readonly senderistaId: string;
  readonly estado: string;
};

type FuentesPreparacionEnMemoria = {
  readonly expediciones: ReadonlyMap<string, ExpedicionEquipoEnMemoria>;
  readonly listas: ReadonlyMap<string, ListaEquipo>;
  readonly generarId?: () => string;
  readonly ahora?: () => string;
};

/**
 * Sustituto aislado; no se conecta a producción. Las fuentes son datos de prueba.
 * Cada escritura comprueba y materializa antes de publicar, sin awaits intermedios.
 * Esto modela el contrato; no acredita bloqueos/transacciones de PostgreSQL.
 */
export class PreparacionExpedicionDAOEnMemoria implements IPreparacionExpedicionDAO {
  private readonly preparaciones = new Map<string, PreparacionExpedicion>();
  private readonly generarId: () => string;
  private readonly ahora: () => string;

  constructor(private readonly fuentes: FuentesPreparacionEnMemoria) {
    this.generarId = fuentes.generarId ?? randomUUID;
    this.ahora = fuentes.ahora ?? (() => new Date().toISOString());
  }

  async obtener(senderistaId: string, expedicionId: string): Promise<PreparacionExpedicion | null> {
    this.expedicionPropia(senderistaId, expedicionId);
    const preparacion = this.preparaciones.get(expedicionId);
    return preparacion ? this.conOrigenVigente(preparacion) : null;
  }

  async asociarLista(senderistaId: string, expedicionId: string, listaId: string): Promise<PreparacionExpedicion> {
    const expedicion = this.expedicionPropia(senderistaId, expedicionId);
    const lista = this.fuentes.listas.get(listaId);
    if (!lista || lista.senderistaId !== senderistaId) {
      throw new ErrorPreparacionExpedicion('LISTA_EQUIPO_NO_ENCONTRADA', 'Lista de equipo no encontrada.');
    }
    validarEstadoPreparacionEditable(expedicion.estado);
    if (this.preparaciones.has(expedicionId)) {
      throw new ErrorPreparacionExpedicion('PREPARACION_YA_ASOCIADA', 'La expedición ya tiene una lista de equipo asociada.');
    }
    const fecha = this.ahora();
    const preparacion = new PreparacionExpedicion({
      id: this.generarId(), expedicionId, senderistaId, listaOrigenId: listaId,
      nombreLista: lista.nombre,
      items: lista.items.map((item) => ({
        id: this.generarId(), nombre: item.nombre, obligatorio: item.obligatorio, preparado: false,
      })),
      creadoEn: fecha, actualizadoEn: fecha,
    });
    this.preparaciones.set(expedicionId, preparacion);
    return preparacion;
  }

  async establecerPreparado(
    senderistaId: string, expedicionId: string, itemId: string, preparado: boolean,
  ): Promise<PreparacionExpedicion> {
    const expedicion = this.expedicionPropia(senderistaId, expedicionId);
    const actual = this.preparaciones.get(expedicionId);
    const item = actual?.items.find((candidato) => candidato.id === itemId);
    if (!actual || !item) {
      throw new ErrorPreparacionExpedicion('ITEM_PREPARACION_NO_ENCONTRADO', 'Ítem de preparación no encontrado.');
    }
    validarEstadoPreparacionEditable(expedicion.estado);
    ItemPreparacion.validarPreparado(preparado);
    if (item.preparado === preparado) return this.conOrigenVigente(actual);
    const actualizada = new PreparacionExpedicion({
      ...this.conOrigenVigente(actual),
      items: actual.items.map((candidato) => candidato.id === itemId ? { ...candidato, preparado } : candidato),
      actualizadoEn: this.ahora(),
    });
    this.preparaciones.set(expedicionId, actualizada);
    return actualizada;
  }

  private expedicionPropia(senderistaId: string, expedicionId: string): ExpedicionEquipoEnMemoria {
    const expedicion = this.fuentes.expediciones.get(expedicionId);
    if (!expedicion || expedicion.senderistaId !== senderistaId) {
      throw new ErrorPreparacionExpedicion('EXPEDICION_NO_ENCONTRADA', 'Expedición no encontrada.');
    }
    return expedicion;
  }

  private conOrigenVigente(preparacion: PreparacionExpedicion): PreparacionExpedicion {
    if (preparacion.listaOrigenId !== null && !this.fuentes.listas.has(preparacion.listaOrigenId)) {
      return new PreparacionExpedicion({ ...preparacion, listaOrigenId: null });
    }
    return preparacion;
  }
}
