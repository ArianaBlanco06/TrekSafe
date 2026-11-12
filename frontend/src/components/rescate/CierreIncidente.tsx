import { useRef, useState } from 'react';
import { Flag } from 'lucide-react';
import {
  AVISO_PRIVACIDAD_BITACORA,
  ETIQUETAS_RESULTADO_RESCATE,
  LIMITE_RESUMEN_CIERRE,
  RESULTADOS_RESCATE,
  TEXTO_CIERRE_OPERATIVO,
  intentarCerrarIncidente,
  intentarMarcarLocalizado,
  validarCierre,
  type CerrarIncidenteApi,
  type MarcarLocalizadoApi,
} from '@/lib/cierreIncidente';
import { crearGestorOperacion, type GestorOperacion } from '@/lib/coordinacionRescate';
import { generarUuid } from '@/lib/uuid';
import {
  cerrarIncidente,
  marcarIncidenteLocalizado,
  type EstadoIncidenteRescate,
  type ResultadoRescate,
} from '@/services/cierreIncidente';

export type CierreIncidenteProps = {
  incidenteId: string;
  estado: EstadoIncidenteRescate;
  esResponsable: boolean;
  nombreResponsable: string;
  /** Tras localizar, cerrar, relevo o cierre previo: la página vuelve a leer el incidente. */
  alCambiar?: () => void;
  /** Solo para pruebas. */
  cerrar?: CerrarIncidenteApi;
  /** Solo para pruebas. */
  marcarLocalizado?: MarcarLocalizadoApi;
  /** Solo para pruebas. */
  generarId?: () => string;
};

/**
 * HU-42: "Marcar persona localizada" (abierto → localizado) y "Cerrar incidente" con informe
 * (resultado y resumen). Solo el responsable vigente ve las acciones; el servidor vuelve a
 * autorizar cada una. Cada acción pide una confirmación en dos pasos. Cerrar el incidente es
 * el cierre operativo: no confirma el retorno del senderista.
 */
