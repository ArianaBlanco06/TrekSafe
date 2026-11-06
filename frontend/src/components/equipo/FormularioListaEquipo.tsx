import { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { FieldLabel } from '@/components/Layout';
import { crearBorradorListaEquipo, datosListaEquipo, nuevoItemEquipo, validarBorradorListaEquipo } from '@/lib/listasEquipoFormulario';
import type { DatosListaEquipo, ListaEquipo } from '@/services/listasEquipo';

type Props = {
  lista?: ListaEquipo;
  ocupado: boolean;
  enLinea: boolean;
  error: string;
  onGuardar: (datos: DatosListaEquipo) => Promise<void>;
  onCancelar: () => void;
};

export function FormularioListaEquipo({ lista, ocupado, enLinea, error, onGuardar, onCancelar }: Props) {
  const id = useId();
  const [borrador, setBorrador] = useState(() => crearBorradorListaEquipo(lista));
  const [validar, setValidar] = useState(false);
  const errores = validarBorradorListaEquipo(borrador);

  function actualizarItem(clave: string, cambio: Partial<{ nombre: string; obligatorio: boolean }>) {
    setBorrador((actual) => ({ ...actual,
      items: actual.items.map((item) => item.claveLocal === clave ? { ...item, ...cambio } : item),
    }));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (ocupado || !enLinea) return;
    setValidar(true);
    if (errores.nombre || Object.keys(errores.items).length > 0) return;
    await onGuardar(datosListaEquipo(borrador));
  }

  return (
    <form onSubmit={(evento) => { void enviar(evento); }} noValidate className="space-y-5" aria-busy={ocupado}>
      {error && <p role="alert" className="error-banner">{error}</p>}
      {!enLinea && <p role="status" className="text-sm text-muted-foreground">Conéctate para guardar. Tus cambios siguen en este formulario.</p>}
      <fieldset disabled={ocupado} className="space-y-5 min-w-0">
        <div>
          <FieldLabel htmlFor={`${id}-nombre`}>Nombre de la lista</FieldLabel>
          <input id={`${id}-nombre`} className={`input-field ${validar && errores.nombre ? 'input-error' : ''}`}
            value={borrador.nombre} placeholder="Ej. Equipo de alta montaña" required autoFocus
            aria-invalid={validar && Boolean(errores.nombre)}
            aria-describedby={validar && errores.nombre ? `${id}-nombre-error` : undefined}
            onChange={(evento) => setBorrador((actual) => ({ ...actual, nombre: evento.target.value }))} />
          {validar && errores.nombre && <p id={`${id}-nombre-error`} className="field-error" role="alert">{errores.nombre}</p>}
        </div>

        <section aria-labelledby={`${id}-items-titulo`} className="space-y-3">
          <div>
            <h3 id={`${id}-items-titulo`} className="font-semibold">Ítems de equipo</h3>
            <p className="text-xs text-muted-foreground mt-1">Marca los obligatorios. Los demás serán opcionales.</p>
          </div>
          {borrador.items.length === 0 && (
            <p className="text-sm text-muted-foreground border border-dashed border-border rounded-xl p-4">
              Puedes guardar la lista vacía y añadir equipo después.
            </p>
          )}
          {borrador.items.map((item, indice) => {
            const inputId = `${id}-${item.claveLocal}`;
            const errorItem = validar ? errores.items[item.claveLocal] : undefined;
            return (
              <div key={item.claveLocal} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={inputId} className="text-sm font-semibold">Ítem {indice + 1}</label>
                  <button type="button" className="btn-touch inline-flex items-center justify-center rounded-lg text-destructive focus-visible:outline-2"
                    aria-label={`Quitar ítem ${indice + 1}`}
                    onClick={() => setBorrador((actual) => ({ ...actual, items: actual.items.filter((actualItem) => actualItem.claveLocal !== item.claveLocal) }))}>
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
                <input id={inputId} className={`input-field ${errorItem ? 'input-error' : ''}`} value={item.nombre}
                  placeholder="Ej. Casco" required aria-invalid={Boolean(errorItem)}
                  aria-describedby={errorItem ? `${inputId}-error` : undefined}
                  onChange={(evento) => actualizarItem(item.claveLocal, { nombre: evento.target.value })} />
                {errorItem && <p id={`${inputId}-error`} className="field-error" role="alert">{errorItem}</p>}
                <label className="flex items-center gap-3 min-h-12 text-sm cursor-pointer">
                  <input type="checkbox" className="h-5 w-5 accent-primary shrink-0" checked={item.obligatorio}
                    aria-label={`Ítem ${indice + 1} obligatorio`}
                    onChange={(evento) => actualizarItem(item.claveLocal, { obligatorio: evento.target.checked })} />
                  Obligatorio
                </label>
              </div>
            );
          })}
          <button type="button" className="min-h-12 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-primary text-primary font-semibold text-sm disabled:opacity-50"
            onClick={() => setBorrador((actual) => ({ ...actual, items: [...actual.items, nuevoItemEquipo()] }))}>
            <Plus size={18} aria-hidden="true" /> Añadir ítem
          </button>
        </section>
      </fieldset>
      <div className="space-y-2">
        <button type="submit" className="btn-primary" disabled={ocupado || !enLinea}>
          {ocupado ? 'Procesando…' : lista ? 'Guardar cambios' : 'Guardar lista'}
        </button>
        <button type="button" className="min-h-12 w-full rounded-xl text-sm font-semibold text-muted-foreground disabled:opacity-50"
          disabled={ocupado} onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}
