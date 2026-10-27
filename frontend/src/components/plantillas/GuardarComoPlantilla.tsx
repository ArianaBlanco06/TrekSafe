import { useState } from 'react';
import { Save } from 'lucide-react';
import { FieldLabel } from '@/components/Layout';
import { guardarPlantillaCuenta, type DatosGuardarPlantilla } from '@/services/plantillas';

type Props = {
  enLinea: boolean;
  /** Datos actuales del formulario, sin nombre. */
  datos: Omit<DatosGuardarPlantilla, 'nombre'>;
  onGuardada: () => void;
};

export function GuardarComoPlantilla({ enLinea, datos, onGuardada }: Props) {
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const datosValidos = datos.lugarInicio.trim().length >= 3 && datos.lugarFin.trim().length >= 3;
  const puedeGuardar = enLinea && datosValidos && nombre.trim().length > 0 && !guardando;

  const guardar = async () => {
    setError('');
    setAviso('');
    setGuardando(true);
    try {
      const { plantilla } = await guardarPlantillaCuenta({ ...datos, nombre: nombre.trim() });
      setNombre('');
      setAviso(`Plantilla «${plantilla.nombre}» guardada en tu cuenta.`);
      onGuardada();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la plantilla');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <FieldLabel htmlFor="plantilla-nombre">Guardar como plantilla</FieldLabel>
      <p className="text-xs text-muted-foreground">
        Guarda ruta, tolerancia, contactos y acompañantes en tu cuenta (sin fechas).
      </p>
      <div className="flex gap-2">
        <input
          id="plantilla-nombre"
          className="input-field"
          value={nombre}
          maxLength={80}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Laguna 69 fin de semana"
          disabled={!enLinea}
        />
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={!puedeGuardar}
          className="flex-shrink-0 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
        >
          <Save size={16} /> Guardar
        </button>
      </div>
      {!enLinea && (
        <p className="text-xs text-muted-foreground">Guardar plantillas requiere conexión.</p>
      )}
      {error && <p className="field-error">{error}</p>}
      {aviso && <p className="text-xs text-primary">{aviso}</p>}
    </div>
  );
}
