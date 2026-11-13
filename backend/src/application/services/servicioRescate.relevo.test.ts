import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

// El servicio importa módulos que leen el entorno al construirse; se fija antes de cargarlos.
Object.assign(process.env, {
  NODE_ENV: 'test',
  SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture',
  JWT_SECRET: 'secreto-ficticio-relevo-0000000000000000',
  MEDICAL_ENCRYPTION_KEY: 'secreto-medico-ficticio-0000000000000',
});

const { ServicioRescate } = await import('./servicioRescate.js');
const { IncidenteDAOMemoria } = await import('../../infrastructure/repositories/memoria/IncidenteDAOMemoria.js');

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // responsable
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // destinatario
const CARLA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const E_RELEVO = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'; // en alerta, relevo pendiente de Ana a Beto
const E_SIN = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2'; // en alerta, coordina Ana sin relevo

const MIN = 60_000;
const fila = (id: string) => ({
  id,
  estado: 'alerta' as const,
  lugarInicio: 'Inicio',
  lugarFin: 'Destino',
  coordenadasInicio: null,
  coordenadasFin: null,
  horaInicio: new Date(Date.now() - 300 * MIN).toISOString(),
  horaRetornoEstimada: new Date(Date.now() - 120 * MIN).toISOString(),
  minutosTolerancia: 30,
  actualizadoEn: new Date(Date.now() - 60 * MIN).toISOString(),
  senderista: { nombreCompleto: 'Senderista Ficticio', telefono: '999999999' },
});

const PATRON_MEDICO = /sangre|alergi|condicion|medicament|salud|consentimiento/i;

describe('ServicioRescate: relevoPendiente en la coordinación (HU-40)', () => {
  let servicio: InstanceType<typeof ServicioRescate>;

  beforeEach(async () => {
    const incidentes = new IncidenteDAOMemoria(
      new Map([[ANA, 'Ana Rescate'], [BETO, 'Beto Rescate'], [CARLA, 'Carla Rescate']]),
      new Map(),
    );
    for (const [i, exp] of [E_RELEVO, E_SIN].entries()) {
      incidentes.sembrar({
        id: `00000000-0000-4000-8000-00000000000${i + 1}`, expedicionId: exp, estado: 'abierto', version: 1,
        responsableId: ANA, nombreResponsable: 'Ana Rescate', asumidoEn: '2030-01-15T12:00:00.000Z',
      });
    }
    await incidentes.proponerRelevo({
      expedicionId: E_RELEVO, rescatistaId: ANA, destinatarioId: BETO,
      motivo: 'Cambio de turno', versionIncidente: 1, operacionId: crypto.randomUUID(),
    });

    const repo = {
      verificarEsRescatista: async () => undefined,
      listarExpedicionesMonitor: async () => [fila(E_RELEVO), fila(E_SIN)],
      listarExpedicionesEnAlerta: async () => [fila(E_RELEVO), fila(E_SIN)],
      buscarConfirmacionesPorExpediciones: async () => new Map(),
      buscarConfirmacion: async () => null,
      buscarExpedicionEnAlerta: async (id: string) => fila(id),
    };
    const repoAlerta = {
      buscarContextoAlertaRescate: async (id: string) => ({
        expedicionId: id,
        senderistaId: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
        nombreCompletoSenderista: 'Senderista Ficticio',
        telefonoSenderista: '999999999',
        lugarInicio: 'Inicio',
        lugarFin: 'Destino',
        coordenadasInicio: null,
        coordenadasFin: null,
        horaInicio: new Date().toISOString(),
        horaRetornoEstimada: new Date().toISOString(),
        minutosTolerancia: 30,
        fechaLimite: new Date().toISOString(),
        acompanantes: [],
        contactos: [],
        contactosEmergencia: [],
      }),
    };
    servicio = new ServicioRescate(
      repo as never,
      repoAlerta as never,
      incidentes,
    );
  });

  it('las tres lecturas de la consola informan el relevo pendiente donde lo hay y nada donde no', async () => {
    const [expediciones, alertas, detalle, detalleSin] = await Promise.all([
      servicio.listarExpediciones(CARLA),
      servicio.listarAlertas(CARLA),
      servicio.obtenerDetalleAlerta(CARLA, E_RELEVO),
      servicio.obtenerDetalleAlerta(CARLA, E_SIN),
    ]);
    for (const coordinacion of [
      expediciones.find((i) => i.expedicionId === E_RELEVO)?.coordinacion,
      alertas.find((i) => i.expedicionId === E_RELEVO)?.coordinacion,
      detalle.coordinacion,
    ]) {
      assert.equal(coordinacion?.relevoPendiente?.destinatarioId, BETO);
      assert.equal(coordinacion?.relevoPendiente?.nombreDestinatario, 'Beto Rescate');
      assert.equal(coordinacion?.relevoPendiente?.esParaMi, false);
    }
    assert.equal('relevoPendiente' in (detalleSin.coordinacion ?? {}), false);
    assert.equal('relevoPendiente' in (expediciones.find((i) => i.expedicionId === E_SIN)?.coordinacion ?? {}), false);
  });

  it('un tercero no ve el motivo; el responsable y el destinatario sí', async () => {
    const comoCarla = (await servicio.obtenerDetalleAlerta(CARLA, E_RELEVO)).coordinacion?.relevoPendiente;
    const comoAna = (await servicio.obtenerDetalleAlerta(ANA, E_RELEVO)).coordinacion?.relevoPendiente;
    const comoBeto = (await servicio.obtenerDetalleAlerta(BETO, E_RELEVO)).coordinacion?.relevoPendiente;
    assert.equal('motivo' in (comoCarla ?? {}), false);
    assert.equal(comoAna?.motivo, 'Cambio de turno');
    assert.equal(comoBeto?.motivo, 'Cambio de turno');
    assert.equal(comoBeto?.esParaMi, true);
  });

  it('la coordinación del relevo no incluye datos médicos', async () => {
    const coordinacion = (await servicio.obtenerDetalleAlerta(BETO, E_RELEVO)).coordinacion;
    assert.ok(!PATRON_MEDICO.test(JSON.stringify(coordinacion)));
  });
});
