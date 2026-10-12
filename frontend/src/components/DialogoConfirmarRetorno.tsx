import { useEffect, useState } from 'react';
import { Lock, X } from 'lucide-react';
import { confirmarRetorno } from '@/services/expedicion';
import { FieldLabel } from '@/components/Layout';

type Props = {
  expedicionId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: (confirmadoEn: string) => void;
  enLinea?: boolean;
};

export function DialogoConfirmarRetorno({
  expedicionId,
  open,
  onClose,
  onSuccess,
  enLinea = true,
}: Props) {
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleClose = () => {
    setContrasena('');
    setError('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contrasena) return;
    if (!enLinea) {
      setError('Sin conexión. El retorno seguro requiere red para registrarse en el servidor.');
      return;
    }
    setError('');
    setCargando(true);
    try {
      const resultado = await confirmarRetorno(expedicionId, contrasena);
      setContrasena('');
      onSuccess(resultado.confirmadoEn);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo confirmar el retorno');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-24">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmar-retorno-titulo"
        className="relative w-full max-w-sm bg-card rounded-3xl p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-primary" />
            <h3 id="confirmar-retorno-titulo" className="font-bold">
              Confirmar retorno seguro
            </h3>
          </div>
          <button type="button" onClick={handleClose} aria-label="Cerrar" className="btn-touch">
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Ingresa tu contraseña para cerrar la expedición y confirmar que regresaste a salvo.
        </p>

        {!enLinea && (
          <div className="error-banner mb-4">
            Estás offline. Conéctate para registrar el retorno en el servidor.
          </div>
        )}

        {error && <div className="error-banner mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <FieldLabel htmlFor="confirmar-retorno-contrasena">Contraseña</FieldLabel>
            <input
              id="confirmar-retorno-contrasena"
              type="password"
              className="input-field"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              placeholder="Tu contraseña de cuenta"
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={!contrasena || cargando || !enLinea}
          >
            {cargando ? 'Confirmando…' : 'Registrar retorno seguro'}
          </button>
        </form>
      </div>
    </div>
  );
}
