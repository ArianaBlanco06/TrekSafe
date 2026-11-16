import type { PuntoRuta } from '@/services/puntosRuta';
import { parseDecimalCoordinates } from '@/lib/coordinates';

export type DatosListaRecorrido = {
  startCoordinates?: string | null; endCoordinates?: string | null;
  startLabel?: string; endLabel?: string; puntos?: readonly PuntoRuta[];
};

export function ListaRecorrido({ startCoordinates, endCoordinates, startLabel, endLabel, puntos = [] }: DatosListaRecorrido) {
  const coordenadas = (valor?: string | null) => {
    const parsed = valor ? parseDecimalCoordinates(valor) : null;
    return parsed?.formatted ?? 'Sin coordenadas registradas';
  };
  return <section aria-label="Lista del recorrido" className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
    <h3 className="font-semibold">Recorrido en orden</h3>
    <ol className="space-y-3">
      <li><strong>Inicio · {startLabel ?? 'Salida'}</strong><p>{coordenadas(startCoordinates)}</p></li>
      {[...puntos].sort((a, b) => a.orden - b.orden).map(punto => <li key={punto.id}>
        <strong>{punto.orden}. {punto.nombre}</strong>
        <p>{coordenadas(`${punto.latitud}, ${punto.longitud}`)}</p>
      </li>)}
      <li><strong>Destino · {endLabel ?? 'Llegada'}</strong><p>{coordenadas(endCoordinates)}</p></li>
    </ol>
    <p className="text-xs text-muted-foreground">Los segmentos son referencias rectas entre puntos; no representan navegación ni un sendero transitable.</p>
  </section>;
}
