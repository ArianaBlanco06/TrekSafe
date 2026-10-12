import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { AlertTriangle, History, LogOut, Navigation, Shield } from 'lucide-react';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import { MobileShell } from '@/components/Layout';
import { BannerOffline } from '@/components/BannerOffline';
import { ThemeToggle } from '@/components/ThemeToggle';
import { obtenerAlertasRescate } from '@/services/rescate';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex flex-col items-center gap-0.5 text-xs font-medium ${
    isActive ? 'text-secondary' : 'text-muted-foreground'
  }`;

export function RescatistaLayout() {
  const { usuario, logout } = useAutenticacion();
  const navigate = useNavigate();
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    const cargar = () => {
      obtenerAlertasRescate()
        .then((r) => setPendientes(r.alertas.filter((a) => !a.confirmadoPorMi).length))
        .catch(() => undefined);
    };
    cargar();
    const poll = setInterval(cargar, 30_000);
    return () => clearInterval(poll);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/iniciar-sesion');
  };

  return (
    <MobileShell>
      <div className="min-h-screen flex flex-col pb-20">
        <header className="px-6 py-4 flex items-center justify-between border-b border-border bg-secondary text-secondary-foreground">
          <div className="flex items-center gap-2">
            <Shield size={22} className="text-primary" />
            <div>
              <h1 className="text-lg font-bold leading-tight">Consola de Rescate</h1>
              <p className="text-xs opacity-70">
                {usuario?.nombreCompleto?.trim() || usuario?.correoElectronico}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle compact />
            <button type="button" onClick={handleLogout} aria-label="Cerrar sesión" className="btn-touch">
              <LogOut size={20} className="opacity-70" />
            </button>
          </div>
        </header>

        <BannerOffline />

        <main className="flex-1">
          <Outlet />
        </main>

        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm bg-card border-t border-border px-6 py-3 flex justify-between">
          <NavLink to="/rescatista/consola" className={navClass}>
            <Navigation size={22} />
            Consola
          </NavLink>
          <NavLink to="/rescatista/alertas" className={navClass}>
            <span className="relative">
              <AlertTriangle size={22} />
              {pendientes > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {pendientes > 9 ? '9+' : pendientes}
                </span>
              )}
            </span>
            Alertas
          </NavLink>
          <NavLink to="/rescatista/historial" className={navClass}>
            <History size={22} />
            Historial
          </NavLink>
        </nav>
      </div>
    </MobileShell>
  );
}
