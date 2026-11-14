import { Download, LoaderCircle } from 'lucide-react';
import { useDescargaCsvReporte } from '@/hooks/useDescargaCsvReporte';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';
import type { ReporteEstadisticasRescate } from '@/services/estadisticasRescate';

export function DescargaCsvReporte({ reporte, bloqueada }: { reporte: ReporteEstadisticasRescate; bloqueada: boolean }) {
  const enLinea = useEstadoEnLinea();
  const { tipo, mensaje, descargar } = useDescargaCsvReporte(reporte, bloqueada || !enLinea);
  const cargando = tipo === 'descargando';
  const Icono = cargando ? LoaderCircle : Download;
  return <div className="space-y-2">
    <button type="button" onClick={() => void descargar()} disabled={bloqueada || !enLinea || cargando}
      className="w-full min-h-12 px-4 rounded-xl border border-secondary bg-card text-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
      <Icono size={18} aria-hidden="true" />
      {cargando ? 'Preparando CSV…' : tipo === 'error' ? 'Reintentar descarga CSV' : 'Descargar CSV'}
    </button>
    <p className="text-xs text-muted-foreground">Exporta los incidentes con los filtros aplicados de este reporte. Los datos pueden haber cambiado desde la consulta.</p>
    {!enLinea && <p role="status" className="text-xs text-muted-foreground">Conéctate a internet para descargar el CSV.</p>}
    {mensaje && <p role={tipo === 'error' ? 'alert' : 'status'} className={`text-sm ${tipo === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>{mensaje}</p>}
  </div>;
}
