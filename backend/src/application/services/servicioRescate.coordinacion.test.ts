import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

// El servicio importa módulos que leen el entorno al construirse; se fija antes de cargarlos.
Object.assign(process.env, {
  NODE_ENV: 'test',
  SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture',
  JWT_SECRET: 'secreto-ficticio-coordinacion-000000000',
  MEDICAL_ENCRYPTION_KEY: 'secreto-medico-ficticio-0000000000000',
});

const { ServicioRescate } = await import('./servicioRescate.js');
const { IncidenteDAOMemoria } = await import('../../infrastructure/repositories/memoria/IncidenteDAOMemoria.js');
type Coordinacion = import('../../domain/repositories/IIncidenteDAO.js').Coordinacion;

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const E_CON = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'; // en alerta, coordina Ana
const E_SIN = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2'; // en alerta, sin responsable
const E_VERDE = 'e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3'; // en progreso
const E_CERRADO = 'e4e4e4e4-e4e4-4e4e-8e4e-e4e4e4e4e4e4'; // alerta con un incidente cerrado

const MIN = 60_000;
const fila = (id: string, estado: 'en_progreso' | 'alerta') => ({
  id,
  estado,
  lugar_inicio: 'Inicio',
  lugar_fin: 'Destino',
  coordenadas_inicio: null,
  coordenadas_fin: null,
  hora_inicio: new Date(Date.now() - 300 * MIN).toISOString(),
  hora_retorno_estimada: new Date(Date.now() - 120 * MIN).toISOString(),
  minutos_tolerancia: 30,
  actualizado_en: new Date(Date.now() - 60 * MIN).toISOString(),
  perfiles_senderista: { nombre_completo: 'Senderista Ficticio', telefono: '999999999' },
});

const CLAVES_COORDINACION = ['asumidoEn', 'esMia', 'incidenteId', 'nombreResponsable', 'responsableId', 'version'];
const PATRON_MEDICO = /sangre|alergi|condicion|medicament|ficha|salud|consentimiento/i;

/** DAO en memoria que cuenta las lecturas de coordinaciones. */
class IncidentesEspia extends IncidenteDAOMemoria {
  lecturas: (readonly string[])[] = [];
  override async leerCoordinaciones(ids: readonly string[], rescatistaId: string) {
    this.lecturas.push(ids);
    return super.leerCoordinaciones(ids, rescatistaId);
  }
}

