import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import {
  ADVERTENCIA_MOTIVO_RELEVO,
  AVISO_RELEVO_CANCELADO,
  AVISO_RELEVO_RECHAZADO,
  MOTIVO_RELEVO_MAXIMO,
  TEXTO_CONFIRMAR_CANCELACION,
  TEXTO_CONFIRMAR_RECHAZO,
  crearGestorOperacion,
  intentarAceptarRelevo,
  intentarCancelarRelevo,
  intentarProponerRelevo,
  intentarRechazarRelevo,
  puedeAceptarRelevo,
  puedeCancelarRelevo,
  puedeProponerRelevo,
  puedeRechazarRelevo,
  textoRelevoPendiente,
  validarMotivoRelevo,
  type AceptarRelevoFn,
  type CancelarRelevoFn,
  type GestorOperacion,
  type ProponerRelevoFn,
  type RechazarRelevoFn,
  type ResultadoRelevoUi,
} from '@/lib/coordinacionRescate';
import { generarUuid } from '@/lib/uuid';
import {
  aceptarRelevo,
  cancelarRelevo,
  obtenerRescatistasElegibles,
  proponerRelevo,
  rechazarRelevo,
  type Coordinacion,
  type RescatistaElegible,
} from '@/services/rescate';

export type BloqueRelevoProps = {
  expedicionId: string;
  /** Coordinación vigente que informa el servidor. */
  coordinacion: Coordinacion;
  /** Se llama tras proponer, aceptar, rechazar, cancelar o un rechazo por estado cambiado, para volver a leer la pantalla. */
  alActualizar: () => void;
  /** Solo para pruebas. */
  proponer?: ProponerRelevoFn;
  /** Solo para pruebas. */
  aceptar?: AceptarRelevoFn;
  /** Solo para pruebas. */
  rechazar?: RechazarRelevoFn;
  /** Solo para pruebas. */
  cancelar?: CancelarRelevoFn;
  /** Solo para pruebas. */
  listarRescatistas?: () => Promise<{ rescatistas: RescatistaElegible[] }>;
  /** Solo para pruebas. */
  generarId?: () => string;
};

/**
 * HU-40: relevo de la coordinación dentro de `BloqueCoordinacion`. Responsable sin relevo:
 * "Transferir coordinación". Relevo pendiente: texto según quién consulta; el destinatario
 * ve "Aceptar relevo" y "Rechazar", y quien propuso ve "Cancelar relevo" (rechazar y
 * cancelar piden una confirmación). Sin vencimiento: el relevo sigue hasta que alguien lo
 * resuelva. Las reglas viven en `lib/coordinacionRescate.ts`; aquí
 * solo hay estado de pantalla. Lo que informa el servidor (`coordinacion`) manda: la
 * respuesta local solo cubre el instante hasta la siguiente lectura.
 */
