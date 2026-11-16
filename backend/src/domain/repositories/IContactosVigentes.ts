export interface IContactosVigentes {
  /** Devuelve los ids que aún existen y pertenecen al senderista, en el orden recibido. */
  filtrarVigentes(senderistaId: string, idsContactos: readonly string[]): Promise<string[]>;
}
