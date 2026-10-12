/** Datos de aplicación persistidos en Cache API (Service Worker). */
const CACHE_NAME = 'treksafe-offline-v1';
const DATA_ORIGIN = 'https://treksafe.local';

function dataRequestUrl(key: string): string {
  return `${DATA_ORIGIN}/offline/${encodeURIComponent(key)}`;
}

function lsKey(key: string): string {
  return `treksafe:sw-fallback:${key}`;
}

function writeLocalFallback<T>(key: string, value: T): void {
  try {
    localStorage.setItem(lsKey(key), JSON.stringify(value));
  } catch {
    /* quota exceeded */
  }
}

export async function readOfflineJson<T>(
  key: string,
  fallback: T,
  legacyLocalKeys: string[] = [],
): Promise<T> {
  if (typeof caches === 'undefined') {
    return readLocalFallback(key, fallback, legacyLocalKeys);
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(dataRequestUrl(key));
    if (hit) {
      return (await hit.json()) as T;
    }

    const legacy = readLocalFallback(key, fallback, legacyLocalKeys);
    const hasLegacy = !isEmptyValue(legacy, fallback);

    if (hasLegacy) {
      await writeOfflineJson(key, legacy);
    }
    return legacy;
  } catch {
    return readLocalFallback(key, fallback, legacyLocalKeys);
  }
}

function isEmptyValue<T>(value: T, fallback: T): boolean {
  if (Array.isArray(value) && Array.isArray(fallback)) {
    return value.length === 0;
  }
  return value === fallback;
}

function readLocalFallback<T>(key: string, fallback: T, legacyLocalKeys: string[] = []): T {
  for (const legacyKey of legacyLocalKeys) {
    try {
      const raw = localStorage.getItem(legacyKey);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        localStorage.removeItem(legacyKey);
        void writeOfflineJson(key, parsed);
        return parsed;
      }
    } catch {
      /* siguiente clave */
    }
  }

  try {
    const raw = localStorage.getItem(lsKey(key));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeOfflineJson<T>(key: string, value: T): Promise<void> {
  writeLocalFallback(key, value);

  if (typeof caches === 'undefined') return;

  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      dataRequestUrl(key),
      new Response(JSON.stringify(value), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  } catch {
    /* SW no activo; localStorage ya guardó */
  }
}

export async function warmOfflineCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  await caches.open(CACHE_NAME);
}
