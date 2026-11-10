import { useRef, useState } from 'react';
import { UserCheck } from 'lucide-react';
import {
  TEXTO_OTRO_COORDINA_SIN_NOMBRE,
  TEXTO_SIN_RESPONSABLE,
  crearGestorOperacion,
  intentarAsumir,
  puedeAsumir,
  textoCoordinacion,
  textoCoordinadaPor,
  type AsumirCoordinacion,
  type EstadoExpedicionRescate,
  type GestorOperacion,
} from '@/lib/coordinacionRescate';
import { generarUuid } from '@/lib/uuid';
import { asumirCoordinacion, type Coordinacion } from '@/services/rescate';

export type BloqueCoordinacionProps = {
  expedicionId: string;
  estado: EstadoExpedicionRescate;
  /** Coordinación vigente que informa el servidor, o `null` si la alerta no tiene responsable. */
  coordinacion: Coordinacion | null | undefined;
  /** Se llama tras asumir o tras un conflicto, para que la pantalla vuelva a leer los datos. */
  alActualizar: () => void;
  /** Solo para pruebas. */
  asumir?: AsumirCoordinacion;
  /** Solo para pruebas. */
  generarId?: () => string;
};

type Local =
  | { tipo: 'asumida'; coordinacion: Coordinacion }
  | { tipo: 'conflicto'; nombre: string | null }
  | null;

/**
 * HU-39: quién coordina una alerta y, si nadie, el botón para asumirla. Es independiente de
 * "Confirmar recepción" (HU-14). Con datos del servidor (`coordinacion`) siempre manda lo que
 * informa el servidor; lo local solo cubre el instante entre la respuesta y la nueva lectura.
 */
export function BloqueCoordinacion({
  expedicionId,
  estado,
  coordinacion,
  alActualizar,
  asumir = asumirCoordinacion,
  generarId = generarUuid,
}: BloqueCoordinacionProps) {
  const [enviando, setEnviando] = useState(false);
  const [local, setLocal] = useState<Local>(null);
  const [mensajeError, setMensajeError] = useState('');
  // El operacionId vive mientras el resultado del intento sea desconocido (ver crearGestorOperacion).
  const gestor = useRef<GestorOperacion | null>(null);
  gestor.current ??= crearGestorOperacion(generarId);

  const alAsumir = async () => {
    if (enviando) return;
    setEnviando(true);
    setMensajeError('');
    try {
      const resultado = await intentarAsumir(expedicionId, gestor.current!, asumir);
      if (resultado.tipo === 'asumida') {
        setLocal({ tipo: 'asumida', coordinacion: resultado.coordinacion });
      } else if (resultado.tipo === 'conflicto') {
        setLocal({ tipo: 'conflicto', nombre: resultado.responsable?.nombreResponsable ?? null });
      } else {
        setMensajeError(resultado.mensaje);
      }
      if (resultado.tipo !== 'error') alActualizar();
    } finally {
      setEnviando(false);
    }
  };

  const texto = textoVisible(coordinacion ?? null, local);
  if (texto !== null) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 p-3 mb-3 text-sm" aria-live="polite">
        <p className="flex items-center gap-2 font-medium">
          <UserCheck size={14} className="flex-shrink-0" />
          <span>{texto}</span>
        </p>
      </div>
    );
  }

  if (!puedeAsumir(estado, coordinacion)) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 mb-3 text-sm" aria-live="polite">
      <p className="flex items-center gap-2 font-medium mb-2">
        <UserCheck size={14} className="flex-shrink-0" />
        <span>{TEXTO_SIN_RESPONSABLE}</span>
      </p>
      <button
        type="button"
        onClick={() => void alAsumir()}
        disabled={enviando}
        className="w-full py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm disabled:opacity-60"
      >
        {enviando ? 'Asumiendo…' : 'Asumir coordinación'}
      </button>
      {mensajeError && (
        <p role="alert" className="text-xs text-destructive mt-2">
          {mensajeError}
        </p>
      )}
    </div>
  );
}

/** Qué se muestra cuando ya hay un responsable; `null` si la alerta sigue sin responsable. */
function textoVisible(coordinacion: Coordinacion | null, local: Local): string | null {
  if (coordinacion) return textoCoordinacion(coordinacion);
  if (local?.tipo === 'asumida') return textoCoordinacion(local.coordinacion);
  if (local?.tipo === 'conflicto') {
    return local.nombre ? textoCoordinadaPor(local.nombre) : TEXTO_OTRO_COORDINA_SIN_NOMBRE;
  }
  return null;
}
