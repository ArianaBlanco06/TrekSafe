import type {
  IConsultaPuntosRuta, IGuardadoPuntosRuta, OrdenGuardarPuntos, ResultadoGuardadoPuntos,
} from '../../application/ports/puntosRuta.js';
import { guardarPuntosRutaSchema } from '../../application/dto/puntosRuta.dto.js';
import type { RutaConPuntos } from '../../domain/entities/RutaConPuntos.js';

// Doble para pruebas del contrato, no conectado al ensamblaje de produccion.
export class RepositorioPuntosRutaMemoria implements IConsultaPuntosRuta, IGuardadoPuntosRuta {
  private readonly planes = new Map<string, { senderistaId: string; ruta: RutaConPuntos }>();

  constructor(private readonly ahora: () => number) {}

  preparar(senderistaId: string, ruta: RutaConPuntos): void {
    this.planes.set(ruta.expedicion.id, { senderistaId, ruta: structuredClone(ruta) });
  }

  cambiarContexto(expedicionId: string, cambios: Partial<RutaConPuntos['expedicion']>): void {
    Object.assign(this.planes.get(expedicionId)!.ruta.expedicion, cambios);
  }

  async consultarPropia(senderistaId: string, expedicionId: string): Promise<RutaConPuntos | null> {
    const plan = this.planes.get(expedicionId);
    if (!plan || plan.senderistaId !== senderistaId) return null;
    return this.fotografia(plan.ruta);
  }

  private fotografia(ruta: RutaConPuntos): RutaConPuntos {
    const copia = structuredClone(ruta);
    copia.expedicion.editable = copia.expedicion.estado === 'programada'
      && new Date(copia.expedicion.horaInicio).getTime() > this.ahora();
    return copia;
  }

  async guardarColeccionPropia(orden: OrdenGuardarPuntos): Promise<ResultadoGuardadoPuntos> {
    // Todo el cambio es sincrono antes de devolver la promesa: no hay ventanas
    // entre validacion y asignacion para dos comandos concurrentes en memoria.
    const entrada = guardarPuntosRutaSchema.safeParse({ versionEsperada: orden.versionEsperada, puntos: orden.puntos });
    if (!entrada.success) return { tipo: 'datos_invalidos', detalles: { puntos: ['Colección inválida'] } };
    const plan = this.planes.get(orden.expedicionId);
    if (!plan || plan.senderistaId !== orden.senderistaId) return { tipo: 'no_encontrado' };
    if (plan.ruta.expedicion.estado !== 'programada') return { tipo: 'expedicion_no_editable' };
    if (new Date(plan.ruta.expedicion.horaInicio).getTime() <= this.ahora()) return { tipo: 'expedicion_ya_iniciada' };
    if (plan.ruta.expedicion.version !== orden.versionEsperada) return { tipo: 'version_obsoleta' };
    for (const otro of this.planes.values()) {
      if (otro === plan) continue;
      if (otro.ruta.puntos.some((p) => entrada.data.puntos.some((nuevo) => nuevo.id === p.id))) {
        return { tipo: 'datos_invalidos', detalles: { puntos: ['Identificadores no disponibles'] } };
      }
    }
    const puntos = entrada.data.puntos.map((p) => ({
      ...p, latitud: redondearDecimal(p.latitud), longitud: redondearDecimal(p.longitud),
    })).sort((a, b) => a.orden - b.orden);
    // Comparacion por valores, independiente del orden de claves del objeto.
    const mismos = puntos.length === plan.ruta.puntos.length && puntos.every((p, i) => {
      const anterior = plan.ruta.puntos[i];
      return p.id === anterior.id && p.nombre === anterior.nombre && p.latitud === anterior.latitud
        && p.longitud === anterior.longitud && p.orden === anterior.orden;
    });
    if (!mismos) {
      if (plan.ruta.expedicion.version === Number.MAX_SAFE_INTEGER) throw new Error('Rango de versión agotado');
      plan.ruta = { expedicion: { ...plan.ruta.expedicion, version: plan.ruta.expedicion.version + 1 }, puntos };
    }
    return { tipo: 'guardado', ruta: this.fotografia(plan.ruta) };
  }
}

/** Replica round(numeric,5) sobre el decimal enviado en JSON, incluso en empates
 * negativos. toFixed() usa el numero binario y puede diferir de PostgreSQL.
 */
function redondearDecimal(numero: number): number {
  const [mantisa, exponente = '0'] = Math.abs(numero).toString().split('e');
  const [entero, fraccion = ''] = mantisa.split('.');
  let unidades = BigInt(entero + fraccion);
  const diferencia = fraccion.length - Number(exponente) - 5;
  if (diferencia > 0) {
    const divisor = 10n ** BigInt(diferencia);
    unidades = (unidades + divisor / 2n) / divisor;
  } else {
    unidades *= 10n ** BigInt(-diferencia);
  }
  return unidades === 0n ? 0 : Math.sign(numero) * Number(unidades) / 100_000;
}
