export type ObservadorConsulta<T> = {
  datos: (datos: T) => void;
  error?: (error: unknown) => void;
  cargando?: (cargando: boolean) => void;
};

type Entorno = {
  visible: () => boolean;
  sesion: () => string | null;
  alCambiarVisibilidad: (listener: () => void) => () => void;
};

/** Una consulta en memoria por recurso y sesión; nunca persiste respuestas privadas. */
export function crearConsultasPeriodicas(entorno: Entorno, intervaloMs = 30_000) {
  type Entrada = {
    sesion: string;
    cargar: (signal: AbortSignal) => Promise<unknown>;
    observadores: Set<ObservadorConsulta<unknown>>;
    control?: AbortController;
    revision: number;
    repetir: boolean;
    tieneDatos: boolean;
    ultimoDato?: unknown;
    timer: ReturnType<typeof setInterval>;
    quitarVisibilidad: () => void;
  };
  const entradas = new Map<string, Entrada>();

  const vigente = (e: Entrada) => e.observadores.size > 0 && entorno.sesion() === e.sesion;
  const detener = (clave: string, e: Entrada) => {
    e.revision += 1;
    e.control?.abort();
    e.control = undefined;
    e.ultimoDato = undefined;
    e.tieneDatos = false;
    e.observadores.clear();
    clearInterval(e.timer);
    e.quitarVisibilidad();
    if (entradas.get(clave) === e) entradas.delete(clave);
  };
  const ejecutar = async (clave: string, e: Entrada): Promise<void> => {
    if (!vigente(e)) { detener(clave, e); return; }
    if (!entorno.visible() || e.control) return;
    const control = new AbortController();
    e.control = control;
    const revision = ++e.revision;
    for (const o of e.observadores) o.cargando?.(true);
    try {
      const dato = await e.cargar(control.signal);
      if (!vigente(e) || control.signal.aborted || e.revision !== revision || e.repetir) return;
      e.ultimoDato = dato;
      e.tieneDatos = true;
      for (const o of e.observadores) o.datos(dato);
    } catch (error) {
      if (vigente(e) && !control.signal.aborted && e.revision === revision && !e.repetir) {
        for (const o of e.observadores) o.error?.(error);
      }
    } finally {
      if (e.revision === revision) {
        e.control = undefined;
        if (vigente(e)) {
          for (const o of e.observadores) o.cargando?.(false);
          if (e.repetir) { e.repetir = false; void ejecutar(clave, e); }
        } else detener(clave, e);
      }
    }
  };

  return {
    suscribir<T>(recurso: string, cargar: (signal: AbortSignal) => Promise<T>, observador: ObservadorConsulta<T>) {
      const sesion = entorno.sesion();
      if (!sesion) { observador.cargando?.(false); return { cancelar() {}, refrescar() {} }; }
      const clave = `${sesion}:${recurso}`;
      let entrada = entradas.get(clave);
      if (!entrada) {
        entrada = {
          sesion, cargar, observadores: new Set(), revision: 0, repetir: false, tieneDatos: false,
          timer: undefined as unknown as ReturnType<typeof setInterval>, quitarVisibilidad() {},
        };
        const actual = entrada;
        actual.timer = setInterval(() => { void ejecutar(clave, actual); }, intervaloMs);
        actual.quitarVisibilidad = entorno.alCambiarVisibilidad(() => {
          if (!vigente(actual)) { detener(clave, actual); return; }
          if (!entorno.visible()) {
            actual.revision += 1;
            actual.control?.abort();
            actual.control = undefined;
            actual.repetir = false;
            for (const o of actual.observadores) o.cargando?.(false);
          } else void ejecutar(clave, actual);
        });
        entradas.set(clave, actual);
      }
      const actual = entrada;
      const o = observador as ObservadorConsulta<unknown>;
      actual.observadores.add(o);
      // Un consumidor nuevo recibe el resultado activo, sin otra consulta ni caché persistente.
      if (actual.tieneDatos) observador.datos(actual.ultimoDato as T);
      observador.cargando?.(!!actual.control);
      if (!actual.control && !actual.tieneDatos) void ejecutar(clave, actual);
      let cancelada = false;
      return {
        cancelar() {
          if (cancelada) return;
          cancelada = true;
          actual.observadores.delete(o);
          if (!actual.observadores.size) detener(clave, actual);
        },
        refrescar() {
          if (cancelada) return;
          if (actual.control) actual.repetir = true;
          else void ejecutar(clave, actual);
        },
      };
    },
    vaciar() { for (const [clave, entrada] of entradas) detener(clave, entrada); },
  };
}
