import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copiarPuntosParaPlanNuevo } from './puntosRuta';

const original = [
  { id: 'b0000000-0000-4000-8000-000000000002', nombre: 'Laguna', latitud: -9.1, longitud: -77.6, orden: 2 },
  { id: 'a0000000-0000-4000-8000-000000000001', nombre: 'Refugio', latitud: -9.2, longitud: -77.5, orden: 1 },
];

test('HU-28: copia los puntos en el mismo orden con ids nuevos sin modificar el origen', () => {
  const antes = structuredClone(original);
  let n = 0;
  const copia = copiarPuntosParaPlanNuevo(original, () => `nuevo-${++n}`);
  assert.deepEqual(copia.map((p) => [p.nombre, p.orden]), [['Refugio', 1], ['Laguna', 2]]);
  assert.deepEqual(copia.map((p) => p.id), ['nuevo-1', 'nuevo-2']);
  assert.ok(copia.every((p) => !original.some((o) => o.id === p.id)));
  copia[0].nombre = 'Cambio de la copia';
  assert.deepEqual(original, antes);
});

test('HU-28: conserva nombre y coordenadas', () => {
  const [primero] = copiarPuntosParaPlanNuevo(original);
  assert.equal(primero.nombre, 'Refugio');
  assert.equal(primero.latitud, -9.2);
  assert.equal(primero.longitud, -77.5);
});

test('HU-28: sin puntos devuelve lista vacía', () => {
  assert.deepEqual(copiarPuntosParaPlanNuevo([]), []);
});
