import assert from 'node:assert/strict';
import { beforeEach, it } from 'node:test';
import type { ServicioAlertaRescate } from '../../application/services/servicioAlertaRescate.js';
import type { ServicioNotificacionAlerta } from '../../application/services/servicioNotificacionAlerta.js';
import { RepositorioExpedicion } from '../repositories/RepositorioExpedicion.js';
import { ejecutarTickFechaLimite } from './cronFechaLimiteExpedicion.js';

// HU-27: el cron no debe activar ni alertar expediciones canceladas.
// Solo configuración ficticia y un cliente Supabase en memoria; nunca consulta una base.
const entornoFicticio = {
  SUPABASE_URL: 'https://dev-test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-ficticia-no-usar',
  JWT_SECRET: 'jwt-ficticio-exclusivo-pruebas-00000000',
  MEDICAL_ENCRYPTION_KEY: 'medico-ficticio-exclusivo-pruebas-0000',
};
for (const [nombre, valor] of Object.entries(entornoFicticio)) process.env[nombre] ??= valor;

type Fila = {
  id: string;
  senderista_id: string;
  estado: string;
  hora_inicio: string;
  hora_retorno_estimada: string;
  minutos_tolerancia: number;
  actualizado_en?: string;
};

const PASADO = '2020-01-01T08:00:00.000Z';
const RETORNO_VENCIDO = '2020-01-01T12:00:00.000Z';

/**
 * Subconjunto del query builder de supabase-js que usa el cron. Evalúa de verdad los
 * filtros sobre filas en memoria, para que la prueba dependa de lo que filtra el
 * repositorio y no de un resultado preparado.
 */
class ConsultaFalsa implements PromiseLike<{ data: unknown; error: null }> {
  private readonly filtros: ((fila: Fila) => boolean)[] = [];
  private valores: Partial<Fila> | null = null;
  private limite: number | null = null;
  private unica = false;

  constructor(
    private readonly filas: Fila[],
    private readonly alLeer: () => void,
  ) {}

  select(): this {
    return this;
  }
  update(valores: Partial<Fila>): this {
    this.valores = valores;
    return this;
  }
  eq(columna: keyof Fila, valor: unknown): this {
    this.filtros.push((fila) => fila[columna] === valor);
    return this;
  }
  in(columna: keyof Fila, valores: unknown[]): this {
    this.filtros.push((fila) => valores.includes(fila[columna]));
    return this;
  }
  lte(columna: keyof Fila, valor: string): this {
    this.filtros.push((fila) => Date.parse(String(fila[columna])) <= Date.parse(valor));
    return this;
  }
  order(): this {
    return this;
  }
  limit(n: number): this {
    this.limite = n;
    return this;
  }
  maybeSingle(): this {
    this.unica = true;
    return this;
  }

