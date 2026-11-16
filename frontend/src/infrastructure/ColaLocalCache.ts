import type { BorradorExpedicion, DatosBorrador, IColaLocal } from '@/application/ports/IColaLocal';
import { getSessionScope, getSessionUser } from '@/lib/sesion';
import { readOfflineJson } from '@/lib/offlineStorage';
import { generarUuid } from '@/lib/uuid';

const pendientes = new Map<string, Promise<unknown>>();
async function serializar<T>(clave: string, tarea: () => Promise<T>): Promise<T> {
  const anterior = pendientes.get(clave) ?? Promise.resolve();
  const siguiente = anterior.catch(() => undefined).then(async () => {
    if (typeof navigator !== 'undefined' && navigator.locks) return await navigator.locks.request(clave, tarea);
    return await tarea();
  });
  pendientes.set(clave, siguiente);
  try { return await siguiente; }
  finally { if (pendientes.get(clave) === siguiente) pendientes.delete(clave); }
}

/** Cache API Adapter: una sola clave autorizada, propietario fijo y guardia de sesión. */
export class ColaLocalCache implements IColaLocal {
  private readonly usuarioId = getSessionUser()?.id;
  constructor(private readonly scope = getSessionScope()) {}
  private vigente() { return !!this.scope && this.scope === getSessionScope() && this.usuarioId === getSessionUser()?.id; }
  private comprobar() { if (!this.vigente()) throw new Error('La sesión cambió. Vuelve a abrir tus borradores.'); }
  private get nombre() { return `treksafe-offline-v2-cola-${this.usuarioId}`; }
  private get claveLocal() { return `treksafe:offline-v2:cola:${this.usuarioId}:expedition-drafts`; }
  private get url() { return new URL('/__treksafe_offline__/expedition-drafts', location.origin).href; }
  private async leer(): Promise<BorradorExpedicion[]> {
    this.comprobar();
    let datos: unknown;
    if (typeof caches !== 'undefined') {
      const respuesta = await caches.match(this.url, { cacheName: this.nombre });
      datos = respuesta ? await respuesta.json() : null;
    } else {
      const raw = localStorage.getItem(this.claveLocal);
      datos = raw ? JSON.parse(raw) : null;
    }
    // Compatibilidad con borradores anteriores de la misma sesión (sin importar legacy sin propietario).
    const anterior = datos === null;
    if (anterior) datos = await readOfflineJson('expedition-drafts', [], this.scope);
    this.comprobar();
    if (!Array.isArray(datos)) throw new Error('No se pudo leer la cola de borradores.');
    const borradores = datos.map((entrada: BorradorExpedicion) => {
      if (!entrada || typeof entrada.id !== 'string' || typeof entrada.guardadoEn !== 'string'
        || !['lugarInicio','lugarFin','coordenadasInicio','coordenadasFin','horaInicio','horaRetornoEstimada']
          .every(clave => typeof entrada[clave as keyof BorradorExpedicion] === 'string')
        || typeof entrada.minutosTolerancia !== 'number'
        || !Array.isArray(entrada.idsContactos) || !entrada.idsContactos.every(id => typeof id === 'string')
        || !Array.isArray(entrada.nombresAcompanantes) || !entrada.nombresAcompanantes.every(nombre => typeof nombre === 'string')
        || (entrada.estado !== undefined && !['pendiente','error','sincronizado'].includes(entrada.estado))) {
        throw new Error('La cola contiene un borrador que no se pudo leer.');
      }
      return { ...entrada, estado: entrada.estado ?? 'pendiente', minutosRecordatorio: entrada.minutosRecordatorio ?? 30 };
    });
    if (anterior && borradores.length > 0) await this.escribir(borradores);
    return borradores;
  }
  private async escribir(datos: BorradorExpedicion[]) {
    this.comprobar();
    const contenido = JSON.stringify(datos);
    if (typeof caches === 'undefined') {
      localStorage.setItem(this.claveLocal, contenido);
      return;
    }
    const cache = await caches.open(this.nombre);
    if (!this.vigente()) await caches.delete(this.nombre);
    this.comprobar();
    await cache.put(this.url, new Response(contenido, { headers: {
      'Content-Type': 'application/json', 'X-TrekSafe-Sesion': this.scope!,
    } }));
    if (!this.vigente()) {
      const respuesta = await cache.match(this.url);
      if (respuesta?.headers.get('X-TrekSafe-Sesion') === this.scope) await cache.delete(this.url);
      await caches.delete(this.nombre);
      this.comprobar();
    }
  }
  listar() {
    if (!this.vigente()) return Promise.resolve([]);
    return serializar(this.nombre, async () => (await this.leer()).sort((a,b) => b.guardadoEn.localeCompare(a.guardadoEn)));
  }
  insertar(datos: DatosBorrador) {
    return serializar(this.nombre, async () => {
      const lista = await this.leer();
      if (lista.length >= 50) throw new Error('La cola está llena. Descarta borradores que ya no necesites antes de guardar otro.');
      const entrada: BorradorExpedicion = { ...structuredClone(datos), id: generarUuid(), guardadoEn: new Date().toISOString(), estado: 'pendiente' };
      await this.escribir([entrada,...lista]);
      return entrada;
    });
  }
  actualizar(id: string, modificar: (actual: BorradorExpedicion) => BorradorExpedicion) {
    return serializar(this.nombre, async () => {
      const lista = await this.leer(); const indice = lista.findIndex(b => b.id === id);
      if (indice < 0) throw new Error('El borrador ya no está en la cola.');
      const entrada = modificar(structuredClone(lista[indice]));
      if (entrada.id !== id) throw new Error('No se puede cambiar el identificador del borrador.');
      lista[indice] = entrada; await this.escribir(lista); return entrada;
    });
  }
  eliminar(id: string) {
    return serializar(this.nombre, async () => this.escribir((await this.leer()).filter(b => b.id !== id)));
  }
}
