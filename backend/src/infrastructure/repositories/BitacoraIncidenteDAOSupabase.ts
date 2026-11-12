import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ErrorBitacoraIncidente,
  type CodigoErrorBitacoraIncidente,
} from '../../domain/errors/ErrorBitacoraIncidente.js';
import type { ResponsableVigente } from '../../domain/errors/ErrorCoordinacion.js';
import type {
  BitacoraIncidente,
  EntradaBitacora,
  IBitacoraIncidenteDAO,
  ResultadoEntradaBitacora,
  SolicitudEntradaBitacora,
} from '../../domain/repositories/IBitacoraIncidenteDAO.js';
import type { EstadoIncidente } from '../../domain/repositories/IIncidenteDAO.js';
import { TIPOS_ENTRADA_BITACORA, type TipoEntradaBitacora } from '../../domain/value-objects/entradaBitacora.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

/** Columnas explícitas: la bitácora solo conoce al responsable y a los autores, nunca datos médicos. */
export const COLUMNAS_INCIDENTE_BITACORA =
  'id, expedicion_id, estado, version, responsable_id, perfiles_rescatista ( nombre_completo )';
export const COLUMNAS_ENTRADA_BITACORA =
  'id, secuencia, incidente_id, tipo, texto, autor_id, registrada_en, corrige_entrada_id, perfiles_rescatista ( nombre_completo )';

/** Códigos de negocio que lanza treksafe_agregar_entrada_bitacora (019) en `error.message`. */
const CODIGOS_RPC = new Set<string>([
  'DATOS_INVALIDOS',
  'INCIDENTE_NO_ENCONTRADO',
  'NO_ES_RESPONSABLE',
  'INCIDENTE_CERRADO',
  'CORRECCION_INVALIDA',
  'OPERACION_YA_REGISTRADA',
] satisfies CodigoErrorBitacoraIncidente[]);

const ESTADOS = new Set<string>(['abierto', 'localizado', 'cerrado'] satisfies EstadoIncidente[]);
const TIPOS = new Set<string>(TIPOS_ENTRADA_BITACORA);
const NOMBRE_POR_DEFECTO = 'Rescatista';

/** Error inesperado: nunca expone el mensaje de la base al cliente y nunca es 401. */
function errorInterno(contexto: string, causa: { message: string }): ErrorAplicacion {
  console.error(`[BitacoraIncidenteDAOSupabase] ${contexto}:`, causa.message);
  return new ErrorAplicacion(500, 'No se pudo completar la operación de bitácora');
}

const esTexto = (valor: unknown): valor is string => typeof valor === 'string' && valor.length > 0;
const esFechaValida = (valor: unknown): valor is string => typeof valor === 'string' && !Number.isNaN(Date.parse(valor));

/** `DETAIL` de NO_ES_RESPONSABLE: JSON `{id, nombreCompleto}` → `{responsableId, nombreResponsable}`. */
function leerResponsableVigente(detalle: unknown): ResponsableVigente | null {
  if (typeof detalle !== 'string') return null;
  try {
    const valor: unknown = JSON.parse(detalle);
    if (typeof valor !== 'object' || valor === null) return null;
    const { id, nombreCompleto } = valor as Record<string, unknown>;
    if (!esTexto(id) || typeof nombreCompleto !== 'string') return null;
    return { responsableId: id, nombreResponsable: nombreCompleto };
  } catch {
    return null;
  }
}

/** Resultado JSON de la RPC → `ResultadoEntradaBitacora`, con `registradaEn` normalizada a ISO en UTC. */
function leerResultado(datos: unknown): ResultadoEntradaBitacora | null {
  if (typeof datos !== 'object' || datos === null) return null;
  const d = datos as Record<string, unknown>;
  const autor = d.autor as Record<string, unknown> | null | undefined;
  if (
    !esTexto(d.id) ||
    !esTexto(d.incidenteId) ||
    typeof d.tipo !== 'string' ||
    !TIPOS.has(d.tipo) ||
    typeof d.texto !== 'string' ||
    typeof autor !== 'object' ||
    autor === null ||
    !esTexto(autor.id) ||
    typeof autor.nombreCompleto !== 'string' ||
    !esFechaValida(d.registradaEn) ||
    (d.corrigeEntradaId !== null && !esTexto(d.corrigeEntradaId)) ||
    typeof d.repetido !== 'boolean'
  ) {
    return null;
  }
  return {
    entrada: Object.freeze({
      id: d.id,
      incidenteId: d.incidenteId,
      tipo: d.tipo as TipoEntradaBitacora,
      texto: d.texto,
      autorId: autor.id,
      nombreAutor: autor.nombreCompleto,
      registradaEn: new Date(d.registradaEn).toISOString(),
      corrigeEntradaId: d.corrigeEntradaId,
    }),
    repetido: d.repetido,
  };
}

