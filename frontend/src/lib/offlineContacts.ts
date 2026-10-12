import { readOfflineJson, writeOfflineJson } from '@/lib/offlineStorage';

const CACHE_KEY = 'contacts-cache';

export type ContactoCacheado = {
  id: string;
  nombreCompleto: string;
  parentesco: string;
  telefono: string;
  correoElectronico: string;
};

export async function cachearContactos(contactos: ContactoCacheado[]): Promise<void> {
  await writeOfflineJson(CACHE_KEY, contactos);
}

export async function obtenerContactosCacheados(): Promise<ContactoCacheado[]> {
  const parsed = await readOfflineJson<ContactoCacheado[]>(CACHE_KEY, [], ['treksafe:contacts-cache']);
  return Array.isArray(parsed) ? parsed : [];
}
