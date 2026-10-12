export type ModoTema = 'light' | 'dark' | 'system';

const CLAVE_ALMACENAMIENTO = 'treksafe:tema';

export function readStoredThemeMode(): ModoTema {
  try {
    const stored = localStorage.getItem(CLAVE_ALMACENAMIENTO);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    // Migrate from old key
    const legacy = localStorage.getItem('treksafe-theme');
    if (legacy === 'light' || legacy === 'dark' || legacy === 'system') {
      localStorage.setItem(CLAVE_ALMACENAMIENTO, legacy);
      localStorage.removeItem('treksafe-theme');
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return 'system';
}

export function resolveThemeMode(mode: ModoTema): 'light' | 'dark' {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyResolvedTheme(resolved: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#0c1410' : '#16a34a');
  }
}

export function initThemeBeforeRender(): void {
  applyResolvedTheme(resolveThemeMode(readStoredThemeMode()));
}
