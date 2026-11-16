import type { IncidenteReporte } from '../../domain/repositories/ILectorPaginasReporteIncidentes.js';
import type { IExportadorIncidentes } from '../ports/ExportadorIncidentes.js';

export const COLUMNAS_CSV_INCIDENTES = [
  'id', 'zona', 'fecha_apertura', 'fecha_cierre', 'estado', 'resultado',
] as const;

/**
 * Se preserva el texto y se añade protección para su apertura en Excel si comienza
 * con un prefijo de fórmula, también detrás de espacios/controles y en variantes
 * de ancho completo. La tabulación protectora forma parte del valor del CSV.
 * Referencia: https://owasp.org/www-community/attacks/CSV_Injection
 */
function celdaCsv(valor: string): string {
  const formula = /^[\s\p{Cc}\p{Cf}]*[=+\-@＝＋－＠]/u.test(valor);
  const texto = formula ? `\t${valor}` : valor;
  return `"${texto.replaceAll('"', '""')}"`;
}

/** SRP: serializa un recorrido de lectura sin conocer HTTP, DAO ni Supabase. */
export class ExportadorCsv implements IExportadorIncidentes {
  /** UTF-8 con BOM para acentos en Excel, comas, comillas dobles y filas CRLF. */
  async *exportar(incidentes: AsyncIterable<IncidenteReporte>): AsyncGenerator<string> {
    yield `\uFEFF${COLUMNAS_CSV_INCIDENTES.map(celdaCsv).join(',')}\r\n`;
    for await (const incidente of incidentes) {
      // Lista blanca explícita. Campos extra de un adaptador nunca pasan al CSV.
      const valores = [
        incidente.id, incidente.zona, incidente.abiertoEn, incidente.cerradoEn ?? '',
        incidente.estado, incidente.resultado ?? '',
      ];
      yield `${valores.map(celdaCsv).join(',')}\r\n`;
    }
  }
}