export function CierreIncidente({
  incidenteId,
  estado,
  esResponsable,
  nombreResponsable,
  alCambiar,
  cerrar = cerrarIncidente,
  marcarLocalizado = marcarIncidenteLocalizado,
  generarId = generarUuid,
}: CierreIncidenteProps) {
  const [resultado, setResultado] = useState<ResultadoRescate | ''>('');
  const [resumen, setResumen] = useState('');
  const [confirmandoLocalizado, setConfirmandoLocalizado] = useState(false);
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [errorEnvio, setErrorEnvio] = useState('');
  // Resultado desconocido (red o 5xx): el formulario queda fijo y el reintento reutiliza el comandoId.
  const [incierto, setIncierto] = useState(false);
  const gestorCierre = useRef<GestorOperacion | null>(null);
  gestorCierre.current ??= crearGestorOperacion(generarId);
  const gestorLocalizado = useRef<GestorOperacion | null>(null);
  gestorLocalizado.current ??= crearGestorOperacion(generarId);

  if (estado === 'cerrado') return null;

  if (!esResponsable) {
    return (
      <section className="bg-card border border-border rounded-2xl p-4 mb-6" aria-labelledby="titulo-cierre-incidente">
        <h3 id="titulo-cierre-incidente" className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
          <Flag size={14} className="flex-shrink-0" />
          Cierre del incidente
        </h3>
        <p className="text-xs text-muted-foreground">Solo {nombreResponsable} (responsable vigente) puede cerrar el incidente.</p>
      </section>
    );
  }

  const trasRechazo = (texto: string) => {
    setIncierto(false);
    setConfirmandoLocalizado(false);
    setConfirmandoCierre(false);
    setMensaje(texto);
    alCambiar?.();
  };

  const localizar = async () => {
    if (enviando) return;
    setEnviando(true);
    setErrorEnvio('');
    setMensaje('');
    try {
      const r = await intentarMarcarLocalizado(incidenteId, gestorLocalizado.current!, marcarLocalizado);
      switch (r.tipo) {
        case 'localizado':
          setIncierto(false);
          setConfirmandoLocalizado(false);
          setMensaje('Persona marcada como localizada');
          alCambiar?.();
          break;
        case 'no_responsable':
          trasRechazo(
            r.responsable
              ? `Ahora coordina ${r.responsable.nombreResponsable}; ya no puedes actualizar el incidente.`
              : 'Otro rescatista coordina ahora; ya no puedes actualizar el incidente.',
          );
          break;
        case 'cerrado':
          trasRechazo('El incidente ya está cerrado.');
          break;
        case 'error':
          setErrorEnvio(r.mensaje);
          setIncierto(r.incierto);
          break;
      }
    } finally {
      setEnviando(false);
    }
  };

  const pedirConfirmacionCierre = () => {
    const problema = validarCierre({ resultado, resumen });
    if (problema) {
      setErrorEnvio(problema);
      return;
    }
    setErrorEnvio('');
    setConfirmandoCierre(true);
  };

  const cerrarElIncidente = async () => {
    if (enviando || resultado === '') return;
    const problema = validarCierre({ resultado, resumen });
    if (problema) {
      setErrorEnvio(problema);
      return;
    }
    setEnviando(true);
    setErrorEnvio('');
    setMensaje('');
    try {
      const r = await intentarCerrarIncidente(incidenteId, gestorCierre.current!, cerrar, { resultado, resumen: resumen.trim() });
      switch (r.tipo) {
        case 'cerrado':
          setIncierto(false);
          setConfirmandoCierre(false);
          setMensaje('Incidente cerrado');
          alCambiar?.();
          break;
        case 'no_responsable':
          trasRechazo(
            r.responsable
              ? `Ahora coordina ${r.responsable.nombreResponsable}; ya no puedes cerrar el incidente.`
              : 'Otro rescatista coordina ahora; ya no puedes cerrar el incidente.',
          );
          break;
        case 'no_localizado':
          trasRechazo('El incidente aún no está marcado como localizado.');
          break;
        case 'ya_cerrado':
          trasRechazo('El incidente ya estaba cerrado.');
          break;
        case 'error':
          setErrorEnvio(r.mensaje);
          setIncierto(r.incierto);
          break;
      }
    } finally {
      setEnviando(false);
    }
  };

  const descartar = () => {
    gestorCierre.current!.resolver();
    gestorLocalizado.current!.resolver();
    setIncierto(false);
    setConfirmandoCierre(false);
    setErrorEnvio('');
    alCambiar?.(); // puede que la operación sí se haya guardado: se vuelve a leer
  };

  return (
    <section className="bg-card border border-border rounded-2xl p-4 mb-6" aria-labelledby="titulo-cierre-incidente">
      <h3 id="titulo-cierre-incidente" className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
        <Flag size={14} className="flex-shrink-0" />
        Cierre del incidente
      </h3>

      {estado === 'abierto' && (
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            Cuando la persona esté localizada, márcalo aquí para poder cerrar el incidente con un informe.
          </p>
          {incierto ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => void localizar()} disabled={enviando} className="flex-1 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm disabled:opacity-60">
                {enviando ? 'Guardando…' : 'Reintentar'}
              </button>
              <button type="button" onClick={descartar} disabled={enviando} className="flex-1 py-2.5 border border-border font-semibold rounded-xl text-sm disabled:opacity-60">
                Descartar
              </button>
            </div>
          ) : confirmandoLocalizado ? (
            <div>
              <p className="text-sm font-medium mb-2">¿Confirmas que la persona fue localizada?</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void localizar()} disabled={enviando} className="flex-1 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm disabled:opacity-60">
                  {enviando ? 'Guardando…' : 'Confirmar localización'}
                </button>
                <button type="button" onClick={() => setConfirmandoLocalizado(false)} disabled={enviando} className="flex-1 py-2.5 border border-border font-semibold rounded-xl text-sm disabled:opacity-60">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmandoLocalizado(true)} className="w-full py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm">
              Marcar persona localizada
            </button>
          )}
        </div>
      )}

      {estado === 'localizado' && (
        <div>
          <p role="note" className="mb-2 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
            {AVISO_PRIVACIDAD_BITACORA}
          </p>
          <p role="note" className="mb-3 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
            {TEXTO_CIERRE_OPERATIVO}
          </p>

          <label className="block text-sm font-medium mb-1.5" htmlFor="resultado-cierre-incidente">
            Resultado del rescate
          </label>
          <select
            id="resultado-cierre-incidente"
            value={resultado}
            onChange={(e) => setResultado(e.target.value as ResultadoRescate | '')}
            disabled={incierto || confirmandoCierre}
            className="input-field mb-3"
          >
            <option value="">Elige un resultado</option>
            {RESULTADOS_RESCATE.map((r) => (
              <option key={r} value={r}>
                {ETIQUETAS_RESULTADO_RESCATE[r]}
              </option>
            ))}
          </select>

          <label className="block text-sm font-medium mb-1.5" htmlFor="resumen-cierre-incidente">
            Resumen del cierre
          </label>
          <textarea
            id="resumen-cierre-incidente"
            value={resumen}
            onChange={(e) => setResumen(e.target.value)}
            maxLength={LIMITE_RESUMEN_CIERRE}
            readOnly={incierto || confirmandoCierre}
            rows={4}
            className="input-field mb-1"
          />
          <p className="text-xs text-muted-foreground mb-3 text-right">
            {resumen.length}/{LIMITE_RESUMEN_CIERRE}
          </p>

          {incierto ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => void cerrarElIncidente()} disabled={enviando} className="flex-1 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm disabled:opacity-60">
                {enviando ? 'Guardando…' : 'Reintentar'}
              </button>
              <button type="button" onClick={descartar} disabled={enviando} className="flex-1 py-2.5 border border-border font-semibold rounded-xl text-sm disabled:opacity-60">
                Descartar
              </button>
            </div>
          ) : confirmandoCierre ? (
            <div>
              <p className="text-sm font-medium mb-2">El cierre no se puede deshacer. ¿Confirmas?</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void cerrarElIncidente()} disabled={enviando} className="flex-1 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm disabled:opacity-60">
                  {enviando ? 'Guardando…' : 'Confirmar cierre'}
                </button>
                <button type="button" onClick={() => setConfirmandoCierre(false)} disabled={enviando} className="flex-1 py-2.5 border border-border font-semibold rounded-xl text-sm disabled:opacity-60">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={pedirConfirmacionCierre} className="w-full py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm">
              Cerrar incidente
            </button>
          )}
        </div>
      )}

      {mensaje && (
        <p role="status" className="mt-3 text-xs font-medium text-primary">
          {mensaje}
        </p>
      )}
      {errorEnvio && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {errorEnvio}
        </p>
      )}
    </section>
  );
}
