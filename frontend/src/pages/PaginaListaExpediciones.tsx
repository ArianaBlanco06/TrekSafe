import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, ChevronRight, Pencil, Plus } from 'lucide-react';
import { DialogoCancelarExpedicion } from '@/components/DialogoCancelarExpedicion';
import {
  obtenerExpediciones,
  type Expedicion,
  type ResultadoCancelacion,
} from '@/services/expedicion';

const ETIQUETA_ESTADO: Record<string, string> = {
  programada: 'Programada',
  en_progreso: 'En curso',
  completada: 'Completada',
  alerta: 'Alerta',
  cancelada: 'Cancelada',
};

export function PaginaListaExpediciones() {
  const [expediciones, setExpediciones] = useState<Expedicion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aCancelar, setACancelar] = useState<Expedicion | null>(null);
  const [aviso, setAviso] = useState('');

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

  const alCancelar = (resultado: ResultadoCancelacion) => {
    setExpediciones((lista) =>
      lista.map((exp) =>
        exp.id === resultado.id ? { ...exp, estado: resultado.estado, version: resultado.version } : exp,
      ),
    );
    setAviso(`Expedición a ${aCancelar?.lugarFin ?? 'tu destino'} cancelada.`);
    setACancelar(null);
  };

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

      {aviso && (
        <div role="status" className="bg-muted rounded-2xl p-4 text-sm mb-4">
          {aviso}
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
            const esCancelada = exp.estado === 'cancelada';
            const tarjeta = (
              <div
                className={`bg-card border rounded-2xl p-4 ${
                  esAlerta
                    ? 'border-destructive/50 bg-destructive/5'
                    : estaActiva
                      ? 'border-primary/30'
                      : esCancelada
                        ? 'border-border opacity-70'
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
                {exp.estado === 'programada' && (
                  <div className="flex items-center gap-5 mt-3">
                    <Link
                      to={`/expediciones/${exp.id}/editar`}
                      className="text-sm font-semibold inline-flex items-center gap-1 text-primary min-h-12"
                    >
                      <Pencil size={14} /> Editar
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setAviso('');
                        setACancelar(exp);
                      }}
                      className="text-sm font-semibold inline-flex items-center gap-1 text-destructive min-h-12"
                    >
                      <Ban size={14} /> Cancelar
                    </button>
                  </div>
                )}
              </div>
            );

            return (
              <div key={exp.id}>
                {estaActiva ? <Link to="/senderista/expedicion/activa" className="block">{tarjeta}</Link> : tarjeta}
                <Link to={`/senderista/expedicion/${encodeURIComponent(exp.id)}/equipo`}
                  aria-label={`Revisar equipo de la expedición a ${exp.lugarFin}`}
                  className="inline-flex items-center min-h-12 text-sm font-semibold text-primary">Revisar equipo</Link>
                <Link to={`/senderista/expedicion/${encodeURIComponent(exp.id)}/cambios`}
                  aria-label={`Ver cambios del plan de la expedición a ${exp.lugarFin}`}
                  className="inline-flex items-center min-h-12 ml-4 text-sm font-semibold text-primary">Ver cambios</Link>
              </div>
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

      {aCancelar && (
        <DialogoCancelarExpedicion
          expedicionId={aCancelar.id}
          destino={aCancelar.lugarFin}
          onClose={() => setACancelar(null)}
          onSuccess={alCancelar}
        />
      )}
    </div>
  );
}
