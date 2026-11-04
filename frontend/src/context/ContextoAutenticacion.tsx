import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { setUnauthorizedHandler } from '@/lib/eventosAuth';
import { limpiarSesion, getSessionUser, guardarSesion, type UsuarioSesion } from '@/lib/sesion';
import { vaciarContactosEnMemoria } from '@/lib/offlineContacts';

type ValorContextoAuth = {
  usuario: UsuarioSesion | null;
  estaAutenticado: boolean;
  loginSession: (token: string, usuario: UsuarioSesion) => Promise<void>;
  logout: () => void;
};

const ContextoAuth = createContext<ValorContextoAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(() => getSessionUser());

  const loginSession = useCallback(async (token: string, usuarioSesion: UsuarioSesion) => {
    // Invalidar primero impide aceptar respuestas pendientes de otra cuenta
    // mientras se eliminan sus datos persistidos.
    const limpieza = limpiarSesion();
    vaciarContactosEnMemoria();
    setUsuario(null);
    try { await limpieza; }
    catch { throw new Error('No se pudieron limpiar los datos locales. Reintenta el inicio de sesión.'); }
    guardarSesion(token, usuarioSesion);
    setUsuario(usuarioSesion);
  }, []);

  const logout = useCallback(() => {
    void limpiarSesion().catch(() => console.error('No se pudo completar la limpieza local de la sesión.'));
    vaciarContactosEnMemoria();
    setUsuario(null);
  }, []);

  const value = useMemo(
    () => ({
      usuario,
      estaAutenticado: usuario !== null,
      loginSession,
      logout,
    }),
    [usuario, loginSession, logout],
  );

  return <ContextoAuth.Provider value={value}>{children}</ContextoAuth.Provider>;
}

export function AuthSessionBridge() {
  const { logout } = useAutenticacion();
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      navigate('/iniciar-sesion', { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [logout, navigate]);

  return null;
}

export function useAutenticacion(): ValorContextoAuth {
  const ctx = useContext(ContextoAuth);
  if (!ctx) throw new Error('useAutenticacion debe usarse dentro de AuthProvider');
  return ctx;
}
