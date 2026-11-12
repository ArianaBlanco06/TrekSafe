import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RepositorioExpedicion } from './RepositorioExpedicion.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
const input = { lugarInicio: 'Inicio', lugarFin: 'Destino', horaInicio: '2035-01-01T10:00:00Z', horaRetornoEstimada: '2035-01-01T15:00:00Z', minutosTolerancia: 30, estado: 'programada' as const, idsContactos: ['11111111-1111-4111-8111-111111111111'], nombresAcompanantes: ['Acompañante'] };
const adapter = (error: unknown, data: unknown = null) => new RepositorioExpedicion({ rpc: async () => ({ data, error }) } as never);
describe('DEP-108 crear expedición mediante RPC única', () => {
    it('normaliza coordenadas y transmite una sola RPC sin escrituras compensatorias', async () => {
        const calls: unknown[] = [];
        const row = { id: 'expedicion', estado: 'programada', version: 1, lugar_inicio: 'Inicio', hora_inicio: input.horaInicio };
        const repo = new RepositorioExpedicion({ rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { data: row, error: null }; }, from: () => { throw new Error('No debe escribir por tablas'); } } as never);
        const resultado = await repo.crearExpedicion('actor', { ...input, coordenadasInicio: '-12,-77' });
        assert.equal(resultado.lugarInicio, 'Inicio');
        assert.equal(resultado.horaInicio, input.horaInicio);
        assert.equal('lugar_inicio' in resultado, false);
        assert.equal(calls.length, 1);
        assert.equal((calls[0] as [
            string,
            unknown
        ])[0], 'treksafe_crear_expedicion');
        assert.equal(((calls[0] as [
            string,
            {
                p_datos: {
                    coordenadasInicio: string;
                };
            }
        ])[1]).p_datos.coordenadasInicio, '-12.00000, -77.00000');
    });
    for (const [code, status] of [['EXPEDICION_ACTIVA_EXISTE', 409], ['CONTACTOS_INVALIDOS', 400], ['HORA_INICIO_INVALIDA', 400], ['HORA_RETORNO_INVALIDA', 400], ['NO_ES_SENDERISTA', 403], ['DATOS_INVALIDOS', 400]] as const)
        it(`conserva el error ${code}`, async () => {
            await assert.rejects(() => adapter({ code: 'P0001', message: code }).crearExpedicion('actor', input), (e: unknown) => e instanceof ErrorAplicacion && e.codigoEstado === status);
        });
    it('mapea solo la violación de unicidad bloqueante a conflicto', async () => {
        await assert.rejects(() => adapter({ code: '23505', message: 'duplicate key violates uq_expedicion_bloqueante_senderista' }).crearExpedicion('actor', input), (e: unknown) => e instanceof ErrorAplicacion && e.codigo === 'EXPEDICION_ACTIVA_EXISTE');
        await assert.rejects(() => adapter({ code: '23505', message: 'duplicate another_constraint' }).crearExpedicion('actor', input), (e: unknown) => e instanceof ErrorAplicacion && e.codigoEstado === 500);
    });
    for (const code of ['PGRST202', '42883'])
        it(`${code} falla explícitamente sin fallback`, async () => {
            await assert.rejects(() => adapter({ code, message: 'No existe RPC' }).crearExpedicion('actor', input), /migración de creación transaccional/);
        });
    it('rechaza respuesta de RPC inválida sin devolver un éxito', async () => {
        await assert.rejects(() => adapter(null, {}).crearExpedicion('actor', input), /Respuesta inválida/);
    });
});
