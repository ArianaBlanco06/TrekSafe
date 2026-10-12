import { Link, useLocation, Navigate } from 'react-router-dom';
import { Check } from 'lucide-react';

type EstadoUbicacion = {
  lugarFin?: string;
  confirmadoEn?: string;
};

export function PaginaRetornoConfirmado() {
  const location = useLocation();
  const state = (location.state as EstadoUbicacion | null) ?? {};

  if (!state.confirmadoEn) {
    return <Navigate to="/senderista" replace />;
  }

  const etiquetaRetorno = new Date(state.confirmadoEn).toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="px-6 py-12 flex flex-col items-center text-center min-h-[70vh] justify-center">
      <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
        <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30">
          <Check size={32} className="text-primary-foreground" />
        </div>
      </div>

      <h1 className="text-2xl font-bold mb-2">¡Retorno confirmado!</h1>
      <p className="text-muted-foreground text-sm mb-8">Has regresado de forma segura.</p>

      <div className="w-full bg-card rounded-2xl border border-border p-5 mb-8 text-left space-y-3">
        {state.lugarFin && (
          <div className="flex justify-between gap-3">
            <span className="text-sm text-muted-foreground">Expedición</span>
            <span className="text-sm font-semibold text-right">{state.lugarFin}</span>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <span className="text-sm text-muted-foreground">Hora de retorno</span>
          <span className="text-sm font-semibold">{etiquetaRetorno}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-sm text-muted-foreground">Estado</span>
          <span className="text-sm font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
            Finalizada
          </span>
        </div>
      </div>

      <div className="w-full space-y-3">
        <Link to="/senderista" className="btn-primary block text-center">
          Volver al inicio
        </Link>
        <Link
          to="/senderista/expedicion/nueva"
          className="block text-center py-3 text-sm font-semibold text-primary"
        >
          Registrar nueva expedición
        </Link>
      </div>
    </div>
  );
}
