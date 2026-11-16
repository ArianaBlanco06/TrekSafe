import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RepositorioExpedicion, mapearExpedicionActivaPersistida } from './RepositorioExpedicion.js';
import { RepositorioRescate } from './RepositorioRescate.js';
import { RepositorioAutenticacionPostgres } from './RepositorioAutenticacionPostgres.js';

const expedicion = {
  id: 'expedicion', lugar_inicio: 'Inicio', lugar_fin: 'Destino',
  hora_inicio: '2030-01-01T10:00:00Z', hora_retorno_estimada: '2030-01-01T14:00:00Z',
  minutos_tolerancia: 30, estado: 'alerta', version: 2,
  creado_en: '2030-01-01T08:00:00Z', actualizado_en: '2030-01-01T15:00:00Z',
};
const perfil = { nombre_completo: 'Persona ficticia', telefono: '999999999' };
const bitacora = {
  id: 'bitacora', expedicion_id: 'expedicion', estado_rescate: 'en_busqueda',
  actualizado_en: '2030-01-01T15:30:00Z', notas: null,
};

/** Responde como PostgREST, manteniendo las filas SQL dentro del adaptador. */
function clienteConDatos(datos: unknown): SupabaseClient {
  const respuesta = { data: datos, error: null };
  const consulta: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(respuesta).then(resolve),
  };
  for (const metodo of ['select', 'eq', 'in', 'order', 'ilike', 'insert', 'update', 'maybeSingle', 'single']) {
    consulta[metodo] = () => consulta;
  }
  return { from: () => consulta, rpc: async()=>respuesta } as unknown as SupabaseClient;
}

function sinColumnasSql(valor: unknown) {
  if (valor === null || typeof valor !== 'object') return;
  for (const [clave, contenido] of Object.entries(valor)) {
    assert.ok(!clave.includes('_'), `La lectura de negocio filtró la columna ${clave}`);
    sinColumnasSql(contenido);
  }
}

it('todas las lecturas de expedición normalizan columnas y el agregado elimina joins y cuenta ampliaciones', async () => {
  const lista = new RepositorioExpedicion(clienteConDatos([expedicion]));
  const porId = new RepositorioExpedicion(clienteConDatos(expedicion));
  const valores = [
    await lista.listarExpediciones('actor'),
    await lista.listarExpedicionesCompletadas('actor'),
    await porId.buscarPorIdParaSenderista('expedicion', 'actor'),
    await porId.completarConfirmacionRetorno('expedicion', 'actor'),
  ];
  for (const valor of valores) sinColumnasSql(valor);
  assert.equal((valores[0] as { lugarFin: string }[])[0]?.lugarFin, 'Destino');
  const activa = mapearExpedicionActivaPersistida({
    ...expedicion,
    acompanantes_expedicion: [{ nombre_acompanante: 'Acompañante ficticio' }],
    vinculos_expedicion_contacto: [
      { contactos_emergencia: null },
      { contactos_emergencia: { nombre_completo: 'Contacto ficticio', correo_electronico: 'ficticio@example.invalid' } },
    ],
    eventos_plan: [{ tipo: 'RETORNO_AMPLIADO' }, { tipo: 'PLAN_EDITADO' }, { tipo: 'RETORNO_AMPLIADO' }],
  });
  assert.deepEqual(activa.acompanantes, ['Acompañante ficticio']);
  assert.deepEqual(activa.contactos, [{ nombreCompleto: 'Contacto ficticio', correoElectronico: 'ficticio@example.invalid' }]);
  assert.equal(activa.cantidadAmpliaciones, 2);
  sinColumnasSql(activa);
});

it('rescate resuelve perfiles objeto, array, vacío y null sin exponer la relación SQL', async () => {
  for (const relacion of [perfil, [perfil], [], null]) {
    const fila = { ...expedicion, perfiles_senderista: relacion, coordenadas_inicio: null, coordenadas_fin: '1,2' };
    const listas = new RepositorioRescate(clienteConDatos([fila]));
    const detalle = new RepositorioRescate(clienteConDatos(fila));
    const lecturas = [
      (await listas.listarExpedicionesMonitor())[0],
      (await listas.listarExpedicionesEnAlerta())[0],
      await detalle.buscarExpedicionEnAlerta('expedicion'),
    ];
    for (const lectura of lecturas) {
      assert.deepEqual(lectura?.senderista, relacion === perfil || (Array.isArray(relacion) && relacion.length)
        ? { nombreCompleto: 'Persona ficticia', telefono: '999999999' } : null);
      sinColumnasSql(lectura);
    }
  }
});

it('bitácoras e historial usan las mismas lecturas normalizadas en consulta y actualización', async () => {
  const una = new RepositorioRescate(clienteConDatos(bitacora));
  const varias = new RepositorioRescate(clienteConDatos([bitacora]));
  const historial = new RepositorioRescate(clienteConDatos([
    { ...bitacora, expediciones: { ...expedicion, perfiles_senderista: [perfil] } },
    { ...bitacora, expediciones: null },
  ]));
  const valores = [
    await una.buscarConfirmacion('expedicion', 'actor'),
    await una.crearConfirmacion('expedicion', 'actor'),
    await una.actualizarBitacoraRescate('expedicion', 'actor', { notas: 'Registro ficticio' }),
    (await varias.buscarConfirmacionesPorExpediciones(['expedicion'], 'actor')).get('expedicion'),
  ];
  for (const valor of valores) {
    assert.equal(valor?.expedicionId, 'expedicion');
    assert.equal(valor?.estadoRescate, 'en_busqueda');
    sinColumnasSql(valor);
  }
  const filas = await historial.listarHistorialCompletadas('actor');
  assert.equal(filas[0]?.expedicion?.senderista?.nombreCompleto, 'Persona ficticia');
  assert.equal(filas[1]?.expedicion, null);
  sinColumnasSql(filas);
});

it('autenticación traduce identidad y credencial en el adaptador y conserva ausencias', async () => {
  const repo = new RepositorioAutenticacionPostgres(clienteConDatos({
    id: 'actor', correo_electronico: 'ficticio@example.invalid', hash_contrasena: 'hash-ficticio', rol: 'senderista',
  }));
  for (const usuario of [await repo.buscarUsuarioPorCorreo('ficticio@example.invalid'), await repo.buscarUsuarioPorId('actor')]) {
    assert.equal(usuario?.hashContrasena, 'hash-ficticio');
    assert.equal(usuario?.correoElectronico, 'ficticio@example.invalid');
    sinColumnasSql(usuario);
  }
  const credenciales = new RepositorioAutenticacionPostgres(clienteConDatos({
    institucion: 'Ficticia', numero_credencial: '123', nombre_completo: 'Persona ficticia',
    fecha_nacimiento: '2000-01-01', esta_activo: true,
  }));
  const credencial = await credenciales.buscarCredencialInstitucionalActiva('Ficticia', '123', 'Persona ficticia', '2000-01-01');
  assert.equal(credencial?.numeroCredencial, '123');
  assert.equal(credencial?.estaActivo, true);
  sinColumnasSql(credencial);
  const ausente = new RepositorioAutenticacionPostgres(clienteConDatos(null));
  assert.equal(await ausente.buscarUsuarioPorId('ausente'), null);
  assert.equal(await ausente.buscarCredencialInstitucionalActiva('', '', '', ''), null);
  assert.equal(await new RepositorioRescate(clienteConDatos(null)).buscarConfirmacion('ausente', 'actor'), null);
});
