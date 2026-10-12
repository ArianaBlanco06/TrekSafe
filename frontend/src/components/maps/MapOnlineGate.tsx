import type { ReactNode } from 'react';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';
import { MapCoordsFallback } from '@/components/maps/MapCoordsFallback';

type MapOnlineGateProps = {
  startCoordinates?: string | null;
  endCoordinates?: string | null;
  startLabel?: string;
  endLabel?: string;
  className?: string;
  children: ReactNode;
};

export function MapOnlineGate({
  startCoordinates,
  endCoordinates,
  startLabel,
  endLabel,
  className,
  children,
}: MapOnlineGateProps) {
  const online = useEstadoEnLinea();

  if (!online) {
    return (
      <MapCoordsFallback
        startCoordinates={startCoordinates}
        endCoordinates={endCoordinates}
        startLabel={startLabel}
        endLabel={endLabel}
        className={className}
      />
    );
  }

  return <>{children}</>;
}
