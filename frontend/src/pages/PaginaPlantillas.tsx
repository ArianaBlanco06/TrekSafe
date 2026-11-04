import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Pencil, Trash2, WifiOff } from 'lucide-react';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';
import { leerCachePlantillas, reemplazarCachePlantillas } from '@/lib/cachePlantillasCuenta';
import type { PlantillaCuenta } from '@/lib/plantillasCuentaLogica';
import { ErrorClienteApi } from '@/services/clienteApi';
import {
  eliminarPlantillaCuenta,
  listarPlantillasCuenta,
  renombrarPlantillaCuenta,
} from '@/services/plantillas';

export function PaginaPlantillas() {
  const { usuario } = useAutenticacion();
  const usuarioId = usuario?.id ?? '';
  const enLinea = useEstadoEnLinea();
  const [plantillas, setPlantillas] = useState<PlantillaCuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState('');
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const cargar = useCallback(async () => {
    if (!usuarioId) return;
    setPlantillas(await leerCachePlantillas(usuarioId));
    if (!enLinea) {
      setCargando(false);
      return;
    }
    try {
      const r = await listarPlantillasCuenta();
      setPlantillas(r.plantillas);
      await reemplazarCachePlantillas(usuarioId, r.plantillas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las plantillas');
    } finally {
      setCargando(false);
    }
  }, [usuarioId, enLinea]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const iniciarEdicion = (p: PlantillaCuenta) => {
    setError('');
    setInfo('');
    setConfirmandoId(null);
    setEditandoId(p.id);
    setNombreEditado(p.nombre);
  };

  const guardarNombre = async (p: PlantillaCuenta) => {
    const nombre = nombreEditado.trim();
    if (!nombre) return;
    setError('');
    setInfo('');
    setOcupadoId(p.id);
    try {
      const { plantilla } = await renombrarPlantillaCuenta(p.id, nombre, p.version);
      const actualizadas = plantillas.map((x) => (x.id === p.id ? plantilla : x));
      setPlantillas(actualizadas);
      await reemplazarCachePlantillas(usuarioId, actualizadas);
      setEditandoId(null);
      setInfo('Plantilla renombrada.');
    } catch (err) {
      if (err instanceof ErrorClienteApi && err.codigo === 'VERSION_OBSOLETA') {
        setEditandoId(null);
        await cargar();
        setError('Esta plantilla cambió desde otro dispositivo. Se recargó la lista; vuelve a intentarlo.');
      } else if (err instanceof ErrorClienteApi && err.codigo === 'PLANTILLA_NO_ENCONTRADA') {
        setEditandoId(null);
        await cargar();
        setError('Esa plantilla ya no existe. Se actualizó tu lista.');
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo renombrar la plantilla');
      }
    } finally {
      setOcupadoId(null);
    }
  };

  const eliminar = async (p: PlantillaCuenta) => {
    setError('');
    setInfo('');
    setOcupadoId(p.id);
    try {
      await eliminarPlantillaCuenta(p.id);
      const restantes = plantillas.filter((x) => x.id !== p.id);
      setPlantillas(restantes);
      await reemplazarCachePlantillas(usuarioId, restantes);
      setConfirmandoId(null);
      setInfo('Plantilla eliminada. Tus expediciones no se modificaron.');
    } catch (err) {
      if (err instanceof ErrorClienteApi && err.codigo === 'PLANTILLA_NO_ENCONTRADA') {
        setConfirmandoId(null);
        await cargar();
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo eliminar la plantilla');
      }
    } finally {
      setOcupadoId(null);
    }
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <Link to="/senderista/perfil" className="flex items-center gap-1 text-xs text-muted-foreground">
        <ChevronLeft size={16} /> Perfil
      </Link>

      <div>
        <h2 className="text-xl font-bold">Mis plantillas</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Rutas guardadas en tu cuenta, disponibles en todos tus dispositivos. Se crean desde «Nueva expedición».
        </p>
      </div>

      {!enLinea && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-100 text-sm flex items-center gap-2">
          <WifiOff size={16} /> Sin conexión: puedes consultar la última lista sincronizada. Renombrar y eliminar requieren conexión.
        </div>
      )}
      {info && <div className="p-3 rounded-xl bg-primary/10 text-primary text-sm">{info}</div>}
      {error && <div className="error-banner">{error}</div>}

      {cargando && plantillas.length === 0 && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {!cargando && plantillas.length === 0 && (
        <p className="text-sm text-muted-foreground">Aún no tienes plantillas guardadas.</p>
      )}

      <ul className="space-y-3">
        {plantillas.map((p) => (
          <li key={p.id} className="bg-card border border-border rounded-2xl p-4 space-y-2">
            {editandoId === p.id ? (
              <div className="space-y-2">
                <label htmlFor={`nombre-${p.id}`} className="block text-sm font-semibold">
                  Nuevo nombre
                </label>
                <input
                  id={`nombre-${p.id}`}
                  className="input-field"
                  value={nombreEditado}
                  maxLength={80}
                  onChange={(e) => setNombreEditado(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!enLinea || ocupadoId === p.id || nombreEditado.trim().length === 0}
                    onClick={() => void guardarNombre(p)}
                  >
                    Guardar nombre
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setEditandoId(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.lugarInicio} → {p.lugarFin}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.idsContactos.length} contacto(s) · {p.nombresAcompanantes.length} acompañante(s) · tolerancia{' '}
                      {p.minutosTolerancia} min
                    </p>
                  </div>
                  <div className="flex gap-3 shrink-0">
                    <button
                      type="button"
                      aria-label={`Renombrar ${p.nombre}`}
                      disabled={!enLinea}
                      onClick={() => iniciarEdicion(p)}
                      className="text-muted-foreground disabled:opacity-40"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Eliminar ${p.nombre}`}
                      disabled={!enLinea}
                      onClick={() => {
                        setError('');
                        setInfo('');
                        setEditandoId(null);
                        setConfirmandoId(p.id);
                      }}
                      className="text-destructive disabled:opacity-40"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {confirmandoId === p.id && (
                  <div
                    role="alertdialog"
                    aria-label={`Confirmar eliminación de ${p.nombre}`}
                    className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 space-y-2"
                  >
                    <p className="text-sm">
                      ¿Eliminar la plantilla «{p.nombre}»? Tus expediciones no se borrarán.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={ocupadoId === p.id}
                        onClick={() => void eliminar(p)}
                      >
                        Sí, eliminar
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setConfirmandoId(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
