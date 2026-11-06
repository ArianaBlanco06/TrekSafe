import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, MapPin, Mountain, RotateCcw } from 'lucide-react';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';
import {
  obtenerHistorialExpediciones,
  type ExpedicionCompletada,
  type EstadisticasHistorial,
} from '@/services/expedicion';

function formatDt(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PaginaHistorialExpediciones() {
  const enLinea = useEstadoEnLinea();
  const [expediciones, setExpediciones] = useState<ExpedicionCompletada[]>([]);
  const [estadisticas, setEstadisticas] = useState<EstadisticasHistorial | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    obtenerHistorialExpediciones()
      .then((r) => {
        if (!activo) return;
        setExpediciones(r.expediciones);
        setEstadisticas(r.estadisticas);
      })
      .catch((e) => { if (activo) setError(e instanceof Error ? e.message : 'Error al cargar historial'); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, []);

  return (
    <div className="px-6 py-6">
      <Link
        to="/senderista/perfil"
        className="flex items-center gap-1 text-sm text-muted-foreground mb-4"
      >
        <ChevronLeft size={18} /> Perfil
      </Link>

      <h2 className="text-xl font-bold mb-1">Historial de montaña</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Expediciones finalizadas con retorno confirmado.
      </p>

      {error && <div role="alert" className="error-banner mb-4">{error}</div>}

      {estadisticas && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-card border border-border rounded-2xl p-4">
            <Mountain size={18} className="text-primary mb-2" />
            <p className="text-2xl font-bold">{estadisticas.totalCompletadas}</p>
            <p className="text-xs text-muted-foreground">Completadas</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <MapPin size={18} className="text-secondary mb-2" />
            <p className="text-2xl font-bold">{estadisticas.destinosUnicos}</p>
            <p className="text-xs text-muted-foreground">Destinos distintos</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 col-span-2">
            <p className="text-sm text-muted-foreground">Duración media declarada</p>
            <p className="text-xl font-bold mt-1">{estadisticas.promedioHoras} h</p>
            {estadisticas.ultimaCompletadaEn && (
              <p className="text-xs text-muted-foreground mt-2">
                Última: {formatDt(estadisticas.ultimaCompletadaEn)}
              </p>
            )}
          </div>
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando historial…</p>
      ) : expediciones.length === 0 ? (
        <div className="bg-muted rounded-2xl p-5 text-sm text-muted-foreground">
          Aún no tienes expediciones completadas. Confirma tu retorno al finalizar cada ruta.
        </div>
      ) : (
        <div className="space-y-3">
          {expediciones.map((exp) => (
            <div key={exp.id} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="font-semibold">{exp.lugarFin}</p>
                  <p className="text-xs text-muted-foreground mt-1">Desde: {exp.lugarInicio}</p>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-lg bg-primary/10 text-primary">
                  Completada
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Salida: {formatDt(exp.horaInicio)}
              </p>
              <p className="text-sm text-muted-foreground">
                Retorno: {formatDt(exp.horaRetornoEstimada)}
              </p>
              {exp.actualizadoEn && (
                <p className="text-xs text-primary font-medium mt-2">
                  Retorno confirmado: {formatDt(exp.actualizadoEn)}
                </p>
              )}
              <Link to={`/senderista/expedicion/${encodeURIComponent(exp.id)}/equipo`}
                aria-label={`Consultar equipo de la expedición a ${exp.lugarFin}`}
                className="inline-flex items-center min-h-12 mt-2 text-sm font-semibold text-primary">Consultar equipo</Link>
              {enLinea ? (
                <Link to={`/senderista/expedicion/nueva?repetir=${encodeURIComponent(exp.id)}`}
                  aria-label={`Repetir expedición a ${exp.lugarFin}`}
                  className="mt-3 inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-primary">
                  <RotateCcw size={16} aria-hidden="true" /> Repetir expedición
                </Link>
              ) : <p className="mt-3 text-xs text-muted-foreground">Conéctate para repetir esta expedición.</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
