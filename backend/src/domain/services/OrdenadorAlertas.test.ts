import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrdenadorAlertas } from './OrdenadorAlertas.js';
import type { AlertaPriorizable, IEstrategiaPrioridad } from '../strategies/IEstrategiaPrioridad.js';
import { PorTiempoExcedido } from '../strategies/PorTiempoExcedido.js';
import { PorTamanoGrupo } from '../strategies/PorTamanoGrupo.js';

const alertas = Object.freeze([
  Object.freeze({ expedicionId: 'c', fechaLimite: '2030-01-15T11:00:00Z', numeroParticipantes: 8, estado: 'alerta' }),
  Object.freeze({ expedicionId: 'b', fechaLimite: '2030-01-15T10:00:00Z', numeroParticipantes: 2, estado: 'alerta' }),
  Object.freeze({ expedicionId: 'a', fechaLimite: '2030-01-15T10:00:00Z', numeroParticipantes: 2, estado: 'alerta' }),
]);

const ids = (items: readonly AlertaPriorizable[]) => items.map((item) => item.expedicionId);
const estrategias: [string, IEstrategiaPrioridad][] = [
  ['tiempo excedido', new PorTiempoExcedido()],
  ['tamaño del grupo', new PorTamanoGrupo()],
];

describe('HU-43: Strategy para ordenar alertas', () => {
  it('prioriza el plazo más antiguo, con desempate por id', () => {
    assert.deepEqual(ids(new OrdenadorAlertas(new PorTiempoExcedido()).ordenar(alertas)), ['a', 'b', 'c']);
  });

  it('prioriza el grupo mayor, con desempate por fecha límite y después id', () => {
    const reciente = { expedicionId: 'd', fechaLimite: '2030-01-15T12:00:00Z', numeroParticipantes: 2 };
    assert.deepEqual(ids(new OrdenadorAlertas(new PorTamanoGrupo()).ordenar([reciente, ...alertas])), ['c', 'a', 'b', 'd']);
  });

  it('compara instantes exactos aunque tengan distintos husos y el mismo minuto redondeado', () => {
    const items = [
      { expedicionId: 'a', fechaLimite: '2030-01-15T10:00:20Z', numeroParticipantes: 1 },
      { expedicionId: 'b', fechaLimite: '2030-01-15T05:00:10-05:00', numeroParticipantes: 1 },
    ];
    assert.deepEqual(ids(new OrdenadorAlertas(new PorTiempoExcedido()).ordenar(items)), ['b', 'a']);
  });

  it('permite sustituir la estrategia y conserva los desempates comunes', () => {
    const estrategia: IEstrategiaPrioridad = { comparar: () => 0 };
    assert.deepEqual(ids(new OrdenadorAlertas(estrategia).ordenar(alertas)), ['a', 'b', 'c']);
  });

  it('respeta los grupos operativos del monitor antes del criterio elegido', () => {
    const items = [
      { ...alertas[0]!, grupo: 2 },
      { ...alertas[1]!, grupo: 1 },
      { ...alertas[2]!, grupo: 0 },
    ];
    assert.deepEqual(ids(new OrdenadorAlertas(new PorTamanoGrupo()).ordenar(items, (item) => item.grupo)), ['a', 'b', 'c']);
  });

  for (const [nombre, estrategia] of estrategias) {
    describe(nombre, () => {
      const ordenador = new OrdenadorAlertas(estrategia);

      it('conserva exactamente el conjunto y los objetos sin alterar estados ni plazos', () => {
        const original = structuredClone(alertas);
        const ordenadas = ordenador.ordenar(alertas);
        assert.notEqual(ordenadas, alertas);
        assert.deepEqual([...ids(ordenadas)].sort(), [...ids(alertas)].sort());
        assert.deepEqual(alertas, original);
        for (const item of ordenadas) assert.ok(alertas.includes(item));
      });

      it('resuelve los empates igual para todas las permutaciones de entrada', () => {
        const esperado = ids(ordenador.ordenar(alertas));
        for (let indice = 0; indice < alertas.length; indice += 1) {
          const rotadas = [...alertas.slice(indice), ...alertas.slice(0, indice)];
          assert.deepEqual(ids(ordenador.ordenar(rotadas)), esperado);
          assert.deepEqual(ids(ordenador.ordenar(rotadas.reverse())), esperado);
        }
      });

      it('acepta listas vacías y alertas individuales', () => {
        assert.deepEqual(ordenador.ordenar([]), []);
        assert.deepEqual(ordenador.ordenar([alertas[0]!]), [alertas[0]]);
      });
    });
  }
});
