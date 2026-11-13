import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronUp, Globe, Plus, WifiOff, X } from 'lucide-react';
import { FieldError, FieldLabel } from '@/components/Layout';
import { CoordinatePickerMapLazy } from '@/components/maps/CoordinatePickerMapLazy';
import { GuardarComoPlantilla } from '@/components/plantillas/GuardarComoPlantilla';
import { SelectorPlantillasCuenta } from '@/components/plantillas/SelectorPlantillasCuenta';
import type { CoordinatePickerMapProps, CoordinatePickerTarget } from '@/components/maps/CoordinatePickerMap';
import { PrepararExpedicionDesdeHistorial } from '@/components/expedicion/PrepararExpedicionDesdeHistorial';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';
import { mensajeAplicacionBorrador, type BorradorDesdePlantilla } from '@/lib/plantillasCuentaLogica';
import { validateCoordinateInput } from '@/lib/coordinates';
import { getSessionScope } from '@/lib/sesion';
import { cachearContactos, obtenerContactosCacheados } from '@/lib/offlineContacts';
import {
  listarBorradoresExpedicion,
  listarPlantillasRuta,
  guardarBorradorExpedicion,
  guardarPlantillaRuta,
  type PlantillaRuta,
} from '@/lib/offlineExpedicion';
import { obtenerContactos, type ContactoEmergencia } from '@/services/usuario';
import { crearExpedicion, type BorradorDesdeHistorial } from '@/services/expedicion';
import { puntosRutaApi } from '@/services/puntosRuta';
import { copiarPuntosParaPlanNuevo } from '@/lib/puntosRuta';
import type { BorradorExpedicion, DatosBorrador } from '@/application/ports/IColaLocal';
import { isoADatetimeLocal } from '@/lib/fechaLocal';

export function PaginaCrearExpedicion({ Mapa }: Pick<PropsFormulario, 'Mapa'> = {}) {
  const [parametros] = useSearchParams();
  const { usuario } = useAutenticacion();
  const claveSesion = `${usuario?.id}:${getSessionScope()}`;
  const origenId = parametros.get('repetir');
  if (origenId !== null) {
    return (
      <PrepararExpedicionDesdeHistorial key={`${claveSesion}:${origenId}`} origenId={origenId}>
        {(borrador) => <FormularioCrearExpedicion borrador={borrador} Mapa={Mapa} />}
      </PrepararExpedicionDesdeHistorial>
    );
  }
  return <FormularioCrearExpedicion key={claveSesion} Mapa={Mapa} />;
}

type PropsFormulario = {
  borrador?: BorradorDesdeHistorial;
  borradorLocal?: BorradorExpedicion;
  onGuardarLocal?: (datos: DatosBorrador, enviar: boolean) => Promise<void>;
  Mapa?: ComponentType<CoordinatePickerMapProps>;
};

