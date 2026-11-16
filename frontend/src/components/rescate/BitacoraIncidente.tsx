import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import {
  AVISO_PRIVACIDAD_BITACORA,
  ETIQUETAS_TIPO_ENTRADA,
  LIMITE_TEXTO_ENTRADA,
  entradaCorregida,
  fechaHoraEntrada,
  intentarAgregarEntrada,
  resumenTexto,
  textoAutorEntrada,
  textoSoloLectura,
  validarTextoEntrada,
  type AgregarEntrada,
} from '@/lib/bitacoraIncidente';
import { crearGestorOperacion, horaCorta, type GestorOperacion } from '@/lib/coordinacionRescate';
import { generarUuid } from '@/lib/uuid';
import {
  agregarEntradaBitacora,
  obtenerBitacoraIncidente,
  type BitacoraIncidente as DatosBitacora,
  type EntradaBitacoraIncidente,
} from '@/services/bitacoraIncidente';

export type BitacoraIncidenteProps = {
  incidenteId: string;
  /** Tras NO_ES_RESPONSABLE (relevo) o cierre: la página vuelve a leer la coordinación. */
  alCambiarResponsable?: () => void;
  /** HU-42: se llama con los datos tras cada lectura correcta (la página los usa para el cierre). */
  alCargar?: (bitacora: DatosBitacora) => void;
  /** Solo para pruebas. */
  cargar?: (incidenteId: string) => Promise<{ bitacora: DatosBitacora }>;
  /** Solo para pruebas. */
  agregar?: AgregarEntrada;
  /** Solo para pruebas. */
  generarId?: () => string;
  /** Solo para pruebas. */
  zonaHoraria?: string;
};

/**
 * HU-41: bitácora cronológica compartida del incidente. Distinta de la bitácora personal de
 * HU-14 ("Bitácora de rescate"). La lista se muestra en el orden que fija el servidor; solo el
 * responsable vigente ve el formulario (el servidor vuelve a autorizar cada escritura).
 */
