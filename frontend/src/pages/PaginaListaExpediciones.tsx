import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { obtenerExpediciones, type Expedicion } from '@/services/expedicion';

const ETIQUETA_ESTADO: Record<string, string> = {
  programada: 'Programada',
  en_progreso: 'En curso',
  completada: 'Completada',
  alerta: 'Alerta',
};

export function PaginaListaExpediciones() {
  const [expediciones, setExpediciones] = useState<Expedicion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = () => {
    setError('');
    setCargando(true);
    obtenerExpediciones()
      .then((r) => setExpediciones(r.expediciones))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Expediciones</h2>
        <Link
          to="/senderista/expedicion/nueva"
          className="flex items-center gap-1 text-sm text-primary font-semibold min-h-12"
        >
          <Plus size={16} /> Nueva
        </Link>
      </div>

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
              <div className="h-4 w-32 bg-muted-foreground/20 rounded mb-2" />
              <div className="h-3 w-48 bg-muted-foreground/20 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {expediciones.map((exp) => {
            const estaActiva = exp.estado === 'en_progreso' || exp.estado === 'alerta';
            const esAlerta = exp.estado === 'alerta';
            const tarjeta = (
              <div
                className={`bg-card border rounded-2xl p-4 ${
                  esAlerta
                    ? 'border-destructive/50 bg-destructive/5'
                    : estaActiva
                      ? 'border-primary/30'
                      : 'border-border'
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-semibold">{exp.lugarFin}</p>
                    <p className="text-xs text-muted-foreground mt-1">Desde: {exp.lugarInicio}</p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded-lg ${
                      esAlerta ? 'bg-destructive/15 text-destructive' : 'bg-muted'
                    }`}
                  >
                    {ETIQUETA_ESTADO[exp.estado] ?? exp.estado}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Salida: {new Date(exp.horaInicio).toLocaleString('es-PE')}
                </p>
                <p className="text-sm text-muted-foreground">
                  Retorno: {new Date(exp.horaRetornoEstimada).toLocaleString('es-PE')}
                </p>
                {estaActiva && (
                  <p
                    className={`text-sm font-semibold mt-3 flex items-center gap-1 ${
                      esAlerta ? 'text-destructive' : 'text-primary'
                    }`}
                  >
                    {esAlerta ? 'Ver expedición en alerta' : 'Ver expedición activa'}{' '}
                    <ChevronRight size={16} />
                  </p>
                )}
              </div>
            );

            return estaActiva ? (
              <Link key={exp.id} to="/senderista/expedicion/activa" className="block">
                {tarjeta}
              </Link>
            ) : (
              <div key={exp.id}>{tarjeta}</div>
            );
          })}
          {expediciones.length === 0 && (
            <div className="bg-muted rounded-2xl p-5 text-sm text-muted-foreground">
              No hay expediciones registradas.{' '}
              <Link to="/senderista/expedicion/nueva" className="text-primary font-semibold underline">
                Crear una
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
