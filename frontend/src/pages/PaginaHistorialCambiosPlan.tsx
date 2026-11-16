import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, History, RefreshCw } from 'lucide-react';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';
import { presentarEntrada, type EntradaPresentada } from '@/lib/historialCambiosPresentacion';
import { getSessionScope } from '@/lib/sesion';
import { ErrorClienteApi } from '@/services/clienteApi';
import { fuentesHistorialCambios, type FuentesHistorialCambios } from '@/services/historialCambios';

/** HU-36. Vista solo en línea: no guarda el historial en almacenamiento local ni offline. */
export function PaginaHistorialCambiosPlan({ fuentes = fuentesHistorialCambios }: { fuentes?: FuentesHistorialCambios }) {
  const { id = '' } = useParams();
  const { usuario } = useAutenticacion();
  return <HistorialCambiosPlan key={`${usuario?.id}:${getSessionScope()}:${id}`} expedicionId={id} fuentes={fuentes} />;
}

type EstadoCarga =
  | { tipo: 'cargando' }
  | { tipo: 'no_encontrada' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; entradas: EntradaPresentada[] };

export function HistorialCambiosPlan({ expedicionId, fuentes }: { expedicionId: string; fuentes: FuentesHistorialCambios }) {
  const enLinea = useEstadoEnLinea();
  const [estado, setEstado] = useState<EstadoCarga>({ tipo: 'cargando' });
  const solicitud = useRef(0);

  const cargar = useCallback(async () => {
    const actual = ++solicitud.current;
    setEstado({ tipo: 'cargando' });
    try {
      const historial = await fuentes.obtener(expedicionId);
      if (actual !== solicitud.current) return;
      setEstado({ tipo: 'listo', entradas: historial.cambios.map((entrada) => presentarEntrada(entrada)) });
    } catch (error) {
      if (actual !== solicitud.current) return;
      if (error instanceof ErrorClienteApi && (error.status === 404 || error.status === 400)) {
        setEstado({ tipo: 'no_encontrada' });
      } else {
        setEstado({ tipo: 'error', mensaje: error instanceof Error ? error.message : 'No se pudo cargar el historial de cambios.' });
      }
    }
  }, [expedicionId, fuentes]);

  useEffect(() => {
    if (enLinea) void cargar();
    return () => { solicitud.current++; };
  }, [enLinea, cargar]);

  return (
    <div className="px-6 py-6 space-y-5">
      <Link to="/senderista/expedicion" className="flex items-center gap-1 text-sm text-muted-foreground min-h-10">
        <ChevronLeft size={18} aria-hidden="true" /> Mis expediciones
      </Link>
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><History size={22} aria-hidden="true" /> Historial de cambios del plan</h2>
        <p className="text-sm text-muted-foreground mt-1">Ediciones, cancelación y ampliaciones de retorno, de la más antigua a la más reciente.</p>
      </div>
      {!enLinea ? (
        <p role="status" className="rounded-xl border border-border bg-muted p-4 text-sm">
          Conéctate para consultar el historial de cambios. Por privacidad no se guarda en este dispositivo.
        </p>
      ) : (
        <>
          <button type="button" disabled={estado.tipo === 'cargando'} onClick={() => { void cargar(); }}
            className="min-h-12 inline-flex items-center gap-2 text-sm font-semibold text-primary disabled:opacity-50">
            <RefreshCw size={16} aria-hidden="true" /> Actualizar historial
          </button>
          {estado.tipo === 'cargando' && <p role="status" className="text-sm text-muted-foreground">Cargando historial…</p>}
          {estado.tipo === 'no_encontrada' && <p role="alert" className="error-banner">No encontramos esta expedición entre las tuyas.</p>}
          {estado.tipo === 'error' && <p role="alert" className="error-banner">{estado.mensaje}</p>}
          {estado.tipo === 'listo' && estado.entradas.length === 0 && (
            <p className="text-sm text-muted-foreground">Este plan aún no tiene cambios registrados.</p>
          )}
          {estado.tipo === 'listo' && estado.entradas.length > 0 && (
            <ol className="space-y-3" aria-label="Cambios del plan">
              {estado.entradas.map((entrada) => <EntradaHistorial key={entrada.id} entrada={entrada} />)}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

function EntradaHistorial({ entrada }: { entrada: EntradaPresentada }) {
  return (
    <li className="bg-card border border-border rounded-2xl p-4 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{entrada.titulo}</h3>
        <span className="text-xs text-muted-foreground">{entrada.fecha}</span>
      </div>
      <p className="text-xs text-muted-foreground">Por {entrada.autor} · versión {entrada.version}</p>
      {entrada.anonimizado ? (
        <p className="text-sm text-muted-foreground">Detalle eliminado por privacidad.</p>
      ) : entrada.sinDetalle ? (
        <p className="text-sm text-muted-foreground">Sin detalle disponible.</p>
      ) : (
        <>
          {entrada.detalleAmpliacion && <p className="text-sm font-medium">{entrada.detalleAmpliacion}</p>}
          {entrada.filas.length > 0 && (
            <dl className="space-y-1 text-sm">
              {entrada.filas.map((fila) => (
                <div key={fila.campo} className="break-words">
                  <dt className="font-medium">{fila.etiqueta}</dt>
                  <dd className="text-muted-foreground">{fila.antes} → {fila.despues}</dd>
                </div>
              ))}
            </dl>
          )}
          {entrada.motivo && <p className="text-sm break-words">Motivo: {entrada.motivo}</p>}
        </>
      )}
    </li>
  );
}
