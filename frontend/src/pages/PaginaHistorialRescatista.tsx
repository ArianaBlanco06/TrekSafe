import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, MapPin, Phone, User } from 'lucide-react';
import {
  obtenerHistorialRescatista,
  type ItemHistorialRescatista,
  type EstadoRescate,
} from '@/services/rescate';

const ETIQUETA_ESTADO_RESCATE: Record<string, string> = {
  en_busqueda: 'En búsqueda',
  localizados: 'Localizados',
  cerrado: 'Cerrado',
};

function formatDt(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PaginaHistorialRescatista() {
  const [historial, setHistorial] = useState<ItemHistorialRescatista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = () => {
    setError('');
    setCargando(true);
    obtenerHistorialRescatista()
      .then((r) => setHistorial(r.historial))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar historial'))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div className="px-6 py-6">
      <h2 className="text-xl font-bold mb-1">Historial operativo</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Expediciones completadas en las que confirmaste recepción de alerta.
      </p>

      {error && (
        <div className="error-banner mb-4">
          {error}{' '}
          <button type="button" onClick={cargar} className="underline font-semibold ml-1">
            Reintentar
          </button>
        </div>
      )}

      {cargando ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="bg-muted/60 border border-border rounded-2xl p-4 animate-pulse">
              <div className="h-4 w-36 bg-muted-foreground/20 rounded mb-2" />
              <div className="h-3 w-52 bg-muted-foreground/20 rounded" />
            </div>
          ))}
        </div>
      ) : historial.length === 0 ? (
        <div className="bg-muted rounded-2xl p-5 text-sm text-muted-foreground">
          Aún no hay expediciones terminadas vinculadas a tus confirmaciones.
        </div>
      ) : (
        <div className="space-y-3">
          {historial.map((item) => (
            <article
              key={item.expedicionId}
              className="bg-card border border-border rounded-2xl p-4"
            >
              <div className="flex justify-between items-start gap-2 mb-2">
                <div>
                  <p className="font-semibold">{item.lugarFin}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <MapPin size={12} /> {item.lugarInicio} → {item.lugarFin}
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-lg bg-primary/10 text-primary shrink-0">
                  Completada
                </span>
              </div>

              <div className="space-y-1.5 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <User size={14} /> {item.nombreCompletoSenderista}
                </p>
                <p className="flex items-center gap-2">
                  <Phone size={14} /> {item.telefonoSenderista}
                </p>
                <p className="flex items-center gap-2">
                  <Clock size={14} /> Límite: {formatDt(item.fechaLimite)}
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 size={14} /> Retorno: {formatDt(item.completadaEn)}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-secondary/10 text-secondary">
                  Bitácora:{' '}
                  {ETIQUETA_ESTADO_RESCATE[item.estadoRescate as EstadoRescate] ??
                    item.estadoRescate}
                </span>
              </div>

              {item.notas && (
                <p className="mt-3 text-xs text-muted-foreground border-t border-border pt-3">
                  {item.notas}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