export function BloqueRelevo({
  expedicionId,
  coordinacion,
  alActualizar,
  proponer = proponerRelevo,
  aceptar = aceptarRelevo,
  rechazar = rechazarRelevo,
  cancelar = cancelarRelevo,
  listarRescatistas = obtenerRescatistasElegibles,
  generarId = generarUuid,
}: BloqueRelevoProps) {
  const [respuesta, setRespuesta] = useState<Coordinacion | null>(null);
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [rescatistas, setRescatistas] = useState<RescatistaElegible[] | null>(null);
  const [destinatarioId, setDestinatarioId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  /** Resultado correcto de rechazar o cancelar (no es un error). */
  const [aviso, setAviso] = useState('');
  /** Acción pendiente de confirmar: rechazar o cancelar. */
  const [confirmar, setConfirmar] = useState<'rechazar' | 'cancelar' | null>(null);
  const [accion, setAccion] = useState<'aceptar' | 'rechazar' | 'cancelar' | null>(null);
  const gestorProponer = useRef<GestorOperacion | null>(null);
  const gestorAceptar = useRef<GestorOperacion | null>(null);
  const gestorRechazar = useRef<GestorOperacion | null>(null);
  const gestorCancelar = useRef<GestorOperacion | null>(null);
  gestorProponer.current ??= crearGestorOperacion(generarId);
  gestorAceptar.current ??= crearGestorOperacion(generarId);
  gestorRechazar.current ??= crearGestorOperacion(generarId);
  gestorCancelar.current ??= crearGestorOperacion(generarId);

  // Una lectura nueva del servidor reemplaza a la respuesta local.
  useEffect(() => {
    setRespuesta(null);
  }, [coordinacion]);

  const efectiva = respuesta ?? coordinacion;

  const abrirFormulario = async () => {
    setFormularioAbierto(true);
    setMensaje('');
    setAviso('');
    if (rescatistas !== null) return;
    try {
      setRescatistas((await listarRescatistas()).rescatistas);
    } catch (error) {
      setMensaje((error as { message?: string }).message || 'No se pudo cargar la lista de rescatistas.');
    }
  };

  const terminar = (resultado: ResultadoRelevoUi, avisoCorrecto = '') => {
    setConfirmar(null);
    if (resultado.tipo === 'ok') {
      setRespuesta(resultado.coordinacion);
      setFormularioAbierto(false);
      setMotivo('');
      setDestinatarioId('');
      setMensaje('');
      setAviso(avisoCorrecto);
      alActualizar();
    } else if (resultado.tipo === 'releer') {
      setFormularioAbierto(false);
      setMensaje(resultado.mensaje);
      setAviso('');
      alActualizar();
    } else {
      setMensaje(resultado.mensaje);
    }
  };

  const alConfirmar = async () => {
    if (enviando) return;
    const errorMotivo = validarMotivoRelevo(motivo);
    if (!destinatarioId) return setMensaje('Elige a quién transferir la coordinación.');
    if (errorMotivo) return setMensaje(errorMotivo);
    setEnviando(true);
    setMensaje('');
    setAviso('');
    try {
      terminar(
        await intentarProponerRelevo(
          expedicionId,
          { destinatarioId, motivo, versionIncidente: efectiva.version },
          gestorProponer.current!,
          proponer,
        ),
      );
    } finally {
      setEnviando(false);
    }
  };

  const alAceptar = async () => {
    const relevo = efectiva.relevoPendiente;
    if (enviando || !relevo) return;
    setEnviando(true);
    setAccion('aceptar');
    setMensaje('');
    setAviso('');
    try {
      terminar(await intentarAceptarRelevo(expedicionId, relevo.relevoId, gestorAceptar.current!, aceptar));
    } finally {
      setEnviando(false);
      setAccion(null);
    }
  };

  /** Rechazar (destinatario) o cancelar (quien propuso), ya confirmado. */
  const alResolver = async (tipo: 'rechazar' | 'cancelar') => {
    const relevo = efectiva.relevoPendiente;
    if (enviando || !relevo) return;
    setEnviando(true);
    setAccion(tipo);
    setMensaje('');
    setAviso('');
    try {
      terminar(
        tipo === 'rechazar'
          ? await intentarRechazarRelevo(expedicionId, relevo.relevoId, gestorRechazar.current!, rechazar)
          : await intentarCancelarRelevo(expedicionId, relevo.relevoId, gestorCancelar.current!, cancelar),
        tipo === 'rechazar' ? AVISO_RELEVO_RECHAZADO : AVISO_RELEVO_CANCELADO,
      );
    } finally {
      setEnviando(false);
      setAccion(null);
    }
  };

  const textoPendiente = textoRelevoPendiente(efectiva);

  return (
    <div className="mt-2 text-sm" aria-live="polite">
      {textoPendiente && (
        <p className="flex items-center gap-2">
          <ArrowRightLeft size={14} className="flex-shrink-0" />
          <span>{textoPendiente}</span>
        </p>
      )}

      {confirmar !== null && (
        <div className="mt-2 space-y-2">
          <p className="text-xs font-medium">
            {confirmar === 'rechazar' ? TEXTO_CONFIRMAR_RECHAZO : TEXTO_CONFIRMAR_CANCELACION}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void alResolver(confirmar)}
              disabled={enviando}
              className="flex-1 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm disabled:opacity-60"
            >
              {accion === 'rechazar'
                ? 'Rechazando…'
                : accion === 'cancelar'
                  ? 'Cancelando…'
                  : confirmar === 'rechazar'
                    ? 'Sí, rechazar'
                    : 'Sí, cancelar relevo'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmar(null)}
              disabled={enviando}
              className="py-2.5 px-4 border border-border font-semibold rounded-xl text-sm disabled:opacity-60"
            >
              No, volver
            </button>
          </div>
        </div>
      )}

      {confirmar === null && puedeAceptarRelevo(efectiva) && (
        <button
          type="button"
          onClick={() => void alAceptar()}
          disabled={enviando}
          className="w-full mt-2 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm disabled:opacity-60"
        >
          {accion === 'aceptar' ? 'Aceptando…' : 'Aceptar relevo'}
        </button>
      )}

      {confirmar === null && puedeRechazarRelevo(efectiva) && (
        <button
          type="button"
          onClick={() => {
            setMensaje('');
            setAviso('');
            setConfirmar('rechazar');
          }}
          disabled={enviando}
          className="w-full mt-2 py-2.5 border border-border font-semibold rounded-xl text-sm disabled:opacity-60"
        >
          Rechazar
        </button>
      )}

      {confirmar === null && puedeCancelarRelevo(efectiva) && (
        <button
          type="button"
          onClick={() => {
            setMensaje('');
            setAviso('');
            setConfirmar('cancelar');
          }}
          disabled={enviando}
          className="w-full mt-2 py-2.5 border border-border font-semibold rounded-xl text-sm disabled:opacity-60"
        >
          Cancelar relevo
        </button>
      )}

      {puedeProponerRelevo(efectiva) && !formularioAbierto && (
        <button
          type="button"
          onClick={() => void abrirFormulario()}
          className="w-full mt-2 py-2.5 border border-border font-semibold rounded-xl text-sm"
        >
          Transferir coordinación
        </button>
      )}

      {puedeProponerRelevo(efectiva) && formularioAbierto && (
        <div className="mt-2 space-y-2">
          <label className="block text-xs font-medium">
            Nuevo responsable
            <select
              value={destinatarioId}
              onChange={(e) => {
                setDestinatarioId(e.target.value);
                gestorProponer.current!.resolver();
              }}
              className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-sm"
            >
              <option value="">Elige un rescatista…</option>
              {(rescatistas ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombreCompleto}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium">
            Motivo del relevo
            <textarea
              value={motivo}
              maxLength={MOTIVO_RELEVO_MAXIMO}
              rows={3}
              onChange={(e) => {
                setMotivo(e.target.value);
                gestorProponer.current!.resolver();
              }}
              className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-sm"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {ADVERTENCIA_MOTIVO_RELEVO} {motivo.length}/{MOTIVO_RELEVO_MAXIMO}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void alConfirmar()}
              disabled={enviando}
              className="flex-1 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm disabled:opacity-60"
            >
              {enviando ? 'Enviando…' : 'Confirmar transferencia'}
            </button>
            <button
              type="button"
              onClick={() => setFormularioAbierto(false)}
              disabled={enviando}
              className="py-2.5 px-4 border border-border font-semibold rounded-xl text-sm disabled:opacity-60"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {aviso && (
        <p role="status" className="text-xs text-muted-foreground mt-2">
          {aviso}
        </p>
      )}

      {mensaje && (
        <p role="alert" className="text-xs text-destructive mt-2">
          {mensaje}
        </p>
      )}
    </div>
  );
}
