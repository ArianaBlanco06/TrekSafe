import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  MapPin,
  Phone,
  User,
} from 'lucide-react';
import { confirmarAlertaRescate, obtenerAlertasRescate, type AlertaRescate } from '@/services/rescate';

const ETIQUETA_ESTADO_RESCATE: Record<string, string> = {
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

export function PaginaInicioRescatista() {
  const [alertas, setAlertas] = useState<AlertaRescate[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  const cargarAlertas = useCallback(() => {
    setError('');
    obtenerAlertasRescate()
      .then((r) => setAlertas(r.alertas))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar alertas'))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargarAlertas();
    const poll = setInterval(cargarAlertas, 30_000);
    return () => clearInterval(poll);
  }, [cargarAlertas]);

  const handleConfirmar = async (expedicionId: string) => {
    setConfirmandoId(expedicionId);
    setError('');
    try {
      await confirmarAlertaRescate(expedicionId);
      cargarAlertas();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo confirmar la alerta');
    } finally {
      setConfirmandoId(null);
    }
  };

  const pendientes = alertas.filter((a) => !a.confirmadoPorMi);
  const confirmadas = alertas.filter((a) => a.confirmadoPorMi);

  return (
    <div className="px-6 py-6 pb-8">
      <p className="text-sm text-muted-foreground mb-4">
        Expediciones en alerta que requieren confirmación de recepción.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4">
          <p className="text-2xl font-bold text-destructive">{pendientes.length}</p>
          <p className="text-xs text-muted-foreground">Pendientes</p>
        </div>
        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4">
          <p className="text-2xl font-bold text-primary">{confirmadas.length}</p>
          <p className="text-xs text-muted-foreground">Confirmadas</p>
        </div>
      </div>

      {error && (
        <div className="error-banner mb-4">
          {error}{' '}
          <button type="button" onClick={cargarAlertas} className="underline font-semibold ml-1">
            Reintentar
          </button>
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando alertas…</p>
      ) : alertas.length === 0 ? (
        <div className="bg-muted rounded-2xl p-5 text-sm text-muted-foreground">
          No hay expediciones en alerta en este momento.
        </div>
      ) : (
        <div className="space-y-4">
          {pendientes.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-destructive uppercase tracking-wide mb-3 flex items-center gap-1">
                <AlertTriangle size={14} /> Requieren confirmación
              </h2>
              <div className="space-y-3">
                {pendientes.map((alerta) => (
                  <TarjetaAlerta
                    key={alerta.expedicionId}
                    alerta={alerta}
                    confirmando={confirmandoId === alerta.expedicionId}
                    onConfirmar={() => handleConfirmar(alerta.expedicionId)}
                  />
                ))}
              </div>
            </section>
          )}

          {confirmadas.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-primary uppercase tracking-wide mb-3 flex items-center gap-1">
                <CheckCircle size={14} /> Confirmadas por ti
              </h2>
              <div className="space-y-3">
                {confirmadas.map((alerta) => (
                  <TarjetaAlerta key={alerta.expedicionId} alerta={alerta} confirmada />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function TarjetaAlerta({
  alerta,
  confirmada,
  confirmando,
  onConfirmar,
}: {
  alerta: AlertaRescate;
  confirmada?: boolean;
  confirmando?: boolean;
  onConfirmar?: () => void;
}) {
  return (
    <div
      className={`bg-card border rounded-2xl p-4 ${
        confirmada ? 'border-primary/30' : 'border-destructive/30'
      }`}
    >
      <div className="flex justify-between items-start gap-2 mb-3">
        <div>
          <p className="font-semibold">{alerta.lugarFin}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <User size={12} /> {alerta.nombreCompletoSenderista}
          </p>
        </div>
        {confirmada ? (
          <span className="text-xs font-bold px-2 py-1 rounded-lg bg-primary/10 text-primary">
            Confirmada
          </span>
        ) : (
          <span className="text-xs font-bold px-2 py-1 rounded-lg bg-destructive/10 text-destructive">
            Pendiente
          </span>
        )}
      </div>

      <div className="space-y-1.5 text-sm text-muted-foreground mb-3">
        <p className="flex items-center gap-2">
          <MapPin size={14} /> {alerta.lugarInicio} → {alerta.lugarFin}
        </p>
        <p className="flex items-center gap-2">
          <Phone size={14} /> {alerta.telefonoSenderista}
        </p>
        <p className="flex items-center gap-2">
          <Clock size={14} /> Alerta desde {formatDt(alerta.enAlertaDesde)}
        </p>
        <p className="text-xs">Límite declarado: {formatDt(alerta.fechaLimite)}</p>
      </div>

      {confirmada && alerta.confirmadoEn && (
        <p className="text-xs text-primary font-medium mb-2">
          Confirmaste el {formatDt(alerta.confirmadoEn)}
          {alerta.estadoRescate && ` · ${ETIQUETA_ESTADO_RESCATE[alerta.estadoRescate] ?? alerta.estadoRescate}`}
        </p>
      )}

      {!confirmada && onConfirmar && (
        <div className="space-y-2">
          <Link
            to={`/rescatista/alertas/${alerta.expedicionId}`}
            className="w-full py-2.5 border border-border font-semibold rounded-xl text-sm flex items-center justify-center"
          >
            Ver ficha de emergencia
          </Link>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={confirmando}
            className="w-full py-3 bg-destructive text-destructive-foreground font-semibold rounded-xl flex items-center justify-center gap-2"
          >
            <CheckCircle size={18} />
            {confirmando ? 'Confirmando…' : 'Confirmar recepción'}
          </button>
        </div>
      )}

      {confirmada && (
        <Link
          to={`/rescatista/alertas/${alerta.expedicionId}`}
          className="w-full py-2.5 bg-primary/10 text-primary font-semibold rounded-xl text-sm flex items-center justify-center"
        >
          Ver ficha y bitácora
        </Link>
      )}
    </div>
  );
}
