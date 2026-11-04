import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';

type Props = {
  titulo: string;
  children: ReactNode;
  textoConfirmar: string;
  textoProcesando: string;
  destructivo?: boolean;
  ocupado: boolean;
  deshabilitado: boolean;
  error: string;
  onCancelar: () => void;
  onConfirmar: () => void;
};

/** Presenta una confirmación modal; la operación pertenece a quien lo utiliza. */
export function DialogoConfirmacion({ titulo, children, textoConfirmar, textoProcesando,
  destructivo = false, ocupado, deshabilitado, error, onCancelar, onConfirmar }: Props) {
  const id = useId();
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const elemento = dialogo.current;
    // showModal mantiene el foco dentro del diálogo y vuelve inerte el resto de la PWA.
    elemento?.showModal();
    return () => { elemento?.close(); };
  }, []);

  return (
    <dialog ref={dialogo} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-descripcion`} aria-busy={ocupado}
      onCancel={(evento) => {
        evento.preventDefault();
        if (!ocupado) onCancelar();
      }}
      className="m-auto w-[90vw] max-w-sm max-h-[85dvh] overflow-y-auto rounded-3xl border border-border bg-card p-6 text-foreground shadow-2xl backdrop:bg-black/50">
      <div className={`mb-4 inline-flex rounded-2xl p-3 ${destructivo ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
        <CircleAlert size={24} aria-hidden="true" />
      </div>
      <h3 id={`${id}-titulo`} className="text-lg font-bold">{titulo}</h3>
      <div id={`${id}-descripcion`} className="mt-2 space-y-2 break-words text-sm text-muted-foreground">
        {children}
      </div>
      {error && <p role="alert" className="error-banner mt-4">{error}</p>}
      <div className="mt-6 flex flex-col gap-2">
        <button type="button" disabled={ocupado || deshabilitado} onClick={onConfirmar}
          className={destructivo
            ? 'min-h-12 w-full rounded-xl bg-destructive px-4 py-3 text-sm font-semibold text-white disabled:opacity-50'
            : 'btn-primary'}>
          {ocupado ? textoProcesando : textoConfirmar}
        </button>
        <button type="button" autoFocus disabled={ocupado} onClick={onCancelar}
          className="min-h-12 w-full rounded-xl bg-muted px-4 py-3 text-sm font-semibold disabled:opacity-50">
          Cancelar
        </button>
      </div>
    </dialog>
  );
}
