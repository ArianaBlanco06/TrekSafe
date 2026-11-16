import type { IConsultaPuntosRuta, IGuardadoPuntosRuta } from '../ports/puntosRuta.js';
import { guardarPuntosRutaSchema, parametrosPuntosRutaSchema } from '../dto/puntosRuta.dto.js';

/** Reglas de entrada y coordinacion: sin HTTP, Supabase ni creacion de repositorios. */
export class ServicioPuntosRuta {
  constructor(
    private readonly consulta: IConsultaPuntosRuta,
    private readonly guardado: IGuardadoPuntosRuta,
  ) {}

  async consultar(senderistaId: string, expedicionId: unknown) {
    const { id } = parametrosPuntosRutaSchema.parse({ id: expedicionId });
    return this.consulta.consultarPropia(senderistaId, id);
  }

  async guardar(senderistaId: string, expedicionId: unknown, cuerpo: unknown) {
    const { id } = parametrosPuntosRutaSchema.parse({ id: expedicionId });
    const entrada = guardarPuntosRutaSchema.parse(cuerpo);
    // Estado, hora y version se comprueban en la operacion atomica. Una lectura
    // previa aqui no protegeria de cambios concurrentes antes de escribir.
    return this.guardado.guardarColeccionPropia({ senderistaId, expedicionId: id, ...entrada });
  }
}
