import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import {
  ADVERTENCIA_MOTIVO_RELEVO,
  MOTIVO_RELEVO_MAXIMO,
  crearGestorOperacion,
  intentarAceptarRelevo,
  intentarProponerRelevo,
  puedeAceptarRelevo,
  puedeProponerRelevo,
  textoRelevoPendiente,
  validarMotivoRelevo,
  type AceptarRelevoFn,
  type GestorOperacion,
  type ProponerRelevoFn,
  type ResultadoRelevoUi,
} from '@/lib/coordinacionRescate';
import { generarUuid } from '@/lib/uuid';
import {
  aceptarRelevo,
  obtenerRescatistasElegibles,
  proponerRelevo,
  type Coordinacion,
  type RescatistaElegible,
} from '@/services/rescate';

export type BloqueRelevoProps = {
  expedicionId: string;
  /** Coordinación vigente que informa el servidor. */
  coordinacion: Coordinacion;
  /** Se llama tras proponer, aceptar o un rechazo por estado cambiado, para volver a leer la pantalla. */
  alActualizar: () => void;
  /** Solo para pruebas. */
  proponer?: ProponerRelevoFn;
  /** Solo para pruebas. */
  aceptar?: AceptarRelevoFn;
  /** Solo para pruebas. */
  listarRescatistas?: () => Promise<{ rescatistas: RescatistaElegible[] }>;
  /** Solo para pruebas. */
  generarId?: () => string;
};

/**
 * HU-40: relevo de la coordinación dentro de `BloqueCoordinacion`. Responsable sin relevo:
 * "Transferir coordinación". Relevo pendiente: texto según quién consulta y, para el
 * destinatario, "Aceptar relevo". Las reglas viven en `lib/coordinacionRescate.ts`; aquí
 * solo hay estado de pantalla. Lo que informa el servidor (`coordinacion`) manda: la
 * respuesta local solo cubre el instante hasta la siguiente lectura.
 */
export function BloqueRelevo({
  expedicionId,
  coordinacion,
  alActualizar,
  proponer = proponerRelevo,
  aceptar = aceptarRelevo,
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
  const gestorProponer = useRef<GestorOperacion | null>(null);
  const gestorAceptar = useRef<GestorOperacion | null>(null);
  gestorProponer.current ??= crearGestorOperacion(generarId);
  gestorAceptar.current ??= crearGestorOperacion(generarId);

  // Una lectura nueva del servidor reemplaza a la respuesta local.
  useEffect(() => {
    setRespuesta(null);
  }, [coordinacion]);

  const efectiva = respuesta ?? coordinacion;

  const abrirFormulario = async () => {
    setFormularioAbierto(true);
    setMensaje('');
    if (rescatistas !== null) return;
    try {
      setRescatistas((await listarRescatistas()).rescatistas);
    } catch (error) {
      setMensaje((error as { message?: string }).message || 'No se pudo cargar la lista de rescatistas.');
    }
  };

  const terminar = (resultado: ResultadoRelevoUi) => {
    if (resultado.tipo === 'ok') {
      setRespuesta(resultado.coordinacion);
      setFormularioAbierto(false);
      setMotivo('');
      setDestinatarioId('');
      setMensaje('');
      alActualizar();
    } else if (resultado.tipo === 'releer') {
      setFormularioAbierto(false);
      setMensaje(resultado.mensaje);
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
    setMensaje('');
    try {
      terminar(await intentarAceptarRelevo(expedicionId, relevo.relevoId, gestorAceptar.current!, aceptar));
    } finally {
      setEnviando(false);
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

      {puedeAceptarRelevo(efectiva) && (
        <button
          type="button"
          onClick={() => void alAceptar()}
          disabled={enviando}
          className="w-full mt-2 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm disabled:opacity-60"
        >
          {enviando ? 'Aceptando…' : 'Aceptar relevo'}
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

      {mensaje && (
        <p role="alert" className="text-xs text-destructive mt-2">
          {mensaje}
        </p>
      )}
    </div>
  );
}
