import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IRepositorioOutbox } from '../../domain/repositories/IRepositorioOutbox.js';
import { AVISO_FICHA_MEDICA_CORREO } from '../mensajes/rescueAlertEmail.js';
import { ServicioAlertaRescate } from './servicioAlertaRescate.js';

const EXPEDICION = '11111111-1111-4111-8111-111111111111';
const PATRON_MEDICO = /Tipo de sangre|Alergias|Condiciones|Medicaci[oó]n|descifrada|O\+|penicilina/i;

describe('ServicioAlertaRescate (HU-50, CA-03)', () => {
  it('el mensaje encolado en la outbox no lleva etiquetas médicas y sí el aviso fijo', async () => {
    const guardados: Parameters<IRepositorioOutbox['guardar']>[0][] = [];
    const outbox = { guardar: async (m: Parameters<IRepositorioOutbox['guardar']>[0]) => void guardados.push(m) } as unknown as IRepositorioOutbox;
    const repoAlerta = {
      buscarContextoAlertaRescate: async () => ({
        expedicionId: EXPEDICION,
        senderistaId: '22222222-2222-4222-8222-222222222222',
        nombreCompletoSenderista: 'Senderista Ficticio',
        telefonoSenderista: '999999999',
        lugarInicio: 'Inicio',
        lugarFin: 'Destino',
        horaInicio: '2030-01-15T08:00:00.000Z',
        horaRetornoEstimada: '2030-01-15T14:00:00.000Z',
        fechaLimite: '2030-01-15T14:30:00.000Z',
        acompanantes: [],
        contactos: [],
        contactosEmergencia: [],
      }),
    };
    const repoRescate = {
      listarCorreosRescatistasValidados: async () => [
        { correoElectronico: 'a@example.invalid', nombreCompleto: 'Ana Ficticia' },
        { correoElectronico: 'b@example.invalid', nombreCompleto: 'Beto Ficticio' },
      ],
    };
    const despacho = { yaFueEnviado: async () => false, registrarEnvio: async () => undefined };
    const servicio = new ServicioAlertaRescate(repoAlerta as never, repoRescate as never, {} as never, despacho as never, outbox);

    const resultado = await servicio.notificarEquiposRescate(EXPEDICION);

    assert.equal(resultado.registrados, 2);
    assert.equal(guardados.length, 2);
    for (const mensaje of guardados) {
      assert.doesNotMatch(mensaje.cuerpo ?? '', PATRON_MEDICO);
      assert.doesNotMatch(mensaje.cuerpoHtml ?? '', PATRON_MEDICO);
      assert.doesNotMatch(mensaje.asunto ?? '', PATRON_MEDICO);
      assert.ok((mensaje.cuerpo ?? '').includes(AVISO_FICHA_MEDICA_CORREO));
      assert.ok((mensaje.cuerpoHtml ?? '').includes(AVISO_FICHA_MEDICA_CORREO));
    }
  });
});
