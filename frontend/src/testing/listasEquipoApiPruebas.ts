import type { DatosListaEquipo, ListaEquipo, ListasEquipoApi } from '../services/listasEquipo';

/** Simula únicamente el contrato HTTP para las pruebas de React. */
export function apiEquipoEnMemoria(iniciales: ListaEquipo[] = []): ListasEquipoApi {
  const listas = new Map(iniciales.map((lista) => [lista.id, structuredClone(lista)]));
  function materializar(datos: DatosListaEquipo, anterior?: ListaEquipo): ListaEquipo {
    return {
      id: anterior?.id ?? crypto.randomUUID(), senderistaId: 'senderista-pruebas', nombre: datos.nombre,
      items: datos.items.map((item) => ({ ...item, id: item.id ?? crypto.randomUUID() })),
      creadoEn: anterior?.creadoEn ?? '2026-11-01T12:00:00Z', actualizadoEn: '2026-11-01T12:00:00Z',
    };
  }
  return {
    async listar() { return structuredClone([...listas.values()]); },
    async obtener(id) {
      const lista = listas.get(id);
      if (!lista) throw new Error('Lista no encontrada.');
      return structuredClone(lista);
    },
    async crear(datos) {
      const lista = materializar(datos);
      listas.set(lista.id, lista);
      return structuredClone(lista);
    },
    async actualizar(id, datos) {
      const anterior = listas.get(id);
      if (!anterior) throw new Error('Lista no encontrada.');
      const lista = materializar(datos, anterior);
      listas.set(id, lista);
      return structuredClone(lista);
    },
    async eliminar(id) { listas.delete(id); },
  };
}

export function promesaPendiente<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (error: Error) => void;
  const promesa = new Promise<T>((resolve, reject) => { resolver = resolve; rechazar = reject; });
  return { promesa, resolver, rechazar };
}
