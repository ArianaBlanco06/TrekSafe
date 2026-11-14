import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  Clock,
  Copy,
  ExternalLink,
  Heart,
  MapPin,
  Phone,
  Users,
} from 'lucide-react';
import { ExpeditionRouteMapLazy } from '@/components/maps/ExpeditionRouteMapLazy';
import { BitacoraIncidente } from '@/components/rescate/BitacoraIncidente';
import { BloqueCoordinacion } from '@/components/rescate/BloqueCoordinacion';
import { CierreIncidente } from '@/components/rescate/CierreIncidente';
import { FichaMedicaIncidente } from '@/components/rescate/FichaMedicaIncidente';
import { InformeCierreIncidente } from '@/components/rescate/InformeCierreIncidente';
import { parseDecimalCoordinates } from '@/lib/coordinates';
import { TEXTO_FICHA_SIN_COORDINACION } from '@/lib/fichaMedicaIncidente';
import { buildExternalMapUrl } from '@/lib/mapLinks';
import { obtenerCierreAlerta, type InformeCierreIncidente as DatosInformeCierre } from '@/services/cierreIncidente';
import type { BitacoraIncidente as DatosBitacora } from '@/services/bitacoraIncidente';
import {
  confirmarAlertaRescate,
  obtenerDetalleAlertaRescate,
  actualizarBitacoraRescate,
  type DetalleAlertaRescate,
  type EstadoRescate,
} from '@/services/rescate';

const ETIQUETA_ESTADO_RESCATE: Record<EstadoRescate, string> = {
  en_busqueda: 'En búsqueda',
  localizados: 'Localizados',
  cerrado: 'Cerrado',
};

