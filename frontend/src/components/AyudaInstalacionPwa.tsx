import { useEffect, useId, useRef, useState } from 'react';
import { Smartphone, X } from 'lucide-react';

export function AyudaInstalacionPwa() {
  const id = useId();
  const dialogo = useRef<HTMLDialogElement>(null);
  const botonAyuda = useRef<HTMLButtonElement>(null);
  const [enNavegador, setEnNavegador] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const modoApp = window.matchMedia(
      '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen), (display-mode: window-controls-overlay)',
    );
    const navegador = window.navigator as Navigator & { standalone?: boolean };
    const actualizar = () => setEnNavegador(!modoApp.matches && navegador.standalone !== true);
    actualizar();
    modoApp.addEventListener('change', actualizar);
    return () => modoApp.removeEventListener('change', actualizar);
  }, []);

  useEffect(() => {
    if (!enNavegador) return;
    const elemento = dialogo.current;
    elemento?.showModal();
    return () => { elemento?.close(); };
  }, [enNavegador]);

  if (!enNavegador) return null;

  const cerrar = () => {
    dialogo.current?.close();
    botonAyuda.current?.focus();
  };

  return (
    <>
      <button
        ref={botonAyuda}
        type="button"
        onClick={() => dialogo.current?.showModal()}
        className="mb-5 inline-flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-primary rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Smartphone size={16} aria-hidden="true" />
        Cómo instalar TrekSafe
      </button>

      <dialog
        ref={dialogo}
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        onCancel={(evento) => { evento.preventDefault(); cerrar(); }}
        className="ayuda-instalacion fixed inset-x-0 bottom-0 top-auto m-0 mx-auto w-full max-w-sm max-h-[80dvh] overflow-y-auto rounded-t-3xl border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-foreground shadow-2xl backdrop:bg-black/30"
      >
        <div className="flex items-start gap-3 mb-5">
          <Smartphone size={24} className="shrink-0 text-primary mt-1" aria-hidden="true" />
          <h2 id={`${id}-titulo`} className="flex-1 text-base font-bold">TrekSafe en tu pantalla de inicio</h2>
          <button type="button" onClick={cerrar} autoFocus aria-label="Cerrar instrucciones de instalación"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 text-sm text-muted-foreground">
          <section aria-labelledby={`${id}-android`}>
            <h3 id={`${id}-android`} className="font-semibold text-foreground mb-2">Android · Chrome</h3>
            <p>
              Menú <strong className="text-foreground">⋮</strong> → <strong className="text-foreground">Instalar y crear acceso directo</strong> (o <strong className="text-foreground">Añadir a pantalla de inicio</strong>) → <strong className="text-foreground">Instalar</strong>.
            </p>
          </section>

          <section aria-labelledby={`${id}-iphone`}>
            <h3 id={`${id}-iphone`} className="font-semibold text-foreground mb-2">iPhone · Safari</h3>
            <p>
              <strong className="text-foreground">Compartir</strong> → <strong className="text-foreground">Añadir a pantalla de inicio</strong> → activa <strong className="text-foreground">Abrir como app web</strong>, si aparece → <strong className="text-foreground">Añadir</strong>.
            </p>
          </section>
        </div>
        <button type="button" onClick={cerrar} className="btn-primary mt-6">Entendido</button>
      </dialog>
    </>
  );
}
