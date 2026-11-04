import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { obtenerAvisos } from '@/services/avisos';

export function BotonCampanaAvisos() {
  const [conteoNoLeidos, setConteoNoLeidos] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let activo = true;

    const cargarConteo = () => {
      obtenerAvisos(true)
        .then((res) => {
          if (activo) setConteoNoLeidos(res.conteoNoLeidos);
        })
        .catch(() => undefined);
    };

    cargarConteo();
    // Actualizar periódicamente cada 30 segundos
    const intervalo = setInterval(cargarConteo, 30_000);

    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => navigate('/senderista/avisos')}
      className="relative p-2 rounded-full hover:bg-muted/50 transition-colors btn-touch"
      aria-label={`Avisos (${conteoNoLeidos} no leídos)`}
      title="Bandeja de avisos"
    >
      <Bell size={20} className="text-foreground" />
      {conteoNoLeidos > 0 && (
        <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-destructive rounded-full animate-pulse">
          {conteoNoLeidos > 99 ? '99+' : conteoNoLeidos}
        </span>
      )}
    </button>
  );
}
