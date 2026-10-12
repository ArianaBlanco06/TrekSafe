import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Clock,
  MapPin,
  Phone,
  Search,
  User,
} from 'lucide-react';
import {
  obtenerExpedicionesRescate,
  type ExpedicionRescate,
  type NivelRiesgoRescate,
} from '@/services/rescate';
import type { PuntoMapaExpedicionRescate } from '@/components/maps/RescueExpeditionsMap';
import { RescueExpeditionsMapLazy } from '@/components/maps/RescueExpeditionsMapLazy';

const RIESGO_META: Record<
  NivelRiesgoRescate,
  { label: string; badge: string; card: string; dot: string }
> = {
  verde: {
    label: 'En plazo',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    card: 'border-emerald-500/30 bg-emerald-500/5',
    dot: 'bg-emerald-500',
  },
  amarillo: {
    label: 'Próximo al límite',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    card: 'border-amber-500/30 bg-amber-500/5',
    dot: 'bg-amber-500',
  },
  rojo: {
    label: 'Alerta activa',
    badge: 'bg-destructive/15 text-destructive',
    card: 'border-destructive/40 bg-destructive/5',
    dot: 'bg-destructive',
  },
};

function formatDt(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatearEstadoTiempo(exp: ExpedicionRescate): string {
  if (exp.nivelRiesgo === 'rojo') {
    if (exp.minutosExcedidos && exp.minutosExcedidos > 0) {
      const h = Math.floor(exp.minutosExcedidos / 60);
      const m = exp.minutosExcedidos % 60;
      return h > 0 ? `Vencido ${h}h ${m}m` : `Vencido ${m} min`;
    }
    return 'Plazo vencido';
  }
  if (exp.minutosRestantes != null) {
    const h = Math.floor(exp.minutosRestantes / 60);
    const m = exp.minutosRestantes % 60;
    return h > 0 ? `${h}h ${m}m restantes` : `${m} min restantes`;
  }
  return `Límite: ${formatDt(exp.fechaLimite)}`;
}

function elegirCoordenadas(exp: ExpedicionRescate): string | null {
  return exp.coordenadasInicio ?? exp.coordenadasFin ?? null;
}

function convertirAPuntosMapas(expediciones: ExpedicionRescate[]): PuntoMapaExpedicionRescate[] {
  return expediciones.flatMap((exp) => {
    const coordenadas = elegirCoordenadas(exp);
    if (!coordenadas) return [];
    return [
      {
        expedicionId: exp.expedicionId,
        label: exp.lugarFin,
        sublabel: exp.nombreCompletoSenderista,
        routeLabel: `${exp.lugarInicio} → ${exp.lugarFin}`,
        coordenadas,
        nivelRiesgo: exp.nivelRiesgo,
        alertHref:
          exp.nivelRiesgo === 'rojo' ? `/rescatista/alertas/${exp.expedicionId}` : undefined,
      },
    ];
  });
}

export function PaginaConsolaRescate() {
  const [expediciones, setExpediciones] = useState<ExpedicionRescate[]>([]);
  const [zonaInput, setZonaInput] = useState('');
  const [zonaAplicada, setZonaAplicada] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargarExpediciones = useCallback(() => {
    setError('');
    obtenerExpedicionesRescate(zonaAplicada || undefined)
      .then((r) => setExpediciones(r.expediciones))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar expediciones'))
      .finally(() => setCargando(false));
  }, [zonaAplicada]);

  useEffect(() => {
    setCargando(true);
    cargarExpediciones();
    const poll = setInterval(cargarExpediciones, 30_000);
    return () => clearInterval(poll);
  }, [cargarExpediciones]);

  const conteos = useMemo(
    () => ({
      verde: expediciones.filter((e) => e.nivelRiesgo === 'verde').length,
      amarillo: expediciones.filter((e) => e.nivelRiesgo === 'amarillo').length,
      rojo: expediciones.filter((e) => e.nivelRiesgo === 'rojo').length,
    }),
    [expediciones],
  );

  const puntosMapas = useMemo(() => convertirAPuntosMapas(expediciones), [expediciones]);

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault();
    setZonaAplicada(zonaInput.trim());
  };

  const handleLimpiarZona = () => {
    setZonaInput('');
    setZonaAplicada('');
  };

  return (
    <div className="px-6 py-6">
      <p className="text-sm text-muted-foreground mb-4">
        Monitoreo en tiempo real de expediciones en curso y alertas activas.
      </p>

      <form onSubmit={handleBuscar} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={zonaInput}
            onChange={(e) => setZonaInput(e.target.value)}
            placeholder="Filtrar por zona o destino…"
            className="input-field pl-9"
            aria-label="Filtrar por zona"
          />
        </div>
        <button type="submit" className="px-4 min-h-12 bg-secondary text-secondary-foreground rounded-xl text-sm font-semibold">
          Buscar
        </button>
      </form>

      {zonaAplicada && (
        <div className="flex items-center justify-between mb-4 text-xs">
          <span className="text-muted-foreground">
            Zona: <strong className="text-foreground">{zonaAplicada}</strong>
          </span>
          <button type="button" onClick={handleLimpiarZona} className="text-primary font-semibold">
            Limpiar
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mb-6">
        {(['verde', 'amarillo', 'rojo'] as const).map((nivel) => (
          <div
            key={nivel}
            className={`rounded-2xl border p-3 text-center ${RIESGO_META[nivel].card}`}
          >
            <div className={`w-2.5 h-2.5 rounded-full mx-auto mb-2 ${RIESGO_META[nivel].dot}`} />
            <p className="text-xl font-bold">{conteos[nivel]}</p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              {RIESGO_META[nivel].label}
            </p>
          </div>
        ))}
      </div>

      {!cargando && puntosMapas.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
            <MapPin size={14} /> Mapa de expediciones activas
          </h3>
          <RescueExpeditionsMapLazy expeditions={puntosMapas} />
        </div>
      )}

      {error && (
        <div className="error-banner mb-4">
          {error}{' '}
          <button type="button" onClick={cargarExpediciones} className="underline font-semibold ml-1">
            Reintentar
          </button>
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando expediciones…</p>
      ) : expediciones.length === 0 ? (
        <div className="bg-muted rounded-2xl p-5 text-sm text-muted-foreground">
          {zonaAplicada
            ? 'No hay expediciones activas en esa zona.'
            : 'No hay expediciones en curso ni alertas activas.'}
        </div>
      ) : (
        <div className="space-y-3">
          {expediciones.map((exp) => (
            <TarjetaExpedicion key={exp.expedicionId} expedicion={exp} />
          ))}
        </div>
      )}
    </div>
  );
}

function TarjetaExpedicion({ expedicion }: { expedicion: ExpedicionRescate }) {
  const meta = RIESGO_META[expedicion.nivelRiesgo];

  return (
    <article className={`border rounded-2xl p-4 ${meta.card}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${meta.dot}`} />
          <div className="min-w-0">
            <p className="font-semibold truncate">{expedicion.lugarFin}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <User size={12} /> {expedicion.nombreCompletoSenderista}
            </p>
          </div>
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0 ${meta.badge}`}>
          {meta.label}
        </span>
      </div>

      <div className="space-y-1.5 text-sm text-muted-foreground mb-3">
        <p className="flex items-center gap-2">
          <MapPin size={14} className="flex-shrink-0" />
          <span className="truncate">
            {expedicion.lugarInicio} → {expedicion.lugarFin}
          </span>
        </p>
        <p className="flex items-center gap-2">
          <Phone size={14} /> {expedicion.telefonoSenderista}
        </p>
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Clock size={14} /> {formatearEstadoTiempo(expedicion)}
        </p>
        <p className="text-xs">Límite: {formatDt(expedicion.fechaLimite)}</p>
      </div>

      {expedicion.nivelRiesgo === 'rojo' && (
        <Link
          to={`/rescatista/alertas/${expedicion.expedicionId}`}
          className="w-full py-2.5 bg-destructive text-destructive-foreground font-semibold rounded-xl text-sm flex items-center justify-center gap-2"
        >
          <AlertTriangle size={16} />
          {expedicion.confirmadoPorMi ? 'Ver ficha y bitácora' : 'Gestionar alerta'}
        </Link>
      )}
    </article>
  );
}