type Perfil = { nombre_completo: string } | { nombre_completo: string }[] | null;

type FilaIncidente = {
  id: string;
  expedicion_id: string;
  estado: string;
  version: number;
  responsable_id: string;
  perfiles_rescatista: Perfil;
};

type FilaEntrada = {
  id: string;
  incidente_id: string;
  tipo: string;
  texto: string;
  autor_id: string;
  registrada_en: string;
  corrige_entrada_id: string | null;
  perfiles_rescatista: Perfil;
};

/** El embebido puede llegar como objeto o como arreglo según el SDK. */
function nombreDe(perfil: Perfil): string {
  const p = Array.isArray(perfil) ? perfil[0] : perfil;
  return p?.nombre_completo ?? NOMBRE_POR_DEFECTO;
}

export class BitacoraIncidenteDAOSupabase implements IBitacoraIncidenteDAO {
  constructor(private readonly cliente: Pick<SupabaseClient, 'from' | 'rpc'>) {}

  async listar(incidenteId: string): Promise<BitacoraIncidente | null> {
    const { data: filas, error } = await this.cliente
      .from('incidentes')
      .select(COLUMNAS_INCIDENTE_BITACORA)
      .eq('id', incidenteId);
    if (error) throw errorInterno('listar incidente', error);

    // data[0]: no se usa maybeSingle porque el puente de pruebas devuelve un arreglo.
    const fila = ((filas ?? []) as unknown as FilaIncidente[])[0];
    if (!fila) return null;
    if (!ESTADOS.has(fila.estado)) throw errorInterno('listar incidente', { message: 'Estado de incidente desconocido' });

    const { data: filasEntradas, error: errorEntradas } = await this.cliente
      .from('entradas_bitacora_incidente')
      .select(COLUMNAS_ENTRADA_BITACORA)
      .eq('incidente_id', incidenteId)
      .order('registrada_en', { ascending: true })
      .order('secuencia', { ascending: true });
    if (errorEntradas) throw errorInterno('listar entradas', errorEntradas);

    const entradas: EntradaBitacora[] = [];
    for (const e of (filasEntradas ?? []) as unknown as FilaEntrada[]) {
      if (!TIPOS.has(e.tipo)) throw errorInterno('listar entradas', { message: 'Tipo de entrada desconocido' });
      entradas.push(
        Object.freeze({
          id: e.id,
          incidenteId: e.incidente_id,
          tipo: e.tipo as TipoEntradaBitacora,
          texto: e.texto,
          autorId: e.autor_id,
          nombreAutor: nombreDe(e.perfiles_rescatista),
          registradaEn: new Date(e.registrada_en).toISOString(),
          corrigeEntradaId: e.corrige_entrada_id,
        }),
      );
    }

    return {
      incidente: Object.freeze({
        id: fila.id,
        expedicionId: fila.expedicion_id,
        estado: fila.estado as EstadoIncidente,
        version: fila.version,
        responsableId: fila.responsable_id,
        nombreResponsable: nombreDe(fila.perfiles_rescatista),
      }),
      entradas,
    };
  }

  async agregar(s: SolicitudEntradaBitacora): Promise<ResultadoEntradaBitacora> {
    const { data, error } = await this.cliente.rpc('treksafe_agregar_entrada_bitacora', {
      p_incidente_id: s.incidenteId,
      p_autor_id: s.autorId,
      p_texto: s.texto,
      p_corrige_entrada_id: s.corrigeEntradaId,
      p_operacion_id: s.operacionId,
    });

    if (error) {
      if (CODIGOS_RPC.has(error.message)) {
        const codigo = error.message as CodigoErrorBitacoraIncidente;
        if (codigo !== 'NO_ES_RESPONSABLE') throw new ErrorBitacoraIncidente(codigo);
        const vigente = leerResponsableVigente(error.details);
        if (!vigente) throw errorInterno('agregar', { message: 'DETAIL de NO_ES_RESPONSABLE mal formado' });
        throw new ErrorBitacoraIncidente(codigo, vigente);
      }
      throw errorInterno('agregar', error);
    }

    const resultado = leerResultado(data);
    if (!resultado) throw errorInterno('agregar', { message: 'Respuesta de la RPC con forma inesperada' });
    return resultado;
  }
}
