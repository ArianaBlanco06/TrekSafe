import { verificarContratoEventosPlanDAO } from '../../../testing/contratoEventosPlanDAO.js';
import { EventosPlanDAOMemoria } from './EventosPlanDAOMemoria.js';

verificarContratoEventosPlanDAO('Contrato IEventosPlanDAO: memoria', () => {
  let ahora = new Date('2026-11-01T08:00:00.000Z');
  return {
    dao: new EventosPlanDAOMemoria({ ahora: () => ahora }),
    senderistaA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    senderistaB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    expedicionA: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    expedicionB: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    fijarReloj(iso) { ahora = new Date(iso); },
  };
});
