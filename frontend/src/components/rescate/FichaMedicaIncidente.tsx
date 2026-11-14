import { useState } from 'react';
import { Heart } from 'lucide-react';
import {
  AVISO_CONSULTA_REGISTRADA,
  MENSAJES_DENEGACION_FICHA,
  mensajeErrorFicha,
  textoCampoFicha,
} from '@/lib/fichaMedicaIncidente';
import {
  consultarFichaMedicaIncidente,
  type FichaMedicaAutorizada,
  type RespuestaFichaMedica,
} from '@/services/fichaMedicaIncidente';

export type FichaMedicaIncidenteProps = {
  incidenteId: string;
  /** `true` solo para el responsable vigente; el servidor vuelve a autorizar cada consulta. */
  esResponsable: boolean;
  /** Solo para pruebas. */
  consultar?: (incidenteId: string) => Promise<RespuestaFichaMedica>;
};

/**
 * HU-50: ficha médica bajo demanda. Quien no es el responsable vigente no ve el botón ni
 * llama a la API. Cada clic en "Ver ficha médica" es una consulta auditada. Los datos viven
 * solo en el estado del componente: nunca en almacenamiento del navegador. Un error o
 * "Ocultar ficha" borran lo mostrado.
 */
export function FichaMedicaIncidente({
  incidenteId,
  esResponsable,
  consultar = consultarFichaMedicaIncidente,
}: FichaMedicaIncidenteProps) {
  const [ficha, setFicha] = useState<FichaMedicaAutorizada | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function ver() {
    setCargando(true);
    setError('');
    try {
      const respuesta = await consultar(incidenteId);
      setFicha(respuesta.fichaMedica);
    } catch (e) {
      setFicha(null);
      setError(mensajeErrorFicha(e));
    } finally {
      setCargando(false);
    }
  }

  function ocultar() {
    setFicha(null);
    setError('');
  }

  return (
    <section className="bg-card border border-border rounded-2xl p-4 mb-4" aria-label="Ficha médica autorizada">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1">
        <Heart size={14} /> Ficha médica autorizada
      </h3>
      {!esResponsable ? (
        <p className="text-sm text-muted-foreground">{MENSAJES_DENEGACION_FICHA.NO_ES_RESPONSABLE}</p>
      ) : (
        <>
          {ficha ? (
            <>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">Tipo de sangre</dt>
                  <dd className="font-medium">{ficha.tipoSangre}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Alergias</dt>
                  <dd>{textoCampoFicha(ficha.alergias, false)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Condiciones</dt>
                  <dd>{textoCampoFicha(ficha.condiciones, false)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Medicación</dt>
                  <dd>{textoCampoFicha(ficha.medicamentos, true)}</dd>
                </div>
              </dl>
              <button type="button" className="mt-3 w-full py-2.5 border border-border font-semibold rounded-xl text-sm" onClick={ocultar}>
                Ocultar ficha
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">{AVISO_CONSULTA_REGISTRADA}</p>
              <button type="button" className="w-full py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm disabled:opacity-60" disabled={cargando} onClick={() => void ver()}>
                Ver ficha médica
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="error-banner mt-3">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