export function FormularioCrearExpedicion({ borrador, borradorLocal, onGuardarLocal, Mapa = CoordinatePickerMapLazy }: PropsFormulario) {
  const [scope] = useState(getSessionScope);
  const navigate = useNavigate();
  const enLinea = useEstadoEnLinea();
  const { usuario } = useAutenticacion();
  const [versionPlantillasCuenta, setVersionPlantillasCuenta] = useState(0);
  const [contactos, setContactos] = useState<ContactoEmergencia[]>([]);
  const [plantillas, setPlantillas] = useState<PlantillaRuta[]>([]);
  const [borradoresPendientes, setBorradoresPendientes] = useState(0);
  const [lugarInicio, setLugarInicio] = useState(borradorLocal?.lugarInicio ?? borrador?.lugarInicio ?? '');
  const [lugarFin, setLugarFin] = useState(borradorLocal?.lugarFin ?? borrador?.lugarFin ?? '');
  const [coordenadasInicio, setCoordenadasInicio] = useState(borradorLocal?.coordenadasInicio ?? borrador?.coordenadasInicio ?? '');
  const [coordenadasFin, setCoordenadasFin] = useState(borradorLocal?.coordenadasFin ?? borrador?.coordenadasFin ?? '');
  const [errorCoordInicio, setErrorCoordInicio] = useState('');
  const [errorCoordFin, setErrorCoordFin] = useState('');
  const [horaInicio, setHoraInicio] = useState(borradorLocal ? isoADatetimeLocal(borradorLocal.horaInicio) : '');
  const [horaRetornoEstimada, setHoraRetornoEstimada] = useState(borradorLocal ? isoADatetimeLocal(borradorLocal.horaRetornoEstimada) : '');
  const [minutosTolerancia, setMinutosTolerancia] = useState(borradorLocal?.minutosTolerancia ?? borrador?.minutosTolerancia ?? 30);
  const [minutosRecordatorio, setMinutosRecordatorio] = useState<15 | 30 | 60>(
    ((borradorLocal?.minutosRecordatorio ?? borrador?.minutosRecordatorio) as 15 | 30 | 60) ?? 30,
  );
  const [idsContactosSeleccionados, setIdsContactosSeleccionados] = useState<string[]>(() => [...(borradorLocal?.idsContactos ?? borrador?.idsContactos ?? [])]);
  const [nombresAcompanantes, setNombresAcompanantes] = useState<string[]>(() =>
    (borradorLocal ?? borrador)?.nombresAcompanantes.length ? [...(borradorLocal ?? borrador)!.nombresAcompanantes] : ['']);
  const [contactosRevisados, setContactosRevisados] = useState(false);
  const [fechasRevisadas, setFechasRevisadas] = useState(false);
  const [cargandoContactos, setCargandoContactos] = useState(true);
  const [errorContactos, setErrorContactos] = useState('');
  const [intentoContactos, setIntentoContactos] = useState(0);
  const [objetivoSelector, setObjetivoSelector] = useState<CoordinatePickerTarget>('start');
  const [coordsManualesAbiertas, setCoordsManualesAbiertas] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cargando, setCargando] = useState(false);
  const operacionEnCurso = useRef(false);

  useEffect(() => {
    if (!enLinea) setCoordsManualesAbiertas(true);
    if (borradorLocal) { setFechasRevisadas(false); setContactosRevisados(false); }
  }, [enLinea, borradorLocal]);

  useEffect(() => {
    if (errorCoordInicio || errorCoordFin) setCoordsManualesAbiertas(true);
  }, [errorCoordInicio, errorCoordFin]);

  useEffect(() => {
    let activo = true;
    const vigente = () => activo && scope === getSessionScope();
    void listarPlantillasRuta(scope).then((lista) => { if (vigente()) setPlantillas(lista); });
    void listarBorradoresExpedicion(scope).then((lista) => { if (vigente()) setBorradoresPendientes(lista.filter(b => b.estado !== 'sincronizado').length); })
      .catch(() => { if (vigente()) setError('No se pudo consultar la cola de borradores.'); });

    function aplicarContactos(lista: ContactoEmergencia[]) {
      if (!vigente()) return;
      setContactos(lista);
      if (borrador || (borradorLocal && enLinea)) {
        const disponibles = new Set(lista.map((contacto) => contacto.id));
        setIdsContactosSeleccionados((anteriores) => anteriores.filter((id) => disponibles.has(id)));
        setContactosRevisados(false);
      }
    }
    async function cargarContactos() {
      setCargandoContactos(true);
      setErrorContactos('');
      try {
        const lista = enLinea ? (await obtenerContactos()).contactos : await obtenerContactosCacheados();
        aplicarContactos(lista);
        if (vigente() && enLinea) await cachearContactos(lista, scope);
      } catch {
        const lista = await obtenerContactosCacheados();
        aplicarContactos(lista);
        if (vigente() && enLinea && (lista.length === 0 || borradorLocal)) {
          setErrorContactos('No pudimos cargar tus contactos. Inténtalo de nuevo.');
        }
      } finally {
        if (vigente()) setCargandoContactos(false);
      }
    }
    void cargarContactos();
    return () => { activo = false; };
  }, [enLinea, scope, borrador, borradorLocal, intentoContactos]);

  const toggleContacto = (id: string) => {
    setContactosRevisados(false);
    setIdsContactosSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const actualizarAcompanante = (index: number, valor: string) => {
    setNombresAcompanantes((prev) => prev.map((n, i) => (i === index ? valor : n)));
  };

  const agregarAcompanante = () => setNombresAcompanantes((prev) => [...prev, '']);
  const quitarAcompanante = (index: number) =>
    setNombresAcompanantes((prev) => prev.filter((_, i) => i !== index));

  const aplicarPlantilla = (plantilla: PlantillaRuta) => {
    setLugarInicio(plantilla.lugarInicio);
    setLugarFin(plantilla.lugarFin);
    setCoordenadasInicio(plantilla.coordenadasInicio ?? '');
    setCoordenadasFin(plantilla.coordenadasFin ?? '');
    setMinutosTolerancia(plantilla.minutosTolerancia);
    setErrorCoordInicio('');
    setErrorCoordFin('');
  };

  const aplicarBorradorPlantilla = (desdePlantilla: BorradorDesdePlantilla) => {
    setLugarInicio(desdePlantilla.lugarInicio);
    setLugarFin(desdePlantilla.lugarFin);
    setCoordenadasInicio(desdePlantilla.coordenadasInicio ?? '');
    setCoordenadasFin(desdePlantilla.coordenadasFin ?? '');
    setMinutosTolerancia(desdePlantilla.minutosTolerancia);
    setIdsContactosSeleccionados(desdePlantilla.idsContactos);
    setContactosRevisados(false);
    setNombresAcompanantes(desdePlantilla.nombresAcompanantes.length > 0 ? desdePlantilla.nombresAcompanantes : ['']);
    setHoraInicio('');
    setHoraRetornoEstimada('');
    setErrorCoordInicio('');
    setErrorCoordFin('');
    setError('');
    setInfo(mensajeAplicacionBorrador(desdePlantilla));
  };

  const validarCoordenadas = (): boolean => {
    let ok = true;
    if (coordenadasInicio.trim()) {
      const err = validateCoordinateInput(coordenadasInicio);
      setErrorCoordInicio(err ?? '');
      if (err) ok = false;
    } else {
      setErrorCoordInicio('');
    }
    if (coordenadasFin.trim()) {
      const err = validateCoordinateInput(coordenadasFin);
      setErrorCoordFin(err ?? '');
      if (err) ok = false;
    } else {
      setErrorCoordFin('');
    }
    if (horaInicio && horaRetornoEstimada && new Date(horaRetornoEstimada) <= new Date(horaInicio)) {
      setError('La hora de retorno debe ser posterior a la hora de salida');
      ok = false;
    } else if (!error.startsWith('La hora')) {
      setError('');
    }
    return ok;
  };

  const acompanantesValidos = nombresAcompanantes.map((n) => n.trim()).filter((n) => n.length >= 2);
  const puntosOrigen = borrador?.puntos ?? [];

  const puedeEnviar =
    lugarInicio.trim().length >= 3 &&
    lugarFin.trim().length >= 3 &&
    horaInicio &&
    horaRetornoEstimada &&
    idsContactosSeleccionados.length > 0 &&
    acompanantesValidos.length > 0 &&
    (enLinea || puntosOrigen.length === 0) &&
    (!borrador || (contactosRevisados && !cargandoContactos &&
      idsContactosSeleccionados.every((id) => contactos.some((contacto) => contacto.id === id)))) &&
    (!borradorLocal || !enLinea || (fechasRevisadas && contactosRevisados && !errorContactos && !cargandoContactos &&
      idsContactosSeleccionados.every((id) => contactos.some((contacto) => contacto.id === id)))) &&
    !errorCoordInicio &&
    !errorCoordFin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (operacionEnCurso.current || !puedeEnviar || !validarCoordenadas() || scope !== getSessionScope()) return;
    const inicioMs = new Date(horaInicio).getTime();
    const retornoMs = new Date(horaRetornoEstimada).getTime();
    if (!Number.isFinite(inicioMs) || !Number.isFinite(retornoMs) || inicioMs <= Date.now() || retornoMs <= inicioMs) {
      setError('Elige una salida futura y un retorno posterior a la salida.');
      return;
    }

    const payload = {
      lugarInicio: lugarInicio.trim(),
      lugarFin: lugarFin.trim(),
      coordenadasInicio: coordenadasInicio.trim() || undefined,
      coordenadasFin: coordenadasFin.trim() || undefined,
      horaInicio: new Date(horaInicio).toISOString(),
      horaRetornoEstimada: new Date(horaRetornoEstimada).toISOString(),
      minutosTolerancia,
      minutosRecordatorio,
      idsContactos: idsContactosSeleccionados,
      nombresAcompanantes: acompanantesValidos,
    };

    setError('');
    setInfo('');
    setCargando(true);
    operacionEnCurso.current = true;

    try {
      if (borradorLocal && onGuardarLocal) {
        await onGuardarLocal({ ...payload, coordenadasInicio: coordenadasInicio.trim(), coordenadasFin: coordenadasFin.trim() }, enLinea);
        return;
      }
      if (!enLinea) {
        await guardarBorradorExpedicion({
          ...payload,
          coordenadasInicio: coordenadasInicio.trim(),
          coordenadasFin: coordenadasFin.trim(),
        }, scope);
        await guardarPlantillaRuta({
          lugarInicio: payload.lugarInicio,
          lugarFin: payload.lugarFin,
          coordenadasInicio: payload.coordenadasInicio,
          coordenadasFin: payload.coordenadasFin,
          minutosTolerancia: payload.minutosTolerancia,
        }, scope);
        const restantes = await listarBorradoresExpedicion(scope);
        const rutas = await listarPlantillasRuta(scope);
        if (scope !== getSessionScope()) return;
        setBorradoresPendientes(restantes.length);
        setPlantillas(rutas);
        setInfo('Borrador guardado para sincronizar después de revisar fechas y contactos. Se eliminará si cierras sesión.');
        return;
      }
      const { expedicion } = await crearExpedicion(payload);
      if (scope !== getSessionScope()) return;
      if (puntosOrigen.length > 0) {
        try {
          await puntosRutaApi.guardar(expedicion.id, expedicion.version, copiarPuntosParaPlanNuevo(puntosOrigen));
        } catch {
          if (scope !== getSessionScope()) return;
          // Ya se creó el plan: consultar su editor evita registrar un duplicado
          // y permite comprobar si el guardado llegó a persistir antes del fallo.
          navigate(`/senderista/expedicion/${encodeURIComponent(expedicion.id)}/puntos`, {
            state: { copiaPuntosNoConfirmada: true },
          });
          return;
        }
        if (scope !== getSessionScope()) return;
      }
      await guardarPlantillaRuta({
        lugarInicio: payload.lugarInicio,
        lugarFin: payload.lugarFin,
        coordenadasInicio: payload.coordenadasInicio,
        coordenadasFin: payload.coordenadasFin,
        minutosTolerancia: payload.minutosTolerancia,
      }, scope);
      if (scope !== getSessionScope()) return;
      navigate(
        expedicion.estado === 'en_progreso'
          ? '/senderista/expedicion/activa'
          : '/senderista/expedicion',
      );
    } catch (err) {
      if (scope === getSessionScope()) setError(err instanceof Error ? err.message : 'Error al registrar expedición');
    } finally {
      operacionEnCurso.current = false;
      if (scope === getSessionScope()) setCargando(false);
    }
  };

  return (
    <div className="px-6 py-6">
      <Link to={borrador ? '/senderista/perfil/historial' : '/senderista/expedicion'} className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
        <ChevronLeft size={16} /> {borrador ? 'Historial' : 'Expediciones'}
      </Link>

      <h2 className="text-xl font-bold mb-1">{borradorLocal ? 'Revisar borrador' : 'Nueva expedición'}</h2>
      <p className="text-sm text-muted-foreground mb-4">Registra tu itinerario y contactos de alerta.</p>

      {borrador && (
        <div role="status" className="mb-4 space-y-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">
          <p className="font-semibold">Ruta cargada desde tu historial</p>
          <p>{borrador.descripcionOrigen}. Completa fechas nuevas y revisa los contactos para esta salida.</p>
          {borrador.cantidadContactosNoVigentes > 0 && (
            <p>{borrador.cantidadContactosNoVigentes} contacto(s) anterior(es) ya no están disponibles.</p>
          )}
          {puntosOrigen.length > 0 && (
            <p>Se copiarán {puntosOrigen.length} punto(s) intermedio(s) de la ruta original.</p>
          )}
        </div>
      )}

      {!enLinea && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-100 text-sm flex items-center gap-2">
          <WifiOff size={16} /> {puntosOrigen.length > 0
            ? 'Sin conexión: conservamos este formulario mientras mantengas la pantalla abierta.'
            : 'Sin conexión: puedes usar tus plantillas y guardar borradores de esta sesión.'}
        </div>
      )}

      {!enLinea && puntosOrigen.length > 0 && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          Vuelve a conectarte para registrar esta expedición con sus puntos. Tu formulario permanece en esta pantalla.
        </p>
      )}

      {borradoresPendientes > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-primary/10 text-primary text-sm">
          {borradoresPendientes} borrador(es) pendiente(s) de sincronización.
          <Link to="/senderista/expedicion/borradores" className="block min-h-11 underline font-semibold">Revisar cola de borradores</Link>
        </div>
      )}

      {info && <div className="mb-4 p-3 rounded-xl bg-primary/10 text-primary text-sm">{info}</div>}
      {error && <div role="alert" className="error-banner mb-4">{error}</div>}

      {usuario && !borrador && !borradorLocal && (
        <SelectorPlantillasCuenta
          usuarioId={usuario.id}
          enLinea={enLinea}
          contactos={contactos}
          versionLista={versionPlantillasCuenta}
          onAplicar={aplicarBorradorPlantilla}
        />
      )}

      {plantillas.length > 0 && (
        <div className="mb-6">
          <FieldLabel>Plantillas de ruta frecuente</FieldLabel>
          <div className="flex gap-2 overflow-x-auto pb-1 mt-2">
            {plantillas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => aplicarPlantilla(p)}
                className="flex-shrink-0 px-3 py-2 bg-card border border-border rounded-xl text-xs font-medium"
              >
                {p.lugarFin}
              </button>
            ))}
          </div>
        </div>
      )}

      {cargandoContactos && <p role="status" className="mb-4 text-sm text-muted-foreground">Cargando contactos…</p>}
      {errorContactos && (
        <div role="alert" className="error-banner mb-4">
          <p>{errorContactos}</p>
          <button type="button" disabled={cargandoContactos || !enLinea} onClick={() => setIntentoContactos((actual) => actual + 1)}
            className="min-h-12 font-semibold disabled:opacity-50">Reintentar contactos</button>
        </div>
      )}
      {!cargandoContactos && !errorContactos && contactos.length === 0 && (
        <div className="error-banner mb-4">
          {enLinea ? (
            <>
              Debes registrar al menos un contacto en{' '}
              <Link to="/senderista/perfil/contactos" className="underline font-semibold">
                Perfil → Contactos
              </Link>
            </>
          ) : (
            'Conéctate para cargar tus contactos. Solo se conservan mientras la aplicación esté abierta.'
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset disabled={cargando} className="min-w-0 space-y-4">
        <div>
          <FieldLabel htmlFor="exp-lugar-inicio">Ubicación inicial</FieldLabel>
          <input
            id="exp-lugar-inicio"
            className="input-field"
            value={lugarInicio}
            onChange={(e) => setLugarInicio(e.target.value)}
            placeholder="Ej: Cebollapampa, Huaraz"
            aria-required="true"
          />
        </div>
        <div>
          <FieldLabel htmlFor="exp-lugar-fin">Destino / Nevado</FieldLabel>
          <input
            id="exp-lugar-fin"
            className="input-field"
            value={lugarFin}
            onChange={(e) => setLugarFin(e.target.value)}
            placeholder="Ej: Laguna 69"
            aria-required="true"
          />
        </div>

        {enLinea ? (
          <div>
            <FieldLabel>Ubicación en mapa</FieldLabel>
            <p className="text-xs text-muted-foreground mb-2">
              Marca salida y destino en el mapa. Las coordenadas se completan solas.
            </p>
            <Mapa
              className="mt-2"
              activeTarget={objetivoSelector}
              onActiveTargetChange={setObjetivoSelector}
              startCoordinates={coordenadasInicio}
              endCoordinates={coordenadasFin}
              startLabel={lugarInicio}
              endLabel={lugarFin}
              onStartChange={(valor) => {
                setCoordenadasInicio(valor);
                if (errorCoordInicio) setErrorCoordInicio('');
              }}
              onEndChange={(valor) => {
                setCoordenadasFin(valor);
                if (errorCoordFin) setErrorCoordFin('');
              }}
              onStartError={setErrorCoordInicio}
              onEndError={setErrorCoordFin}
            />
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-muted/60 text-sm text-muted-foreground flex items-start gap-2">
            <WifiOff size={16} className="mt-0.5 shrink-0" />
            Mapa no disponible offline. Usa coordenadas manuales o una plantilla guardada.
          </div>
        )}

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setCoordsManualesAbiertas((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-semibold"
          >
            <span className="flex items-center gap-2">
              <Globe size={16} className="text-muted-foreground" />
              Editar coordenadas manualmente
            </span>
            {coordsManualesAbiertas ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {coordsManualesAbiertas && (
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                Útil para pegar coords de GPS, ajustar precisión o registrar offline.
                Formato decimal: <span className="font-medium">-9.0105, -77.6042</span>
              </p>
              <div>
                <FieldLabel htmlFor="exp-coord-inicio">Coordenadas de salida</FieldLabel>
                <input
                  id="exp-coord-inicio"
                  className={`input-field ${errorCoordInicio ? 'input-error' : ''}`}
                  value={coordenadasInicio}
                  onChange={(e) => {
                    setCoordenadasInicio(e.target.value);
                    if (errorCoordInicio) setErrorCoordInicio('');
                  }}
                  onBlur={() => {
                    if (coordenadasInicio.trim()) {
                      setErrorCoordInicio(validateCoordinateInput(coordenadasInicio) ?? '');
                    }
                  }}
                  placeholder="-9.5105, -77.5275"
                />
                {errorCoordInicio && <FieldError message={errorCoordInicio} />}
              </div>
              <div>
                <FieldLabel htmlFor="exp-coord-fin">Coordenadas de destino</FieldLabel>
                <input
                  id="exp-coord-fin"
                  className={`input-field ${errorCoordFin ? 'input-error' : ''}`}
                  value={coordenadasFin}
                  onChange={(e) => {
                    setCoordenadasFin(e.target.value);
                    if (errorCoordFin) setErrorCoordFin('');
                  }}
                  onBlur={() => {
                    if (coordenadasFin.trim()) {
                      setErrorCoordFin(validateCoordinateInput(coordenadasFin) ?? '');
                    }
                  }}
                  placeholder="-9.0105, -77.6042"
                />
                {errorCoordFin && <FieldError message={errorCoordFin} />}
              </div>
            </div>
          )}
        </div>

        <div>
          <FieldLabel htmlFor="exp-hora-inicio">Fecha y hora de salida</FieldLabel>
          <input
            id="exp-hora-inicio"
            type="datetime-local"
            className="input-field"
            value={horaInicio}
              onChange={(e) => { setHoraInicio(e.target.value); setFechasRevisadas(false); }}
            aria-required="true"
          />
        </div>
        <div>
          <FieldLabel htmlFor="exp-hora-retorno">Retorno estimado</FieldLabel>
          <input
            id="exp-hora-retorno"
            type="datetime-local"
            className="input-field"
            value={horaRetornoEstimada}
              onChange={(e) => { setHoraRetornoEstimada(e.target.value); setFechasRevisadas(false); }}
            aria-required="true"
          />
        </div>
        <div>
          <FieldLabel htmlFor="exp-tolerancia">Tolerancia (minutos)</FieldLabel>
          <input
            id="exp-tolerancia"
            type="number"
            min={1}
            max={480}
            className="input-field"
            value={minutosTolerancia}
            onChange={(e) => setMinutosTolerancia(Number(e.target.value))}
          />
        </div>

        <div>
          <FieldLabel htmlFor="exp-recordatorio">Anticipación del recordatorio in-app</FieldLabel>
          <p className="text-xs text-muted-foreground mb-2">
            Elige con cuánta anticipación recibirás el aviso en tu bandeja antes de la hora de retorno estimada.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[15, 30, 60].map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => setMinutosRecordatorio(min as 15 | 30 | 60)}
                className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all ${
                  minutosRecordatorio === min
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card text-foreground border-border hover:bg-muted/50'
                }`}
              >
                {min} min {min === 30 && '(Inicial)'}
              </button>
            ))}
          </div>
        </div>

        <fieldset>
          <legend className="block text-sm font-semibold mb-1.5">Contactos de alerta</legend>
          <div className="space-y-2 mt-2">
            {contactos.map((c) => (
              <label key={c.id} className="flex items-center gap-3 bg-card border border-border rounded-xl p-3">
                <input
                  type="checkbox"
                  checked={idsContactosSeleccionados.includes(c.id)}
                  onChange={() => toggleContacto(c.id)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">
                  {c.nombreCompleto} · {c.correoElectronico}
                </span>
              </label>
            ))}
          </div>
          {idsContactosSeleccionados.length === 0 && (
            <FieldError message="Selecciona al menos un contacto" />
          )}
        </fieldset>

        {(borrador || (borradorLocal && enLinea)) && (
          <label className="flex min-h-12 items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
            <input id="exp-contactos-revisados" type="checkbox" checked={contactosRevisados}
              disabled={cargandoContactos || contactos.length === 0}
              onChange={(evento) => setContactosRevisados(evento.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
            He revisado los contactos de alerta para esta nueva expedición.
          </label>
        )}
        {borradorLocal && enLinea && <label className="flex min-h-12 items-center gap-3 text-sm">
          <input type="checkbox" checked={fechasRevisadas} onChange={e => setFechasRevisadas(e.target.checked)} />
          He revisado las fechas de salida y retorno para este borrador.
        </label>}

        <div>
          <FieldLabel>Acompañantes de la cordada</FieldLabel>
          <div className="space-y-2 mt-2">
            {nombresAcompanantes.map((nombre, index) => (
              <div key={index} className="flex gap-2">
                <input
                  className="input-field"
                  value={nombre}
                  onChange={(e) => actualizarAcompanante(index, e.target.value)}
                  placeholder="Nombre completo"
                />
                {nombresAcompanantes.length > 1 && (
                  <button type="button" onClick={() => quitarAcompanante(index)}>
                    <X size={18} className="text-muted-foreground mt-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={agregarAcompanante}
            className="mt-2 text-sm text-primary font-semibold flex items-center gap-1"
          >
            <Plus size={16} /> Agregar acompañante
          </button>
        </div>

        <GuardarComoPlantilla
          enLinea={enLinea}
          datos={{
            lugarInicio: lugarInicio.trim(),
            lugarFin: lugarFin.trim(),
            coordenadasInicio: coordenadasInicio.trim() || undefined,
            coordenadasFin: coordenadasFin.trim() || undefined,
            minutosTolerancia,
            idsContactos: idsContactosSeleccionados,
            nombresAcompanantes: acompanantesValidos,
          }}
          onGuardada={() => setVersionPlantillasCuenta((v) => v + 1)}
        />

        </fieldset>
        <button type="submit" className="btn-primary" disabled={!puedeEnviar || cargando}>
          {cargando
            ? 'Registrando…'
            : borradorLocal ? (enLinea ? 'Confirmar y sincronizar borrador' : 'Guardar correcciones') : enLinea
              ? 'Registrar expedición'
              : 'Guardar borrador offline'}
        </button>
      </form>
    </div>
  );
}
