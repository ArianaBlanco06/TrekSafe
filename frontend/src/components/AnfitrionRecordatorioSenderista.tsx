import { useEffect, useState } from 'react';
import { useCuentaRegresiva } from '@/hooks/useCuentaRegresiva';
import { dismissReminder, isReminderDismissed } from '@/lib/recordatorioRetorno';
import { obtenerExpedicionActiva, type ExpedicionActiva } from '@/services/expedicion';
import { HojaRecordatorioRetorno } from './HojaRecordatorioRetorno';

export function AnfitrionRecordatorioSenderista() {
  const [expedicion, setExpedicion] = useState<ExpedicionActiva | null>(null);
  const [descartado, setDescartado] = useState(false);

  const cuentaRegresiva = useCuentaRegresiva(expedicion?.fechaLimite, expedicion?.horaInicio);

  useEffect(() => {
    const cargar = () => {
      obtenerExpedicionActiva()
        .then((r) => {
          setExpedicion(r.expedicion);
          if (r.expedicion) {
            setDescartado(isReminderDismissed(r.expedicion.id));
          }
        })
        .catch(() => setExpedicion(null));
    };
    cargar();
    const intervalo = setInterval(cargar, 30_000);
    return () => clearInterval(intervalo);
  }, []);

  const debeMostrar =
    expedicion &&
    cuentaRegresiva.esUrgente &&
    !cuentaRegresiva.vencida &&
    !descartado;

  const minutosRestantes = cuentaRegresiva.horas * 60 + cuentaRegresiva.minutos;

  if (!debeMostrar || !expedicion) return null;

  return (
    <HojaRecordatorioRetorno
      expedicion={expedicion}
      minutosRestantes={minutosRestantes}
      checkInHref="/senderista/expedicion/activa?checkIn=1"
      onDismiss={() => {
        dismissReminder(expedicion.id);
        setDescartado(true);
      }}
    />
  );
}
