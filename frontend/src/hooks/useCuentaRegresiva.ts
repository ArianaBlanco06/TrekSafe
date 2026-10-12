import { useEffect, useState } from 'react';

export type EstadoCuentaRegresiva = {
  horas: number;
  minutos: number;
  segundos: number;
  vencida: boolean;
  progresoPct: number;
  esUrgente: boolean;
};

function limitarPct(valor: number): number {
  return Math.min(100, Math.max(0, valor));
}

export function useCuentaRegresiva(
  fechaLimite: string | null | undefined,
  horaInicio?: string | null,
): EstadoCuentaRegresiva {
  const [estado, setEstado] = useState<EstadoCuentaRegresiva>({
    horas: 0,
    minutos: 0,
    segundos: 0,
    vencida: false,
    progresoPct: 0,
    esUrgente: false,
  });

  useEffect(() => {
    if (!fechaLimite) return;

    const limiteMs = new Date(fechaLimite).getTime();
    const inicioMs = horaInicio ? new Date(horaInicio).getTime() : limiteMs - 3_600_000;
    const totalMs = Math.max(limiteMs - inicioMs, 1);

    const tick = () => {
      const restanteMs = limiteMs - Date.now();
      const vencida = restanteMs <= 0;
      const absMs = Math.max(restanteMs, 0);

      const horas = Math.floor(absMs / 3_600_000);
      const minutos = Math.floor((absMs % 3_600_000) / 60_000);
      const segundos = Math.floor((absMs % 60_000) / 1000);
      const transcurridoMs = Date.now() - inicioMs;
      const progresoPct = limitarPct((transcurridoMs / totalMs) * 100);

      setEstado({
        horas,
        minutos,
        segundos,
        vencida,
        progresoPct,
        esUrgente: !vencida && restanteMs <= 30 * 60_000,
      });
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [fechaLimite, horaInicio]);

  return estado;
}
