import { useEffect, useMemo, useRef, useState } from 'react';
import { ErrorClienteApi } from '@/services/clienteApi';
import { puntosRutaApi, type IPuntosRutaApi, type RutaConPuntos } from '@/services/puntosRuta';
import {
  editarPuntos, MAX_PUNTOS_RUTA, nuevoPunto, validarPuntosEditables, type ErroresPuntos, type PuntoEditable,
} from '@/lib/puntosRuta';
import { useEstadoEnLinea } from './useEstadoEnLinea';

type RevisionPendiente = 'version' | 'estado' | 'incierto' | null;

/** Estado del editor separado de la vista y del transporte HTTP. El componente
 * que lo usa se monta por usuario/expedicion para no compartir ediciones.
 */
export function useEditorPuntosRuta(id: string, api: IPuntosRutaApi = puntosRutaApi) {
  const [ruta, setRuta] = useState<RutaConPuntos | null>(null);
  const [puntos, setPuntos] = useState<PuntoEditable[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [errorGuardado, setErrorGuardado] = useState('');
  const [exito, setExito] = useState('');
  const [validar, setValidar] = useState(false);
  const [erroresServidor, setErroresServidor] = useState<ErroresPuntos>({});
  const [revision, setRevision] = useState<RevisionPendiente>(null);
  const [versionActual, setVersionActual] = useState<RutaConPuntos | null>(null);
  const activa = useRef(true);
  const peticiones = useRef(new Set<AbortController>());
  const enLinea = useEstadoEnLinea();

  const validacion = useMemo(() => validarPuntosEditables(puntos), [puntos]);
  const errores: ErroresPuntos = { ...(validar ? validacion.errores : {}), ...erroresServidor };
  const hayCambios = ruta !== null && JSON.stringify(puntos) !== JSON.stringify(editarPuntos(ruta.puntos));
  const editable = ruta?.expedicion.editable === true && ruta.expedicion.estado === 'programada' && revision !== 'estado';
  const ocupada = cargando || guardando || revisando;

  function adoptar(nueva: RutaConPuntos) {
    setRuta(nueva);
    setPuntos(editarPuntos(nueva.puntos));
    setErroresServidor({});
    setValidar(false);
    setRevision(null);
    setVersionActual(null);
    setErrorGuardado('');
  }

  useEffect(() => {
    activa.current = true;
    return () => {
      activa.current = false;
      for (const controller of peticiones.current) controller.abort();
      peticiones.current.clear();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    peticiones.current.add(controller);
    setCargando(true);
    api.consultar(id, controller.signal).then(nueva => {
      if (controller.signal.aborted) return;
      adoptar(nueva);
      setErrorCarga('');
    }).catch(error => {
      if (!controller.signal.aborted) setErrorCarga(mensaje(error, 'No pudimos cargar los puntos'));
    }).finally(() => {
      peticiones.current.delete(controller);
      if (!controller.signal.aborted) setCargando(false);
    });
    return () => controller.abort();
  }, [id, api]);

  useEffect(() => {
    if (!hayCambios) return;
    const advertir = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', advertir);
    return () => window.removeEventListener('beforeunload', advertir);
  }, [hayCambios]);

  function cambiar(actualizar: (previos: PuntoEditable[]) => PuntoEditable[]) {
    if (!editable || ocupada) return;
    setPuntos(actualizar);
    setErroresServidor({});
    setExito('');
    if (revision === null) setErrorGuardado('');
  }

  function agregar() {
    cambiar(previos => previos.length < MAX_PUNTOS_RUTA ? [...previos, nuevoPunto()] : previos);
  }

  function actualizar(puntoId: string, campo: 'nombre' | 'latitud' | 'longitud', valor: string) {
    cambiar(previos => previos.map(punto => punto.id === puntoId ? { ...punto, [campo]: valor } : punto));
  }

  function quitar(puntoId: string) {
    cambiar(previos => previos.filter(punto => punto.id !== puntoId));
  }

  function mover(puntoId: string, desplazamiento: -1 | 1) {
    cambiar(previos => {
      const indice = previos.findIndex(punto => punto.id === puntoId);
      const destino = indice + desplazamiento;
      if (indice < 0 || destino < 0 || destino >= previos.length) return previos;
      const copia = [...previos];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  async function guardar(): Promise<boolean> {
    if (!ruta || !editable || ocupada || !enLinea || revision !== null || !hayCambios) return false;
    setValidar(true);
    setExito('');
    setErroresServidor({});
    if (Object.keys(validacion.errores).length) {
      setErrorGuardado('Revisa los campos indicados antes de guardar');
      return false;
    }
    const controller = new AbortController();
    peticiones.current.add(controller);
    setGuardando(true);
    setErrorGuardado('');
    try {
      const nueva = await api.guardar(id, ruta.expedicion.version, validacion.puntos, controller.signal);
      if (controller.signal.aborted || !activa.current) return false;
      adoptar(nueva);
      setExito('Puntos de ruta guardados');
      return true;
    } catch (error) {
      if (controller.signal.aborted || !activa.current) return false;
      if (error instanceof ErrorClienteApi) {
        setErroresServidor(error.detalles ?? {});
        if (error.codigo === 'VERSION_PLAN_OBSOLETA') setRevision('version');
        else if (['EXPEDICION_NO_EDITABLE', 'EXPEDICION_YA_INICIADA'].includes(error.codigo ?? '') || [403, 404].includes(error.status)) setRevision('estado');
        else if (error.status === 0 || error.status >= 500) setRevision('incierto');
      } else {
        setRevision('incierto');
      }
      setErrorGuardado(mensaje(error, 'No pudimos confirmar el guardado'));
      return false;
    } finally {
      peticiones.current.delete(controller);
      if (activa.current && !controller.signal.aborted) setGuardando(false);
    }
  }

  async function revisar() {
    if (ocupada || !enLinea) return;
    const controller = new AbortController();
    peticiones.current.add(controller);
    setRevisando(true);
    try {
      const nueva = await api.consultar(id, controller.signal);
      if (!controller.signal.aborted && activa.current) setVersionActual(nueva);
    } catch (error) {
      if (!controller.signal.aborted && activa.current) setErrorGuardado(mensaje(error, 'No pudimos consultar la lista actual'));
    } finally {
      peticiones.current.delete(controller);
      if (!controller.signal.aborted && activa.current) setRevisando(false);
    }
  }

  function cargarVersionActual() {
    if (!versionActual || ocupada) return;
    adoptar(versionActual);
    setExito('Se cargaron los puntos actuales del servidor');
  }

  function conservarEdicion() {
    if (!versionActual?.expedicion.editable || ocupada) return;
    // Decision explicita despues de revisar. No envia un PUT ni reintenta solo.
    setRuta(versionActual);
    setRevision(null);
    setVersionActual(null);
    setErroresServidor({});
    setErrorGuardado('');
    setExito('Edición conservada. Revisa tu lista y pulsa Guardar puntos para reemplazar la lista del servidor');
  }

  return {
    ruta, puntos, cargando, guardando, revisando, errorCarga, errorGuardado, exito, errores,
    revision, versionActual, enLinea, editable, ocupada, hayCambios,
    agregar, actualizar, quitar, mover, guardar, revisar, cargarVersionActual, conservarEdicion,
  };
}

function mensaje(error: unknown, alternativa: string): string {
  if (error instanceof ErrorClienteApi && error.status === 0) {
    return 'No pudimos conectar con TrekSafe. Revisa tu conexión e inténtalo de nuevo';
  }
  return error instanceof Error ? error.message : alternativa;
}
