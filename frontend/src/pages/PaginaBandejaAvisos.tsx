import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  CheckCheck,
  Check,
  Calendar,
  AlertTriangle,
  Clock,
  Info,
  ExternalLink,
} from 'lucide-react';
import {
  obtenerAvisos,
  marcarAvisoComoLeido,
  marcarTodosComoLeidos,
  type AvisoFrontend,
  type TipoAviso,
} from '@/services/avisos';

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function iconoTipo(tipo: TipoAviso) {
  switch (tipo) {
    case 'EDICION':
      return <Calendar size={18} className="text-blue-500" />;
    case 'CANCELACION':
      return <AlertTriangle size={18} className="text-destructive" />;
    case 'AMPLIACION':
      return <Clock size={18} className="text-amber-500" />;
    case 'RECORDATORIO':
      return <Clock size={18} className="text-primary" />;
    default:
      return <Info size={18} className="text-muted-foreground" />;
  }
}

function etiquetaTipo(tipo: TipoAviso): string {
  switch (tipo) {
    case 'EDICION':
      return 'Modificación';
    case 'CANCELACION':
      return 'Cancelación';
    case 'AMPLIACION':
      return 'Retorno Ampliado';
    case 'RECORDATORIO':
      return 'Recordatorio';
    default:
      return 'Aviso';
  }
}

export function PaginaBandejaAvisos() {
  const [avisos, setAvisos] = useState<AvisoFrontend[]>([]);
  const [conteoNoLeidos, setConteoNoLeidos] = useState(0);
  const [filtroSoloNoLeidos, setFiltroSoloNoLeidos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const cargarDatos = (soloNoLeidos: boolean) => {
    setCargando(true);
    obtenerAvisos(soloNoLeidos)
      .then((res) => {
        setAvisos(res.avisos);
        setConteoNoLeidos(res.conteoNoLeidos);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar avisos'))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargarDatos(filtroSoloNoLeidos);
  }, [filtroSoloNoLeidos]);

  const handleMarcarLeido = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await marcarAvisoComoLeido(id);
      setAvisos((prev) =>
        prev.map((a) => (a.id === id ? { ...a, leido: true } : a)),
      );
      setConteoNoLeidos((prev) => Math.max(0, prev - 1));
    } catch {
      // Ignorar fallo puntual
    }
  };

  const handleMarcarTodos = async () => {
    try {
      await marcarTodosComoLeidos();
      setAvisos((prev) => prev.map((a) => ({ ...a, leido: true })));
      setConteoNoLeidos(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo marcar todos');
    }
  };

  return (
    <div className="px-6 py-6 max-w-lg mx-auto">
      <Link
        to="/senderista"
        className="flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground transition-colors"
      >
        <ChevronLeft size={16} />
        Volver al inicio
      </Link>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">Bandeja de Avisos</h2>
          <p className="text-xs text-muted-foreground">
            {conteoNoLeidos} {conteoNoLeidos === 1 ? 'aviso no leído' : 'avisos no leídos'}
          </p>
        </div>

        {conteoNoLeidos > 0 && (
          <button
            type="button"
            onClick={handleMarcarTodos}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <CheckCheck size={16} />
            Marcar todos leídos
          </button>
        )}
      </div>

      {/* Selector de filtro */}
      <div className="flex gap-2 p-1 bg-muted rounded-lg mb-6">
        <button
          type="button"
          onClick={() => setFiltroSoloNoLeidos(false)}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            !filtroSoloNoLeidos ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          Todos
        </button>
        <button
          type="button"
          onClick={() => setFiltroSoloNoLeidos(true)}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            filtroSoloNoLeidos ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          Solo no leídos {conteoNoLeidos > 0 && `(${conteoNoLeidos})`}
        </button>
      </div>

      {error && (
        <div className="p-3 mb-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {cargando ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Cargando avisos...
        </div>
      ) : avisos.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border rounded-xl">
          <Info size={32} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium text-foreground">No tienes avisos en esta bandeja</p>
          <p className="text-xs text-muted-foreground mt-1">
            Los cambios en tus expediciones y recordatorios aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {avisos.map((aviso) => (
            <div
              key={aviso.id}
              onClick={() => !aviso.leido && handleMarcarLeido(aviso.id)}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                aviso.leido
                  ? 'bg-card/50 border-border opacity-85'
                  : 'bg-card border-primary/40 shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-muted/60">{iconoTipo(aviso.tipo)}</div>
                  <span className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
                    {etiquetaTipo(aviso.tipo)}
                  </span>
                  {!aviso.leido && (
                    <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {formatFecha(aviso.creadoEn)}
                </span>
              </div>

              <h3 className="text-sm font-semibold text-foreground mb-1">{aviso.titulo}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                {aviso.mensaje}
              </p>

              <div className="flex items-center justify-between pt-2 border-t border-border/60">
                {aviso.expedicionId ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!aviso.leido) handleMarcarLeido(aviso.id);
                      navigate('/senderista/expedicion/activa');
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <ExternalLink size={13} />
                    Ver expedición
                  </button>
                ) : (
                  <div />
                )}

                {!aviso.leido ? (
                  <button
                    type="button"
                    onClick={(e) => handleMarcarLeido(aviso.id, e)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    title="Marcar como leído"
                  >
                    <Check size={14} />
                    Marcar leído
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
                    <CheckCheck size={13} /> Leído
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
