import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import type { DatosListaEquipo } from '../domain/entities/ListaEquipo.js';
import { RepositorioPreparacionExpedicionSupabase } from '../infrastructure/repositories/RepositorioPreparacionExpedicionSupabase.js';
import { clienteSupabasePostgresPruebas } from './clienteSupabasePostgresPruebas.js';
import { contextoPostgresEquipoPruebas } from './contextoPostgresEquipoPruebas.js';

/** Reutiliza usuarios/listas y limpieza de HU-30 en la misma base local desechable. */
export async function contextoPostgresPreparacionPruebas(pool: pg.Pool, t: TestContext) {
  const base = await contextoPostgresEquipoPruebas(pool, t);
  const expedicionA = randomUUID();
  const otraExpedicionA = randomUUID();
  const expedicionB = randomUUID();
  for (const [id, actor] of [[expedicionA, base.senderistaA], [otraExpedicionA, base.senderistaA], [expedicionB, base.senderistaB]]) {
    await pool.query(`INSERT INTO public.expediciones
      (id,senderista_id,lugar_inicio,lugar_fin,hora_inicio,hora_retorno_estimada)
      VALUES($1,$2,'Inicio ficticio','Destino ficticio',NOW()+INTERVAL '1 day',NOW()+INTERVAL '2 days')`, [id, actor]);
  }
  const listaA = await base.dao.crear(base.senderistaA, {
    nombre: 'Montaña', items: [
      { nombre: 'Casco', obligatorio: true }, { nombre: 'Cámara', obligatorio: false }, { nombre: 'Agua', obligatorio: true },
    ],
  });
  const listaB = await base.dao.crear(base.senderistaB, { nombre: 'Equipo de B', items: [{ nombre: 'Botas', obligatorio: true }] });
  const listaVaciaA = await base.dao.crear(base.senderistaA, { nombre: 'Vacía', items: [] });
  return {
    dao: new RepositorioPreparacionExpedicionSupabase(clienteSupabasePostgresPruebas(pool)),
    listasDAO: base.dao,
    senderistaA: base.senderistaA, senderistaB: base.senderistaB,
    expedicionA, otraExpedicionA, expedicionB, listaA, listaB, listaVaciaA,
    async cambiarEstado(expedicionId: string, estado: string): Promise<void> {
      await pool.query('UPDATE public.expediciones SET estado=$2 WHERE id=$1', [expedicionId, estado]);
    },
    async actualizarLista(actor: string, listaId: string, datos: DatosListaEquipo): Promise<void> {
      if (!(await base.dao.actualizar(actor, listaId, datos))) throw new Error('Lista ficticia no encontrada.');
    },
    async eliminarLista(actor: string, listaId: string): Promise<void> {
      if (!(await base.dao.eliminar(actor, listaId))) throw new Error('Lista ficticia no encontrada.');
    },
  };
}
