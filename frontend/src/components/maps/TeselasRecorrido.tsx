import { useMemo, useRef } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
import type { LeafletEventHandlerFnMap } from 'leaflet';
import { OSM_ATTRIBUTION, OSM_TILE_URL } from './mapDefaults';

type Props = {
  onNoDisponible: () => void;
  onCargaParcial: (parcial: boolean) => void;
};

/** Decide al terminar la carga y considera también las teselas de ciclos anteriores. */
export function TeselasRecorrido({ onNoDisponible, onCargaParcial }: Props) {
  const mapa = useMap();
  const teselas = useRef(new Map<HTMLElement, boolean>());
  const eventos = useMemo<LeafletEventHandlerFnMap>(() => ({
    tileload: evento => { teselas.current.set(evento.tile, true); },
    tileerror: evento => { teselas.current.set(evento.tile, false); },
    tileunload: evento => { teselas.current.delete(evento.tile); },
    load: () => {
      const zona = mapa.getContainer().getBoundingClientRect();
      const visibles = [...teselas.current].filter(([tesela]) => {
        if (!tesela.isConnected) return false;
        const rect = tesela.getBoundingClientRect();
        return rect.right > zona.left && rect.left < zona.right && rect.bottom > zona.top && rect.top < zona.bottom;
      });
      const hayCorrectas = visibles.some(([, correcta]) => correcta);
      const hayFallidas = visibles.some(([, correcta]) => !correcta);
      onCargaParcial(hayFallidas && hayCorrectas);
      if (hayFallidas && !hayCorrectas) onNoDisponible();
    },
  }), [mapa, onNoDisponible, onCargaParcial]);
  return <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} eventHandlers={eventos} />;
}
