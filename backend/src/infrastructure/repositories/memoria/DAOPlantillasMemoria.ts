import { randomUUID } from 'node:crypto';
import type { PlantillaRuta } from '../../../domain/entities/PlantillaRuta.js';
import type {
  DatosPlantilla,
  IPlantillaDAO,
  ResultadoCrearPlantilla,
  ResultadoRenombrarPlantilla,
} from '../../../domain/repositories/IPlantillaDAO.js';

const claveNombre = (nombre: string) => nombre.trim().toLowerCase();

/** Doble de prueba con la misma semántica que la tabla plantillas_ruta (versión, unicidad, orden). */
export class DAOPlantillasMemoria implements IPlantillaDAO {
  private readonly filas = new Map<string, PlantillaRuta>();

  constructor(private readonly reloj: () => Date = () => new Date()) {}

  private copiar(p: PlantillaRuta): PlantillaRuta {
    return {
      ...p,
      idsContactos: [...p.idsContactos],
      nombresAcompanantes: [...p.nombresAcompanantes],
    };
  }

  private nombreOcupado(senderistaId: string, nombre: string, excluirId?: string): boolean {
    for (const p of this.filas.values()) {
      if (p.senderistaId === senderistaId && p.id !== excluirId && claveNombre(p.nombre) === claveNombre(nombre)) {
        return true;
      }
    }
    return false;
  }

  private propia(senderistaId: string, plantillaId: string): PlantillaRuta | undefined {
    const fila = this.filas.get(plantillaId);
    return fila && fila.senderistaId === senderistaId ? fila : undefined;
  }

  async listarPorPropietario(senderistaId: string): Promise<PlantillaRuta[]> {
    return [...this.filas.values()]
      .filter((p) => p.senderistaId === senderistaId)
      .sort(
        (a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn) || a.id.localeCompare(b.id),
      )
      .map((p) => this.copiar(p));
  }

  async buscarPorId(senderistaId: string, plantillaId: string): Promise<PlantillaRuta | null> {
    const fila = this.propia(senderistaId, plantillaId);
    return fila ? this.copiar(fila) : null;
  }

  async crear(senderistaId: string, datos: DatosPlantilla): Promise<ResultadoCrearPlantilla> {
    if (this.nombreOcupado(senderistaId, datos.nombre)) return { tipo: 'nombre_duplicado' };
    const ahora = this.reloj().toISOString();
    const plantilla: PlantillaRuta = {
      id: randomUUID(),
      senderistaId,
      nombre: datos.nombre.trim(),
      lugarInicio: datos.lugarInicio,
      lugarFin: datos.lugarFin,
      coordenadasInicio: datos.coordenadasInicio,
      coordenadasFin: datos.coordenadasFin,
      minutosTolerancia: datos.minutosTolerancia,
      idsContactos: [...datos.idsContactos],
      nombresAcompanantes: [...datos.nombresAcompanantes],
      version: 1,
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    this.filas.set(plantilla.id, plantilla);
    return { tipo: 'ok', plantilla: this.copiar(plantilla) };
  }

  async renombrar(
    senderistaId: string,
    plantillaId: string,
    nombre: string,
    versionEsperada: number,
  ): Promise<ResultadoRenombrarPlantilla> {
    const fila = this.propia(senderistaId, plantillaId);
    if (!fila) return { tipo: 'no_encontrada' };
    if (fila.version !== versionEsperada) {
      return { tipo: 'version_obsoleta', versionActual: fila.version };
    }
    if (this.nombreOcupado(senderistaId, nombre, fila.id)) return { tipo: 'nombre_duplicado' };
    fila.nombre = nombre.trim();
    fila.version += 1;
    fila.actualizadoEn = this.reloj().toISOString();
    return { tipo: 'ok', plantilla: this.copiar(fila) };
  }

  async eliminar(senderistaId: string, plantillaId: string): Promise<boolean> {
    return this.propia(senderistaId, plantillaId) ? this.filas.delete(plantillaId) : false;
  }
}
