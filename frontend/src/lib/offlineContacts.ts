import { getSessionScope } from './sesion';

export type ContactoCacheado = {
  id: string;
  nombreCompleto: string;
  parentesco: string;
  telefono: string;
  correoElectronico: string;
};

let memoria: { scope: string; contactos: ContactoCacheado[] } | null = null;

// Apoyo al formulario abierto al perder red. No escribe Cache/Local Storage.
export async function cachearContactos(contactos: ContactoCacheado[], scope = getSessionScope()): Promise<void> {
  if (scope && scope === getSessionScope()) memoria = { scope, contactos: structuredClone(contactos) };
}

export async function obtenerContactosCacheados(): Promise<ContactoCacheado[]> {
  if (!memoria || memoria.scope !== getSessionScope()) return [];
  return structuredClone(memoria.contactos);
}

export function vaciarContactosEnMemoria(): void { memoria = null; }
