import type { DatosListaEquipo, ListaEquipo } from '../services/listasEquipo.ts';

export type ItemEquipoFormulario = {
  claveLocal: string;
  id?: string;
  nombre: string;
  obligatorio: boolean;
};
export type BorradorListaEquipo = { nombre: string; items: ItemEquipoFormulario[] };
export type ErroresListaEquipo = { nombre?: string; items: Record<string, string> };

export function nuevoItemEquipo(): ItemEquipoFormulario {
  return { claveLocal: crypto.randomUUID(), nombre: '', obligatorio: false };
}

export function crearBorradorListaEquipo(lista?: ListaEquipo): BorradorListaEquipo {
  return {
    nombre: lista?.nombre ?? '',
    items: lista?.items.map((item) => ({ ...item, claveLocal: crypto.randomUUID() })) ?? [],
  };
}

/** Validación inmediata del formulario; el servidor conserva la autoridad de las reglas. */
export function validarBorradorListaEquipo(borrador: BorradorListaEquipo): ErroresListaEquipo {
  const errores: ErroresListaEquipo = { items: {} };
  if (!borrador.nombre.trim()) errores.nombre = 'Escribe un nombre para la lista.';
  for (const item of borrador.items) {
    if (!item.nombre.trim()) errores.items[item.claveLocal] = 'Escribe el nombre del ítem o quítalo.';
  }
  return errores;
}

/** Envía solo el contrato HTTP; las claves de React nunca se convierten en ids guardados. */
export function datosListaEquipo(borrador: BorradorListaEquipo): DatosListaEquipo {
  return {
    nombre: borrador.nombre.trim(),
    items: borrador.items.map((item) => ({
      ...(item.id === undefined ? {} : { id: item.id }),
      nombre: item.nombre.trim(),
      obligatorio: item.obligatorio,
    })),
  };
}
