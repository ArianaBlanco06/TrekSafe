import { useCallback, useEffect, useRef, useState } from 'react';
import type { DatosListaEquipo, ListaEquipo, ListasEquipoApi } from '@/services/listasEquipo';
import { ErrorClienteApi } from '@/services/clienteApi';

function mensajeError(error: unknown): string {
  if (error instanceof ErrorClienteApi && error.status === 0) {
    return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
  }
  return error instanceof Error ? error.message : 'No se pudo completar la operación. Inténtalo de nuevo.';
}

/** Coordina solicitudes y estado de pantalla; depende del contrato HTTP recibido. */
export function useListasEquipo(api: ListasEquipoApi, enLinea: boolean) {
  const [listas, setListas] = useState<ListaEquipo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [errorOperacion, setErrorOperacion] = useState('');
  const [mensaje, setMensaje] = useState('');
  const montado = useRef(false);
  const cargaActual = useRef(0);
  const cargandoRef = useRef(false);
  const operacionActual = useRef(false);

  const cargar = useCallback(async () => {
    const version = ++cargaActual.current;
    if (!enLinea) { setCargando(false); cargandoRef.current = false; return; }
    cargandoRef.current = true;
    setCargando(true);
    setErrorCarga('');
    try {
      const recibidas = await api.listar();
      if (montado.current && version === cargaActual.current) setListas(recibidas);
    } catch (error) {
      if (montado.current && version === cargaActual.current) setErrorCarga(mensajeError(error));
    } finally {
      if (montado.current && version === cargaActual.current) {
        setCargando(false);
        cargandoRef.current = false;
      }
    }
  }, [api, enLinea]);

  useEffect(() => {
    montado.current = true;
    void cargar();
    return () => { montado.current = false; cargaActual.current++; };
  }, [cargar]);

  function limpiarMensajes() { setErrorOperacion(''); setMensaje(''); }

  async function ejecutar<T>(solicitud: () => Promise<T>, alCompletar: (resultado: T) => void, escritura = false): Promise<T | null> {
    if (!enLinea || operacionActual.current || cargandoRef.current) return null;
    operacionActual.current = true;
    setOcupado(true);
    limpiarMensajes();
    try {
      const resultado = await solicitud();
      if (!montado.current) return null;
      if (escritura) {
        // Una lectura iniciada antes de guardar no puede reemplazar el resultado nuevo.
        cargaActual.current++;
        cargandoRef.current = false;
        setCargando(false);
      }
      alCompletar(resultado);
      return resultado;
    } catch (error) {
      if (montado.current) setErrorOperacion(mensajeError(error));
      return null;
    } finally {
      operacionActual.current = false;
      if (montado.current) setOcupado(false);
    }
  }

  async function obtenerParaEditar(id: string): Promise<ListaEquipo | null> {
    return ejecutar(() => api.obtener(id), (lista) => {
      setListas((anteriores) => anteriores.map((actual) => actual.id === lista.id ? lista : actual));
    });
  }

  async function guardar(datos: DatosListaEquipo, id?: string): Promise<ListaEquipo | null> {
    return ejecutar(() => id === undefined ? api.crear(datos) : api.actualizar(id, datos), (lista) => {
      setListas((anteriores) => anteriores.some((actual) => actual.id === lista.id)
        ? anteriores.map((actual) => actual.id === lista.id ? lista : actual)
        : [...anteriores, lista]);
      setMensaje('Lista guardada.');
    }, true);
  }

  async function eliminar(id: string): Promise<boolean> {
    const resultado = await ejecutar(async () => { await api.eliminar(id); return id; }, (eliminado) => {
      setListas((anteriores) => anteriores.filter((lista) => lista.id !== eliminado));
      setMensaje('Lista eliminada.');
    }, true);
    return resultado !== null;
  }

  return { listas, cargando, ocupado, errorCarga, errorOperacion, mensaje, cargar, guardar,
    eliminar, obtenerParaEditar, limpiarMensajes };
}
