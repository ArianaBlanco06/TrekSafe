import { randomUUID } from 'node:crypto';
import type {
  FichaCifrada,
  IFichaMedicaIncidenteDAO,
  RegistroAccesoFicha,
  SolicitudRegistroAccesoFicha,
} from '../../../domain/repositories/IFichaMedicaIncidenteDAO.js';
import type { EstadoIncidente } from '../../../domain/repositories/IIncidenteDAO.js';
import {
  ESTADOS_INCIDENTE_CON_ACCESO_FICHA,
  MOTIVO_PERMITIDO_FICHA,
  MOTIVOS_DENEGACION_FICHA,
  type ContextoAccesoFicha,
} from '../../../domain/value-objects/accesoFichaMedica.js';
import { ErrorAplicacion } from '../../../shared/errors/ErrorAplicacion.js';

type FilaIncidente = {
  id: string;
  expedicionId: string;
  senderistaId: string;
  estado: EstadoIncidente;
  responsableId: string;
};

const MOTIVOS = new Set<string>([MOTIVO_PERMITIDO_FICHA, ...MOTIVOS_DENEGACION_FICHA]);

/**
 * Doble de prueba de `IFichaMedicaIncidenteDAO`. Replica las tres RPC de la 030: el contexto
 * nunca incluye la ficha, la guarda devuelve el texto cifrado solo al responsable de un
 * incidente no cerrado con ficha, y el registro valida el catálogo (DATOS_INVALIDOS se lanza
 * como ErrorAplicacion 500) y fija la hora del "servidor". Es de solo anexado: no hay forma
 * de editar ni borrar los accesos. La evidencia de concurrencia real está en la suite
 * PostgreSQL (test-hu50-postgres.mjs).
 */
export class FichaMedicaIncidenteDAOMemoria implements IFichaMedicaIncidenteDAO {
  private readonly rescatistas = new Set<string>();
  private readonly incidentes = new Map<string, FilaIncidente>();
  private readonly fichas = new Map<string, FichaCifrada>();
  private readonly _accesos: RegistroAccesoFicha[] = [];

  /** Los accesos registrados, del más antiguo al más reciente. */
  get accesos(): readonly RegistroAccesoFicha[] {
    return this._accesos;
  }

  sembrarRescatista(id: string): void {
    this.rescatistas.add(id);
  }

  sembrarIncidente(i: {
    id: string;
    expedicionId: string;
    senderistaId: string;
    estado?: EstadoIncidente;
    responsableId: string;
  }): void {
    this.incidentes.set(i.id, {
      id: i.id,
      expedicionId: i.expedicionId,
      senderistaId: i.senderistaId,
      estado: i.estado ?? 'abierto',
      responsableId: i.responsableId,
    });
  }

  /** Ficha con consentimiento vigente del senderista. */
  sembrarFicha(senderistaId: string, ficha: FichaCifrada): void {
    this.fichas.set(senderistaId, ficha);
  }

  /** El consentimiento revocado equivale a que no haya ficha (chk_ficha_consentimiento). */
  revocarConsentimiento(senderistaId: string): void {
    this.fichas.delete(senderistaId);
  }

  /** Simula el relevo de HU-40. */
  transferir(incidenteId: string, nuevoResponsableId: string): void {
    this.exigirIncidente(incidenteId).responsableId = nuevoResponsableId;
  }

  /** Simula el cierre de HU-42. */
  cerrar(incidenteId: string): void {
    this.exigirIncidente(incidenteId).estado = 'cerrado';
  }

  /** Simula "persona localizada" de HU-42. */
  localizar(incidenteId: string): void {
    this.exigirIncidente(incidenteId).estado = 'localizado';
  }

  async leerContexto(incidenteId: string, actorId: string): Promise<ContextoAccesoFicha> {
    const incidente = this.incidentes.get(incidenteId) ?? null;
    return Object.freeze({
      incidenteId,
      actorId,
      actorEsRescatista: this.rescatistas.has(actorId),
      incidente: incidente ? Object.freeze({ ...incidente }) : null,
      consentimientoVigente: incidente ? this.fichas.has(incidente.senderistaId) : false,
    });
  }

  async leerSiResponsable(incidenteId: string, actorId: string): Promise<FichaCifrada | null> {
    const incidente = this.incidentes.get(incidenteId);
    if (!incidente) return null;
    if (!ESTADOS_INCIDENTE_CON_ACCESO_FICHA.includes(incidente.estado)) return null;
    if (incidente.responsableId !== actorId || !this.rescatistas.has(actorId)) return null;
    return this.fichas.get(incidente.senderistaId) ?? null;
  }

  async registrar(s: SolicitudRegistroAccesoFicha): Promise<RegistroAccesoFicha> {
    const invalido =
      !s.incidenteId ||
      !s.actorId ||
      (s.resultado !== 'permitido' && s.resultado !== 'denegado') ||
      !MOTIVOS.has(s.motivo) ||
      (s.resultado === 'permitido') !== (s.motivo === MOTIVO_PERMITIDO_FICHA);
    if (invalido) throw new ErrorAplicacion(500, 'DATOS_INVALIDOS');

    const incidente = this.incidentes.get(s.incidenteId) ?? null;
    // CHECK chk_accesos_ficha_permitido_completo.
    if (s.resultado === 'permitido' && !incidente) throw new ErrorAplicacion(500, 'chk_accesos_ficha_permitido_completo');

    const registro: RegistroAccesoFicha = Object.freeze({
      id: randomUUID(),
      incidenteId: s.incidenteId,
      expedicionId: incidente?.expedicionId ?? null,
      senderistaId: incidente?.senderistaId ?? null,
      actorId: s.actorId,
      resultado: s.resultado,
      motivo: s.motivo,
      registradoEn: new Date().toISOString(),
    });
    this._accesos.push(registro);
    return registro;
  }

  private exigirIncidente(incidenteId: string): FilaIncidente {
    const incidente = this.incidentes.get(incidenteId);
    if (!incidente) throw new Error(`Incidente no sembrado: ${incidenteId}`);
    return incidente;
  }
}
