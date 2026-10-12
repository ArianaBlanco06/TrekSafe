import { useCallback, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import { LocateFixed } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import '@/components/maps/leafletIconFix';
import { parseDecimalCoordinates, validateCoordinateInput } from '@/lib/coordinates';
import { FitMapBounds } from '@/components/maps/FitMapBounds';
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

export type CoordinatePickerTarget = 'start' | 'end';

export type CoordinatePickerMapProps = {
  activeTarget: CoordinatePickerTarget;
  onActiveTargetChange: (target: CoordinatePickerTarget) => void;
  startCoordinates: string;
  endCoordinates: string;
  startLabel?: string;
  endLabel?: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onStartError?: (message: string) => void;
  onEndError?: (message: string) => void;
  className?: string;
};

function MapClickPicker({
  onPick,
}: {
  onPick: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function formatCoordinate(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

export function CoordinatePickerMap({
  activeTarget,
  onActiveTargetChange,
  startCoordinates,
  endCoordinates,
  startLabel,
  endLabel,
  onStartChange,
  onEndChange,
  onStartError,
  onEndError,
  className,
}: CoordinatePickerMapProps) {
  const [geoError, setGeoError] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);

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

  const applyCoordinate = useCallback(
    (target: CoordinatePickerTarget, lat: number, lon: number) => {
      const formatted = formatCoordinate(lat, lon);
      const validationError = validateCoordinateInput(formatted);
      if (target === 'start') {
        onStartChange(formatted);
        onStartError?.(validationError ?? '');
      } else {
        onEndChange(formatted);
        onEndError?.(validationError ?? '');
      }
      return validationError;
    },
    [onEndChange, onEndError, onStartChange, onStartError],
  );

  const handleMapPick = useCallback(
    (lat: number, lon: number) => {
      setGeoError('');
      const validationError = applyCoordinate(activeTarget, lat, lon);
      if (validationError) setGeoError(validationError);
    },
    [activeTarget, applyCoordinate],
  );

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Tu navegador no soporta geolocalización.');
      return;
    }

    setGeoLoading(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const validationError = applyCoordinate(
          activeTarget,
          position.coords.latitude,
          position.coords.longitude,
        );
        if (validationError) setGeoError(validationError);
        setGeoLoading(false);
      },
      () => {
        setGeoError('No se pudo obtener tu ubicación. Revisa permisos del navegador.');
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const center = start ?? end ?? PERU_CENTER;
  const zoom = points.length === 1 ? ROUTE_ZOOM : points.length > 1 ? DEFAULT_ZOOM : ROUTE_ZOOM;

  return (
    <div className={className}>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => onActiveTargetChange('start')}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
            activeTarget === 'start'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-muted-foreground'
          }`}
        >
          Marcar salida
        </button>
        <button
          type="button"
          onClick={() => onActiveTargetChange('end')}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
            activeTarget === 'end'
              ? 'bg-destructive text-destructive-foreground border-destructive'
              : 'bg-card border-border text-muted-foreground'
          }`}
        >
          Marcar destino
        </button>
      </div>

      <p className="text-xs text-muted-foreground mb-2">
        Toca el mapa para fijar el punto de {activeTarget === 'start' ? 'salida' : 'destino'}.
      </p>

      <div className="overflow-hidden rounded-xl border border-border">
        <MapContainer
          center={center}
          zoom={zoom}
          scrollWheelZoom={false}
          className="h-64 w-full z-0"
        >
          <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
          <FitMapBounds points={points.length > 0 ? points : [PERU_CENTER]} />
          <MapClickPicker onPick={handleMapPick} />
          {start && (
            <Marker position={start} icon={makeMarkerIcon(START_MARKER_COLOR)}>
              <Popup>
                <strong>Salida</strong>
                {startLabel && (
                  <>
                    <br />
                    {startLabel}
                  </>
                )}
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
              </Popup>
            </Marker>
          )}
          {start && end && (
            <Polyline
              positions={[start, end]}
              pathOptions={{ color: '#2563eb', weight: 3, opacity: 0.6, dashArray: '6 8' }}
            />
          )}
        </MapContainer>
      </div>

      <button
        type="button"
        onClick={handleUseMyLocation}
        disabled={geoLoading}
        className="mt-2 w-full py-2.5 rounded-xl border border-border bg-card text-sm font-semibold flex items-center justify-center gap-2"
      >
        <LocateFixed size={16} />
        {geoLoading ? 'Obteniendo ubicación…' : 'Usar mi ubicación actual'}
      </button>
      <p className="text-[11px] text-muted-foreground mt-1">
        Al usar GPS registras solo este punto en la expedición (geolocalización declarativa).
      </p>
      {geoError && <p className="text-xs text-destructive mt-1">{geoError}</p>}
    </div>
  );
}