describe('ServicioRescate: campo coordinacion (HU-39, CA-03)', () => {
  let incidentes: IncidentesEspia;
  let servicio: InstanceType<typeof ServicioRescate>;
  let leidasDeFichaMedica = 0;

  beforeEach(() => {
    leidasDeFichaMedica = 0;
    incidentes = new IncidentesEspia(new Map(), new Map());
    incidentes.sembrar({
      id: '00000000-0000-4000-8000-000000000001', expedicionId: E_CON, estado: 'abierto', version: 1,
      responsableId: ANA, nombreResponsable: 'Ana Rescate', asumidoEn: '2030-01-15T12:00:00.000Z',
    });
    incidentes.sembrar({
      id: '00000000-0000-4000-8000-000000000002', expedicionId: E_CERRADO, estado: 'cerrado', version: 4,
      responsableId: BETO, nombreResponsable: 'Beto Rescate', asumidoEn: '2030-01-15T10:00:00.000Z',
    });

    const repo = {
      verificarEsRescatista: async () => undefined,
      listarExpedicionesMonitor: async () => [fila(E_CON, 'alerta'), fila(E_SIN, 'alerta'), fila(E_VERDE, 'en_progreso'), fila(E_CERRADO, 'alerta')],
      listarExpedicionesEnAlerta: async () => [fila(E_CON, 'alerta'), fila(E_SIN, 'alerta'), fila(E_CERRADO, 'alerta')],
      buscarConfirmacionesPorExpediciones: async () => new Map(),
      buscarConfirmacion: async () => null,
      buscarExpedicionEnAlerta: async (id: string) => fila(id, 'alerta'),
    };
    const repoAlerta = {
      buscarContextoAlertaRescate: async (id: string) =>
        id === E_CON || id === E_SIN
          ? {
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
            }
          : null,
    };
    const repoUsuario = {
      obtenerFichaMedica: async () => {
        leidasDeFichaMedica += 1;
        return null;
      },
    };
    const repoAuditoria = { registrarAcceso: async () => undefined };

    servicio = new ServicioRescate(
      repo as never,
      repoAlerta as never,
      repoUsuario as never,
      repoAuditoria as never,
      incidentes,
    );
  });

  it('GET /rescate/expediciones: una sola lectura para todas las expediciones, null donde no hay incidente vigente', async () => {
    const items = await servicio.listarExpediciones(BETO);

    assert.equal(incidentes.lecturas.length, 1, 'sin N+1');
    assert.deepEqual([...incidentes.lecturas[0]!].sort(), [E_CON, E_SIN, E_VERDE, E_CERRADO].sort());
    const porId = new Map(items.map((i) => [i.expedicionId, i.coordinacion]));
    assert.equal(porId.get(E_SIN), null);
    assert.equal(porId.get(E_VERDE), null, 'una expedición en curso no tiene coordinación');
    assert.equal(porId.get(E_CERRADO), null, 'un incidente cerrado no es coordinación vigente');
    assert.equal(porId.get(E_CON)?.responsableId, ANA);
    assert.equal(porId.get(E_CON)?.nombreResponsable, 'Ana Rescate');
  });

  it('GET /rescate/alertas: una sola lectura y esMia depende de quien consulta', async () => {
    const comoAna = await servicio.listarAlertas(ANA);
    const comoBeto = await servicio.listarAlertas(BETO);

    assert.equal(incidentes.lecturas.length, 2, 'una lectura por lista');
    assert.equal(comoAna.find((i) => i.expedicionId === E_CON)?.coordinacion?.esMia, true);
    assert.equal(comoBeto.find((i) => i.expedicionId === E_CON)?.coordinacion?.esMia, false);
    assert.equal(comoBeto.find((i) => i.expedicionId === E_SIN)?.coordinacion, null);
  });

  it('GET /rescate/alertas/:id: coordinacion del detalle, o null, con una sola lectura', async () => {
    const con = await servicio.obtenerDetalleAlerta(BETO, E_CON);
    assert.deepEqual(incidentes.lecturas, [[E_CON]]);
    assert.equal(con.coordinacion?.nombreResponsable, 'Ana Rescate');
    assert.equal(con.coordinacion?.esMia, false);

    const sin = await servicio.obtenerDetalleAlerta(BETO, E_SIN);
    assert.equal(sin.coordinacion, null);
  });

  it('CA-03: coordinacion tiene exactamente las seis claves del contrato y ningún dato médico', async () => {
    const [expediciones, alertas, detalle] = await Promise.all([
      servicio.listarExpediciones(BETO),
      servicio.listarAlertas(BETO),
      servicio.obtenerDetalleAlerta(BETO, E_CON),
    ]);
    const coordinaciones: Coordinacion[] = [
      expediciones.find((i) => i.expedicionId === E_CON)?.coordinacion,
      alertas.find((i) => i.expedicionId === E_CON)?.coordinacion,
      detalle.coordinacion,
    ].filter((c): c is Coordinacion => c !== null && c !== undefined);

    assert.equal(coordinaciones.length, 3);
    for (const c of coordinaciones) {
      assert.deepEqual(Object.keys(c).sort(), CLAVES_COORDINACION);
      assert.ok(!PATRON_MEDICO.test(JSON.stringify(c)), `coordinacion con datos médicos: ${JSON.stringify(c)}`);
    }
  });

  it('leer coordinaciones no consulta la ficha médica: ni la lista ni el monitor la leen', async () => {
    await servicio.listarExpediciones(BETO);
    await servicio.listarAlertas(BETO);
    assert.equal(leidasDeFichaMedica, 0);
  });
});
