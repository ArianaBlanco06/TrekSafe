import { ExternalLink, WifiOff } from 'lucide-react';
import { parseDecimalCoordinates } from '@/lib/coordinates';
import { buildExternalMapUrl } from '@/lib/mapLinks';

type MapCoordsFallbackProps = {
  startCoordinates?: string | null;
  endCoordinates?: string | null;
  startLabel?: string;
  endLabel?: string;
  className?: string;
};

export function MapCoordsFallback({
  startCoordinates,
  endCoordinates,
  startLabel,
  endLabel,
  className,
}: MapCoordsFallbackProps) {
  const start = startCoordinates ? parseDecimalCoordinates(startCoordinates) : null;
  const end = endCoordinates ? parseDecimalCoordinates(endCoordinates) : null;

  if (!start && !end) {
    return (
      <p className={`text-sm text-muted-foreground ${className ?? ''}`.trim()}>
        Sin coordenadas registradas para mostrar en el mapa.
      </p>
    );
  }

  return (
    <div
      className={`rounded-xl border border-border bg-muted/40 p-4 text-sm ${className ?? ''}`.trim()}
    >
      <p className="flex items-center gap-2 text-muted-foreground mb-3">
        <WifiOff size={14} />
        Mapa no disponible sin conexión. Usa las coordenadas o abre en mapas externo.
      </p>
      <div className="space-y-2">
        {start && (
          <div>
            <p className="font-medium">{startLabel ? `Inicio · ${startLabel}` : 'Inicio'}</p>
            <p className="text-muted-foreground text-xs">{start.formatted}</p>
            <a
              href={buildExternalMapUrl(start.lat, start.lon)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary text-xs font-semibold mt-1"
            >
              Abrir en mapas <ExternalLink size={12} />
            </a>
          </div>
        )}
        {end && (
          <div>
            <p className="font-medium">{endLabel ? `Destino · ${endLabel}` : 'Destino'}</p>
            <p className="text-muted-foreground text-xs">{end.formatted}</p>
            <a
              href={buildExternalMapUrl(end.lat, end.lon)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary text-xs font-semibold mt-1"
            >
              Abrir en mapas <ExternalLink size={12} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
