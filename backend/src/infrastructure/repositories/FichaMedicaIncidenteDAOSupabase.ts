import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FichaCifrada,
  IFichaMedicaIncidenteDAO,
  RegistroAccesoFicha,
  SolicitudRegistroAccesoFicha,
} from '../../domain/repositories/IFichaMedicaIncidenteDAO.js';
import type { EstadoIncidente } from '../../domain/repositories/IIncidenteDAO.js';
import {
  MOTIVO_PERMITIDO_FICHA,
  MOTIVOS_DENEGACION_FICHA,
  type ContextoAccesoFicha,
  type MotivoAccesoFicha,
  type ResultadoAccesoFicha,
} from '../../domain/value-objects/accesoFichaMedica.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

const ESTADOS_INCIDENTE = new Set<string>(['abierto', 'localizado', 'cerrado'] satisfies EstadoIncidente[]);
const MOTIVOS = new Set<string>([MOTIVO_PERMITIDO_FICHA, ...MOTIVOS_DENEGACION_FICHA]);
const RESULTADOS = new Set<string>(['permitido', 'denegado'] satisfies ResultadoAccesoFicha[]);

/**
 * Error inesperado: nunca expone el mensaje de la base y nunca es 401.
 * Privacidad: solo se registra `error.message`; jamás `details` ni `data` (podrían traer la
 * fila, y en ella el texto cifrado), ni los parámetros.
 */
function errorInterno(contexto: string, causa: { message: string }): ErrorAplicacion {
  console.error(`[FichaMedicaIncidenteDAOSupabase] ${contexto}:`, causa.message);
  return new ErrorAplicacion(500, 'No se pudo completar la consulta de la ficha médica');
}

const esTexto = (valor: unknown): valor is string => typeof valor === 'string' && valor.length > 0;
const esFechaValida = (valor: unknown): valor is string => typeof valor === 'string' && !Number.isNaN(Date.parse(valor));
const esTextoONulo = (valor: unknown): valor is string | null => valor === null || esTexto(valor);

function leerContextoRpc(datos: unknown, incidenteId: string, actorId: string): ContextoAccesoFicha | null {
  if (typeof datos !== 'object' || datos === null) return null;
  const d = datos as Record<string, unknown>;
  if (typeof d.actorEsRescatista !== 'boolean' || typeof d.consentimientoVigente !== 'boolean') return null;
  if (d.incidente === null) {
    return Object.freeze({
      incidenteId,
      actorId,
      actorEsRescatista: d.actorEsRescatista,
      incidente: null,
      consentimientoVigente: d.consentimientoVigente,
    });
  }
  const i = d.incidente as Record<string, unknown> | undefined;
  if (
    typeof i !== 'object' ||
    i === null ||
    !esTexto(i.id) ||
    !esTexto(i.expedicionId) ||
    !esTexto(i.senderistaId) ||
    typeof i.estado !== 'string' ||
    !ESTADOS_INCIDENTE.has(i.estado) ||
    !esTexto(i.responsableId)
  ) {
    return null;
  }
  return Object.freeze({
    incidenteId,
    actorId,
    actorEsRescatista: d.actorEsRescatista,
    incidente: Object.freeze({
      id: i.id,
      expedicionId: i.expedicionId,
      senderistaId: i.senderistaId,
      estado: i.estado as EstadoIncidente,
      responsableId: i.responsableId,
    }),
    consentimientoVigente: d.consentimientoVigente,
  });
}

function leerRegistro(datos: unknown): RegistroAccesoFicha | null {
  if (typeof datos !== 'object' || datos === null) return null;
  const d = datos as Record<string, unknown>;
  if (
    !esTexto(d.id) ||
    !esTexto(d.incidenteId) ||
    !esTextoONulo(d.expedicionId) ||
    !esTextoONulo(d.senderistaId) ||
    !esTexto(d.actorId) ||
    typeof d.resultado !== 'string' ||
    !RESULTADOS.has(d.resultado) ||
    typeof d.motivo !== 'string' ||
    !MOTIVOS.has(d.motivo) ||
    !esFechaValida(d.registradoEn)
  ) {
    return null;
  }
  return Object.freeze({
    id: d.id,
    incidenteId: d.incidenteId,
    expedicionId: d.expedicionId,
    senderistaId: d.senderistaId,
    actorId: d.actorId,
    resultado: d.resultado as ResultadoAccesoFicha,
    motivo: d.motivo as MotivoAccesoFicha,
    registradoEn: new Date(d.registradoEn).toISOString(),
  });
}

/** Adaptador Supabase de las tres RPC de HU-50 (migración 030). */
export class FichaMedicaIncidenteDAOSupabase implements IFichaMedicaIncidenteDAO {
  constructor(private readonly cliente: Pick<SupabaseClient, 'rpc'>) {}

  async leerContexto(incidenteId: string, actorId: string): Promise<ContextoAccesoFicha> {
    const { data, error } = await this.cliente.rpc('treksafe_contexto_ficha_medica', {
      p_incidente_id: incidenteId,
      p_actor_id: actorId,
    });
    if (error) throw errorInterno('leer contexto', error);
    const contexto = leerContextoRpc(data, incidenteId, actorId);
    if (!contexto) throw errorInterno('leer contexto', { message: 'Respuesta de la RPC con forma inesperada' });
    return contexto;
  }

  async leerSiResponsable(incidenteId: string, actorId: string): Promise<FichaCifrada | null> {
    const { data, error } = await this.cliente.rpc('treksafe_leer_ficha_cifrada_responsable', {
      p_incidente_id: incidenteId,
      p_actor_id: actorId,
    });
    if (error) throw errorInterno('leer ficha cifrada', error);
    if (data === null || data === undefined) return null;
    const d = data as Record<string, unknown>;
    if (typeof d !== 'object' || !esTexto(d.tipoSangre) || !esTexto(d.cargaCifrada)) {
      throw errorInterno('leer ficha cifrada', { message: 'Respuesta de la RPC con forma inesperada' });
    }
    return Object.freeze({ tipoSangre: d.tipoSangre, cargaCifrada: d.cargaCifrada });
  }

  async registrar(s: SolicitudRegistroAccesoFicha): Promise<RegistroAccesoFicha> {
    const { data, error } = await this.cliente.rpc('treksafe_registrar_acceso_ficha_medica', {
      p_incidente_id: s.incidenteId,
      p_actor_id: s.actorId,
      p_resultado: s.resultado,
      p_motivo: s.motivo,
    });
    if (error) throw errorInterno('registrar acceso', error);
    const registro = leerRegistro(data);
    if (!registro) throw errorInterno('registrar acceso', { message: 'Respuesta de la RPC con forma inesperada' });
    return registro;
  }
}
