import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { calcularFechaLimite } from './RepositorioExpedicion.js';
import { getSupabaseAdmin } from '../database/supabase.js';

export type ContextoAlertaExpedicion = {
  expedicionId: string;
  nombreCompletoSenderista: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  fechaLimite: string;
  contactos: { nombreCompleto: string; correoElectronico: string; parentesco: string }[];
};

export type ContextoAlertaRescate = ContextoAlertaExpedicion & {
  senderistaId: string;
  telefonoSenderista: string;
  horaInicio: string;
  acompanantes: string[];
  contactosEmergencia: { nombreCompleto: string; telefono: string; parentesco: string }[];
};

type PerfilSenderistaBruto = { usuario_id?: string; nombre_completo: string; telefono: string };
type ContactoEmergenciaBruto = {
  nombre_completo: string;
  correo_electronico: string;
  telefono: string;
  parentesco: string;
};

type FilaContextoAlerta = {
  id: string;
  senderista_id: string;
  lugar_inicio: string;
  lugar_fin: string;
  coordenadas_inicio: string | null;
  coordenadas_fin: string | null;
  hora_inicio: string;
  hora_retorno_estimada: string;
  minutos_tolerancia: number;
  estado: string;
  perfiles_senderista: PerfilSenderistaBruto | PerfilSenderistaBruto[] | null;
  acompanantes_expedicion: { nombre_acompanante: string }[];
  vinculos_expedicion_contacto: {
    contactos_emergencia: ContactoEmergenciaBruto | ContactoEmergenciaBruto[] | null;
  }[];
};

function resolverUno<T>(raw: T | T[] | null | undefined): T | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export class RepositorioAlerta {
  private readonly supabase = getSupabaseAdmin();

  async buscarContextoAlerta(expedicionId: string): Promise<ContextoAlertaExpedicion | null> {
    const completo = await this.buscarContextoAlertaRescate(expedicionId);
    if (!completo) return null;

    return {
      expedicionId: completo.expedicionId,
      nombreCompletoSenderista: completo.nombreCompletoSenderista,
      lugarInicio: completo.lugarInicio,
      lugarFin: completo.lugarFin,
      coordenadasInicio: completo.coordenadasInicio,
      coordenadasFin: completo.coordenadasFin,
      horaRetornoEstimada: completo.horaRetornoEstimada,
      minutosTolerancia: completo.minutosTolerancia,
      fechaLimite: completo.fechaLimite,
      contactos: completo.contactos,
    };
  }

  async buscarContextoAlertaRescate(expedicionId: string): Promise<ContextoAlertaRescate | null> {
    const { data, error } = await this.supabase
      .from('expediciones')
      .select(
        `
        id, senderista_id, lugar_inicio, lugar_fin, coordenadas_inicio, coordenadas_fin,
        hora_inicio,
        hora_retorno_estimada, minutos_tolerancia, estado,
        perfiles_senderista ( usuario_id, nombre_completo, telefono ),
        acompanantes_expedicion ( nombre_acompanante ),
        vinculos_expedicion_contacto (
          contactos_emergencia ( nombre_completo, correo_electronico, telefono, parentesco )
        )
      `,
      )
      .eq('id', expedicionId)
      .eq('estado', 'alerta')
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, error.message);
    if (!data) return null;

    const fila = data as unknown as FilaContextoAlerta;
    const senderista = resolverUno(fila.perfiles_senderista);
    if (!senderista?.nombre_completo) return null;

    const contactos = fila.vinculos_expedicion_contacto
      .map((enlace) => resolverUno(enlace.contactos_emergencia))
      .filter((c): c is ContactoEmergenciaBruto => c !== null);

    return {
      expedicionId: fila.id,
      senderistaId: fila.senderista_id,
      nombreCompletoSenderista: senderista.nombre_completo,
      telefonoSenderista: senderista.telefono,
      lugarInicio: fila.lugar_inicio,
      lugarFin: fila.lugar_fin,
      coordenadasInicio: fila.coordenadas_inicio ?? null,
      coordenadasFin: fila.coordenadas_fin ?? null,
      horaInicio: fila.hora_inicio,
      horaRetornoEstimada: fila.hora_retorno_estimada,
      minutosTolerancia: fila.minutos_tolerancia,
      fechaLimite: calcularFechaLimite(fila.hora_retorno_estimada, fila.minutos_tolerancia),
      acompanantes: fila.acompanantes_expedicion.map((a) => a.nombre_acompanante),
      contactos: contactos.map((c) => ({
        nombreCompleto: c.nombre_completo,
        correoElectronico: c.correo_electronico.toLowerCase(),
        parentesco: c.parentesco,
      })),
      contactosEmergencia: contactos.map((c) => ({
        nombreCompleto: c.nombre_completo,
        telefono: c.telefono,
        parentesco: c.parentesco,
      })),
    };
  }
}
