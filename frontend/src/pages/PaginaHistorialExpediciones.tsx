import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, MapPin, Mountain } from 'lucide-react';
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
  const [expediciones, setExpediciones] = useState<ExpedicionCompletada[]>([]);
  const [estadisticas, setEstadisticas] = useState<EstadisticasHistorial | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    obtenerHistorialExpediciones()
      .then((r) => {
        setExpediciones(r.expediciones);
        setEstadisticas(r.estadisticas);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar historial'))
      .finally(() => setCargando(false));
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

      {error && <div className="error-banner mb-4">{error}</div>}

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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
