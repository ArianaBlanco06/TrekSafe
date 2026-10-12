import { lazy, Suspense } from 'react';
import type { CoordinatePickerMapProps } from '@/components/maps/CoordinatePickerMap';

const CoordinatePickerMap = lazy(() =>
  import('@/components/maps/CoordinatePickerMap').then((m) => ({
    default: m.CoordinatePickerMap,
  })),
);

export function CoordinatePickerMapLazy(props: CoordinatePickerMapProps) {
  return (
    <Suspense
      fallback={
        <div
          className={`h-64 w-full animate-pulse rounded-xl bg-muted ${props.className ?? ''}`.trim()}
          aria-hidden
        />
      }
    >
      <CoordinatePickerMap {...props} />
    </Suspense>
  );
}
