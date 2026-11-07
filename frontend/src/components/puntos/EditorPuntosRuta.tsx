import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ErroresPuntos, PuntoEditable } from '@/lib/puntosRuta';
import { MAX_PUNTOS_RUTA } from '@/lib/puntosRuta';

type Props = {
  puntos: PuntoEditable[];
  errores: ErroresPuntos;
  deshabilitado: boolean;
  agregar: () => void;
  actualizar: (id: string, campo: 'nombre' | 'latitud' | 'longitud', valor: string) => void;
  quitar: (id: string) => void;
  mover: (id: string, desplazamiento: -1 | 1) => void;
};

export function EditorPuntosRuta({ puntos, errores, deshabilitado, agregar, actualizar, quitar, mover }: Props) {
  return (
    <section aria-labelledby="titulo-lista-puntos" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 id="titulo-lista-puntos" className="font-semibold">Puntos intermedios</h3>
        <span className="text-xs text-muted-foreground" aria-live="polite">{puntos.length} de {MAX_PUNTOS_RUTA} puntos</span>
      </div>
      {errores.puntos && <p role="alert" className="field-error">{errores.puntos.join('. ')}</p>}
      {puntos.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
          Aún no hay puntos intermedios. Puedes agregar paradas o conservar el recorrido con inicio y destino.
        </div>
      )}
      {puntos.map((punto, indice) => (
        <fieldset key={punto.id} data-punto-id={punto.id} disabled={deshabilitado}
          className="min-w-0 rounded-2xl border border-border bg-card p-4 space-y-3">
          <legend className="px-1 text-sm font-semibold">Punto {indice + 1}</legend>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Orden del recorrido</span>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={() => mover(punto.id, -1)} disabled={deshabilitado || indice === 0}
                aria-label={`Subir punto ${indice + 1}`} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-35">
                <ArrowUp size={18} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => mover(punto.id, 1)} disabled={deshabilitado || indice === puntos.length - 1}
                aria-label={`Bajar punto ${indice + 1}`} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-35">
                <ArrowDown size={18} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => quitar(punto.id)} disabled={deshabilitado}
                aria-label={`Quitar punto ${indice + 1}`} className="flex h-11 w-11 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-35">
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
          {(['nombre', 'latitud', 'longitud'] as const).map(campo => {
            const label = { nombre: 'Nombre', latitud: 'Latitud', longitud: 'Longitud' }[campo];
            const campoId = `punto-${punto.id}-${campo}`;
            const mensajes = errores[`puntos.${indice}.${campo}`];
            return (
              <div key={campo} className="min-w-0">
                <label htmlFor={campoId} className="block text-sm font-semibold mb-1.5">{label}</label>
                <input id={campoId} name={campo} value={punto[campo]}
                  onChange={event => actualizar(punto.id, campo, event.target.value)}
                  inputMode={campo === 'nombre' ? 'text' : 'decimal'} autoComplete="off"
                  placeholder={{ nombre: 'Ej.: Mirador', latitud: '-9.03012', longitud: '-77.60634' }[campo]}
                  aria-invalid={!!mensajes} aria-describedby={mensajes ? `${campoId}-error` : undefined}
                  className={`input-field ${mensajes ? 'input-error' : ''}`} />
                {mensajes && <p id={`${campoId}-error`} className="field-error">{mensajes.join('. ')}</p>}
              </div>
            );
          })}
          {errores[`puntos.${indice}.id`] && <p role="alert" className="field-error">{errores[`puntos.${indice}.id`].join('. ')}</p>}
          {errores[`puntos.${indice}.orden`] && <p role="alert" className="field-error">{errores[`puntos.${indice}.orden`].join('. ')}</p>}
        </fieldset>
      ))}
      <button type="button" onClick={agregar} disabled={deshabilitado || puntos.length >= MAX_PUNTOS_RUTA}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 px-4 py-3 text-sm font-semibold text-primary disabled:opacity-40">
        <Plus size={18} aria-hidden="true" /> Agregar punto
      </button>
      {puntos.length >= MAX_PUNTOS_RUTA && <p className="text-xs text-muted-foreground">Alcanzaste el límite de 20 puntos. Puedes editar, ordenar o quitar los existentes.</p>}
    </section>
  );
}
