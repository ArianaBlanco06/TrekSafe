/** Parte de la API Web Crypto que usa el generador; permite inyectarla en las pruebas. */
export type CriptoUuid = {
  randomUUID?: () => string;
  getRandomValues?: (arreglo: Uint8Array) => Uint8Array;
};

/**
 * UUID v4 para identificar operaciones (`operacionId`).
 *
 * Usa `crypto.randomUUID()` cuando existe. Fuera de un contexto seguro (por ejemplo, la
 * aplicación abierta por HTTP en la red local) esa función no está disponible, así que
 * se arma el UUID con `crypto.getRandomValues`. Nunca se usa `Math.random`: si el navegador
 * no ofrece ninguna de las dos, falla en lugar de generar un identificador predecible.
 */
export function generarUuid(cripto: CriptoUuid | undefined = globalThis.crypto): string {
  if (typeof cripto?.randomUUID === 'function') return cripto.randomUUID();

  if (typeof cripto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cripto.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40; // versión 4
    bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variante RFC 4122
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  throw new Error('Este navegador no puede generar identificadores seguros.');
}
