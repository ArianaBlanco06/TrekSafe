import { useState } from 'react';
import { useConsultaPeriodica } from './useConsultaPeriodica';
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
  const cargarExpediciones = useConsultaPeriodica(
    `expediciones-rescate:${JSON.stringify([zona, criterio])}`,
    (signal) => obtenerExpedicionesRescate(zona || undefined, criterio, signal),
    {
      datos: (respuesta) => {
      setResultado({ expediciones: respuesta.expediciones, criterioAplicado: criterio, zonaAplicada: zona });
        setError('');
      },
      error: (causa) => setError(causa instanceof Error ? causa.message : 'Error al cargar expediciones'),
      cargando: (valor) => { setCargando(valor); if (valor) setError(''); },
    },
  );

  return { ...resultado, cargando, error, cargarExpediciones };
}
