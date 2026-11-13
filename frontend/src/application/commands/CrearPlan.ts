import type { IColaLocal } from '@/application/ports/IColaLocal';
import { ErrorEnvioPlan, type EnviarPlan } from '@/application/ports/ICreadorPlanRemoto';

export class CrearPlan {
  constructor(private readonly cola: IColaLocal, private readonly enviar: EnviarPlan,
    private readonly sesionVigente: () => boolean, private readonly ahora = Date.now) {}
  async ejecutar(id: string, revisado: boolean) {
    if (!this.sesionVigente()) throw new Error('La sesión cambió.');
    const borrador = await this.cola.actualizar(id, actual => {
      if (actual.estado === 'sincronizado') return actual;
      if (!actual.envioIncierto) {
        if (!revisado) throw new Error('Revisa las fechas y los contactos antes de enviar.');
        const inicio = Date.parse(actual.horaInicio); const retorno = Date.parse(actual.horaRetornoEstimada);
        if (!Number.isFinite(inicio) || !Number.isFinite(retorno) || inicio <= this.ahora() || retorno <= inicio) {
          throw new Error('El borrador tiene fechas vencidas o inválidas. Corrígelo antes de enviar.');
        }
      }
      return { ...actual, envioIncierto: true, estado: 'pendiente', error: undefined };
    });
    if (borrador.estado === 'sincronizado') return borrador;
    try {
      if (!this.sesionVigente()) throw new Error('La sesión cambió.');
      const { expedicion } = await this.enviar(borrador);
      if (!this.sesionVigente()) throw new Error('La sesión cambió.');
      return await this.cola.actualizar(id, actual => ({ ...actual, estado: 'sincronizado',
        expedicionId: expedicion.id, envioIncierto: false, error: undefined,
        idsContactos: [], nombresAcompanantes: [] }));
    } catch (error) {
      if (this.sesionVigente()) {
        const rechazoDefinitivo = error instanceof ErrorEnvioPlan && error.rechazoConfirmado;
        await this.cola.actualizar(id, actual => ({ ...actual, estado: 'error', envioIncierto: !rechazoDefinitivo,
          error: error instanceof Error ? error.message : 'No se pudo confirmar el envío.' }));
      }
      throw error;
    }
  }
}
