import { Navigate, useLocation } from 'react-router-dom';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  rol?: 'senderista' | 'rescatista';
};

export function RutaProtegida({ children, rol }: Props) {
  const { estaAutenticado, usuario } = useAutenticacion();
  const location = useLocation();

  if (!estaAutenticado || !usuario) {
    return <Navigate to="/iniciar-sesion" state={{ from: location }} replace />;
  }

  if (rol && usuario.rol !== rol) {
    return <Navigate to={usuario.rol === 'rescatista' ? '/rescatista' : '/senderista'} replace />;
  }

  return children;
}
