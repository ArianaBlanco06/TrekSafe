import type { IContactosVigentes } from '../../../domain/repositories/IContactosVigentes.js';

/** Doble de prueba: contactos vigentes por senderista, mantenidos en memoria. */
export class ContactosVigentesMemoria implements IContactosVigentes {
  private readonly porSenderista = new Map<string, Set<string>>();

  agregar(senderistaId: string, ...ids: string[]): void {
    const conjunto = this.porSenderista.get(senderistaId) ?? new Set<string>();
    ids.forEach((id) => conjunto.add(id));
    this.porSenderista.set(senderistaId, conjunto);
  }

  quitar(senderistaId: string, id: string): void {
    this.porSenderista.get(senderistaId)?.delete(id);
  }

  async filtrarVigentes(senderistaId: string, idsContactos: readonly string[]): Promise<string[]> {
    const vigentes = this.porSenderista.get(senderistaId);
    return idsContactos.filter((id) => vigentes?.has(id) ?? false);
  }
}
