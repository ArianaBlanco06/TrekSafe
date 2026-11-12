import { CheckCircle } from 'lucide-react';
import { fechaHoraEntrada } from '@/lib/bitacoraIncidente';
import { ETIQUETAS_RESULTADO_RESCATE, TEXTO_CIERRE_OPERATIVO, textoRetorno } from '@/lib/cierreIncidente';
import type { InformeCierreIncidente as DatosInforme } from '@/services/cierreIncidente';

export type InformeCierreIncidenteProps = {
  informe: DatosInforme;
  /** Solo para pruebas. */
  zonaHoraria?: string;
};

/**
 * HU-42: informe del cierre operativo del rescate, en solo lectura. Aclara (CA-3) que cerrar
 * el rescate no confirma el retorno del senderista y muestra si él ya lo confirmó.
 */
export function InformeCierreIncidente({ informe, zonaHoraria }: InformeCierreIncidenteProps) {
  const quien = informe.cerradoPor.esMio ? 'Tú' : informe.cerradoPor.nombreRescatista;
  return (
    <section className="bg-card border border-border rounded-2xl p-4 mb-6" aria-labelledby="titulo-informe-cierre">
      <h3 id="titulo-informe-cierre" className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
        <CheckCircle size={14} className="flex-shrink-0" />
        Rescate cerrado (cierre operativo)
      </h3>
      <dl className="text-sm space-y-2">
        <div>
          <dt className="text-xs text-muted-foreground">Resultado</dt>
          <dd className="font-semibold">{ETIQUETAS_RESULTADO_RESCATE[informe.resultado]}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Resumen</dt>
          <dd className="whitespace-pre-wrap break-words">{informe.resumen}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Cerrado por</dt>
          <dd>
            {quien} ·{' '}
            <time dateTime={informe.cerradoEn}>{fechaHoraEntrada(informe.cerradoEn, zonaHoraria)}</time>
          </dd>
        </div>
      </dl>
      <p role="note" className="mt-3 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
        {TEXTO_CIERRE_OPERATIVO}
      </p>
      <p className="mt-2 text-xs font-medium">{textoRetorno(informe)}</p>
    </section>
  );
}
