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

type ValorContextoAuth = {
  usuario: UsuarioSesion | null;
  estaAutenticado: boolean;
  loginSession: (token: string, usuario: UsuarioSesion) => void;
  logout: () => void;
};

const ContextoAuth = createContext<ValorContextoAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(() => getSessionUser());

  const loginSession = useCallback((token: string, usuarioSesion: UsuarioSesion) => {
    guardarSesion(token, usuarioSesion);
    setUsuario(usuarioSesion);
  }, []);

  const logout = useCallback(() => {
    limpiarSesion();
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
