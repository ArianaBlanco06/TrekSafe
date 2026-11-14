import { useState, type FormEvent } from 'react';
import { BarChart3, CheckCircle2, Clock3, RefreshCw } from 'lucide-react';
import { useEstadisticasRescate } from '@/hooks/useEstadisticasRescate';
import { ETIQUETAS_RESULTADO_RESCATE, RESULTADOS_RESCATE } from '@/lib/cierreIncidente';
import { filtrosEstadisticasIniciales, presentarDiaReporte, validarFechasEstadisticas } from '@/lib/estadisticasRescate';
import type { ResultadoRescate } from '@/services/cierreIncidente';
import type { ConsultaEstadisticasRescate, CriterioFechaReporte } from '@/services/estadisticasRescate';

export function PaginaEstadisticasRescate() {
  const [iniciales] = useState(filtrosEstadisticasIniciales);
  const [fechaDesde, setFechaDesde] = useState(iniciales.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(iniciales.fechaHasta);
  const [criterioFecha, setCriterioFecha] = useState<CriterioFechaReporte>('apertura');
  const [zona, setZona] = useState('');
  const [resultado, setResultado] = useState<ResultadoRescate | ''>('');
  const [errorFechas, setErrorFechas] = useState('');
  const { reporte, cargando, error, consultar, reintentar } = useEstadisticasRescate(iniciales);

  const aplicar = (evento: FormEvent) => {
    evento.preventDefault();
    const mensaje = validarFechasEstadisticas(fechaDesde, fechaHasta);
    setErrorFechas(mensaje ?? '');
    if (mensaje) return;
    const filtros: ConsultaEstadisticasRescate = {
      fechaDesde, fechaHasta, criterioFecha, zona, ...(resultado ? { resultado } : {}),
    };
    void consultar(filtros);
  };
  const aplicados = reporte?.filtros;
  const hayCambios = aplicados && (fechaDesde !== aplicados.fechaDesde || fechaHasta !== aplicados.fechaHasta ||
    criterioFecha !== aplicados.criterioFecha || (zona.trim() || null) !== aplicados.zona || (resultado || null) !== aplicados.resultado);

  return (
    <div className="px-5 py-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><BarChart3 size={23} aria-hidden="true" />Estadísticas de rescate</h2>
        <p className="text-sm text-muted-foreground mt-2">Resumen de todos los incidentes del equipo de rescate.</p>
      </div>

      <form onSubmit={aplicar} className="rounded-2xl border border-border bg-card p-4 space-y-4" aria-label="Filtros de estadísticas">
        <div>
          <label htmlFor="reporte-criterio" className="block text-sm font-semibold mb-1.5">Fecha del reporte</label>
          <select id="reporte-criterio" className="input-field w-full" value={criterioFecha} onChange={e => setCriterioFecha(e.target.value as CriterioFechaReporte)}>
            <option value="apertura">Apertura del incidente</option><option value="cierre">Cierre del incidente</option>
          </select>
        </div>
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor="reporte-desde" className="block text-sm font-semibold mb-1.5">Desde</label>
            <input id="reporte-desde" type="date" required className="input-field w-full min-w-0" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} aria-describedby="reporte-tiempo" />
          </div>
          <div className="min-w-0">
            <label htmlFor="reporte-hasta" className="block text-sm font-semibold mb-1.5">Hasta</label>
            <input id="reporte-hasta" type="date" required className="input-field w-full min-w-0" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} aria-describedby="reporte-tiempo" />
          </div>
        </div>
        <p id="reporte-tiempo" className="text-xs text-muted-foreground">Se incluyen ambos días completos. Horario del reporte: UTC.</p>
        <div>
          <label htmlFor="reporte-zona" className="block text-sm font-semibold mb-1.5">Zona o destino</label>
          <input id="reporte-zona" type="search" maxLength={120} className="input-field w-full" placeholder="Todos los destinos" value={zona} onChange={e => setZona(e.target.value)} aria-describedby="reporte-zona-ayuda" />
          <p id="reporte-zona-ayuda" className="text-xs text-muted-foreground mt-1.5">Busca en el destino declarado de la expedición.</p>
        </div>
        <div>
          <label htmlFor="reporte-resultado" className="block text-sm font-semibold mb-1.5">Resultado del rescate</label>
          <select id="reporte-resultado" className="input-field w-full" value={resultado} onChange={e => setResultado(e.target.value as ResultadoRescate | '')}>
            <option value="">Todos los resultados</option>
            {RESULTADOS_RESCATE.map(valor => <option key={valor} value={valor}>{ETIQUETAS_RESULTADO_RESCATE[valor]}</option>)}
          </select>
        </div>
        {(criterioFecha === 'cierre' || resultado) && <p className="text-xs text-muted-foreground">Al filtrar por cierre o por resultado se incluyen solo incidentes cerrados.</p>}
        {errorFechas && <p role="alert" className="text-sm text-destructive">{errorFechas}</p>}
        <button type="submit" disabled={cargando} className="w-full min-h-12 px-4 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm disabled:opacity-60">
          {cargando ? 'Consultando…' : 'Consultar estadísticas'}
        </button>
      </form>

      {error && <div role="alert" className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-sm space-y-3">
        <p>{error}</p>
        {reporte && <p>Se conserva la última consulta correcta con los filtros que aparecen abajo.</p>}
        <button type="button" onClick={() => void reintentar()} disabled={cargando} className="min-h-11 font-semibold underline disabled:opacity-60">Reintentar consulta</button>
      </div>}
      {cargando && <p role="status" className="text-sm text-muted-foreground flex gap-2 items-center"><RefreshCw size={16} aria-hidden="true" />{reporte ? 'Actualizando. Se muestra la última consulta correcta.' : 'Cargando estadísticas…'}</p>}

      {reporte && aplicados && <section aria-label="Resumen de incidentes" aria-busy={cargando} className="space-y-4">
        <div className="space-y-1.5">
          <h3 className="font-bold">Filtros aplicados</h3>
          <p className="text-sm" data-testid="rango-aplicado">{aplicados.criterioFecha === 'apertura' ? 'Apertura' : 'Cierre'} · {presentarDiaReporte(aplicados.fechaDesde)} al {presentarDiaReporte(aplicados.fechaHasta)} · UTC</p>
          <p className="text-xs text-muted-foreground">Destino: {aplicados.zona || 'Todos'} · Resultado: {aplicados.resultado ? ETIQUETAS_RESULTADO_RESCATE[aplicados.resultado] : 'Todos'}</p>
          {hayCambios && <p className="text-xs text-amber-700 dark:text-amber-300">Hay filtros sin aplicar. Pulsa «Consultar estadísticas» para actualizar el resumen.</p>}
        </div>
        <dl className="grid grid-cols-3 gap-2">
          {([
            ['atendidos', 'Atendidos', BarChart3, 'bg-secondary/10 text-secondary dark:text-foreground'],
            ['abiertos', 'Abiertos', Clock3, 'bg-amber-500/10 text-amber-700 dark:text-amber-300'],
            ['cerrados', 'Cerrados', CheckCircle2, 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'],
          ] as const).map(([clave, etiqueta, Icono, color]) => <div key={clave} className={`rounded-2xl p-3 min-w-0 ${color}`}>
            <Icono size={18} aria-hidden="true" />
            <dt className="text-xs mt-2">{etiqueta}</dt>
            <dd className="text-2xl font-bold tabular-nums break-all" data-testid={`conteo-${clave}`}>{reporte.resumen[clave].toLocaleString('es-PE')}</dd>
          </div>)}
        </dl>
        {reporte.resumen.atendidos === 0 && <p role="status" className="text-sm rounded-xl border border-border p-4">No hay incidentes que coincidan con estos filtros.</p>}
        <p className="text-xs text-muted-foreground">Cada incidente se cuenta una sola vez. Atendidos incluye abiertos y cerrados. Los localizados pendientes de cierre se cuentan como abiertos.</p>
      </section>}
    </div>
  );
}
