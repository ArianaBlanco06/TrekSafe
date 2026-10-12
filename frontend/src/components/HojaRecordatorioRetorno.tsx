import { Link } from 'react-router-dom';
import { CheckCircle, Clock, Compass } from 'lucide-react';
import type { ExpedicionActiva } from '@/services/expedicion';

function formatarRetorno(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Props = {
  expedicion: ExpedicionActiva;
  minutosRestantes: number;
  onDismiss: () => void;
  checkInHref: string;
};

export function HojaRecordatorioRetorno({ expedicion, minutosRestantes, onDismiss, checkInHref }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-secondary/50 dark:bg-black/60" aria-hidden onClick={onDismiss} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recordatorio-retorno-titulo"
        className="relative w-full max-w-sm mx-4 mb-20 bg-card rounded-3xl p-6 shadow-2xl border-t-4 border-amber-400 dark:border-amber-500"
      >
        <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-5" />

        <div className="flex items-center gap-2 mb-3">
          <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
          <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
            Recordatorio de retorno
          </span>
        </div>

        <h2 id="recordatorio-retorno-titulo" className="text-xl font-bold mb-2 leading-tight">
          {minutosRestantes <= 30
            ? `Faltan ${minutosRestantes} minutos para tu límite`
            : 'Tu expedición está próxima a vencer'}
        </h2>
        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
          Confirma tu regreso a tiempo para evitar una alerta automática a tus contactos y rescatistas.
        </p>

        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-3 mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Límite declarado</p>
            <p className="font-bold text-amber-700 dark:text-amber-300">
              {formatarRetorno(expedicion.fechaLimite)}
            </p>
          </div>
          <Clock size={22} className="text-amber-500" />
        </div>

        <div className="flex flex-col gap-3">
          <Link
            to={checkInHref}
            className="w-full min-h-[52px] py-4 bg-primary text-primary-foreground font-semibold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-primary/30 text-base"
          >
            <CheckCircle size={20} /> Confirmar retorno
          </Link>
          <Link
            to="/senderista/expedicion/activa"
            className="w-full min-h-[48px] py-3 bg-muted text-foreground font-medium rounded-2xl text-sm flex items-center justify-center gap-2"
          >
            <Compass size={16} /> Ver expedición
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="w-full py-2 text-muted-foreground text-sm min-h-[44px]"
          >
            Más tarde
          </button>
        </div>
      </div>
    </div>
  );
}
