import { Component, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import { getSessionScope } from '@/lib/sesion';
import { obtenerRecorrido, type RecorridoExpedicion } from '@/services/recorrido';
import { ExpeditionRouteMapLazy } from '@/components/maps/ExpeditionRouteMapLazy';
import { ListaRecorrido } from '@/components/maps/ListaRecorrido';

class LimiteMapa extends Component<{ children: ReactNode; fallback: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() { return { fallo: true }; }
  render() { return this.state.fallo ? this.props.fallback : this.props.children; }
}

export function PaginaRecorrido() {
  const { id = '' } = useParams();
  const { usuario } = useAutenticacion();
  return <DetalleRecorrido key={`${usuario?.id}:${getSessionScope()}:${id}`} id={id} />;
}

function DetalleRecorrido({ id }: { id: string }) {
  const [datos, setDatos] = useState<RecorridoExpedicion | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    let vigente = true;
    setCargando(true); setError(''); setDatos(null);
    obtenerRecorrido(id).then(resultado => { if (vigente) setDatos(resultado); })
      .catch(causa => { if (vigente) setError(causa instanceof Error ? causa.message : 'No se pudo consultar el recorrido.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [id, intento]);
  const props = datos ? {
    startCoordinates: datos.plan.coordenadasInicio, endCoordinates: datos.plan.coordenadasFin,
    startLabel: datos.plan.lugarInicio, endLabel: datos.plan.lugarFin, puntos: datos.puntos,
  } : null;
  return <div className="px-6 py-6 space-y-5">
    <Link to="/senderista/expedicion" className="inline-flex min-h-11 items-center text-sm text-primary">Volver a expediciones</Link>
    <h2 className="text-xl font-bold">Recorrido de la expedición</h2>
    {cargando && <p role="status">Cargando recorrido…</p>}
    {error && <div role="alert" className="error-banner">{error}
      <button type="button" className="ml-3 min-h-11 underline" onClick={() => setIntento(valor => valor + 1)}>Reintentar</button>
    </div>}
    {datos && props && <>
      <p className="text-sm">{datos.plan.lugarInicio} → {datos.plan.lugarFin}</p>
      <p className="text-sm text-muted-foreground">Los segmentos son referencias rectas; no se calculan rutas reales ni navegación.</p>
      <LimiteMapa fallback={<ListaRecorrido {...props} />}><ExpeditionRouteMapLazy {...props} /></LimiteMapa>
      <details><summary className="min-h-11 cursor-pointer text-primary">Ver lista y coordenadas del recorrido</summary><ListaRecorrido {...props} /></details>
      <section aria-label="Preparación de la expedición" className="rounded-xl border border-border p-4 space-y-2">
        <h3 className="font-semibold">Equipo de la expedición</h3>
        {datos.preparacion ? <>
          <p>{datos.preparacion.nombreLista}</p>
          <p>{datos.preparacion.obligatoriosPendientes} elementos obligatorios pendientes.</p>
        </> : <p>Sin lista de equipo asociada.</p>}
        <Link className="inline-flex min-h-11 items-center text-primary" to={`/senderista/expedicion/${encodeURIComponent(id)}/equipo`}>Revisar equipo</Link>
      </section>
    </>}
  </div>;
}
