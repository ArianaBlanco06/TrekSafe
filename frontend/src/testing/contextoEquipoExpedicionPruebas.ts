import { crearContextoPreparacionEnMemoria } from '../../../backend/src/testing/contextoPreparacionEnMemoria';
import { ServicioPreparacionExpedicion } from '../../../backend/src/application/services/servicioPreparacionExpedicion';
import { ErrorAplicacion } from '../../../backend/src/shared/errors/ErrorAplicacion';
import { respuestaPreparacion } from '../../../backend/src/presentation/http/dto/preparacionExpedicion.dto';
import { ErrorClienteApi } from '../services/clienteApi';
import type { FuentesEquipoExpedicion } from '../services/preparacionExpedicion';

/** Reutiliza reglas reales del backend; sustituye únicamente el transporte de la pantalla. */
export async function contextoEquipoExpedicionPruebas() {
  const c = await crearContextoPreparacionEnMemoria();
  const servicio = new ServicioPreparacionExpedicion(c.dao);
  let actor = c.senderistaA;
  async function traducir<T>(operacion: () => Promise<T>): Promise<T> {
    try { return await operacion(); }
    catch (error) {
      if (error instanceof ErrorAplicacion) throw new ErrorClienteApi(error.message, error.codigoEstado, error.codigo);
      throw error;
    }
  }
  const fuentes: FuentesEquipoExpedicion = {
    preparacion: {
      obtener: (id) => traducir(async () => respuestaPreparacion(await servicio.obtenerPreparacion(actor, id))),
      asociar: (id, listaId) => traducir(async () => respuestaPreparacion(await servicio.asociarLista(actor, id, listaId))!),
      establecerPreparado: (id, itemId, preparado) => traducir(async () =>
        respuestaPreparacion(await servicio.establecerPreparado(actor, id, itemId, preparado))!),
    },
    async obtenerExpedicion(id) {
      const expedicion = c.expediciones.get(id);
      if (!expedicion || expedicion.senderistaId !== actor) throw new ErrorClienteApi('Expedición no encontrada.', 404);
      return { id, lugarFin: 'Destino ficticio', estado: expedicion.estado };
    },
    async listarListas() {
      return [...c.listas.values()].filter((lista) => lista.senderistaId === actor)
        .map((lista) => ({ ...lista, items: lista.items.map((item) => ({ ...item })) }));
    },
  };
  return { ...c, fuentes, cambiarActor: (id: string) => { actor = id; } };
}
