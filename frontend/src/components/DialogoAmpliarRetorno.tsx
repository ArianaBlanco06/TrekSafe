import { useEffect, useState } from 'react';
import { Clock, X } from 'lucide-react';
import { FieldError, FieldLabel } from '@/components/Layout';
import { ErrorClienteApi } from '@/services/clienteApi';
import {
  ampliarRetorno,
  MAX_MINUTOS_AMPLIACION,
  MAX_MOTIVO_AMPLIACION,
  MIN_MINUTOS_AMPLIACION,
  MIN_MOTIVO_AMPLIACION,
  type ResultadoAmpliacionRetorno,
} from '@/services/expedicion';

type Props = {
  expedicionId: string;
  versionEsperada: number;
  horaRetornoEstimada: string;
  onClose: () => void;
  onSuccess: (resultado: ResultadoAmpliacionRetorno) => void;
  /** El servidor rechazó por un cambio de estado: la página debe recargar la expedición. */
  onRecargar: () => void;
};

const MENSAJES_409: Record<string, string> = {
  PLAZO_VENCIDO: 'Tu plazo ya venció y no se puede ampliar. Confirma tu retorno si estás a salvo.',
  ALERTA_YA_DECLARADA:
    'La alerta ya se declaró y tus contactos fueron avisados. Confirma tu retorno si estás a salvo.',
  AMPLIACION_NO_DISPONIBLE: 'Ya usaste la ampliación disponible para esta expedición.',
  RETORNO_NO_AMPLIABLE: 'Esta expedición ya no está en curso.',
};

