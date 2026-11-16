import type { IReloj } from '../../domain/services/IReloj.js';

export class RelojSistema implements IReloj {
  ahora(): Date {
    return new Date();
  }
}
