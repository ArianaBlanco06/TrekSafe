import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorClienteApi } from '@/services/clienteApi';
import { obtenerEstadisticasRescate, type ConsultaEstadisticasRescate, type ReporteEstadisticasRescate } from '@/services/estadisticasRescate';

/** Conserva el último reporte con sus filtros; una respuesta tardía no lo reemplaza. */
export function useEstadisticasRescate(iniciales: ConsultaEstadisticasRescate) {
  const [reporte, setReporte] = useState<ReporteEstadisticasRescate | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const actual = useRef(0);
  const ultimaConsulta = useRef(iniciales);
  const consultar = useCallback(async (filtros: ConsultaEstadisticasRescate) => {
    const solicitud = ++actual.current;
    ultimaConsulta.current = { ...filtros };
    setCargando(true);
    setError('');
    try {
      const respuesta = await obtenerEstadisticasRescate(filtros);
      if (actual.current === solicitud) setReporte(respuesta);
    } catch (causa) {
      if (actual.current !== solicitud) return;
      if (causa instanceof ErrorClienteApi && (causa.status === 401 || causa.status === 403)) {
        setReporte(null);
        setError('Tu sesión debe corresponder a un rescatista con perfil validado para consultar este reporte.');
      } else {
        setError('No se pudieron actualizar las estadísticas. Revisa tu conexión e inténtalo nuevamente.');
      }
    } finally {
      if (actual.current === solicitud) setCargando(false);
    }
  }, []);
  useEffect(() => {
    void consultar(iniciales);
    return () => { actual.current += 1; };
  }, [consultar, iniciales]);
  const reintentar = () => consultar(ultimaConsulta.current);
  return { reporte, cargando, error, consultar, reintentar };
}
