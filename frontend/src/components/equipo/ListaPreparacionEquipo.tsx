import type { PreparacionExpedicion } from '@/services/preparacionExpedicion';

type Props = {
  preparacion: PreparacionExpedicion;
  deshabilitado: boolean;
  onCambiar: (itemId: string, preparado: boolean) => void;
};

/** Vista de la copia; las casillas siempre representan el último guardado confirmado. */
export function ListaPreparacionEquipo({ preparacion, deshabilitado, onCambiar }: Props) {
  return (
    <section aria-labelledby="equipo-lista-titulo" className="space-y-4">
      <div>
        <h3 id="equipo-lista-titulo" className="text-lg font-bold break-words">{preparacion.nombreLista}</h3>
        <p className="text-xs text-muted-foreground mt-1">Los cambios de la lista original no modifican esta copia.</p>
        {preparacion.listaOrigenId === null && <p className="text-xs text-muted-foreground mt-1">La lista original fue eliminada. Tu equipo y sus marcas se conservan.</p>}
      </div>
      <p role="status" className={`rounded-xl border p-4 font-semibold text-sm ${preparacion.obligatoriosPendientes > 0
        ? 'border-amber-500/40 bg-amber-500/10' : 'border-primary/30 bg-primary/10'}`}>
        {preparacion.obligatoriosPendientes === 0 ? 'No quedan ítems obligatorios pendientes.'
          : `${preparacion.obligatoriosPendientes} ${preparacion.obligatoriosPendientes === 1 ? 'ítem obligatorio pendiente' : 'ítems obligatorios pendientes'}.`}
      </p>
      {preparacion.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Esta lista se asoció sin ítems. No hay equipo registrado para marcar.
        </p>
      ) : (
        <ul aria-label="Equipo de la expedición" className="space-y-3">
          {preparacion.items.map((item) => (
            <li key={item.id} className="bg-card border border-border rounded-2xl">
              <label htmlFor={`equipo-item-${item.id}`} className="min-h-16 flex items-center gap-3 p-4 cursor-pointer">
                <input id={`equipo-item-${item.id}`} type="checkbox" checked={item.preparado} disabled={deshabilitado}
                  className="h-5 w-5 accent-primary shrink-0 disabled:opacity-50"
                  onChange={(evento) => onCambiar(item.id, evento.target.checked)} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold break-words">{item.nombre}</span>
                  <span className="block text-xs text-muted-foreground mt-1">{item.obligatorio ? 'Obligatorio' : 'Opcional'} · {item.preparado ? 'Preparado' : 'Pendiente'}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">La lista es una ayuda de preparación. Puedes registrar tu retorno seguro aunque falte equipo.</p>
    </section>
  );
}
