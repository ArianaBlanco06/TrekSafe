export interface IReloj {
  ahora(): Date;
}

export class RelojSistema implements IReloj {
  ahora(): Date {
    return new Date();
  }
}
