import assert from 'node:assert/strict';
import { it, type TestContext } from 'node:test';
import { crearConsultasPeriodicas } from './consultasPeriodicas';

const resolverMicrotareas = async () => { for (let n = 0; n < 4; n += 1) await Promise.resolve(); };
function fixture(t: TestContext) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let visible = true;
  let sesion = 'cuenta-A:sesion-1';
  const eventos = new EventTarget();
  const gestor = crearConsultasPeriodicas({
    visible: () => visible,
    sesion: () => sesion,
    alCambiarVisibilidad(listener) {
      eventos.addEventListener('visibilitychange', listener);
      return () => eventos.removeEventListener('visibilitychange', listener);
    },
  });
  t.after(() => gestor.vaciar());
  return {
    gestor,
    cambiarSesion: (valor: string) => { sesion = valor; },
    visibilidad: (valor: boolean) => { visible = valor; eventos.dispatchEvent(new Event('visibilitychange')); },
  };
}
function diferida<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((res) => { resolver = res; });
  return { promesa, resolver };
}

it('comparte carga y resultado entre dos consumidores del mismo recurso y sesión', async (t) => {
  const { gestor } = fixture(t);
  let peticiones = 0;
  const datos: number[] = [];
  const cargar = async () => ++peticiones;
  const uno = gestor.suscribir('alertas', cargar, { datos: (v) => datos.push(v) });
  const dos = gestor.suscribir('alertas', cargar, { datos: (v) => datos.push(v) });
  await resolverMicrotareas();
  assert.equal(peticiones, 1);
  assert.deepEqual(datos, [1, 1]);
  let cargando: boolean | undefined;
  const tres = gestor.suscribir('alertas', cargar, { datos() {}, cargando: (v) => { cargando = v; } });
  assert.equal(cargando, false, 'un consumidor que recibe datos ya cargados termina su estado de carga');
  t.mock.timers.tick(30_000);
  await resolverMicrotareas();
  assert.equal(peticiones, 2);
  uno.cancelar(); dos.cancelar(); tres.cancelar();
  t.mock.timers.tick(90_000);
  assert.equal(peticiones, 2);
});

it('no solapa ticks con una consulta lenta y refresca una vez después de una mutación', async (t) => {
  const { gestor } = fixture(t);
  const pendiente = diferida<number>();
  let peticiones = 0;
  const datos: number[] = [];
  const suscripcion = gestor.suscribir('alertas', async () => ++peticiones === 1 ? pendiente.promesa : 2, { datos: (v) => datos.push(v) });
  t.mock.timers.tick(90_000);
  suscripcion.refrescar(); suscripcion.refrescar();
  assert.equal(peticiones, 1);
  pendiente.resolver(1);
  await resolverMicrotareas();
  assert.equal(peticiones, 2);
  assert.deepEqual(datos, [2], 'el resultado anterior a la mutación no se publica');
});

it('ocultar aborta la lectura, ignora su respuesta y reanuda inmediatamente al volver visible', async (t) => {
  const { gestor, visibilidad } = fixture(t);
  const pendiente = diferida<number>();
  const señales: AbortSignal[] = [];
  const datos: number[] = [];
  gestor.suscribir('alertas', (signal) => {
    señales.push(signal);
    return señales.length === 1 ? pendiente.promesa : Promise.resolve(2);
  }, { datos: (v) => datos.push(v) });
  visibilidad(false);
  assert.equal(señales[0].aborted, true);
  t.mock.timers.tick(300_000);
  assert.equal(señales.length, 1);
  pendiente.resolver(1);
  await resolverMicrotareas();
  assert.deepEqual(datos, []);
  visibilidad(true);
  await resolverMicrotareas();
  assert.deepEqual(datos, [2]);
});

it('una respuesta de otra sesión no se publica ni se reutiliza para la cuenta nueva', async (t) => {
  const { gestor, cambiarSesion } = fixture(t);
  const pendiente = diferida<number>();
  const datosA: number[] = [];
  const datosB: number[] = [];
  gestor.suscribir('alertas', () => pendiente.promesa, { datos: (v) => datosA.push(v) });
  cambiarSesion('cuenta-B:sesion-2');
  gestor.suscribir('alertas', async () => 2, { datos: (v) => datosB.push(v) });
  pendiente.resolver(1);
  await resolverMicrotareas();
  assert.deepEqual(datosA, []);
  assert.deepEqual(datosB, [2]);
});

it('separa filtros y no conserva datos después de que salga el último consumidor', async (t) => {
  const { gestor } = fixture(t);
  let peticiones = 0;
  const cargar = async () => ++peticiones;
  const primera = gestor.suscribir('consola:tiempo', cargar, { datos() {} });
  gestor.suscribir('consola:grupo', cargar, { datos() {} });
  await resolverMicrotareas();
  assert.equal(peticiones, 2);
  primera.cancelar();
  gestor.suscribir('consola:tiempo', cargar, { datos() {} });
  await resolverMicrotareas();
  assert.equal(peticiones, 3);
});

it('un fallo de red informa error, conserva sesión y permite recuperar en el siguiente tick', async (t) => {
  const { gestor } = fixture(t);
  let consultas = 0;
  const errores: unknown[] = [];
  const datos: number[] = [];
  gestor.suscribir('alertas', async () => {
    if (++consultas === 1) throw new Error('red interrumpida');
    return 2;
  }, { datos: (v) => datos.push(v), error: (e) => errores.push(e) });
  await resolverMicrotareas();
  assert.equal(errores.length, 1);
  t.mock.timers.tick(30_000);
  await resolverMicrotareas();
  assert.deepEqual(datos, [2]);
});

it('cancelar dos veces una suscripción vieja no retira una consulta nueva de la misma clave', async (t) => {
  const { gestor } = fixture(t);
  let consultas = 0;
  const cargar = async () => ++consultas;
  const anterior = gestor.suscribir('alertas', cargar, { datos() {} });
  await resolverMicrotareas();
  anterior.cancelar();
  gestor.suscribir('alertas', cargar, { datos() {} });
  await resolverMicrotareas();
  anterior.cancelar(); anterior.refrescar();
  gestor.suscribir('alertas', cargar, { datos() {} });
  await resolverMicrotareas();
  assert.equal(consultas, 2, 'el tercer consumidor reutiliza la entrada nueva');
});
