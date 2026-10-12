import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applyResolvedTheme,
  readStoredThemeMode,
  resolveThemeMode,
  type ModoTema,
} from '@/lib/tema';

const CLAVE_ALMACENAMIENTO = 'treksafe:tema';

type ValorContextoTema = {
  mode: ModoTema;
  resolved: 'light' | 'dark';
  setMode: (mode: ModoTema) => void;
  toggleDark: () => void;
};

const ContextoTema = createContext<ValorContextoTema | null>(null);

export type { ModoTema };
export type { ModoTema as ThemeMode };

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ModoTema>(() => readStoredThemeMode());
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    typeof window !== 'undefined' ? resolveThemeMode(readStoredThemeMode()) : 'light',
  );

  const setMode = useCallback((next: ModoTema) => {
    setModeState(next);
    localStorage.setItem(CLAVE_ALMACENAMIENTO, next);
  }, []);

  const toggleDark = useCallback(() => {
    setMode(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setMode]);

  useEffect(() => {
    const next = resolveThemeMode(mode);
    setResolved(next);
    applyResolvedTheme(next);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = resolveThemeMode('system');
      setResolved(next);
      applyResolvedTheme(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const value = useMemo(
    () => ({ mode, resolved, setMode, toggleDark }),
    [mode, resolved, setMode, toggleDark],
  );

  return <ContextoTema.Provider value={value}>{children}</ContextoTema.Provider>;
}

export function useTheme() {
  const ctx = useContext(ContextoTema);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
}
