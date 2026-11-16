import type { BorradorExpedicion } from './IColaLocal';

export type EnviarPlan = (borrador: BorradorExpedicion) => Promise<{ expedicion: { id: string } }>;
export class ErrorEnvioPlan extends Error {
  constructor(message: string, public readonly rechazoConfirmado: boolean) { super(message); }
}
