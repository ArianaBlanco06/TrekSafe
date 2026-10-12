import { Link } from 'react-router-dom';
import { ChevronRight, Heart, Map, Phone, Shield } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAutenticacion } from '@/context/ContextoAutenticacion';

export function PaginaPerfilSenderista() {
  const { usuario } = useAutenticacion();

  return (
    <div className="px-6 py-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold">Perfil</h2>
        <p className="text-sm text-muted-foreground mt-1">{usuario?.correoElectronico}</p>
      </div>

      <div className="space-y-3">
        <ThemeToggle />

        <Link
          to="/senderista/perfil/medica"
          className="flex items-center justify-between bg-card border border-border rounded-2xl p-4"
        >
          <div className="flex items-center gap-3">
            <Heart size={20} className="text-primary" />
            <span className="font-medium">Ficha médica</span>
          </div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </Link>

        <Link
          to="/senderista/perfil/contactos"
          className="flex items-center justify-between bg-card border border-border rounded-2xl p-4"
        >
          <div className="flex items-center gap-3">
            <Phone size={20} className="text-primary" />
            <span className="font-medium">Contactos de emergencia</span>
          </div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </Link>

        <Link
          to="/senderista/perfil/historial"
          className="flex items-center justify-between bg-card border border-border rounded-2xl p-4"
        >
          <div className="flex items-center gap-3">
            <Map size={20} className="text-primary" />
            <span className="font-medium">Historial de expediciones</span>
          </div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </Link>

        <Link
          to="/senderista/perfil/privacidad"
          className="flex items-center justify-between bg-card border border-border rounded-2xl p-4"
        >
          <div className="flex items-center gap-3">
            <Shield size={20} className="text-primary" />
            <span className="font-medium">Privacidad y datos (ARCO)</span>
          </div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}
