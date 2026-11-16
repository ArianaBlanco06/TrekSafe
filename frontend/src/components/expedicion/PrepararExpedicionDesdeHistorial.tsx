import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';
import { getSessionScope } from '@/lib/sesion';
import { obtenerBorradorDesdeHistorial, type BorradorDesdeHistorial } from '@/services/expedicion';
import { puntosRutaApi, type PuntoRuta } from '@/services/puntosRuta';

type Props = {
  origenId: string;
  children: (borrador: BorradorDesdeHistorial) => ReactNode;
  obtener?: typeof obtenerBorradorDesdeHistorial;
  consultarPuntos?: (id: string) => Promise<{ puntos: PuntoRuta[] }>;
};

const consultarPuntosPorDefecto = (id: string) => puntosRutaApi.consultar(id);

/** Carga un origen autorizado antes de montar el formulario de creación. */
export function PrepararExpedicionDesdeHistorial({
  origenId, children, obtener = obtenerBorradorDesdeHistorial, consultarPuntos = consultarPuntosPorDefecto,
}: Props) {
  const enLinea = useEstadoEnLinea();
  const [scope] = useState(getSessionScope);
  const [borrador, setBorrador] = useState<BorradorDesdeHistorial | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError('');
    setBorrador(null);
    obtener(origenId)
      .then(async (respuesta) => {
        if (!activo || scope !== getSessionScope()) return;
        // Un fallo de consulta no significa que el origen carezca de puntos.
        const { puntos } = await consultarPuntos(origenId);
        if (activo && scope === getSessionScope()) setBorrador({ ...respuesta.borrador, puntos });
      })
      .catch((causa: unknown) => {
        if (activo && scope === getSessionScope()) {
          setError(causa instanceof Error ? causa.message : 'No se pudo preparar la expedición.');
        }
      })
      .finally(() => { if (activo && scope === getSessionScope()) setCargando(false); });
    return () => { activo = false; };
    // Reconectar no vuelve a montar un formulario que ya contiene cambios.
  }, [origenId, obtener, consultarPuntos, intento, scope]);

  if (borrador) return children(borrador);

  return (
    <div className="px-6 py-6">
      <Link to="/senderista/perfil/historial" className="mb-4 flex min-h-10 items-center gap-1 text-xs text-muted-foreground">
        <ChevronLeft size={16} aria-hidden="true" /> Historial
      </Link>
      <h2 className="text-xl font-bold">Repetir expedición</h2>
      {cargando && <p role="status" className="mt-4 text-sm text-muted-foreground">Preparando la ruta de tu historial…</p>}
      {error && (
        <div role="alert" className="error-banner mt-4">
          <p>{error}</p>
          <button type="button" disabled={cargando || !enLinea} onClick={() => setIntento((actual) => actual + 1)}
            className="mt-2 inline-flex min-h-12 items-center gap-2 font-semibold disabled:opacity-50">
            <RefreshCw size={16} aria-hidden="true" /> Reintentar
          </button>
        </div>
      )}
      {!enLinea && <p role="status" className="mt-4 text-sm text-muted-foreground">Conéctate para recuperar la ruta y comprobar tus contactos.</p>}
    </div>
  );
}
