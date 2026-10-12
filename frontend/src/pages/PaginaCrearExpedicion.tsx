import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronUp, Globe, Plus, WifiOff, X } from 'lucide-react';
import { FieldError, FieldLabel } from '@/components/Layout';
import { CoordinatePickerMapLazy } from '@/components/maps/CoordinatePickerMapLazy';
import type { CoordinatePickerTarget } from '@/components/maps/CoordinatePickerMap';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';
import { validateCoordinateInput } from '@/lib/coordinates';
import { cachearContactos, obtenerContactosCacheados } from '@/lib/offlineContacts';
import {
  listarBorradoresExpedicion,
  listarPlantillasRuta,
  eliminarBorradorExpedicion,
  guardarBorradorExpedicion,
  guardarPlantillaRuta,
  type PlantillaRuta,
} from '@/lib/offlineExpedicion';
import { obtenerContactos, type ContactoEmergencia } from '@/services/usuario';
import { crearExpedicion } from '@/services/expedicion';

export function PaginaCrearExpedicion() {
  const navigate = useNavigate();
  const enLinea = useEstadoEnLinea();
  const [contactos, setContactos] = useState<ContactoEmergencia[]>([]);
  const [plantillas, setPlantillas] = useState<PlantillaRuta[]>([]);
  const [borradoresPendientes, setBorradoresPendientes] = useState(0);
  const [lugarInicio, setLugarInicio] = useState('');
  const [lugarFin, setLugarFin] = useState('');
  const [coordenadasInicio, setCoordenadasInicio] = useState('');
  const [coordenadasFin, setCoordenadasFin] = useState('');
  const [errorCoordInicio, setErrorCoordInicio] = useState('');
  const [errorCoordFin, setErrorCoordFin] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaRetornoEstimada, setHoraRetornoEstimada] = useState('');
  const [minutosTolerancia, setMinutosTolerancia] = useState(30);
  const [idsContactosSeleccionados, setIdsContactosSeleccionados] = useState<string[]>([]);
  const [nombresAcompanantes, setNombresAcompanantes] = useState<string[]>(['']);
  const [objetivoSelector, setObjetivoSelector] = useState<CoordinatePickerTarget>('start');
  const [coordsManualesAbiertas, setCoordsManualesAbiertas] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!enLinea) setCoordsManualesAbiertas(true);
  }, [enLinea]);

  useEffect(() => {
    if (errorCoordInicio || errorCoordFin) setCoordsManualesAbiertas(true);
  }, [errorCoordInicio, errorCoordFin]);

  useEffect(() => {
    void listarPlantillasRuta().then(setPlantillas);
    void listarBorradoresExpedicion().then((b) => setBorradoresPendientes(b.length));

    if (enLinea) {
      obtenerContactos()
        .then((r) => {
          setContactos(r.contactos);
          void cachearContactos(r.contactos);
        })
        .catch(() => {
          void obtenerContactosCacheados().then(setContactos);
        });
    } else {
      void obtenerContactosCacheados().then(setContactos);
    }
  }, [enLinea]);

  useEffect(() => {
    if (!enLinea) return;

    const sincronizarBorradores = async () => {
      const borradores = await listarBorradoresExpedicion();
      if (borradores.length === 0) return;

      for (const borrador of borradores) {
        try {
          await crearExpedicion({
            lugarInicio: borrador.lugarInicio,
            lugarFin: borrador.lugarFin,
            coordenadasInicio: borrador.coordenadasInicio || undefined,
            coordenadasFin: borrador.coordenadasFin || undefined,
            horaInicio: borrador.horaInicio,
            horaRetornoEstimada: borrador.horaRetornoEstimada,
            minutosTolerancia: borrador.minutosTolerancia,
            idsContactos: borrador.idsContactos,
            nombresAcompanantes: borrador.nombresAcompanantes,
          });
          await eliminarBorradorExpedicion(borrador.id);
        } catch {
          break;
        }
      }

      const restantes = await listarBorradoresExpedicion();
      setBorradoresPendientes(restantes.length);
      if (restantes.length === 0) {
        setInfo('Borradores offline sincronizados con el servidor.');
      }
    };

    void sincronizarBorradores();
  }, [enLinea]);

  const toggleContacto = (id: string) => {
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

  const puedeEnviar =
    lugarInicio.trim().length >= 3 &&
    lugarFin.trim().length >= 3 &&
    horaInicio &&
    horaRetornoEstimada &&
    idsContactosSeleccionados.length > 0 &&
    acompanantesValidos.length > 0 &&
    !errorCoordInicio &&
    !errorCoordFin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeEnviar || !validarCoordenadas()) return;

    const payload = {
      lugarInicio: lugarInicio.trim(),
      lugarFin: lugarFin.trim(),
      coordenadasInicio: coordenadasInicio.trim() || undefined,
      coordenadasFin: coordenadasFin.trim() || undefined,
      horaInicio: new Date(horaInicio).toISOString(),
      horaRetornoEstimada: new Date(horaRetornoEstimada).toISOString(),
      minutosTolerancia,
      idsContactos: idsContactosSeleccionados,
      nombresAcompanantes: acompanantesValidos,
    };

    setError('');
    setInfo('');
    setCargando(true);

    if (!enLinea) {
      await guardarBorradorExpedicion({
        ...payload,
        coordenadasInicio: coordenadasInicio.trim(),
        coordenadasFin: coordenadasFin.trim(),
      });
      await guardarPlantillaRuta({
        lugarInicio: payload.lugarInicio,
        lugarFin: payload.lugarFin,
        coordenadasInicio: payload.coordenadasInicio,
        coordenadasFin: payload.coordenadasFin,
        minutosTolerancia: payload.minutosTolerancia,
      });
      const restantes = await listarBorradoresExpedicion();
      setBorradoresPendientes(restantes.length);
      setPlantillas(await listarPlantillasRuta());
      setInfo('Sin conexión: borrador guardado en caché offline (Service Worker) para sincronizar después.');
      setCargando(false);
      return;
    }

    try {
      const { expedicion } = await crearExpedicion(payload);
      await guardarPlantillaRuta({
        lugarInicio: payload.lugarInicio,
        lugarFin: payload.lugarFin,
        coordenadasInicio: payload.coordenadasInicio,
        coordenadasFin: payload.coordenadasFin,
        minutosTolerancia: payload.minutosTolerancia,
      });
      navigate(
        expedicion.estado === 'en_progreso'
          ? '/senderista/expedicion/activa'
          : '/senderista/expedicion',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar expedición');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="px-6 py-6">
      <Link to="/senderista/expedicion" className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
        <ChevronLeft size={16} /> Expediciones
      </Link>

      <h2 className="text-xl font-bold mb-1">Nueva expedición</h2>
      <p className="text-sm text-muted-foreground mb-4">Registra tu itinerario y contactos de alerta.</p>

      {!enLinea && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-100 text-sm flex items-center gap-2">
          <WifiOff size={16} /> Modo offline: plantillas y borradores en caché del Service Worker.
        </div>
      )}

      {borradoresPendientes > 0 && enLinea && (
        <div className="mb-4 p-3 rounded-xl bg-primary/10 text-primary text-sm">
          {borradoresPendientes} borrador(es) pendiente(s) de sincronización.
        </div>
      )}

      {info && <div className="mb-4 p-3 rounded-xl bg-primary/10 text-primary text-sm">{info}</div>}
      {error && <div className="error-banner mb-4">{error}</div>}

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

      {contactos.length === 0 && (
        <div className="error-banner mb-4">
          {enLinea ? (
            <>
              Debes registrar al menos un contacto en{' '}
              <Link to="/senderista/perfil/contactos" className="underline font-semibold">
                Perfil → Contactos
              </Link>
            </>
          ) : (
            'Sin contactos en caché. Conéctate una vez para sincronizar contactos antes de salir offline.'
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
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
            <CoordinatePickerMapLazy
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
            onChange={(e) => setHoraInicio(e.target.value)}
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
            onChange={(e) => setHoraRetornoEstimada(e.target.value)}
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

        <button type="submit" className="btn-primary" disabled={!puedeEnviar || cargando}>
          {cargando
            ? 'Registrando…'
            : enLinea
              ? 'Registrar expedición'
              : 'Guardar borrador offline'}
        </button>
      </form>
    </div>
  );
}