function formatearHora(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function validarMinutos(texto: string): string {
  const valor = texto.trim();
  if (valor === '') return 'Indica cuántos minutos necesitas';
  const minutos = Number(valor);
  if (!Number.isInteger(minutos)) return 'Usa un número entero de minutos';
  if (minutos < MIN_MINUTOS_AMPLIACION || minutos > MAX_MINUTOS_AMPLIACION) {
    return `Amplía entre ${MIN_MINUTOS_AMPLIACION} y ${MAX_MINUTOS_AMPLIACION} minutos`;
  }
  return '';
}

function validarMotivo(texto: string): string {
  const largo = texto.trim().length;
  if (largo === 0) return 'El motivo es obligatorio';
  if (largo < MIN_MOTIVO_AMPLIACION) {
    return `El motivo debe tener al menos ${MIN_MOTIVO_AMPLIACION} caracteres`;
  }
  if (largo > MAX_MOTIVO_AMPLIACION) {
    return `El motivo admite como máximo ${MAX_MOTIVO_AMPLIACION} caracteres`;
  }
  return '';
}

/**
 * Ampliación del retorno de HU-35. Se monta al abrirse y se desmonta al cerrarse, de
 * modo que cada intento tiene un único `operacionId`: si el envío falla y el usuario
 * reintenta, se reutiliza y el servidor no suma los minutos dos veces.
 */
export function DialogoAmpliarRetorno({
  expedicionId,
  versionEsperada,
  horaRetornoEstimada,
  onClose,
  onSuccess,
  onRecargar,
}: Props) {
  const [operacionId] = useState(() => crypto.randomUUID());
  // Texto, no número: el campo se puede vaciar y reescribir; se valida al enviar.
  const [minutos, setMinutos] = useState('30');
  const [motivo, setMotivo] = useState('');
  const [errorMinutos, setErrorMinutos] = useState('');
  const [errorMotivo, setErrorMotivo] = useState('');
  const [error, setError] = useState('');
  const [versionObsoleta, setVersionObsoleta] = useState(false);
  const [rechazoFinal, setRechazoFinal] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cerrar = () => {
    if (!enviando) onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !enviando) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enviando, onClose]);

  const minutosValidos = validarMinutos(minutos) === '' ? Number(minutos) : null;
  const nuevaHora =
    minutosValidos === null
      ? null
      : new Date(new Date(horaRetornoEstimada).getTime() + minutosValidos * 60_000).toISOString();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando || rechazoFinal || versionObsoleta) return;

    const errMinutos = validarMinutos(minutos);
    const errMotivo = validarMotivo(motivo);
    setErrorMinutos(errMinutos);
    setErrorMotivo(errMotivo);
    if (errMinutos || errMotivo) return;

    setError('');
    setEnviando(true);
    try {
      const { expedicion } = await ampliarRetorno(
        expedicionId,
        { versionEsperada, minutos: Number(minutos), motivo },
        operacionId,
      );
      onSuccess(expedicion);
    } catch (err) {
      if (err instanceof ErrorClienteApi && err.codigo === 'VERSION_OBSOLETA') {
        setVersionObsoleta(true);
      } else if (err instanceof ErrorClienteApi && err.codigo && MENSAJES_409[err.codigo]) {
        setError(MENSAJES_409[err.codigo]);
        setRechazoFinal(true);
        onRecargar();
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo ampliar el retorno');
      }
      setEnviando(false);
    }
  };

  const bloqueado = enviando || rechazoFinal || versionObsoleta;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-24">
      <div className="absolute inset-0 bg-black/40" onClick={cerrar} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ampliar-retorno-titulo"
        className="relative w-full max-w-sm bg-card rounded-3xl p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-primary" />
            <h3 id="ampliar-retorno-titulo" className="font-bold">
              Ampliar retorno
            </h3>
          </div>
          <button
            type="button"
            onClick={cerrar}
            disabled={enviando}
            aria-label="Cerrar"
            className="btn-touch"
          >
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Retorno estimado actual:{' '}
          <strong className="text-foreground">{formatearHora(horaRetornoEstimada)}</strong>. Los
          minutos se suman a esta hora y la ampliación queda registrada con su motivo.
        </p>

        {versionObsoleta && (
          <div className="error-banner mb-4" role="alert">
            <p className="mb-2">
              La expedición cambió desde que abriste esta pantalla. Recárgala para ver los datos
              actuales.
            </p>
            <button
              type="button"
              onClick={() => {
                onRecargar();
                onClose();
              }}
              className="text-sm font-semibold underline"
            >
              Recargar expedición
            </button>
          </div>
        )}

        {error && (
          <div className="error-banner mb-4" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <FieldLabel htmlFor="ampliar-retorno-minutos">Minutos adicionales</FieldLabel>
            <input
              id="ampliar-retorno-minutos"
              type="number"
              inputMode="numeric"
              min={MIN_MINUTOS_AMPLIACION}
              max={MAX_MINUTOS_AMPLIACION}
              step={1}
              className={`input-field ${errorMinutos ? 'input-error' : ''}`}
              value={minutos}
              onChange={(e) => {
                setMinutos(e.target.value);
                setErrorMinutos('');
              }}
              disabled={bloqueado}
              aria-required="true"
              aria-invalid={Boolean(errorMinutos)}
            />
            {errorMinutos ? (
              <FieldError message={errorMinutos} />
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                {nuevaHora
                  ? `Nuevo retorno: ${formatearHora(nuevaHora)}`
                  : `Entre ${MIN_MINUTOS_AMPLIACION} y ${MAX_MINUTOS_AMPLIACION} minutos`}
              </p>
            )}
          </div>

          <div>
            <FieldLabel htmlFor="ampliar-retorno-motivo">Motivo</FieldLabel>
            <textarea
              id="ampliar-retorno-motivo"
              className={`input-field min-h-24 resize-none ${errorMotivo ? 'input-error' : ''}`}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setErrorMotivo('');
              }}
              maxLength={MAX_MOTIVO_AMPLIACION}
              placeholder="Por ejemplo: avanzamos lento por la nieve"
              disabled={bloqueado}
              aria-required="true"
              aria-invalid={Boolean(errorMotivo)}
            />
            <div className="flex justify-between gap-2 mt-1">
              <span>{errorMotivo && <FieldError message={errorMotivo} />}</span>
              <p className="text-xs text-muted-foreground text-right flex-shrink-0">
                {motivo.length}/{MAX_MOTIVO_AMPLIACION}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={cerrar}
              disabled={enviando}
              className="flex-1 py-3 border border-border rounded-xl font-medium text-sm disabled:opacity-60"
            >
              {rechazoFinal ? 'Cerrar' : 'Volver'}
            </button>
            <button
              type="submit"
              disabled={bloqueado}
              className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm disabled:opacity-60"
            >
              {enviando ? 'Ampliando…' : 'Ampliar retorno'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
