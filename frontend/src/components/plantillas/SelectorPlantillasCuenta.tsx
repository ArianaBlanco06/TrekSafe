import { useEffect, useState } from 'react';
import { FieldLabel } from '@/components/Layout';
import { leerCachePlantillas, reemplazarCachePlantillas } from '@/lib/cachePlantillasCuenta';
import { getSessionScope } from '@/lib/sesion';
import {
  construirBorradorDesdeCache,
  type BorradorDesdePlantilla,
  type PlantillaCuenta,
} from '@/lib/plantillasCuentaLogica';
import { ErrorClienteApi } from '@/services/clienteApi';
import { listarPlantillasCuenta, obtenerBorradorDesdePlantilla } from '@/services/plantillas';
import type { ContactoEmergencia } from '@/services/usuario';

type Props = {
  usuarioId: string;
  enLinea: boolean;
  contactos: ContactoEmergencia[];
  /** Cambia cuando se guarda una plantilla nueva para volver a cargar la lista. */
  versionLista: number;
  onAplicar: (borrador: BorradorDesdePlantilla) => void;
};

export function SelectorPlantillasCuenta({ usuarioId, enLinea, contactos, versionLista, onAplicar }: Props) {
  const [plantillas, setPlantillas] = useState<PlantillaCuenta[]>([]);
  const [aplicandoId, setAplicandoId] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Ámbito de sesión fijado al montar: si cambia (logout u otra cuenta), se descartan respuestas.
  const [scope] = useState(getSessionScope);
  const sesionVigente = () => scope !== null && scope === getSessionScope();

  useEffect(() => {
    let activo = true;
    const vigente = () => activo && scope !== null && scope === getSessionScope();
    void leerCachePlantillas(usuarioId, scope).then((cacheadas) => {
      if (vigente()) setPlantillas(cacheadas);
    });

    if (enLinea) {
      listarPlantillasCuenta()
        .then(async (r) => {
          if (!vigente()) return;
          await reemplazarCachePlantillas(usuarioId, r.plantillas, scope);
          if (vigente()) setPlantillas(r.plantillas);
        })
        .catch(() => undefined);
    }
    return () => {
      activo = false;
    };
  }, [usuarioId, enLinea, versionLista, scope]);

  const borradorDesdeCache = (plantilla: PlantillaCuenta) =>
    construirBorradorDesdeCache(
      plantilla,
      contactos.map((c) => c.id),
    );

  const aplicar = async (plantilla: PlantillaCuenta) => {
    if (!sesionVigente()) return;
    setError('');
    setAplicandoId(plantilla.id);
    try {
      if (!enLinea) {
        onAplicar(borradorDesdeCache(plantilla));
        return;
      }
      try {
        const { borrador } = await obtenerBorradorDesdePlantilla(plantilla.id);
        if (sesionVigente()) onAplicar(borrador);
      } catch (err) {
        if (!sesionVigente() || (err instanceof ErrorClienteApi && err.codigo === 'SESSION_CHANGED')) {
          return;
        }
        if (err instanceof ErrorClienteApi && err.status === 404) {
          const restantes = plantillas.filter((p) => p.id !== plantilla.id);
          setPlantillas(restantes);
          await reemplazarCachePlantillas(usuarioId, restantes, scope);
          setError('Esa plantilla ya no existe. Se actualizó tu lista.');
        } else if (err instanceof ErrorClienteApi && err.status === 0) {
          onAplicar(borradorDesdeCache(plantilla));
        } else {
          setError(err instanceof Error ? err.message : 'No se pudo aplicar la plantilla');
        }
      }
    } finally {
      setAplicandoId(null);
    }
  };

  if (plantillas.length === 0 && !error) return null;

  return (
    <div className="mb-6">
      <FieldLabel>Mis plantillas</FieldLabel>
      <p className="text-xs text-muted-foreground mb-2">
        Guardadas en tu cuenta. Al aplicarlas debes ingresar fechas nuevas.
      </p>
      {error && <div className="error-banner mb-2">{error}</div>}
      <div className="flex gap-2 overflow-x-auto pb-1 mt-2">
        {plantillas.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={aplicandoId !== null}
            onClick={() => void aplicar(p)}
            className="flex-shrink-0 px-3 py-2 bg-card border border-border rounded-xl text-xs font-medium text-left"
          >
            <span className="block font-semibold">{p.nombre}</span>
            <span className="block text-muted-foreground">{p.lugarFin}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
