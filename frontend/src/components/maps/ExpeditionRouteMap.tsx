import { useCallback, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import '@/components/maps/leafletIconFix';
import { parseDecimalCoordinates } from '@/lib/coordinates';
import { FitMapBounds } from '@/components/maps/FitMapBounds';
import { MapOnlineGate } from '@/components/maps/MapOnlineGate';
import { TeselasRecorrido } from '@/components/maps/TeselasRecorrido';
import {
  END_MARKER_COLOR,
  makeMarkerIcon,
  makeNumberedMarkerIcon,
  START_MARKER_COLOR,
} from '@/components/maps/mapMarkers';
import {
  DEFAULT_ZOOM,
  PERU_CENTER,
  ROUTE_ZOOM,
} from '@/components/maps/mapDefaults';
import { ListaRecorrido } from '@/components/maps/ListaRecorrido';
import type { PuntoRuta } from '@/services/puntosRuta';

export type ExpeditionRouteMapProps = {
  startCoordinates?: string | null;
  endCoordinates?: string | null;
  startLabel?: string;
  endLabel?: string;
  className?: string;
  mapHeightClass?: string;
  puntos?: readonly PuntoRuta[];
};

export function ExpeditionRouteMap({
  startCoordinates,
  endCoordinates,
  startLabel,
  endLabel,
  className,
  mapHeightClass = 'h-56',
  puntos,
}: ExpeditionRouteMapProps) {
  const [falloMapa, setFalloMapa] = useState(false);
  const [cargaParcial, setCargaParcial] = useState(false);
  const marcarNoDisponible = useCallback(() => setFalloMapa(true), []);
  const ordenados = useMemo(() => [...(puntos ?? [])].sort((a, b) => a.orden - b.orden), [puntos]);
  const { start, end, points } = useMemo(() => {
    const startParsed = startCoordinates ? parseDecimalCoordinates(startCoordinates) : null;
    const endParsed = endCoordinates ? parseDecimalCoordinates(endCoordinates) : null;
    const startPos = startParsed
      ? ([startParsed.lat, startParsed.lon] as [number, number])
      : null;
    const endPos = endParsed ? ([endParsed.lat, endParsed.lon] as [number, number]) : null;
    const pts: [number, number][] = [];
    if (startPos) pts.push(startPos);
    for (const punto of ordenados) {
      const coordenada = parseDecimalCoordinates(`${punto.latitud}, ${punto.longitud}`);
      if (coordenada) pts.push([coordenada.lat, coordenada.lon]);
    }
    if (endPos) pts.push(endPos);
    return { start: startPos, end: endPos, points: pts };
  }, [startCoordinates, endCoordinates, ordenados]);

  const lista = <ListaRecorrido startCoordinates={startCoordinates} endCoordinates={endCoordinates}
    startLabel={startLabel} endLabel={endLabel} puntos={ordenados} />;
  if (falloMapa) return <div className="space-y-3">
    <p role="status" className="text-sm text-muted-foreground">El mapa no está disponible. Puedes consultar el recorrido y sus coordenadas.</p>
    {lista}
    <button type="button" className="min-h-11 text-primary font-semibold" onClick={() => { setCargaParcial(false); setFalloMapa(false); }}>Reintentar mapa</button>
  </div>;

  if (points.length === 0) {
    if (puntos !== undefined) return lista;
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
      fallback={puntos !== undefined ? lista : undefined}
    >
      <div className={`overflow-hidden rounded-xl border border-border ${className ?? ''}`.trim()}>
        <MapContainer
          center={center}
          zoom={zoom}
          scrollWheelZoom={false}
          className={`${mapHeightClass} w-full z-0`}
        >
          <TeselasRecorrido onNoDisponible={marcarNoDisponible} onCargaParcial={setCargaParcial} />
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
          {ordenados.map(punto => {
            const posicion = parseDecimalCoordinates(`${punto.latitud}, ${punto.longitud}`);
            return posicion && <Marker key={punto.id} position={[posicion.lat, posicion.lon]}
              title={`Punto ${punto.orden}: ${punto.nombre}`} icon={makeNumberedMarkerIcon(punto.orden)}>
              <Popup><strong>{punto.orden}. {punto.nombre}</strong><br />{posicion.formatted}</Popup>
            </Marker>;
          })}
          {points.length > 1 && (
            <Polyline
              positions={points}
              pathOptions={{
                color: '#2563eb',
                weight: 3,
                opacity: 0.75,
                dashArray: '6 8',
              }}
            />
          )}
        </MapContainer>
        {cargaParcial && <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
          Algunas imágenes del mapa no cargaron. El recorrido y sus marcadores siguen disponibles.
        </p>}
      </div>
    </MapOnlineGate>
  );
}