  then<R1, R2>(
    resolver?: ((valor: { data: unknown; error: null }) => R1 | PromiseLike<R1>) | null,
    rechazar?: ((motivo: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    let coincidentes = this.filas.filter((fila) => this.filtros.every((f) => f(fila)));
    if (this.valores) {
      for (const fila of coincidentes) Object.assign(fila, this.valores);
    } else {
      this.alLeer();
    }
    if (this.limite !== null) coincidentes = coincidentes.slice(0, this.limite);
    const copia = coincidentes.map((fila) => ({ ...fila }));
    const data = this.unica ? (copia[0] ?? null) : copia;
    return Promise.resolve({ data, error: null }).then(resolver, rechazar);
  }
}

function repositorioConFilas(filas: Fila[], alLeer: () => void = () => undefined) {
  const cliente = {
    from: (tabla: string) => {
      assert.equal(tabla, 'expediciones');
      return new ConsultaFalsa(filas, alLeer);
    },
    // Sin la función SQL, el repositorio usa su alternativa con filtros en TypeScript.
    rpc: async () => ({ data: null, error: { message: 'function does not exist' } }),
  };
  const repo = new RepositorioExpedicion();
  Object.assign(repo, { supabase: cliente });
  return repo;
}

let notificadas: string[];
const alertasContacto = {
  notificarContactosEmergencia: async (id: string) => {
    notificadas.push(id);
    return { enviados: 1, registrados: 0 };
  },
} as unknown as ServicioNotificacionAlerta;
const alertasRescate = {
  notificarEquiposRescate: async (id: string) => {
    notificadas.push(id);
    return { enviados: 1, registrados: 0 };
  },
} as unknown as ServicioAlertaRescate;

beforeEach(() => {
  notificadas = [];
});

it('la promoción no activa una cancelada con la salida vencida, pero sí una programada', async () => {
  const filas: Fila[] = [
    { id: 'cancelada', senderista_id: 's-1', estado: 'cancelada', hora_inicio: PASADO, hora_retorno_estimada: RETORNO_VENCIDO, minutos_tolerancia: 30 },
    { id: 'programada', senderista_id: 's-2', estado: 'programada', hora_inicio: PASADO, hora_retorno_estimada: '2099-01-01T12:00:00.000Z', minutos_tolerancia: 30 },
  ];

  const promovidas = await repositorioConFilas(filas).promoverProgramadasListas();

  assert.equal(promovidas, 1);
  assert.equal(filas[0]?.estado, 'cancelada');
  assert.equal(filas[1]?.estado, 'en_progreso');
});

it('una cancelada no bloquea que el cron active otro plan del mismo senderista', async () => {
  const filas: Fila[] = [
    { id: 'cancelada', senderista_id: 's-1', estado: 'cancelada', hora_inicio: PASADO, hora_retorno_estimada: RETORNO_VENCIDO, minutos_tolerancia: 30 },
    { id: 'programada', senderista_id: 's-1', estado: 'programada', hora_inicio: PASADO, hora_retorno_estimada: '2099-01-01T12:00:00.000Z', minutos_tolerancia: 30 },
  ];

  assert.equal(await repositorioConFilas(filas).promoverProgramadasListas(), 1);
  assert.equal(filas[1]?.estado, 'en_progreso');
});

it('si se cancela entre la lectura y la escritura del cron, el UPDATE condicional no la activa', async () => {
  const filas: Fila[] = [
    { id: 'carrera', senderista_id: 's-1', estado: 'programada', hora_inicio: PASADO, hora_retorno_estimada: RETORNO_VENCIDO, minutos_tolerancia: 30 },
  ];
  let lecturas = 0;
  // La primera lectura es la de candidatas; justo después, el senderista cancela.
  const repo = repositorioConFilas(filas, () => {
    if (++lecturas === 1) queueMicrotask(() => Object.assign(filas[0]!, { estado: 'cancelada' }));
  });

  assert.equal(await repo.promoverProgramadasListas(), 0);
  assert.equal(filas[0]?.estado, 'cancelada');
});

it('la alerta no marca una cancelada con el retorno y la tolerancia vencidos', async () => {
  const filas: Fila[] = [
    { id: 'cancelada', senderista_id: 's-1', estado: 'cancelada', hora_inicio: PASADO, hora_retorno_estimada: RETORNO_VENCIDO, minutos_tolerancia: 30 },
    { id: 'en-curso', senderista_id: 's-2', estado: 'en_progreso', hora_inicio: PASADO, hora_retorno_estimada: RETORNO_VENCIDO, minutos_tolerancia: 30 },
  ];

  const ids = await repositorioConFilas(filas).marcarEnProgresoExpiradaComoAlerta();

  assert.deepEqual(ids, ['en-curso']);
  assert.equal(filas[0]?.estado, 'cancelada');
});

it('un tick completo no promueve, no alerta ni notifica una cancelada vencida', async () => {
  const filas: Fila[] = [
    { id: 'cancelada', senderista_id: 's-1', estado: 'cancelada', hora_inicio: PASADO, hora_retorno_estimada: RETORNO_VENCIDO, minutos_tolerancia: 30 },
  ];

  const resultado = await ejecutarTickFechaLimite(
    repositorioConFilas(filas),
    alertasContacto,
    alertasRescate,
  );

  assert.deepEqual(resultado, { promovidas: 0, enAlerta: 0, correosContacto: 0, correosRescate: 0 });
  assert.deepEqual(notificadas, []);
  assert.equal(filas[0]?.estado, 'cancelada');
  assert.equal(filas[0]?.actualizado_en, undefined);
});

it('control: en el mismo tick, una programada vencida sí se promueve y alerta', async () => {
  // Comprueba que el cliente en memoria permite al cron actuar; si no, las pruebas
  // anteriores pasarían sin demostrar nada.
  const filas: Fila[] = [
    { id: 'programada', senderista_id: 's-1', estado: 'programada', hora_inicio: PASADO, hora_retorno_estimada: RETORNO_VENCIDO, minutos_tolerancia: 30 },
  ];

  const resultado = await ejecutarTickFechaLimite(
    repositorioConFilas(filas),
    alertasContacto,
    alertasRescate,
  );

  assert.equal(resultado.promovidas, 1);
  assert.equal(resultado.enAlerta, 1);
  assert.deepEqual(notificadas, ['programada', 'programada']);
});
