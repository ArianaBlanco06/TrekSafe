import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Home, Map, User, LogOut } from 'lucide-react';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import { MobileShell } from '@/components/Layout';
import { BannerOffline } from '@/components/BannerOffline';
import { AnfitrionRecordatorioSenderista } from '@/components/AnfitrionRecordatorioSenderista';
import { obtenerExpedicionActiva } from '@/services/expedicion';
import { contarAvisosNoLeidos } from '@/services/avisos';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center gap-0.5 text-xs font-medium ${
    isActive ? 'text-primary' : 'text-muted-foreground'
  }`;

function ExpeditionNavLink() {
  const [to, setTo] = useState('/senderista/expedicion');
  const location = useLocation();

  useEffect(() => {
    obtenerExpedicionActiva()
      .then((r) => {
        setTo(r.expedicion ? '/senderista/expedicion/activa' : '/senderista/expedicion');
      })
      .catch(() => undefined);
  }, [location.pathname]);

  return (
    <NavLink to={to} className={navClass}>
      <Map size={22} />
      Expedición
    </NavLink>
  );
}

function BotonAvisos() {
  const [noLeidos, setNoLeidos] = useState(0);
  const location = useLocation();

  useEffect(() => {
    contarAvisosNoLeidos()
      .then((r) => setNoLeidos(r.datos.totalNoLeidos))
      .catch(() => undefined);
  }, [location.pathname]);

  return (
    <Link to="/senderista/avisos" aria-label={`Avisos, ${noLeidos} sin leer`} className="btn-touch relative">
      <Bell size={20} className="text-muted-foreground" />
      {noLeidos > 0 && (
        <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] rounded-full px-1.5">
          {noLeidos}
        </span>
      )}
    </Link>
  );
}

export function SenderistaLayout() {
  const { logout } = useAutenticacion();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/iniciar-sesion');
  };

  return (
    <MobileShell>
      <div className="min-h-screen flex flex-col pb-20">
        <header className="px-6 py-4 flex items-center justify-between border-b border-border">
          <h1 className="text-lg font-bold">TrekSafe</h1>
          <div className="flex items-center gap-2">
            <BotonAvisos />
            <button type="button" onClick={handleLogout} aria-label="Cerrar sesión" className="btn-touch">
              <LogOut size={20} className="text-muted-foreground" />
            </button>
          </div>
        </header>

        <BannerOffline />

        <main className="flex-1">
          <Outlet />
        </main>

        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm bg-card border-t border-border px-8 py-3 flex justify-between">
          <NavLink to="/senderista" end className={navClass}>
            <Home size={22} />
            Inicio
          </NavLink>
          <ExpeditionNavLink />
          <NavLink to="/senderista/perfil" className={navClass}>
            <User size={22} />
            Perfil
          </NavLink>
        </nav>

        <AnfitrionRecordatorioSenderista />
      </div>
    </MobileShell>
  );
}
