import { WifiOff } from 'lucide-react';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';

export function BannerOffline() {
  const enLinea = useEstadoEnLinea();
  if (enLinea) return null;

  return (
    <div
      role="status"
      className="px-4 py-2 bg-amber-500 text-amber-950 text-xs font-semibold flex items-center justify-center gap-2"
    >
      <WifiOff size={14} />
      Sin conexión — algunas acciones requieren red
    </div>
  );
}
