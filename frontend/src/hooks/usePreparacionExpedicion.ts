import { useCallback, useEffect, useRef, useState } from 'react';
import { getSessionScope } from '@/lib/sesion';
import { ErrorClienteApi } from '@/services/clienteApi';
import type { ListaEquipo } from '@/services/listasEquipo';
import type { FuentesEquipoExpedicion, PreparacionExpedicion, ResumenExpedicionEquipo } from '@/services/preparacionExpedicion';

type EquipoCargado = { expedicion: ResumenExpedicionEquipo; preparacion: PreparacionExpedicion | null };
const estadoEditable = (estado: string) => estado === 'programada' || estado === 'en_progreso';
function mensajeError(error: unknown): string {
  if (error instanceof ErrorClienteApi && error.status === 0) return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
  return error instanceof Error ? error.message : 'No se pudo consultar el equipo. Inténtalo de nuevo.';
}

/** Coordina lecturas y escrituras confirmadas. El servidor decide propiedad y estado. */
export function usePreparacionExpedicion(expedicionId: string, fuentes: FuentesEquipoExpedicion, enLinea: boolean) {
  const [datos, setDatos] = useState<EquipoCargado | null>(null);
  const [listas, setListas] = useState<ListaEquipo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [errorListas, setErrorListas] = useState('');
  const [errorOperacion, setErrorOperacion] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [requiereRecarga, setRequiereRecarga] = useState(false);
  const sesion = useRef(getSessionScope()).current;
  const montado = useRef(false);
  const cargaActual = useRef(0);
  const cargandoRef = useRef(true);
  const guardandoRef = useRef(false);
  const vigente = useCallback(() => montado.current && getSessionScope() === sesion, [sesion]);

  const cargar = useCallback(async (trasOperacion = false) => {
    if (!enLinea || (!trasOperacion && guardandoRef.current) || !vigente()) return;
    const version = ++cargaActual.current;
    const aceptar = () => vigente() && version === cargaActual.current;
    cargandoRef.current = true;
    setCargando(true);
    setErrorCarga('');
    setErrorListas('');
    try {
      const [expedicion, preparacion] = await Promise.all([
        fuentes.obtenerExpedicion(expedicionId), fuentes.preparacion.obtener(expedicionId),
      ]);
      if (!aceptar()) return;
      if (expedicion.id !== expedicionId || (preparacion && preparacion.expedicionId !== expedicionId)) {
        throw new ErrorClienteApi('Expedición no encontrada.', 404);
      }
      setDatos({ expedicion, preparacion });
      setRequiereRecarga(false);
      setListas([]);
      if (!preparacion && estadoEditable(expedicion.estado)) {
        try {
          const recibidas = await fuentes.listarListas();
          if (aceptar()) setListas(recibidas);
        } catch (error) {
          if (aceptar()) setErrorListas(mensajeError(error));
        }
      }
    } catch (error) {
      if (aceptar()) {
        setDatos(null);
        setListas([]);
        setErrorCarga(mensajeError(error));
      }
    } finally {
      if (aceptar()) { cargandoRef.current = false; setCargando(false); }
    }
  }, [enLinea, expedicionId, fuentes, vigente]);

  useEffect(() => {
    montado.current = true;
    if (enLinea) void cargar();
    else { cargandoRef.current = false; setCargando(false); }
    const alEnfocar = () => { void cargar(); };
    window.addEventListener('focus', alEnfocar);
    return () => { montado.current = false; cargaActual.current++; window.removeEventListener('focus', alEnfocar); };
  }, [cargar, enLinea]);

  const puedeEditar = Boolean(datos && estadoEditable(datos.expedicion.estado) && !requiereRecarga);

  async function guardar(solicitud: () => Promise<PreparacionExpedicion>, mensajeExito: string): Promise<boolean> {
    if (!vigente() || !enLinea || !puedeEditar || guardandoRef.current || cargandoRef.current) return false;
    guardandoRef.current = true;
    cargaActual.current++;
    setOcupado(true);
    setErrorOperacion('');
    setMensaje('');
    try {
      const preparacion = await solicitud();
      if (!vigente()) return false;
      if (preparacion.expedicionId !== expedicionId) throw new ErrorClienteApi('Expedición no encontrada.', 404);
      setDatos((actual) => actual ? { ...actual, preparacion } : null);
      setListas([]);
      setMensaje(mensajeExito);
      return true;
    } catch (error) {
      if (!vigente()) return false;
      setErrorOperacion(mensajeError(error));
      if (error instanceof ErrorClienteApi && [404, 409].includes(error.status)) {
        setRequiereRecarga(true);
        // El estado o la asociación pudieron cambiar en otra sesión: releer antes de seguir.
        await cargar(true);
      }
      return false;
    } finally {
      guardandoRef.current = false;
      if (vigente()) setOcupado(false);
    }
  }

  function asociar(listaId: string): Promise<boolean> {
    if (datos?.preparacion || !listas.some((lista) => lista.id === listaId)) return Promise.resolve(false);
    return guardar(() => fuentes.preparacion.asociar(expedicionId, listaId), 'Lista asociada a esta expedición.');
  }

  function marcar(itemId: string, preparado: boolean): Promise<boolean> {
    if (!datos?.preparacion?.items.some((item) => item.id === itemId)) return Promise.resolve(false);
    return guardar(() => fuentes.preparacion.establecerPreparado(expedicionId, itemId, preparado),
      preparado ? 'Ítem marcado como preparado.' : 'Ítem marcado como pendiente.');
  }

  return { datos, listas, cargando, ocupado, puedeEditar, errorCarga, errorListas, errorOperacion, mensaje,
    cargar: () => cargar(), asociar, marcar };
}
