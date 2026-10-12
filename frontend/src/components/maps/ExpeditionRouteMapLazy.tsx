import { lazy, Suspense } from 'react';
import type { ExpeditionRouteMapProps } from '@/components/maps/ExpeditionRouteMap';

const ExpeditionRouteMap = lazy(() =>
  import('@/components/maps/ExpeditionRouteMap').then((m) => ({
    default: m.ExpeditionRouteMap,
  })),
);

export function ExpeditionRouteMapLazy(props: ExpeditionRouteMapProps) {
  return (
    <Suspense
      fallback={
        <div
          className={`h-56 w-full animate-pulse rounded-xl bg-muted ${props.className ?? ''}`.trim()}
          aria-hidden
        />
      }
    >
      <ExpeditionRouteMap {...props} />
    </Suspense>
  );
}
