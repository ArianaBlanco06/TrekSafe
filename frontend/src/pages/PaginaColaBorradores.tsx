import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';
import { getSessionScope } from '@/lib/sesion';
import { ColaLocalCache } from '@/infrastructure/ColaLocalCache';
import { CrearPlan } from '@/application/commands/CrearPlan';
import type { BorradorExpedicion, DatosBorrador } from '@/application/ports/IColaLocal';
import { sincronizarBorrador } from '@/services/borradores';
import { FormularioCrearExpedicion } from './PaginaCrearExpedicion';

export function PaginaColaBorradores() {
  const { usuario } = useAutenticacion();
  return <ColaBorradores key={`${usuario?.id}:${getSessionScope()}`} />;
}

function ColaBorradores() {
  const [scope] = useState(getSessionScope);
  const [cola] = useState(() => new ColaLocalCache(scope));
  const [borradores, setBorradores] = useState<BorradorExpedicion[]>([]);
  const [seleccionado, setSeleccionado] = useState<BorradorExpedicion | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const operando = useRef(false);
  const enLinea = useEstadoEnLinea();
  const vigente = () => scope !== null && scope === getSessionScope();
  async function cargar() {
    const lista = await cola.listar();
    if (vigente()) setBorradores(lista);
  }
  useEffect(() => {
    let activo = true;
    void cola.listar().then(lista => { if (activo && vigente()) setBorradores(lista); })
      .catch(causa => { if (activo && vigente()) setError(causa instanceof Error ? causa.message : 'No se pudo leer la cola.'); });
    return () => { activo = false; };
  }, [cola, scope]);
  async function operar(tarea: () => Promise<void>) {
    if (operando.current || !vigente()) return;
    operando.current = true; setOcupado(true); setError(''); setInfo('');
    try { await tarea(); }
    catch (causa) { if (vigente()) setError(causa instanceof Error ? causa.message : 'No se pudo completar la operación.'); }
    finally {
      try { await cargar(); } catch (causa) { if (vigente()) setError(causa instanceof Error ? causa.message : 'No se pudo leer la cola.'); }
      operando.current = false;
      if (vigente()) setOcupado(false);
    }
  }
  async function enviar(id: string, revisado: boolean) {
    if (!enLinea) throw new Error('Conéctate antes de sincronizar.');
    await new CrearPlan(cola, sincronizarBorrador, vigente).ejecutar(id, revisado);
    if (vigente()) { setSeleccionado(null); setInfo('Borrador sincronizado. Puedes abrir su expedición.'); }
  }
  async function guardar(datos: DatosBorrador, sincronizar: boolean) {
    if (!seleccionado || ocupado) return;
    await operar(async () => {
      await cola.actualizar(seleccionado.id, actual => {
        if (actual.envioIncierto || actual.estado === 'sincronizado') throw new Error('Comprueba primero el envío anterior.');
        return { ...datos, id: actual.id, guardadoEn: new Date().toISOString(), estado: 'pendiente' };
      });
      if (sincronizar) {
        if (vigente()) setSeleccionado(null);
        await enviar(seleccionado.id, true);
      }
      else if (vigente()) { setSeleccionado(null); setInfo('Correcciones guardadas. Revisa fechas y contactos al reconectar.'); }
    });
  }
  return <div className="space-y-4 px-6 py-6">
    <Link to="/senderista/expedicion" className="inline-flex min-h-11 items-center text-primary">Volver a expediciones</Link>
    <h2 className="text-xl font-bold">Borradores offline</h2>
    <p className="text-sm text-muted-foreground">{enLinea
      ? 'Conexión disponible. Revisa fechas y contactos antes de confirmar cada envío.'
      : 'Sin conexión. Puedes revisar, corregir o descartar tus borradores.'}</p>
    <p className="text-sm text-muted-foreground">Los borradores se conservan al cerrar la aplicación y se eliminan al cerrar sesión.</p>
    {error && <p role="alert" className="error-banner">{error}</p>}
    {info && <p role="status">{info}</p>}
    {borradores.length === 0 && <p>No tienes borradores guardados.</p>}
    <ul className="space-y-3" aria-label="Cola de borradores">
      {borradores.map(b => <li key={b.id} className="rounded-xl border border-border p-4 space-y-2">
        <h3 className="font-semibold">{b.lugarInicio} → {b.lugarFin}</h3>
        <p>Estado: {b.estado === 'sincronizado' ? 'Sincronizado' : b.estado === 'error' ? 'Error' : 'Pendiente'}</p>
        <p className="text-sm">Salida: {new Date(b.horaInicio).toLocaleString()} · Retorno: {new Date(b.horaRetornoEstimada).toLocaleString()}</p>
        {b.estado !== 'sincronizado' && Date.parse(b.horaInicio) <= Date.now() && <p className="text-sm text-destructive">Fecha vencida: requiere corrección antes de un envío nuevo.</p>}
        {b.error && <p className="text-sm text-destructive">{b.error}</p>}
        {b.envioIncierto && <p className="text-sm">El envío anterior no está confirmado. Compruébalo con el mismo identificador antes de editar.</p>}
        <div className="flex flex-wrap gap-4">
          {b.estado !== 'sincronizado' && !b.envioIncierto && <button type="button" disabled={ocupado}
            className="min-h-11 text-primary font-semibold" onClick={() => { setSeleccionado(b); setError(''); }}>Revisar borrador</button>}
          {b.envioIncierto && <button type="button" disabled={ocupado || !enLinea} className="min-h-11 text-primary font-semibold"
            onClick={() => void operar(() => enviar(b.id, false))}>Comprobar envío</button>}
          {b.expedicionId && <Link className="min-h-11 inline-flex items-center text-primary" to={`/expediciones/${encodeURIComponent(b.expedicionId)}/editar`}>Abrir expedición</Link>}
          <button type="button" disabled={ocupado} className="min-h-11 text-destructive" onClick={() => {
            if (window.confirm(b.envioIncierto ? 'El plan podría existir en el servidor. Descartar el borrador no lo cancela. ¿Descartarlo?' : '¿Descartar este borrador de la cola?')) {
              void operar(async () => { await cola.eliminar(b.id); if (vigente() && seleccionado?.id === b.id) setSeleccionado(null); });
            }
          }}>Descartar</button>
        </div>
      </li>)}
    </ul>
    {seleccionado && <section aria-label="Revisión del borrador">
      <button type="button" disabled={ocupado} className="min-h-11 text-primary" onClick={() => setSeleccionado(null)}>Cerrar revisión</button>
      <FormularioCrearExpedicion key={seleccionado.id} borradorLocal={seleccionado} onGuardarLocal={guardar} />
    </section>}
  </div>;
}
