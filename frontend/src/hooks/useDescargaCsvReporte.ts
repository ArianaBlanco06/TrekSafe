import { useCallback, useEffect, useRef, useState } from 'react';
import { guardarArchivoDescargado } from '@/lib/guardarArchivoDescargado';
import { getSessionScope, getToken } from '@/lib/sesion';
import { ErrorClienteApi } from '@/services/clienteApi';
import { descargarCsvEstadisticas, type ReporteEstadisticasRescate } from '@/services/estadisticasRescate';

type EstadoDescarga = { tipo: 'lista' | 'descargando' | 'solicitada' | 'error'; mensaje: string };

export function useDescargaCsvReporte(reporte: ReporteEstadisticasRescate, bloqueada: boolean) {
  const [estado, setEstado] = useState<EstadoDescarga>({ tipo: 'lista', mensaje: '' });
  const pendiente = useRef<AbortController | null>(null);
  const actual = useRef({ reporte, bloqueada });
  actual.current = { reporte, bloqueada };

  useEffect(() => {
    pendiente.current?.abort();
    pendiente.current = null;
    setEstado({ tipo: 'lista', mensaje: '' });
    return () => { pendiente.current?.abort(); pendiente.current = null; };
  }, [reporte, bloqueada]);

  const descargar = useCallback(async () => {
    if (bloqueada || pendiente.current) return;
    const ambito = getSessionScope(), token = getToken();
    if (!ambito || !token) {
      setEstado({ tipo: 'error', mensaje: 'Inicia sesión como rescatista para descargar el reporte.' });
      return;
    }
    const control = new AbortController();
    pendiente.current = control;
    const vigente = () => pendiente.current === control && !control.signal.aborted &&
      actual.current.reporte === reporte && !actual.current.bloqueada &&
      getSessionScope() === ambito && getToken() === token;
    setEstado({ tipo: 'descargando', mensaje: '' });
    try {
      const f = reporte.filtros;
      const archivo = await descargarCsvEstadisticas({
        fechaDesde: f.fechaDesde, fechaHasta: f.fechaHasta, criterioFecha: f.criterioFecha,
        ...(f.zona ? { zona: f.zona } : {}), ...(f.resultado ? { resultado: f.resultado } : {}),
      }, control.signal);
      if (!vigente()) return;
      guardarArchivoDescargado(archivo);
      setEstado({ tipo: 'solicitada', mensaje: 'Descarga solicitada. Revisa las descargas de tu navegador.' });
    } catch (error) {
      if (!vigente()) return;
      const permiso = error instanceof ErrorClienteApi && (error.status === 401 || error.status === 403);
      setEstado({ tipo: 'error', mensaje: permiso
        ? 'Necesitas un perfil de rescatista validado para descargar el reporte.'
        : 'No se pudo completar la descarga del CSV. Revisa tu conexión e inténtalo nuevamente.' });
    } finally {
      if (pendiente.current === control) {
        const valida = vigente();
        pendiente.current = null;
        if (!valida) setEstado({ tipo: 'lista', mensaje: '' });
      }
    }
  }, [reporte, bloqueada]);
  return { ...estado, descargar };
}
