import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { ROUTE_ZOOM } from '@/components/maps/mapDefaults';

type FitMapBoundsProps = {
  points: [number, number][];
  padding?: [number, number];
};

export function FitMapBounds({ points, padding = [24, 24] }: FitMapBoundsProps) {
  const map = useMap();
  const pointsKey = points.map((p) => p.join(',')).join('|');

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], ROUTE_ZOOM);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding });
  }, [map, padding, points, pointsKey]);

  return null;
}
