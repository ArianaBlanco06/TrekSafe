import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronLeft, Route } from 'lucide-react';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import { useEditorPuntosRuta } from '@/hooks/useEditorPuntosRuta';
import { EditorPuntosRuta } from '@/components/puntos/EditorPuntosRuta';

export function PaginaPuntosRuta() {
  const { id = '' } = useParams();
  const { usuario } = useAutenticacion();
  // Remontar por identidad evita conservar ediciones de otra ruta o cuenta.
  return <ContenidoPuntosRuta key={`${usuario?.id}:${id}`} id={id} />;
}

function ContenidoPuntosRuta({ id }: { id: string }) {
  const { state } = useLocation();
  const editor = useEditorPuntosRuta(id);
  const { ruta } = editor;

  function puedeSalir(): boolean {
    return !editor.hayCambios || window.confirm('Tienes cambios sin guardar. ¿Quieres salir y descartarlos?');
  }

  async function guardar(event: React.FormEvent) {
    event.preventDefault();
    await editor.guardar();
    // React pinta los errores antes de situar el foco en el primer campo.
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus());
  }

  return (
    <div className="px-6 py-6 space-y-5">
      <Link to="/senderista/expedicion" onClick={event => { if (!puedeSalir()) event.preventDefault(); }}
        className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft size={16} aria-hidden="true" /> Expediciones
      </Link>
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Route size={22} aria-hidden="true" /> Puntos de la ruta</h2>
        <p className="mt-2 text-sm text-muted-foreground">Organiza hasta 20 paradas intermedias antes de iniciar tu expedición.</p>
      </div>
      {editor.cargando && <p role="status" className="text-sm text-muted-foreground">Cargando puntos…</p>}
      {state?.copiaPuntosNoConfirmada === true && (
        <p role="alert" className="error-banner">
          La expedición ya se creó, pero no pudimos confirmar la copia de sus puntos.
          Revisa la lista guardada y completa los puntos que falten. No necesitas registrar otra expedición.
        </p>
      )}
      {editor.errorCarga && (
        <div role="alert" className="error-banner space-y-2">
          <p>{editor.errorCarga}</p>
          <button type="button" onClick={() => window.location.reload()} disabled={!editor.enLinea} className="min-h-11 font-semibold underline">Reintentar carga</button>
        </div>
      )}
      {ruta && (
        <>
          <section aria-label="Extremos de la ruta" className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div><p className="text-xs text-muted-foreground">Inicio</p><p className="font-semibold break-words">{ruta.expedicion.lugarInicio}</p>
              {ruta.expedicion.coordenadasInicio && <p className="text-xs text-muted-foreground">{ruta.expedicion.coordenadasInicio}</p>}</div>
            <div><p className="text-xs text-muted-foreground">Destino</p><p className="font-semibold break-words">{ruta.expedicion.lugarFin}</p>
              {ruta.expedicion.coordenadasFin && <p className="text-xs text-muted-foreground">{ruta.expedicion.coordenadasFin}</p>}</div>
            <p className="text-xs text-muted-foreground border-t border-border pt-3">Salida prevista: {new Date(ruta.expedicion.horaInicio).toLocaleString('es-PE')}</p>
          </section>
          {!editor.editable && !editor.revision && <p role="status" className="rounded-xl bg-muted p-3 text-sm">Esta expedición ya no permite modificar puntos. Puedes consultar la lista guardada.</p>}
          {!editor.enLinea && <p role="status" className="rounded-xl bg-urgent/15 p-3 text-sm">Sin conexión. Conservamos tu edición mientras mantengas esta pantalla abierta. Vuelve a conectarte para guardar.</p>}
          {editor.errorGuardado && <p role="alert" className="error-banner">{editor.errorGuardado}</p>}
          {editor.exito && <p role="status" className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{editor.exito}</p>}
          {editor.revision && (
            <section aria-label="Revisión del guardado" className="rounded-2xl border border-urgent/50 bg-urgent/10 p-4 space-y-3 text-sm">
              <p>{editor.revision === 'incierto'
                ? 'No pudimos confirmar si el servidor recibió tus puntos. Tu edición sigue en pantalla; consulta la lista actual antes de volver a guardar.'
                : 'La expedición cambió. Tu edición sigue en pantalla; revisa la lista actual antes de continuar.'}</p>
              <button type="button" onClick={() => void editor.revisar()} disabled={editor.ocupada || !editor.enLinea}
                className="min-h-11 font-semibold underline disabled:opacity-40">{editor.revisando ? 'Consultando…' : 'Revisar lista del servidor'}</button>
              {editor.versionActual && (
                <div className="space-y-3">
                  <h3 className="font-semibold">Lista actual del servidor</h3>
                  {editor.versionActual.puntos.length === 0 ? <p>Sin puntos intermedios.</p> : (
                    <ol className="space-y-2">
                      {editor.versionActual.puntos.map(punto => <li key={punto.id} className="break-words">
                        <span className="font-medium">{punto.orden}. {punto.nombre}</span>
                        <span className="block text-xs text-muted-foreground">{punto.latitud}, {punto.longitud}</span>
                      </li>)}
                    </ol>
                  )}
                  <button type="button" onClick={() => {
                    if (!editor.hayCambios || window.confirm('Se descartará tu edición y se cargarán los puntos del servidor. ¿Continuar?')) editor.cargarVersionActual();
                  }} className="min-h-11 w-full rounded-xl border border-border bg-card px-3 py-2 font-semibold">Cargar puntos del servidor</button>
                  {editor.versionActual.expedicion.editable && editor.revision !== 'estado' && (
                    <>
                      <p className="text-xs">Si conservas tu edición, al guardar reemplazarás la lista del servidor por tus puntos.</p>
                      <button type="button" onClick={editor.conservarEdicion} className="min-h-11 w-full rounded-xl border border-primary/40 bg-card px-3 py-2 font-semibold text-primary">Conservar mi edición</button>
                    </>
                  )}
                </div>
              )}
            </section>
          )}
          <form onSubmit={event => void guardar(event)} noValidate className="space-y-5" aria-busy={editor.guardando}>
            <EditorPuntosRuta puntos={editor.puntos} errores={editor.errores} deshabilitado={!editor.editable || editor.ocupada}
              agregar={editor.agregar} actualizar={editor.actualizar} quitar={editor.quitar} mover={editor.mover} />
            <div className="rounded-2xl border border-border bg-card p-3 space-y-2 shadow-lg">
              <p className="text-xs text-muted-foreground" aria-live="polite">{editor.hayCambios ? 'Cambios sin guardar' : 'Lista actualizada'}</p>
              <button type="submit" className="btn-primary" disabled={!editor.editable || editor.ocupada || !editor.enLinea || !!editor.revision || !editor.hayCambios}>
                {editor.guardando ? 'Guardando puntos…' : 'Guardar puntos'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
