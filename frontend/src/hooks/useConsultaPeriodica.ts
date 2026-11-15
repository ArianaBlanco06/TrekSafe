import { useCallback, useEffect, useRef } from 'react';
import { crearConsultasPeriodicas, type ObservadorConsulta } from '@/lib/consultasPeriodicas';
import { getSessionScope, getToken } from '@/lib/sesion';

const identidadSesion = () => {
  const scope = getSessionScope();
  return scope ? `${scope}:${getToken()}` : null;
};

const consultas = crearConsultasPeriodicas({
  sesion: identidadSesion,
  visible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  alCambiarVisibilidad(listener) {
    if (typeof document === 'undefined') return () => {};
    const documento = document;
    documento.addEventListener('visibilitychange', listener);
    return () => documento.removeEventListener('visibilitychange', listener);
  },
});

/** El recurso incluye sus filtros; las respuestas nunca pasan de una sesión a otra. */
export function useConsultaPeriodica<T>(
  recurso: string,
  cargar: (signal: AbortSignal) => Promise<T>,
  observador: ObservadorConsulta<T>,
) {
  const callbacks = useRef({ cargar, observador });
  callbacks.current = { cargar, observador };
  const sesion = identidadSesion();
  const suscripcion = useRef<ReturnType<typeof consultas.suscribir> | null>(null);
  useEffect(() => {
    const actual = consultas.suscribir<T>(recurso, (signal) => callbacks.current.cargar(signal), {
      datos: (dato) => callbacks.current.observador.datos(dato),
      error: (error) => callbacks.current.observador.error?.(error),
      cargando: (cargando) => callbacks.current.observador.cargando?.(cargando),
    });
    suscripcion.current = actual;
    return () => { actual.cancelar(); suscripcion.current = null; };
  }, [recurso, sesion]);
  return useCallback(() => suscripcion.current?.refrescar(), []);
}
