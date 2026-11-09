import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';
import {
  listarAvisos,
  marcarAvisoLeido,
  marcarTodosLosAvisosLeidos,
  type Aviso,
} from '@/services/avisos';

function formatDt(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** HU-37: bandeja de avisos del senderista. Solo online; no se guarda offline. */
export function PaginaAvisos() {
  const enLinea = useEstadoEnLinea();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    listarAvisos()
      .then((r) => { if (activo) setAvisos(r.datos); })
      .catch((e) => { if (activo) setError(e instanceof Error ? e.message : 'Error al cargar avisos'); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, []);

  const marcarUno = async (id: string) => {
    try {
      const r = await marcarAvisoLeido(id);
      setAvisos((prev) => prev.map((a) => (a.id === id ? r.datos : a)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo marcar el aviso');
    }
  };

  const marcarTodos = async () => {
    try {
      await marcarTodosLosAvisosLeidos();
      setAvisos((prev) => prev.map((a) => ({ ...a, leido: true })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron marcar los avisos');
    }
  };

  const hayNoLeidos = avisos.some((a) => !a.leido);

  return (
    <div className="px-6 py-6">
      <Link to="/senderista" className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
        <ChevronLeft size={18} /> Inicio
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Avisos</h2>
        {hayNoLeidos && (
          <button type="button" className="text-sm text-primary" onClick={marcarTodos} disabled={!enLinea}>
            Marcar todos como leídos
          </button>
        )}
      </div>

      {!enLinea && <p className="text-sm text-muted-foreground mb-4">Necesitas conexión para ver tus avisos.</p>}
      {error && <div role="alert" className="error-banner mb-4">{error}</div>}

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando avisos…</p>
      ) : avisos.length === 0 ? (
        <div className="bg-muted rounded-2xl p-5 text-sm text-muted-foreground">No tienes avisos.</div>
      ) : (
        <ul className="space-y-3">
          {avisos.map((a) => (
            <li
              key={a.id}
              className={`bg-card border rounded-2xl p-4 ${a.leido ? 'border-border' : 'border-primary'}`}
            >
              <p className="font-semibold">{a.titulo}</p>
              <p className="text-sm mt-1">{a.mensaje}</p>
              <p className="text-xs text-muted-foreground mt-2">{formatDt(a.creadoEn)}</p>
              <div className="flex gap-4 mt-2 text-sm">
                {a.expedicionId && (
                  <Link className="text-primary" to={`/expediciones/${a.expedicionId}/editar`}>
                    Ver plan
                  </Link>
                )}
                {!a.leido && (
                  <button type="button" className="text-primary" onClick={() => marcarUno(a.id)} disabled={!enLinea}>
                    Marcar como leído
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
