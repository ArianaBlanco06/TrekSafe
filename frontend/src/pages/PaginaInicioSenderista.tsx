import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Heart, Phone, MapPin, Plus } from 'lucide-react';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import { obtenerExpedicionActiva, type ExpedicionActiva } from '@/services/expedicion';

export function PaginaInicioSenderista() {
  const { usuario } = useAutenticacion();
  const [activa, setActiva] = useState<ExpedicionActiva | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = () => {
    setError('');
    setCargando(true);
    obtenerExpedicionActiva()
      .then((r) => setActiva(r.expedicion))
      .catch((e) => {
        setActiva(null);
        setError(e instanceof Error ? e.message : 'No se pudo cargar la expedición');
      })
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargar();
  }, []);

  const saludo = usuario?.nombreCompleto?.trim() || usuario?.correoElectronico;

  return (
    <div className="px-6 py-6 space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Bienvenido</p>
        <p className="font-semibold text-lg">{saludo}</p>
      </div>

      {error && (
        <div className="error-banner">
          {error}{' '}
          <button type="button" onClick={cargar} className="underline font-semibold ml-1">
            Reintentar
          </button>
        </div>
      )}

      {cargando ? (
        <div className="bg-muted/60 border border-border rounded-2xl p-4 animate-pulse">
          <div className="h-3 w-28 bg-muted-foreground/20 rounded mb-3" />
          <div className="h-5 w-40 bg-muted-foreground/20 rounded mb-2" />
          <div className="h-3 w-48 bg-muted-foreground/20 rounded" />
        </div>
      ) : activa ? (
        <Link
          to="/senderista/expedicion/activa"
          className={`block rounded-2xl p-4 transition-colors ${
            activa.estado === 'alerta'
              ? 'bg-destructive/5 border border-destructive/20 hover:bg-destructive/10'
              : 'bg-primary/5 border border-primary/20 hover:bg-primary/10'
          }`}
        >
          <p
            className={`text-xs font-bold uppercase mb-1 ${
              activa.estado === 'alerta' ? 'text-destructive' : 'text-primary'
            }`}
          >
            {activa.estado === 'alerta' ? 'Alerta activa — sin check-in' : 'Expedición activa'}
          </p>
          <p className="font-semibold">{activa.lugarFin}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Límite: {new Date(activa.fechaLimite).toLocaleString('es-PE')}
          </p>
          <p
            className={`text-sm font-semibold mt-3 flex items-center gap-1 ${
              activa.estado === 'alerta' ? 'text-destructive' : 'text-primary'
            }`}
          >
            Ver expedición <ChevronRight size={16} />
          </p>
        </Link>
      ) : (
        <div className="bg-muted rounded-2xl p-4 text-sm text-muted-foreground">
          No tienes expediciones en curso. Registra tu próxima ruta.
        </div>
      )}

      <div className="grid gap-3">
        <Link
          to="/senderista/expedicion/nueva"
          className="flex items-center gap-3 bg-primary text-primary-foreground rounded-2xl p-4 min-h-[56px] font-semibold text-base"
        >
          <Plus size={20} />
          Nueva expedición
        </Link>

        <Link
          to="/senderista/perfil/medica"
          className="flex items-center gap-3 bg-card border border-border rounded-2xl p-4 min-h-[52px]"
        >
          <Heart size={20} className="text-primary" />
          Ficha médica
        </Link>

        <Link
          to="/senderista/perfil/contactos"
          className="flex items-center gap-3 bg-card border border-border rounded-2xl p-4"
        >
          <Phone size={20} className="text-primary" />
          Contactos de emergencia
        </Link>

        <Link
          to="/senderista/expedicion"
          className="flex items-center gap-3 bg-card border border-border rounded-2xl p-4"
        >
          <MapPin size={20} className="text-primary" />
          Mis expediciones
        </Link>
      </div>
    </div>
  );
}
