import { verificarContratoLectorEventosPlan } from '../../../testing/contratoLectorEventosPlan.js';
import { verificarContratoRegistroEventosPlan } from '../../../testing/contratoRegistroEventosPlan.js';
import { EventosPlanDAOMemoria } from './EventosPlanDAOMemoria.js';

const senderistaA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const senderistaB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const expedicionA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const expedicionB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function crearMemoria() {
  let ahora = new Date('2026-11-01T08:00:00.000Z');
  const fijarReloj = (fecha: Date) => { ahora = fecha; };
  return { dao: new EventosPlanDAOMemoria({ ahora: () => ahora }), fijarReloj, ahora: () => ahora };
}

verificarContratoLectorEventosPlan('Contrato ILectorEventosPlan: memoria', () => {
  const memoria = crearMemoria();
  return {
    lector: memoria.dao, senderistaA, senderistaB, expedicionA, expedicionB,
    async sembrar(instantes) {
      for (const grupo of instantes) {
        // Cada grupo comparte instante y ocurre un minuto después del anterior.
        memoria.fijarReloj(new Date(memoria.ahora().getTime() + 60_000));
        for (const evento of grupo) await memoria.dao.registrar(evento);
      }
    },
  };
});

verificarContratoRegistroEventosPlan('Contrato IRegistroEventosPlan: memoria', () => ({
  dao: crearMemoria().dao, senderistaA, expedicionA,
}));
