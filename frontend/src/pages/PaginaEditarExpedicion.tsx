import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Plus, WifiOff, X } from 'lucide-react';
import { FieldError, FieldLabel } from '@/components/Layout';
import { CoordinatePickerMapLazy } from '@/components/maps/CoordinatePickerMapLazy';
import type { CoordinatePickerTarget } from '@/components/maps/CoordinatePickerMap';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';
import { validateCoordinateInput } from '@/lib/coordinates';
import { isoADatetimeLocal } from '@/lib/fechaLocal';
import { ErrorClienteApi } from '@/services/clienteApi';
import {
  editarExpedicion,
  obtenerExpedicion,
  type DatosEdicionExpedicion,
  type PlanExpedicion,
} from '@/services/expedicion';
import { obtenerContactos, type ContactoEmergencia } from '@/services/usuario';

function mensajeDeError(err: unknown, porDefecto: string): string {
  if (err instanceof ErrorClienteApi && err.detalles) {
    const detalles = Object.values(err.detalles).flat();
    if (detalles.length > 0) return detalles.join(' ');
  }
  return err instanceof Error ? err.message : porDefecto;
}

function mismosElementos(a: string[], b: string[]): boolean {
  const ordenadaB = [...b].sort();
  return a.length === b.length && [...a].sort().every((valor, i) => valor === ordenadaB[i]);
}

