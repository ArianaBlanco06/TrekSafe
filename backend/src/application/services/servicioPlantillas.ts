import type { PlantillaRuta } from '../../domain/entities/PlantillaRuta.js';
import type { IContactosVigentes } from '../../domain/repositories/IContactosVigentes.js';
import type { IPlantillaDAO } from '../../domain/repositories/IPlantillaDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { parseDecimalCoordinates } from '../../shared/utils/coordinates.js';
import type {
  EntradaGuardarPlantilla,
  EntradaRenombrarPlantilla,
  PlantillaDTO,
} from '../dto/plantilla.dto.js';

export function aPlantillaDTO(plantilla: PlantillaRuta): PlantillaDTO {
  return {
    id: plantilla.id,
    nombre: plantilla.nombre,
    lugarInicio: plantilla.lugarInicio,
    lugarFin: plantilla.lugarFin,
    coordenadasInicio: plantilla.coordenadasInicio,
    coordenadasFin: plantilla.coordenadasFin,
    minutosTolerancia: plantilla.minutosTolerancia,
    idsContactos: [...plantilla.idsContactos],
    nombresAcompanantes: [...plantilla.nombresAcompanantes],
    version: plantilla.version,
    creadoEn: plantilla.creadoEn,
    actualizadoEn: plantilla.actualizadoEn,
  };
}

function normalizarCoordenadas(valor: string | undefined): string | null {
  if (!valor) return null;
  return parseDecimalCoordinates(valor)?.formatted ?? null;
}

const errorNoEncontrada = () =>
  new ErrorAplicacion(404, 'Plantilla no encontrada', 'PLANTILLA_NO_ENCONTRADA');
const errorNombreDuplicado = () =>
  new ErrorAplicacion(409, 'Ya tienes una plantilla con ese nombre', 'NOMBRE_DUPLICADO');

export class ServicioPlantillas {
  constructor(
    private readonly plantillas: IPlantillaDAO,
    private readonly contactosVigentes: IContactosVigentes,
  ) {}

  async listar(senderistaId: string): Promise<PlantillaDTO[]> {
    const filas = await this.plantillas.listarPorPropietario(senderistaId);
    return filas.map(aPlantillaDTO);
  }

  async guardar(senderistaId: string, entrada: EntradaGuardarPlantilla): Promise<PlantillaDTO> {
    const vigentes = await this.contactosVigentes.filtrarVigentes(senderistaId, entrada.idsContactos);
    if (vigentes.length !== entrada.idsContactos.length) {
      throw new ErrorAplicacion(400, 'Uno o más contactos no pertenecen al senderista', 'CONTACTOS_INVALIDOS');
    }

    const resultado = await this.plantillas.crear(senderistaId, {
      nombre: entrada.nombre,
      lugarInicio: entrada.lugarInicio,
      lugarFin: entrada.lugarFin,
      coordenadasInicio: normalizarCoordenadas(entrada.coordenadasInicio),
      coordenadasFin: normalizarCoordenadas(entrada.coordenadasFin),
      minutosTolerancia: entrada.minutosTolerancia,
      idsContactos: entrada.idsContactos,
      nombresAcompanantes: entrada.nombresAcompanantes,
    });
    if (resultado.tipo === 'nombre_duplicado') throw errorNombreDuplicado();
    return aPlantillaDTO(resultado.plantilla);
  }

  async renombrar(
    senderistaId: string,
    plantillaId: string,
    entrada: EntradaRenombrarPlantilla,
  ): Promise<PlantillaDTO> {
    const resultado = await this.plantillas.renombrar(
      senderistaId,
      plantillaId,
      entrada.nombre,
      entrada.versionEsperada,
    );
    switch (resultado.tipo) {
      case 'ok':
        return aPlantillaDTO(resultado.plantilla);
      case 'no_encontrada':
        throw errorNoEncontrada();
      case 'nombre_duplicado':
        throw errorNombreDuplicado();
      case 'version_obsoleta':
        throw new ErrorAplicacion(
          409,
          'La plantilla fue modificada desde otro dispositivo. Recarga la lista e inténtalo de nuevo.',
          'VERSION_OBSOLETA',
        );
    }
  }

  async eliminar(senderistaId: string, plantillaId: string): Promise<void> {
    const eliminada = await this.plantillas.eliminar(senderistaId, plantillaId);
    if (!eliminada) throw errorNoEncontrada();
  }
}
