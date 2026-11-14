import { AutorizadorFichaIncidente } from '../../domain/services/AutorizadorFichaIncidente.js';
import type {
  ILectorContextoFichaIncidente,
  ILectorFichaCifradaResponsable,
  IRegistroAccesoFicha,
} from '../../domain/repositories/IFichaMedicaIncidenteDAO.js';
import type { MotivoDenegacionFicha } from '../../domain/value-objects/accesoFichaMedica.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import {
  consultaFichaSchema,
  errorDenegacionFicha,
  type ResultadoConsultaFicha,
} from '../dto/accesoFichaMedica.dto.js';
import type { IDescifradorFichaMedica } from '../ports/descifradorFichaMedica.js';

/**
 * Consulta de la ficha médica de un incidente (HU-50). El orden es el contrato:
 *   1. contexto (sin datos de salud) → 2. autorizar (dominio puro) → 3. auditar (siempre)
 *   → 4. solo si se permite: leer el texto cifrado con la guarda de SQL → 5. descifrar.
 * Nada se descifra antes de autorizar y auditar. Si falla la auditoría de un permitido no se
 * lee ni se descifra (fail-closed). Nunca se registra en el log la carga, el texto cifrado ni
 * el tipo de sangre.
 */
export class FachadaFichaMedicaIncidente {
  constructor(
    private readonly contexto: ILectorContextoFichaIncidente,
    private readonly fichas: ILectorFichaCifradaResponsable,
    private readonly auditoria: IRegistroAccesoFicha,
    private readonly descifrador: IDescifradorFichaMedica,
    private readonly autorizador = new AutorizadorFichaIncidente(),
  ) {}

  async consultar(actorId: string, incidenteId: string): Promise<ResultadoConsultaFicha> {
    const datos = consultaFichaSchema.parse({ actorId, incidenteId });

    const contexto = await this.contexto.leerContexto(datos.incidenteId, datos.actorId);
    const decision = this.autorizador.decidir(contexto);
    if (!decision.permitido) {
      await this.auditarDenegacion(datos.incidenteId, datos.actorId, decision.motivo);
      throw errorDenegacionFicha(decision.motivo);
    }

    let registro;
    try {
      registro = await this.auditoria.registrar({
        incidenteId: datos.incidenteId,
        actorId: datos.actorId,
        resultado: 'permitido',
        motivo: decision.motivo,
      });
    } catch {
      console.error('[FichaMedicaIncidente] auditoría no disponible');
      throw new ErrorAplicacion(
        503,
        'No se pudo registrar el acceso; la ficha no se mostró',
        'AUDITORIA_NO_DISPONIBLE',
      );
    }

    const cifrada = await this.fichas.leerSiResponsable(datos.incidenteId, datos.actorId);
    if (cifrada === null) {
      // El relevo o el cierre ocurrieron entre la decisión y la lectura.
      await this.auditarDenegacion(datos.incidenteId, datos.actorId, 'CONTEXTO_CAMBIADO');
      throw errorDenegacionFicha('CONTEXTO_CAMBIADO');
    }

    let carga;
    try {
      carga = this.descifrador.descifrar(cifrada.cargaCifrada);
    } catch {
      console.error('[FichaMedicaIncidente] ficha ilegible');
      throw new ErrorAplicacion(500, 'No se pudo leer la ficha médica', 'FICHA_ILEGIBLE');
    }

    return {
      fichaMedica: {
        tipoSangre: cifrada.tipoSangre,
        alergias: carga.alergias,
        condiciones: carga.condiciones,
        medicamentos: carga.medicamentos,
      },
      acceso: {
        incidenteId: datos.incidenteId,
        auditoriaId: registro.id,
        registradoEn: registro.registradoEn,
      },
    };
  }

  /** Un fallo al auditar un rechazo no cambia la respuesta: se registra sin datos. */
  private async auditarDenegacion(
    incidenteId: string,
    actorId: string,
    motivo: MotivoDenegacionFicha,
  ): Promise<void> {
    try {
      await this.auditoria.registrar({ incidenteId, actorId, resultado: 'denegado', motivo });
    } catch {
      console.error('[FichaMedicaIncidente] no se pudo auditar un acceso denegado:', motivo);
    }
  }
}
