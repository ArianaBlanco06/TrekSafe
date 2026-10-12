import { useEffect, useState } from 'react';

export function useEstadoEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const alConectarse = () => setEnLinea(true);
    const alDesconectarse = () => setEnLinea(false);
    window.addEventListener('online', alConectarse);
    window.addEventListener('offline', alDesconectarse);
    return () => {
      window.removeEventListener('online', alConectarse);
      window.removeEventListener('offline', alDesconectarse);
    };
  }, []);

  return enLinea;
}
