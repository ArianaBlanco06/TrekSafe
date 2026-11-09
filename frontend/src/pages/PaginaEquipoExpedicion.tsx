import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Backpack, CheckCircle2, ChevronLeft, RefreshCw } from 'lucide-react';
import { DialogoConfirmacion } from '@/components/DialogoConfirmacion';
import { ListaPreparacionEquipo } from '@/components/equipo/ListaPreparacionEquipo';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';
import { usePreparacionExpedicion } from '@/hooks/usePreparacionExpedicion';
import { getSessionScope } from '@/lib/sesion';
import { fuentesEquipoExpedicion, type FuentesEquipoExpedicion } from '@/services/preparacionExpedicion';

export function PaginaEquipoExpedicion({ fuentes = fuentesEquipoExpedicion }: { fuentes?: FuentesEquipoExpedicion }) {
  const { id = '' } = useParams();
  const { usuario } = useAutenticacion();
  return <GestionEquipoExpedicion key={`${usuario?.id}:${getSessionScope()}:${id}`} expedicionId={id} fuentes={fuentes} />;
}

export function GestionEquipoExpedicion({ expedicionId, fuentes }: { expedicionId: string; fuentes: FuentesEquipoExpedicion }) {
  const enLinea = useEstadoEnLinea();
  const equipo = usePreparacionExpedicion(expedicionId, fuentes, enLinea);
  const [listaId, setListaId] = useState('');
  const [confirmacion, setConfirmacion] = useState(false);
  const seleccionada = equipo.listas.find((lista) => lista.id === listaId);
  const preparacion = equipo.datos?.preparacion;
  const estado = equipo.datos?.expedicion.estado;
  const bloqueado = equipo.cargando || equipo.ocupado || !enLinea || !equipo.puedeEditar;
  useEffect(() => {
    if (preparacion || !seleccionada || !equipo.puedeEditar) setConfirmacion(false);
  }, [preparacion, seleccionada, equipo.puedeEditar]);

  return (
    <div className="px-6 py-6 space-y-5">
      <Link to="/senderista/expedicion" className="flex items-center gap-1 text-sm text-muted-foreground min-h-10">
        <ChevronLeft size={18} aria-hidden="true" /> Mis expediciones
      </Link>
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Backpack size={22} aria-hidden="true" /> Equipo de la expedición</h2>
        {equipo.datos && <p className="text-sm text-muted-foreground mt-1 break-words">{equipo.datos.expedicion.lugarFin}</p>}
      </div>
      {/* Este acceso no depende de cargar ni completar el equipo. */}
      <Link to="/senderista/expedicion/activa" className="inline-flex items-center min-h-12 text-sm font-semibold text-primary">
        {estado === 'en_progreso' || estado === 'alerta' ? 'Volver a la expedición activa y registrar retorno' : 'Ver expedición activa y retorno seguro'}
      </Link>
      {!enLinea && <p role="status" className="rounded-xl border border-border bg-muted p-4 text-sm">
        Conéctate para consultar o guardar el equipo. Las marcas visibles corresponden al último guardado confirmado.
      </p>}
      <button type="button" disabled={!enLinea || equipo.ocupado || equipo.cargando} onClick={() => { void equipo.cargar(); }}
        className="min-h-12 inline-flex items-center gap-2 text-sm font-semibold text-primary disabled:opacity-50">
        <RefreshCw size={16} aria-hidden="true" /> Actualizar equipo
      </button>
      {equipo.cargando && <p role="status" className="text-sm text-muted-foreground">Cargando equipo…</p>}
      {equipo.errorCarga && <p role="alert" className="error-banner">{equipo.errorCarga}</p>}
      {equipo.errorOperacion && !confirmacion && <p role="alert" className="error-banner">{equipo.errorOperacion}</p>}
      {equipo.mensaje && <p role="status" className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
        <CheckCircle2 size={18} className="shrink-0" aria-hidden="true" /> {equipo.mensaje}
      </p>}
      {!equipo.cargando && equipo.datos && (
        <>
          {!equipo.puedeEditar && <p role="status" className="text-sm text-muted-foreground">
            El equipo es de consulta en el estado actual de esta expedición. Actualiza para comprobar su estado.
          </p>}
          {preparacion ? (
            <ListaPreparacionEquipo preparacion={preparacion} deshabilitado={bloqueado}
              onCambiar={(itemId, preparado) => { void equipo.marcar(itemId, preparado); }} />
          ) : (
            <section aria-labelledby="equipo-asociar-titulo" className="space-y-4">
              <h3 id="equipo-asociar-titulo" className="font-semibold">Sin lista de equipo asociada</h3>
              {equipo.puedeEditar && (
                <>
                  <p className="text-sm text-muted-foreground">Elige una lista personal para crear la copia de esta expedición. Una vez asociada, se conserva esa copia.</p>
                  {equipo.errorListas ? <p role="alert" className="error-banner">{equipo.errorListas} Usa «Actualizar equipo» para reintentar.</p>
                    : equipo.listas.length === 0 ? <p className="text-sm text-muted-foreground">Aún no tienes listas disponibles para asociar.</p> : (
                      <>
                        <label htmlFor="equipo-lista-origen" className="block text-sm font-semibold">Lista personal de equipo</label>
                        <select id="equipo-lista-origen" className="input-field" value={seleccionada?.id ?? ''} disabled={bloqueado}
                          onChange={(evento) => setListaId(evento.target.value)}>
                          <option value="">Selecciona una lista</option>
                          {equipo.listas.map((lista) => <option key={lista.id} value={lista.id}>{lista.nombre}</option>)}
                        </select>
                        {seleccionada && <p className="text-sm text-muted-foreground">
                          {seleccionada.items.length} ítems · {seleccionada.items.filter((item) => item.obligatorio).length} obligatorios.
                        </p>}
                        <button type="button" className="btn-primary" disabled={bloqueado || !seleccionada}
                          onClick={() => setConfirmacion(true)}>Asociar lista</button>
                      </>
                    )}
                  <Link to="/senderista/perfil/equipo" className="inline-flex items-center min-h-12 text-primary text-sm font-semibold">Gestionar mis listas de equipo</Link>
                </>
              )}
            </section>
          )}
          {equipo.ocupado && <p role="status" className="text-sm text-muted-foreground">Guardando equipo…</p>}
        </>
      )}
      {confirmacion && seleccionada && !preparacion && equipo.puedeEditar && (
        <DialogoConfirmacion titulo="¿Asociar esta lista?" textoConfirmar="Confirmar asociación" textoProcesando="Asociando…"
          ocupado={equipo.ocupado} deshabilitado={bloqueado} error={equipo.errorOperacion}
          onCancelar={() => { if (!equipo.ocupado) setConfirmacion(false); }}
          onConfirmar={() => { void equipo.asociar(seleccionada.id).then((guardada) => { if (guardada) setConfirmacion(false); }); }}>
          <p>Se copiarán los ítems de «{seleccionada.nombre}» a esta expedición, inicialmente sin preparar.</p>
          <p>La copia se conservará aunque cambie la lista original y no se podrá reemplazar por otra.</p>
        </DialogoConfirmacion>
      )}
    </div>
  );
}