function formatDt(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PaginaDetalleAlertaRescate() {
  const { expedicionId } = useParams<{ expedicionId: string }>();
  const navigate = useNavigate();
  const [detalle, setDetalle] = useState<DetalleAlertaRescate | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [estadoRescate, setEstadoRescate] = useState<EstadoRescate>('en_busqueda');
  const [notas, setNotas] = useState('');
  const [mensajeGuardado, setMensajeGuardado] = useState('');
  const [coordsCopiadas, setCoordsCopiadas] = useState(false);
  // HU-42: informe del último cierre (la alerta sigue en `alerta` tras cerrar el incidente).
  const [cierre, setCierre] = useState<DatosInformeCierre | null>(null);
  const [vistaBitacora, setVistaBitacora] = useState<DatosBitacora | null>(null);
  const [recargaBitacora, setRecargaBitacora] = useState(0);

  const cargarDetalle = useCallback(() => {
    if (!expedicionId) return;
    setError('');
    obtenerDetalleAlertaRescate(expedicionId)
      .then((r) => {
        setDetalle(r.alerta);
        if (r.alerta.bitacora) {
          setEstadoRescate(r.alerta.bitacora.estadoRescate as EstadoRescate);
          setNotas(r.alerta.bitacora.notas ?? '');
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar ficha'))
      .finally(() => setCargando(false));
    // HU-42: si falla, la página sigue funcionando sin el informe.
    obtenerCierreAlerta(expedicionId)
      .then((r) => setCierre(r.cierre))
      .catch(() => setCierre(null));
  }, [expedicionId]);

  const trasCambioIncidente = useCallback(() => {
    setRecargaBitacora((n) => n + 1);
    cargarDetalle();
  }, [cargarDetalle]);

  useEffect(() => {
    cargarDetalle();
  }, [cargarDetalle]);

  const handleConfirmar = async () => {
    if (!expedicionId) return;
    setConfirmando(true);
    setError('');
    try {
      const res = await confirmarAlertaRescate(expedicionId);
      setDetalle((prev) =>
        prev
          ? {
              ...prev,
              bitacora: {
                id: res.confirmacion.id,
                estadoRescate: res.confirmacion.estadoRescate,
                notas: res.confirmacion.notas,
                actualizadoEn: res.confirmacion.confirmadoEn,
              },
            }
          : prev,
      );
      setEstadoRescate((res.confirmacion.estadoRescate as EstadoRescate) || 'en_busqueda');
      setNotas(res.confirmacion.notas ?? '');
      cargarDetalle();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo confirmar');
    } finally {
      setConfirmando(false);
    }
  };

  const handleGuardarBitacora = async () => {
    if (!expedicionId) return;
    setGuardando(true);
    setError('');
    setMensajeGuardado('');
    try {
      await actualizarBitacoraRescate(expedicionId, { estadoRescate, notas: notas.trim() || undefined });
      setMensajeGuardado('Bitácora guardada');
      cargarDetalle();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return <p className="px-6 py-6 text-sm text-muted-foreground">Cargando ficha de emergencia…</p>;
  }

  if (!detalle) {
    return (
      <div className="px-6 py-6">
        <div className="error-banner mb-4">{error || 'Alerta no encontrada'}</div>
        <button type="button" onClick={() => navigate('/rescatista/alertas')} className="text-primary text-sm font-semibold">
          Volver a alertas
        </button>
      </div>
    );
  }

  const coordsPrioritarias =
    parseDecimalCoordinates(detalle.coordenadasFin ?? '') ??
    parseDecimalCoordinates(detalle.coordenadasInicio ?? '');
  const textoCoords =
    detalle.coordenadasFin?.trim() ||
    detalle.coordenadasInicio?.trim() ||
    '';
  const urlMapa = coordsPrioritarias
    ? buildExternalMapUrl(coordsPrioritarias.lat, coordsPrioritarias.lon)
    : null;

  const copiarCoords = async () => {
    if (!textoCoords) return;
    try {
      await navigator.clipboard.writeText(textoCoords);
      setCoordsCopiadas(true);
      window.setTimeout(() => setCoordsCopiadas(false), 2000);
    } catch {
      setError('No se pudieron copiar las coordenadas');
    }
  };

  return (
    <div className="px-6 py-6 pb-36">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-muted-foreground mb-4"
      >
        <ChevronLeft size={18} /> Volver
      </button>

      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h2 className="text-xl font-bold">{detalle.lugarFin}</h2>
          <p className="text-sm text-muted-foreground mt-1">{detalle.nombreCompletoSenderista}</p>
        </div>
        <span className="text-xs font-bold px-2 py-1 rounded-lg bg-destructive/15 text-destructive">
          Alerta activa
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <a
          href={`tel:${detalle.telefonoSenderista}`}
          className="min-h-12 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold flex flex-col items-center justify-center gap-1"
        >
          <Phone size={16} />
          Llamar
        </a>
        {urlMapa ? (
          <a
            href={urlMapa}
            target="_blank"
            rel="noreferrer"
            className="min-h-12 rounded-xl bg-secondary text-secondary-foreground text-xs font-semibold flex flex-col items-center justify-center gap-1"
          >
            <ExternalLink size={16} />
            Mapa
          </a>
        ) : (
          <span className="min-h-12 rounded-xl bg-muted text-muted-foreground text-xs font-semibold flex flex-col items-center justify-center gap-1 opacity-60">
            <ExternalLink size={16} />
            Sin GPS
          </span>
        )}
        <button
          type="button"
          onClick={() => void copiarCoords()}
          disabled={!textoCoords}
          className="min-h-12 rounded-xl border border-border bg-card text-xs font-semibold flex flex-col items-center justify-center gap-1 disabled:opacity-50"
        >
          <Copy size={16} />
          {coordsCopiadas ? 'Copiado' : 'Coords'}
        </button>
      </div>

      {error && <div className="error-banner mb-4">{error}</div>}

      {/* HU-39: coordinación de la alerta, aparte de "Confirmar recepción" (HU-14). */}
      <BloqueCoordinacion
        expedicionId={detalle.expedicionId}
        estado="alerta"
        coordinacion={detalle.coordinacion}
        alActualizar={cargarDetalle}
      />

      {/* HU-41: bitácora compartida del incidente (distinta de la bitácora personal de HU-14). */}
      {detalle.coordinacion && (
        <>
          <BitacoraIncidente
            key={`${detalle.coordinacion.incidenteId}-${recargaBitacora}`}
            incidenteId={detalle.coordinacion.incidenteId}
            alCambiarResponsable={cargarDetalle}
            alCargar={setVistaBitacora}
          />
          {/* HU-42: marcar localizada y cerrar con informe (solo el responsable vigente). */}
          {vistaBitacora?.incidenteId === detalle.coordinacion.incidenteId && (
            <CierreIncidente
              key={detalle.coordinacion.incidenteId}
              incidenteId={detalle.coordinacion.incidenteId}
              estado={vistaBitacora.estado}
              esResponsable={vistaBitacora.esResponsable}
              nombreResponsable={vistaBitacora.responsable.nombreResponsable}
              alCambiar={trasCambioIncidente}
            />
          )}
        </>
      )}

      {/* HU-42: sin coordinación vigente pero con un cierre: informe y bitácora en solo lectura. */}
      {!detalle.coordinacion && cierre && (
        <>
          <InformeCierreIncidente informe={cierre} />
          <BitacoraIncidente key={`cerrado-${cierre.incidenteId}`} incidenteId={cierre.incidenteId} />
        </>
      )}

      {mensajeGuardado && (
        <div className="mb-4 p-3 rounded-xl bg-primary/10 text-primary text-sm font-medium">
          {mensajeGuardado}
        </div>
      )}

      {!detalle.bitacora && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 mb-6">
          <p className="text-sm text-muted-foreground mb-3">
            Confirma la recepción de esta alerta para habilitar la bitácora de rescate.
          </p>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={confirmando}
            className="w-full py-3 bg-destructive text-destructive-foreground font-semibold rounded-xl flex items-center justify-center gap-2"
          >
            <CheckCircle size={18} />
            {confirmando ? 'Confirmando…' : 'Confirmar recepción'}
          </button>
        </div>
      )}

      <section className="bg-card border border-border rounded-2xl p-4 mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1">
          <MapPin size={14} /> Ruta declarada
        </h3>
        <p className="font-medium">{detalle.lugarInicio} → {detalle.lugarFin}</p>
        <ExpeditionRouteMapLazy
          startCoordinates={detalle.coordenadasInicio}
          endCoordinates={detalle.coordenadasFin}
          startLabel={detalle.lugarInicio}
          endLabel={detalle.lugarFin}
          className="mt-3"
        />
        {(detalle.coordenadasInicio || detalle.coordenadasFin) && (
          <div className="mt-2 text-sm text-muted-foreground space-y-1">
            {detalle.coordenadasInicio && <p>Inicio: {detalle.coordenadasInicio}</p>}
            {detalle.coordenadasFin && <p>Destino: {detalle.coordenadasFin}</p>}
          </div>
        )}
        <div className="mt-3 space-y-1 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <Clock size={14} /> Salida: {formatDt(detalle.horaInicio)}
          </p>
          <p className="flex items-center gap-2">
            <Clock size={14} /> Retorno estimado: {formatDt(detalle.horaRetornoEstimada)}
          </p>
          <p className="flex items-center gap-2">
            <AlertTriangle size={14} /> Límite: {formatDt(detalle.fechaLimite)}
          </p>
          <p className="text-xs">Alerta desde {formatDt(detalle.enAlertaDesde)}</p>
        </div>
      </section>

      {/* HU-50: la ficha médica solo la consulta el responsable vigente, bajo demanda y con auditoría. */}
      {detalle.coordinacion ? (
        <FichaMedicaIncidente
          key={`${detalle.coordinacion.incidenteId}-${detalle.coordinacion.responsableId}`}
          incidenteId={detalle.coordinacion.incidenteId}
          esResponsable={detalle.coordinacion.esMia}
        />
      ) : (
        <section className="bg-card border border-border rounded-2xl p-4 mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1">
            <Heart size={14} /> Ficha médica autorizada
          </h3>
          <p className="text-sm text-muted-foreground">{TEXTO_FICHA_SIN_COORDINACION}</p>
        </section>
      )}

      <section className="bg-card border border-border rounded-2xl p-4 mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1">
          <Users size={14} /> Cordada
        </h3>
        <p className="text-sm">
          {detalle.acompanantes.length > 0 ? detalle.acompanantes.join(', ') : 'Sin acompañantes declarados'}
        </p>
      </section>

      {detalle.contactosEmergencia.length > 0 && (
        <section className="bg-card border border-border rounded-2xl p-4 mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
            Contactos de emergencia
          </h3>
          <div className="space-y-3">
            {detalle.contactosEmergencia.map((c) => (
              <div key={`${c.nombreCompleto}-${c.telefono}`} className="text-sm">
                <p className="font-medium">{c.nombreCompleto}</p>
                <p className="text-muted-foreground text-xs">{c.parentesco}</p>
                <p className="text-muted-foreground">
                  <a href={`tel:${c.telefono}`} className="text-primary">{c.telefono}</a>
                  {' · '}
                  <a href={`mailto:${c.correoElectronico}`} className="text-primary">{c.correoElectronico}</a>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {detalle.bitacora && (
        <section className="bg-card border border-border rounded-2xl p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
            Bitácora de rescate
          </h3>
          <label className="block text-sm font-medium mb-1.5" htmlFor="estado-rescate">
            Estado del incidente
          </label>
          <select
            id="estado-rescate"
            value={estadoRescate}
            onChange={(e) => setEstadoRescate(e.target.value as EstadoRescate)}
            className="input-field mb-4"
          >
            {(Object.keys(ETIQUETA_ESTADO_RESCATE) as EstadoRescate[]).map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_ESTADO_RESCATE[s]}
              </option>
            ))}
          </select>

          <label className="block text-sm font-medium mb-1.5" htmlFor="notas-rescate">
            Notas operativas
          </label>
          <textarea
            id="notas-rescate"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Registro de acciones, ubicación, coordinación…"
            className="input-field min-h-24 resize-none mb-4"
          />

          {detalle.bitacora.actualizadoEn && (
            <p className="text-xs text-muted-foreground mb-3">
              Última actualización: {formatDt(detalle.bitacora.actualizadoEn)}
            </p>
          )}

          <button
            type="button"
            onClick={handleGuardarBitacora}
            disabled={guardando}
            className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl"
          >
            {guardando ? 'Guardando…' : 'Guardar bitácora'}
          </button>
        </section>
      )}

      <Link
        to="/rescatista/alertas"
        className="block text-center text-sm text-primary font-semibold mt-6"
      >
        Ver todas las alertas
      </Link>

      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-full max-w-sm px-4 z-40">
        <div className="bg-card/95 backdrop-blur border border-border rounded-2xl shadow-lg p-2 grid grid-cols-3 gap-2">
          <a
            href={`tel:${detalle.telefonoSenderista}`}
            className="min-h-11 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold flex items-center justify-center gap-1"
          >
            <Phone size={14} /> Llamar
          </a>
          {urlMapa ? (
            <a
              href={urlMapa}
              target="_blank"
              rel="noreferrer"
              className="min-h-11 rounded-xl bg-secondary text-secondary-foreground text-xs font-semibold flex items-center justify-center gap-1"
            >
              <ExternalLink size={14} /> Mapa
            </a>
          ) : (
            <span className="min-h-11 rounded-xl bg-muted text-muted-foreground text-xs font-semibold flex items-center justify-center opacity-60">
              Sin GPS
            </span>
          )}
          <button
            type="button"
            onClick={() => void copiarCoords()}
            disabled={!textoCoords}
            className="min-h-11 rounded-xl border border-border text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Copy size={14} /> {coordsCopiadas ? 'OK' : 'Coords'}
          </button>
        </div>
      </div>
    </div>
  );
}
