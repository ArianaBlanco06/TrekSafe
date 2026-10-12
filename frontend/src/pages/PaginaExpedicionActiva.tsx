import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  Clock,
  MapPin,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { DialogoConfirmarRetorno } from '@/components/DialogoConfirmarRetorno';
import { useCuentaRegresiva } from '@/hooks/useCuentaRegresiva';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';
import { clearReminderDismissal } from '@/lib/recordatorioRetorno';
import { obtenerExpedicionActiva, type ExpedicionActiva } from '@/services/expedicion';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PaginaExpedicionActiva() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const enLinea = useEstadoEnLinea();
  const [expedicion, setExpedicion] = useState<ExpedicionActiva | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [checkInAbierto, setCheckInAbierto] = useState(false);
  const [bannerDescartado, setBannerDescartado] = useState(false);

  const cuentaRegresiva = useCuentaRegresiva(expedicion?.fechaLimite, expedicion?.horaInicio);

  useEffect(() => {
    if (searchParams.get('checkIn') === '1') {
      setCheckInAbierto(true);
    }
  }, [searchParams]);

  const cargarActiva = () => {
    obtenerExpedicionActiva()
      .then((r) => setExpedicion(r.expedicion))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargarActiva();
    const poll = setInterval(() => {
      obtenerExpedicionActiva()
        .then((r) => setExpedicion(r.expedicion))
        .catch(() => undefined);
    }, 30_000);
    return () => clearInterval(poll);
  }, []);

  const handleRetornoConfirmado = (confirmadoEn: string) => {
    if (expedicion) clearReminderDismissal(expedicion.id);
    setCheckInAbierto(false);
    navigate('/senderista/expedicion/confirmada', {
      state: {
        lugarFin: expedicion?.lugarFin,
        confirmadoEn,
      },
    });
  };

  if (cargando) {
    return (
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">Cargando expedición…</div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-6">
        <div className="error-banner mb-4">{error}</div>
        <Link to="/senderista/expedicion" className="text-sm text-primary font-semibold">
          Volver al listado
        </Link>
      </div>
    );
  }

  if (!expedicion) {
    return (
      <div className="px-6 py-6">
        <Link to="/senderista" className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
          <ChevronLeft size={16} /> Inicio
        </Link>
        <h2 className="text-xl font-bold mb-2">Sin expedición activa</h2>
        <p className="text-sm text-muted-foreground mb-6">
          No tienes una ruta en curso. Registra una nueva expedición o revisa las programadas.
        </p>
        <div className="space-y-3">
          <Link to="/senderista/expedicion/nueva" className="btn-primary block text-center">
            Nueva expedición
          </Link>
          <Link
            to="/senderista/expedicion"
            className="block text-center py-3 text-sm font-semibold text-primary"
          >
            Ver mis expediciones
          </Link>
        </div>
      </div>
    );
  }

  const esAlerta = expedicion.estado === 'alerta';

  const timerBg = esAlerta
    ? 'bg-destructive'
    : cuentaRegresiva.vencida
      ? 'bg-destructive'
      : cuentaRegresiva.esUrgente
        ? 'bg-amber-500'
        : 'bg-secondary';

  return (
    <div className="px-6 py-6 pb-8">
      {esAlerta && (
        <div className="error-banner mb-4 flex items-start gap-2" role="alert">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>Alerta activa.</strong> Tus contactos y rescatistas fueron notificados. Confirma
            tu retorno en cuanto estés a salvo.
          </span>
        </div>
      )}

      {cuentaRegresiva.esUrgente && !cuentaRegresiva.vencida && !esAlerta && !bannerDescartado && (
        <div className="urgent-banner -mx-6 -mt-6 mb-4 flex items-center gap-3 px-5 py-3">
          <AlertTriangle size={18} className="flex-shrink-0" />
          <p className="text-sm font-semibold flex-1">
            Faltan {cuentaRegresiva.horas * 60 + cuentaRegresiva.minutos} min para tu límite — confirma retorno
          </p>
          <button
            type="button"
            onClick={() => setBannerDescartado(true)}
            className="btn-touch opacity-70 hover:opacity-100"
            aria-label="Cerrar aviso"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <Link to="/senderista" className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
        <ChevronLeft size={16} /> Inicio
      </Link>

      <p className="text-xs text-muted-foreground uppercase tracking-wide">
        {esAlerta ? 'Expedición en alerta' : 'Expedición activa'}
      </p>
      <h2 className="text-xl font-bold mb-5 leading-tight">{expedicion.lugarFin}</h2>

      {cuentaRegresiva.vencida && !esAlerta && (
        <div className="error-banner mb-4 flex items-start gap-2">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <span>Plazo vencido. El sistema puede escalar tu expedición a alerta automáticamente.</span>
        </div>
      )}

      <div className={`${timerBg} rounded-3xl px-6 py-8 text-center mb-5`} aria-live="polite">
        <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-4">
          {esAlerta || cuentaRegresiva.vencida ? 'Plazo vencido' : 'Tiempo restante'}
        </p>
        <div className="flex items-end justify-center gap-1 mb-6">
          <span className="font-extrabold text-6xl text-white leading-none">
            {String(cuentaRegresiva.horas).padStart(2, '0')}
          </span>
          <span className="font-medium text-2xl text-white/40 mb-2">h</span>
          <span className="font-extrabold text-6xl text-white leading-none mx-1">
            {String(cuentaRegresiva.minutos).padStart(2, '0')}
          </span>
          <span className="font-medium text-2xl text-white/40 mb-2">m</span>
          <span className="font-extrabold text-6xl text-white leading-none">
            {String(cuentaRegresiva.segundos).padStart(2, '0')}
          </span>
          <span className="font-medium text-2xl text-white/40 mb-2">s</span>
        </div>
        <div className="h-1.5 bg-white/15 rounded-full overflow-hidden mb-2.5">
          <div
            className="h-full bg-primary rounded-full transition-all duration-1000"
            style={{ width: `${cuentaRegresiva.progresoPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-white/40">
          <span>Salida {formatTime(expedicion.horaInicio)}</span>
          <span>Límite {formatTime(expedicion.fechaLimite)}</span>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border divide-y divide-border mb-4">
        {[
          { Icon: MapPin, label: 'Inicio', value: expedicion.lugarInicio },
          { Icon: MapPin, label: 'Destino', value: expedicion.lugarFin },
          { Icon: Clock, label: 'Retorno estimado', value: formatTime(expedicion.horaRetornoEstimada) },
          {
            Icon: Users,
            label: 'Participantes',
            value: `${expedicion.cantidadAcompanantes + 1} personas`,
          },
          { Icon: Activity, label: 'Tolerancia', value: `${expedicion.minutosTolerancia} min` },
          {
            Icon: Shield,
            label: 'Contactos protegidos',
            value: `${expedicion.cantidadContactos} contactos`,
          },
        ].map(({ Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3">
            <Icon size={14} className="text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground w-28 flex-shrink-0">{label}</span>
            <span className="text-sm font-medium flex-1">{value}</span>
          </div>
        ))}
      </div>

      {expedicion.acompanantes.length > 0 && (
        <div className="bg-muted rounded-2xl p-4 mb-4 text-sm">
          <p className="font-semibold mb-1">Cordada</p>
          <p className="text-muted-foreground">{expedicion.acompanantes.join(', ')}</p>
        </div>
      )}

      <div
        className={`rounded-2xl p-4 mb-5 border ${
          esAlerta
            ? 'bg-destructive/5 border-destructive/30'
            : 'bg-primary/5 border-primary/20'
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <Shield size={15} className={esAlerta ? 'text-destructive' : 'text-primary'} />
          <span className={`text-sm font-bold ${esAlerta ? 'text-destructive' : 'text-primary'}`}>
            {esAlerta ? 'Alerta de seguridad activa' : 'Monitoreo activo'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {esAlerta
            ? 'El equipo de rescate tiene acceso a tu ficha. Confirma retorno para cerrar la alerta.'
            : 'Tus contactos serán notificados si no confirmas tu retorno antes del límite declarado.'}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setCheckInAbierto(true)}
        disabled={!enLinea}
        className="w-full py-4 bg-primary text-primary-foreground font-semibold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-primary/30 text-lg disabled:opacity-50"
      >
        <CheckCircle size={22} />
        {enLinea ? 'Registrar retorno seguro' : 'Sin red — no se puede confirmar'}
      </button>

      {!enLinea && (
        <p className="text-xs text-center text-muted-foreground mt-2">
          El check-in de retorno necesita conexión para avisar a contactos y rescatistas.
        </p>
      )}

      <DialogoConfirmarRetorno
        expedicionId={expedicion.id}
        open={checkInAbierto}
        onClose={() => setCheckInAbierto(false)}
        onSuccess={handleRetornoConfirmado}
        enLinea={enLinea}
      />
    </div>
  );
}
