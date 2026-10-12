import { lazy, Suspense } from 'react';
import type { RescueExpeditionsMapProps } from '@/components/maps/RescueExpeditionsMap';

const RescueExpeditionsMap = lazy(() =>
  import('@/components/maps/RescueExpeditionsMap').then((m) => ({
    default: m.RescueExpeditionsMap,
  })),
);

export function RescueExpeditionsMapLazy(props: RescueExpeditionsMapProps) {
  return (
    <Suspense
      fallback={
        <div
          className={`h-72 w-full animate-pulse rounded-2xl bg-muted ${props.className ?? ''}`.trim()}
          aria-hidden
        />
      }
    >
      <RescueExpeditionsMap {...props} />
    </Suspense>
  );
}
