import { useState } from 'react';
import { useConsultaPeriodica } from '@/hooks/useConsultaPeriodica';
import { useCuentaRegresiva } from '@/hooks/useCuentaRegresiva';
import { dismissReminder, isReminderDismissed } from '@/lib/recordatorioRetorno';
import { obtenerExpedicionActiva, type ExpedicionActiva } from '@/services/expedicion';
import { HojaRecordatorioRetorno } from './HojaRecordatorioRetorno';

export function AnfitrionRecordatorioSenderista() {
  const [expedicion, setExpedicion] = useState<ExpedicionActiva | null>(null);
  const [descartado, setDescartado] = useState(false);

  const cuentaRegresiva = useCuentaRegresiva(expedicion?.fechaLimite, expedicion?.horaInicio);

  useConsultaPeriodica('expedicion-activa', obtenerExpedicionActiva, {
    datos: (r) => {
      setExpedicion(r.expedicion);
      setDescartado(r.expedicion ? isReminderDismissed(r.expedicion.id) : false);
    },
    error: () => setExpedicion(null),
  });

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
