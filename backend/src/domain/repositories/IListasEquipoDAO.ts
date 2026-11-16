import type { DatosListaEquipo, ListaEquipo } from '../entities/ListaEquipo.js';

/**
 * Persistencia de listas base, siempre dentro del alcance del propietario.
 *
 * - Una lista ajena se trata igual que una inexistente: null/false.
 * - Crear y actualizar guardan la lista y TODOS sus ítems atómicamente.
 * - Las escrituras asignan ids y fechas; no cambian id, propietario ni creadoEn al editar.
 * - Crear rechaza ids de ítems suministrados; editar conserva los ids existentes,
 *   asigna ids a los nuevos y rechaza ids duplicados o de otra lista.
 * - Un error no deja cambios parciales. Eliminar incluye los ítems.
 * - Los resultados no permiten modificar la persistencia fuera de estas operaciones.
 */
export interface IListasEquipoDAO {
  listar(senderistaId: string): Promise<readonly ListaEquipo[]>;
  buscarPorId(senderistaId: string, listaId: string): Promise<ListaEquipo | null>;
  crear(senderistaId: string, datos: DatosListaEquipo): Promise<ListaEquipo>;
  actualizar(senderistaId: string, listaId: string, datos: DatosListaEquipo): Promise<ListaEquipo | null>;
  eliminar(senderistaId: string, listaId: string): Promise<boolean>;
}