export function PaginaEditarExpedicion() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const enLinea = useEstadoEnLinea();

  const [plan, setPlan] = useState<PlanExpedicion | null>(null);
  const [contactos, setContactos] = useState<ContactoEmergencia[]>([]);
  const [lugarInicio, setLugarInicio] = useState('');
  const [lugarFin, setLugarFin] = useState('');
  const [coordenadasInicio, setCoordenadasInicio] = useState('');
  const [coordenadasFin, setCoordenadasFin] = useState('');
  const [errorCoordInicio, setErrorCoordInicio] = useState('');
  const [errorCoordFin, setErrorCoordFin] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaRetornoEstimada, setHoraRetornoEstimada] = useState('');
  const [minutosTolerancia, setMinutosTolerancia] = useState(30);
  const [idsContactos, setIdsContactos] = useState<string[]>([]);
  const [nombresAcompanantes, setNombresAcompanantes] = useState<string[]>(['']);
  const [objetivoSelector, setObjetivoSelector] = useState<CoordinatePickerTarget>('start');

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [error, setError] = useState('');
  const [versionObsoleta, setVersionObsoleta] = useState(false);

  // Un reintento del mismo envío conserva su operacionId para que el servidor no lo aplique dos veces.
  const intentoPendiente = useRef<{ cuerpo: string; operacionId: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga('');
    setError('');
    setVersionObsoleta(false);
    intentoPendiente.current = null;

    try {
      const [{ expedicion }, { contactos: lista }] = await Promise.all([
        obtenerExpedicion(id),
        obtenerContactos(),
      ]);
      setPlan(expedicion);
      setContactos(lista);
      setLugarInicio(expedicion.lugarInicio);
      setLugarFin(expedicion.lugarFin);
      setCoordenadasInicio(expedicion.coordenadasInicio ?? '');
      setCoordenadasFin(expedicion.coordenadasFin ?? '');
      setErrorCoordInicio('');
      setErrorCoordFin('');
      setHoraInicio(isoADatetimeLocal(expedicion.horaInicio));
      setHoraRetornoEstimada(isoADatetimeLocal(expedicion.horaRetornoEstimada));
      setMinutosTolerancia(expedicion.minutosTolerancia);
      setIdsContactos(expedicion.idsContactos);
      setNombresAcompanantes(
        expedicion.nombresAcompanantes.length > 0 ? expedicion.nombresAcompanantes : [''],
      );
    } catch (err) {
      setErrorCarga(mensajeDeError(err, 'No se pudo cargar la expedición'));
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const toggleContacto = (contactoId: string) => {
    setIdsContactos((prev) =>
      prev.includes(contactoId) ? prev.filter((c) => c !== contactoId) : [...prev, contactoId],
    );
  };

  const acompanantesValidos = nombresAcompanantes.map((n) => n.trim()).filter((n) => n.length >= 2);

  // Se compara con lo que el formulario mostró al cargar: el campo de hora no conserva los segundos.
  const tieneCambios =
    plan !== null &&
    (lugarInicio.trim() !== plan.lugarInicio ||
      lugarFin.trim() !== plan.lugarFin ||
      coordenadasInicio.trim() !== (plan.coordenadasInicio ?? '') ||
      coordenadasFin.trim() !== (plan.coordenadasFin ?? '') ||
      horaInicio !== isoADatetimeLocal(plan.horaInicio) ||
      horaRetornoEstimada !== isoADatetimeLocal(plan.horaRetornoEstimada) ||
      minutosTolerancia !== plan.minutosTolerancia ||
      !mismosElementos(idsContactos, plan.idsContactos) ||
      !mismosElementos(acompanantesValidos, plan.nombresAcompanantes));

  const puedeEnviar =
    enLinea &&
    tieneCambios &&
    lugarInicio.trim().length >= 3 &&
    lugarFin.trim().length >= 3 &&
    Boolean(horaInicio) &&
    Boolean(horaRetornoEstimada) &&
    idsContactos.length > 0 &&
    acompanantesValidos.length > 0 &&
    !errorCoordInicio &&
    !errorCoordFin;

  const validarFormulario = (): boolean => {
    const errInicio = coordenadasInicio.trim() ? validateCoordinateInput(coordenadasInicio) : null;
    const errFin = coordenadasFin.trim() ? validateCoordinateInput(coordenadasFin) : null;
    setErrorCoordInicio(errInicio ?? '');
    setErrorCoordFin(errFin ?? '');
    if (errInicio || errFin) return false;

    if (new Date(horaRetornoEstimada) <= new Date(horaInicio)) {
      setError('La hora de retorno debe ser posterior a la hora de salida');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan || !puedeEnviar || guardando) return;

    setError('');
    setVersionObsoleta(false);
    if (!validarFormulario()) return;

    const datos: DatosEdicionExpedicion = {
      lugarInicio: lugarInicio.trim(),
      lugarFin: lugarFin.trim(),
      coordenadasInicio: coordenadasInicio.trim() || undefined,
      coordenadasFin: coordenadasFin.trim() || undefined,
      horaInicio: new Date(horaInicio).toISOString(),
      horaRetornoEstimada: new Date(horaRetornoEstimada).toISOString(),
      minutosTolerancia,
      idsContactos,
      nombresAcompanantes: acompanantesValidos,
      versionEsperada: plan.version,
    };

    const cuerpo = JSON.stringify(datos);
    const operacionId =
      intentoPendiente.current?.cuerpo === cuerpo
        ? intentoPendiente.current.operacionId
        : crypto.randomUUID();
    intentoPendiente.current = { cuerpo, operacionId };

    setGuardando(true);
    try {
      await editarExpedicion(id, datos, operacionId);
      navigate('/senderista/expedicion');
    } catch (err) {
      if (err instanceof ErrorClienteApi && err.codigo === 'VERSION_OBSOLETA') {
        setVersionObsoleta(true);
      } else {
        setError(mensajeDeError(err, 'No se pudo guardar la expedición'));
      }
    } finally {
      setGuardando(false);
    }
  };

  const enlaceVolver = (
    <Link to="/senderista/expedicion" className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
      <ChevronLeft size={16} /> Expediciones
    </Link>
  );

  if (cargando) {
    return (
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">Cargando expedición…</div>
    );
  }

  if (errorCarga || !plan) {
    return (
      <div className="px-6 py-6">
        {enlaceVolver}
        <div className="error-banner mb-4">
          {errorCarga || 'Expedición no encontrada'}{' '}
          <button type="button" onClick={() => void cargar()} className="underline font-semibold ml-1">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (plan.estado !== 'programada' || new Date(plan.horaInicio).getTime() <= Date.now()) {
    return (
      <div className="px-6 py-6">
        {enlaceVolver}
        <h2 className="text-xl font-bold mb-2">Esta expedición ya no se puede editar</h2>
        <p className="text-sm text-muted-foreground">
          Solo puedes modificar expediciones programadas cuya salida todavía no ha pasado.
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      {enlaceVolver}

      <h2 className="text-xl font-bold mb-1">Editar expedición</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Corrige tu plan antes de salir. Seguirá programada hasta la hora de salida.
      </p>

      {!enLinea && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-100 text-sm flex items-center gap-2">
          <WifiOff size={16} /> Necesitas conexión para guardar los cambios.
        </div>
      )}

      {versionObsoleta && (
        <div className="error-banner mb-4" role="alert">
          Este plan cambió desde que lo abriste, posiblemente en otro dispositivo. Tus cambios no se
          guardaron.{' '}
          <button type="button" onClick={() => void cargar()} className="underline font-semibold ml-1">
            Recargar plan
          </button>
        </div>
      )}

      {error && <div className="error-banner mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <FieldLabel htmlFor="editar-lugar-inicio">Ubicación inicial</FieldLabel>
          <input
            id="editar-lugar-inicio"
            className="input-field"
            value={lugarInicio}
            maxLength={500}
            onChange={(e) => setLugarInicio(e.target.value)}
            aria-required="true"
          />
        </div>
        <div>
          <FieldLabel htmlFor="editar-lugar-fin">Destino / Nevado</FieldLabel>
          <input
            id="editar-lugar-fin"
            className="input-field"
            value={lugarFin}
            maxLength={500}
            onChange={(e) => setLugarFin(e.target.value)}
            aria-required="true"
          />
        </div>

        {enLinea && (
          <div>
            <FieldLabel>Ubicación en mapa</FieldLabel>
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
                setErrorCoordInicio('');
              }}
              onEndChange={(valor) => {
                setCoordenadasFin(valor);
                setErrorCoordFin('');
              }}
              onStartError={setErrorCoordInicio}
              onEndError={setErrorCoordFin}
            />
          </div>
        )}

        <div>
          <FieldLabel htmlFor="editar-coord-inicio">Coordenadas de salida</FieldLabel>
          <input
            id="editar-coord-inicio"
            className={`input-field ${errorCoordInicio ? 'input-error' : ''}`}
            value={coordenadasInicio}
            onChange={(e) => {
              setCoordenadasInicio(e.target.value);
              setErrorCoordInicio('');
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
          <FieldLabel htmlFor="editar-coord-fin">Coordenadas de destino</FieldLabel>
          <input
            id="editar-coord-fin"
            className={`input-field ${errorCoordFin ? 'input-error' : ''}`}
            value={coordenadasFin}
            onChange={(e) => {
              setCoordenadasFin(e.target.value);
              setErrorCoordFin('');
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

        <div>
          <FieldLabel htmlFor="editar-hora-inicio">Fecha y hora de salida</FieldLabel>
          <input
            id="editar-hora-inicio"
            type="datetime-local"
            className="input-field"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            aria-required="true"
          />
        </div>
        <div>
          <FieldLabel htmlFor="editar-hora-retorno">Retorno estimado</FieldLabel>
          <input
            id="editar-hora-retorno"
            type="datetime-local"
            className="input-field"
            value={horaRetornoEstimada}
            onChange={(e) => setHoraRetornoEstimada(e.target.value)}
            aria-required="true"
          />
        </div>
        <div>
          <FieldLabel htmlFor="editar-tolerancia">Tolerancia (minutos)</FieldLabel>
          <input
            id="editar-tolerancia"
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
                  checked={idsContactos.includes(c.id)}
                  onChange={() => toggleContacto(c.id)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">
                  {c.nombreCompleto} · {c.correoElectronico}
                </span>
              </label>
            ))}
          </div>
          {idsContactos.length === 0 && <FieldError message="Selecciona al menos un contacto" />}
        </fieldset>

        <div>
          <FieldLabel>Acompañantes de la cordada</FieldLabel>
          <div className="space-y-2 mt-2">
            {nombresAcompanantes.map((nombre, index) => (
              <div key={index} className="flex gap-2">
                <input
                  className="input-field"
                  value={nombre}
                  maxLength={200}
                  onChange={(e) =>
                    setNombresAcompanantes((prev) =>
                      prev.map((n, i) => (i === index ? e.target.value : n)),
                    )
                  }
                  placeholder="Nombre completo"
                />
                {nombresAcompanantes.length > 1 && (
                  <button
                    type="button"
                    aria-label="Quitar acompañante"
                    onClick={() =>
                      setNombresAcompanantes((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    <X size={18} className="text-muted-foreground mt-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setNombresAcompanantes((prev) => [...prev, ''])}
            className="mt-2 text-sm text-primary font-semibold flex items-center gap-1"
          >
            <Plus size={16} /> Agregar acompañante
          </button>
        </div>

        <button type="submit" className="btn-primary" disabled={!puedeEnviar || guardando}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}
