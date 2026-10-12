import { useMemo } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import '@/components/maps/leafletIconFix';
import { parseDecimalCoordinates } from '@/lib/coordinates';
import { FitMapBounds } from '@/components/maps/FitMapBounds';
import { MapOnlineGate } from '@/components/maps/MapOnlineGate';
import {
  END_MARKER_COLOR,
  makeMarkerIcon,
  START_MARKER_COLOR,
} from '@/components/maps/mapMarkers';
import {
  DEFAULT_ZOOM,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  PERU_CENTER,
  ROUTE_ZOOM,
} from '@/components/maps/mapDefaults';

export type ExpeditionRouteMapProps = {
  startCoordinates?: string | null;
  endCoordinates?: string | null;
  startLabel?: string;
  endLabel?: string;
  className?: string;
  mapHeightClass?: string;
};

export function ExpeditionRouteMap({
  startCoordinates,
  endCoordinates,
  startLabel,
  endLabel,
  className,
  mapHeightClass = 'h-56',
}: ExpeditionRouteMapProps) {
  const { start, end, points } = useMemo(() => {
    const startParsed = startCoordinates ? parseDecimalCoordinates(startCoordinates) : null;
    const endParsed = endCoordinates ? parseDecimalCoordinates(endCoordinates) : null;
    const startPos = startParsed
      ? ([startParsed.lat, startParsed.lon] as [number, number])
      : null;
    const endPos = endParsed ? ([endParsed.lat, endParsed.lon] as [number, number]) : null;
    const pts: [number, number][] = [];
    if (startPos) pts.push(startPos);
    if (endPos) pts.push(endPos);
    return { start: startPos, end: endPos, points: pts };
  }, [startCoordinates, endCoordinates]);

  if (points.length === 0) {
    return (
      <p className={`text-sm text-muted-foreground ${className ?? ''}`.trim()}>
        Sin coordenadas registradas para mostrar en el mapa.
      </p>
    );
  }

  const center = start ?? end ?? PERU_CENTER;
  const zoom = points.length === 1 ? ROUTE_ZOOM : DEFAULT_ZOOM;

  return (
    <MapOnlineGate
      startCoordinates={startCoordinates}
      endCoordinates={endCoordinates}
      startLabel={startLabel}
      endLabel={endLabel}
      className={className}
    >
      <div className={`overflow-hidden rounded-xl border border-border ${className ?? ''}`.trim()}>
        <MapContainer
          center={center}
          zoom={zoom}
          scrollWheelZoom={false}
          className={`${mapHeightClass} w-full z-0`}
        >
          <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
          <FitMapBounds points={points} />
          {start && (
            <Marker position={start} icon={makeMarkerIcon(START_MARKER_COLOR)}>
              <Popup>
                <strong>Inicio</strong>
                {startLabel && (
                  <>
                    <br />
                    {startLabel}
                  </>
                )}
                <br />
                <span className="text-xs">{startCoordinates}</span>
              </Popup>
            </Marker>
          )}
          {end && (
            <Marker position={end} icon={makeMarkerIcon(END_MARKER_COLOR)}>
              <Popup>
                <strong>Destino</strong>
                {endLabel && (
                  <>
                    <br />
                    {endLabel}
                  </>
                )}
                <br />
                <span className="text-xs">{endCoordinates}</span>
              </Popup>
            </Marker>
          )}
          {start && end && (
            <Polyline
              positions={[start, end]}
              pathOptions={{
                color: '#2563eb',
                weight: 3,
                opacity: 0.75,
                dashArray: '6 8',
              }}
            />
          )}
        </MapContainer>
      </div>
    </MapOnlineGate>
  );
}
