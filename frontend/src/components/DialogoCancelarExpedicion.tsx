import { useEffect, useState } from 'react';
import { Ban, X } from 'lucide-react';
import { FieldLabel } from '@/components/Layout';
import {
  cancelarExpedicion,
  MAX_MOTIVO_CANCELACION,
  type ResultadoCancelacion,
} from '@/services/expedicion';

type Props = {
  expedicionId: string;
  destino: string;
  onClose: () => void;
  onSuccess: (resultado: ResultadoCancelacion) => void;
};

/**
 * Confirmación de HU-27. Se monta al abrirse y se desmonta al cerrarse, de modo que
 * cada intento tiene un único `operacionId`: si el envío falla y el usuario reintenta,
 * se reutiliza y el servidor no repite la cancelación.
 */
export function DialogoCancelarExpedicion({ expedicionId, destino, onClose, onSuccess }: Props) {
  const [operacionId] = useState(() => crypto.randomUUID());
  // Texto libre: se puede vaciar y reescribir; vacío equivale a "sin motivo".
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setError('');
    setEnviando(true);
    try {
      const { expedicion } = await cancelarExpedicion(expedicionId, motivo, operacionId);
      onSuccess(expedicion);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cancelar la expedición');
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-24">
      <div className="absolute inset-0 bg-black/40" onClick={cerrar} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancelar-expedicion-titulo"
        className="relative w-full max-w-sm bg-card rounded-3xl p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Ban size={18} className="text-destructive" />
            <h3 id="cancelar-expedicion-titulo" className="font-bold">
              Cancelar expedición
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
          Se cancelará tu plan a <strong className="text-foreground">{destino}</strong>. No se
          activará el monitoreo ni se generarán alertas. Esta acción no se puede deshacer.
        </p>

        {error && <div className="error-banner mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <FieldLabel htmlFor="cancelar-expedicion-motivo">Motivo (opcional)</FieldLabel>
            <textarea
              id="cancelar-expedicion-motivo"
              className="input-field min-h-24 resize-none"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={MAX_MOTIVO_CANCELACION}
              placeholder="Por ejemplo: pronóstico de tormenta"
              disabled={enviando}
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {motivo.length}/{MAX_MOTIVO_CANCELACION}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={cerrar}
              disabled={enviando}
              className="flex-1 py-3 border border-border rounded-xl font-medium text-sm"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="flex-1 py-3 bg-destructive text-white rounded-xl font-semibold text-sm disabled:opacity-60"
            >
              {enviando ? 'Cancelando…' : 'Cancelar expedición'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