export function BitacoraIncidente({
  incidenteId,
  alCambiarResponsable,
  alCargar,
  cargar = obtenerBitacoraIncidente,
  agregar = agregarEntradaBitacora,
  generarId = generarUuid,
  zonaHoraria,
}: BitacoraIncidenteProps) {
  const [bitacora, setBitacora] = useState<DatosBitacora | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [texto, setTexto] = useState('');
  const [corrigiendo, setCorrigiendo] = useState<EntradaBitacoraIncidente | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [errorEnvio, setErrorEnvio] = useState('');
  // Resultado desconocido (red o 5xx): el texto queda fijo y el reintento reutiliza el operacionId.
  const [incierto, setIncierto] = useState(false);
  const gestor = useRef<GestorOperacion | null>(null);
  gestor.current ??= crearGestorOperacion(generarId);
  const lectura = useRef(0);
  // Referencia: un `alCargar` nuevo en cada render no debe disparar otra lectura.
  const alCargarRef = useRef(alCargar);
  alCargarRef.current = alCargar;

  const recargar = useCallback(async () => {
    const numero = (lectura.current += 1);
    try {
      const { bitacora: datos } = await cargar(incidenteId);
      if (numero !== lectura.current) return; // llegó una lectura más nueva
      setBitacora(datos);
      alCargarRef.current?.(datos);
      setErrorCarga('');
    } catch (error) {
      if (numero !== lectura.current) return;
      setErrorCarga((error as { message?: string }).message || 'No se pudo cargar la bitácora.');
    } finally {
      if (numero === lectura.current) setCargando(false);
    }
  }, [cargar, incidenteId]);

  useEffect(() => {
    setCargando(true);
    void recargar();
  }, [recargar]);

  const enviar = async () => {
    if (enviando) return;
    const problema = validarTextoEntrada(texto);
    if (problema) {
      setErrorEnvio(problema);
      return;
    }
    setEnviando(true);
    setErrorEnvio('');
    setMensaje('');
    try {
      const resultado = await intentarAgregarEntrada(incidenteId, gestor.current!, agregar, {
        texto: texto.trim(),
        corrigeEntradaId: corrigiendo?.id ?? null,
      });
      switch (resultado.tipo) {
        case 'agregada':
          setIncierto(false);
          setTexto('');
          setCorrigiendo(null);
          setMensaje('Entrada añadida');
          await recargar();
          break;
        case 'no_responsable':
          setIncierto(false);
          setMensaje(
            resultado.responsable
              ? `Ahora coordina ${resultado.responsable.nombreResponsable}; ya no puedes añadir entradas.`
              : 'Otro rescatista coordina ahora; ya no puedes añadir entradas.',
          );
          setCorrigiendo(null);
          await recargar();
          alCambiarResponsable?.();
          break;
        case 'cerrado':
          setIncierto(false);
          setMensaje('El incidente está cerrado: la bitácora es de solo lectura.');
          setCorrigiendo(null);
          await recargar();
          alCambiarResponsable?.();
          break;
        case 'error':
          setErrorEnvio(resultado.mensaje);
          setIncierto(resultado.incierto);
          break;
      }
    } finally {
      setEnviando(false);
    }
  };

  const descartar = async () => {
    gestor.current!.resolver();
    setIncierto(false);
    setErrorEnvio('');
    await recargar(); // puede que la entrada sí se haya guardado: se refleja en la lista
  };

  return (
    <section className="bg-card border border-border rounded-2xl p-4 mb-6" aria-labelledby="titulo-bitacora-incidente">
      <h3
        id="titulo-bitacora-incidente"
        className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2"
      >
        <BookOpen size={14} className="flex-shrink-0" />
        Bitácora del incidente
      </h3>

      {cargando && !bitacora && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {errorCarga && (
        <div role="alert" className="mb-3 text-sm text-destructive">
          <p>{errorCarga}</p>
          <button
            type="button"
            onClick={() => {
              setCargando(true);
              void recargar();
            }}
            className="mt-2 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold"
          >
            Reintentar
          </button>
        </div>
      )}

      {bitacora && (
        <>
          {bitacora.entradas.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-3">Aún no hay entradas.</p>
          ) : (
            <ol aria-label="Entradas de la bitácora" className="space-y-3 mb-4">
              {bitacora.entradas.map((entrada) => {
                const original = entradaCorregida(bitacora.entradas, entrada);
                return (
                  <li key={entrada.id} className="rounded-xl border border-border p-3 text-sm">
                    <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2">
                      <span className="font-semibold">{ETIQUETAS_TIPO_ENTRADA[entrada.tipo]}</span>
                      <span>{textoAutorEntrada(entrada)}</span>
                      <time dateTime={entrada.registradaEn}>{fechaHoraEntrada(entrada.registradaEn, zonaHoraria)}</time>
                    </p>
                    {entrada.tipo === 'correccion' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {original
                          ? `Corrige la entrada de ${horaCorta(original.registradaEn, zonaHoraria) ?? '—'} de ${textoAutorEntrada(original)}: «${resumenTexto(original.texto)}»`
                          : 'Corrige una entrada anterior.'}
                      </p>
                    )}
                    <p className="mt-1 whitespace-pre-wrap break-words">{entrada.texto}</p>
                    {bitacora.puedeEscribir && entrada.tipo !== 'cierre' && (
                      <button
                        type="button"
                        onClick={() => setCorrigiendo(entrada)}
                        disabled={incierto || enviando}
                        className="mt-2 text-xs font-semibold text-primary disabled:opacity-50"
                      >
                        Corregir
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {bitacora.puedeEscribir ? (
            <div>
              <p role="note" className="mb-2 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
                {AVISO_PRIVACIDAD_BITACORA}
              </p>
              {corrigiendo && (
                <p className="mb-2 flex items-center justify-between gap-2 text-xs font-medium">
                  <span>Corrigiendo la entrada de {horaCorta(corrigiendo.registradaEn, zonaHoraria) ?? '—'}</span>
                  <button
                    type="button"
                    onClick={() => setCorrigiendo(null)}
                    disabled={incierto || enviando}
                    className="text-primary font-semibold disabled:opacity-50"
                  >
                    Cancelar corrección
                  </button>
                </p>
              )}
              <label className="block text-sm font-medium mb-1.5" htmlFor="texto-bitacora-incidente">
                Nueva entrada
              </label>
              <textarea
                id="texto-bitacora-incidente"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                maxLength={LIMITE_TEXTO_ENTRADA}
                readOnly={incierto}
                rows={3}
                className="input-field mb-1"
              />
              <p className="text-xs text-muted-foreground mb-2 text-right">
                {texto.length}/{LIMITE_TEXTO_ENTRADA}
              </p>
              {incierto ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void enviar()}
                    disabled={enviando}
                    className="flex-1 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm disabled:opacity-60"
                  >
                    {enviando ? 'Guardando…' : 'Reintentar envío'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void descartar()}
                    disabled={enviando}
                    className="flex-1 py-2.5 border border-border font-semibold rounded-xl text-sm disabled:opacity-60"
                  >
                    Descartar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void enviar()}
                  disabled={enviando}
                  className="w-full py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm disabled:opacity-60"
                >
                  {enviando ? 'Guardando…' : 'Añadir entrada'}
                </button>
              )}
            </div>
          ) : (
            textoSoloLectura(bitacora) && (
              <p className="text-xs text-muted-foreground">{textoSoloLectura(bitacora)}</p>
            )
          )}
        </>
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
