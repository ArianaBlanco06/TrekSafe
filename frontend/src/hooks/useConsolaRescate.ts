import { useCallback, useEffect, useRef, useState } from 'react';
import {
  obtenerExpedicionesRescate,
  type CriterioPrioridadRescate,
  type ExpedicionRescate,
} from '@/services/rescate';

export function useConsolaRescate(zona: string, criterio: CriterioPrioridadRescate) {
  const [resultado, setResultado] = useState({
    expediciones: [] as ExpedicionRescate[],
    criterioAplicado: 'tiempo_excedido' as CriterioPrioridadRescate,
    zonaAplicada: '',
  });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const solicitudActual = useRef(0);
  const cargaPendiente = useRef(false);

  const cargarExpediciones = useCallback(async () => {
    const solicitud = ++solicitudActual.current;
    cargaPendiente.current = true;
    setCargando(true);
    setError('');
    try {
      const respuesta = await obtenerExpedicionesRescate(zona || undefined, criterio);
      if (solicitud !== solicitudActual.current) return;
      setResultado({ expediciones: respuesta.expediciones, criterioAplicado: criterio, zonaAplicada: zona });
    } catch (causa) {
      if (solicitud !== solicitudActual.current) return;
      setError(causa instanceof Error ? causa.message : 'Error al cargar expediciones');
    } finally {
      if (solicitud === solicitudActual.current) {
        cargaPendiente.current = false;
        setCargando(false);
      }
    }
  }, [zona, criterio]);

  useEffect(() => {
    void cargarExpediciones();
    const intervalo = setInterval(() => {
      if (!cargaPendiente.current) void cargarExpediciones();
    }, 30_000);
    return () => {
      clearInterval(intervalo);
      solicitudActual.current += 1;
      cargaPendiente.current = false;
    };
  }, [cargarExpediciones]);

  return { ...resultado, cargando, error, cargarExpediciones };
}
