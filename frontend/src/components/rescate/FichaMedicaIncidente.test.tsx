import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { FichaMedicaIncidente, type FichaMedicaIncidenteProps } from './FichaMedicaIncidente';
import { ErrorClienteApi } from '../../services/clienteApi';
import type { RespuestaFichaMedica } from '../../services/fichaMedicaIncidente';

const respuesta: RespuestaFichaMedica = {
  fichaMedica: { tipoSangre: 'AB-', alergias: 'penicilina-ficticia', condiciones: '', medicamentos: 'salbutamol-ficticio' },
  acceso: { incidenteId: 'inc-1', auditoriaId: 'aud-1', registradoEn: '2030-01-15T12:00:00.000Z' },
};

function textoDe(arbol: ReactTestRenderer): string {
  const aplanar = (nodo: unknown): string => {
    if (nodo === null || nodo === undefined) return '';
    if (typeof nodo === 'string') return nodo;
    if (Array.isArray(nodo)) return nodo.map(aplanar).join(' ');
    return aplanar((nodo as { children?: unknown }).children);
  };
  return aplanar(arbol.toJSON());
}

const botones = (arbol: ReactTestRenderer, texto: string) =>
  arbol.root.findAllByType('button').filter((b) => b.children.join('') === texto);
const pulsar = (arbol: ReactTestRenderer, texto: string) =>
  act(async () => {
    botones(arbol, texto)[0]!.props.onClick();
  });

async function montar(props: Partial<FichaMedicaIncidenteProps> = {}) {
  let arbol!: ReactTestRenderer;
  await act(async () => {
    arbol = create(<FichaMedicaIncidente incidenteId="inc-1" esResponsable {...props} />);
  });
  return arbol;
}

describe('FichaMedicaIncidente (HU-50)', () => {
  it('si no es el responsable: muestra el mensaje, no hay botón y no llama a la API', async () => {
    const llamadas: string[] = [];
    const arbol = await montar({ esResponsable: false, consultar: async (id) => (llamadas.push(id), respuesta) });
    assert.match(textoDe(arbol), /Solo el responsable vigente del incidente puede consultar la ficha médica\./);
    assert.equal(arbol.root.findAllByType('button').length, 0);
    assert.deepEqual(llamadas, []);
  });

  it('el responsable ve el botón y el aviso de que cada consulta queda registrada, pero no consulta hasta pulsar', async () => {
    const llamadas: string[] = [];
    const arbol = await montar({ consultar: async (id) => (llamadas.push(id), respuesta) });
    assert.equal(botones(arbol, 'Ver ficha médica').length, 1);
    assert.match(textoDe(arbol), /Cada consulta queda registrada\./);
    assert.deepEqual(llamadas, []);
    assert.doesNotMatch(textoDe(arbol), /penicilina|AB-/);
  });

  it('el clic consulta una vez y muestra los cuatro campos (los vacíos como no declarados)', async () => {
    const llamadas: string[] = [];
    const arbol = await montar({ consultar: async (id) => (llamadas.push(id), respuesta) });
    await pulsar(arbol, 'Ver ficha médica');
    assert.deepEqual(llamadas, ['inc-1']);
    const texto = textoDe(arbol);
    for (const esperado of ['Tipo de sangre', 'AB-', 'Alergias', 'penicilina-ficticia', 'Condiciones', 'No declaradas', 'Medicación', 'salbutamol-ficticio']) {
      assert.ok(texto.includes(esperado), `falta ${esperado}`);
    }
    assert.equal(botones(arbol, 'Ocultar ficha').length, 1);
    assert.equal(botones(arbol, 'Ver ficha médica').length, 0);
  });

  it('un 403 NO_ES_RESPONSABLE muestra su mensaje y ningún dato', async () => {
    const arbol = await montar({
      consultar: async () => { throw new ErrorClienteApi('x', 403, 'ACCESO_FICHA_DENEGADO', undefined, { motivo: 'NO_ES_RESPONSABLE' }); },
    });
    await pulsar(arbol, 'Ver ficha médica');
    const texto = textoDe(arbol);
    assert.match(texto, /Solo el responsable vigente del incidente puede consultar la ficha médica\./);
    assert.doesNotMatch(texto, /Tipo de sangre|AB-/);
    assert.equal(botones(arbol, 'Ver ficha médica').length, 1, 'puede volver a intentarlo');
  });

  it('un 403 SIN_CONSENTIMIENTO muestra su mensaje', async () => {
    const arbol = await montar({
      consultar: async () => { throw new ErrorClienteApi('x', 403, 'ACCESO_FICHA_DENEGADO', undefined, { motivo: 'SIN_CONSENTIMIENTO' }); },
    });
    await pulsar(arbol, 'Ver ficha médica');
    assert.match(textoDe(arbol), /El senderista no tiene una ficha médica autorizada\./);
  });

  it('503, sin conexión y un error desconocido muestran su mensaje', async () => {
    for (const [error, patron] of [
      [new ErrorClienteApi('x', 503, 'AUDITORIA_NO_DISPONIBLE'), /No se pudo registrar el acceso; la ficha no se mostró/],
      [new ErrorClienteApi('red', 0), /Sin conexión: la ficha médica no se guarda para uso sin conexión/],
      [new ErrorClienteApi('x', 500), /No se pudo consultar la ficha médica\./],
    ] as const) {
      const arbol = await montar({ consultar: async () => { throw error; } });
      await pulsar(arbol, 'Ver ficha médica');
      assert.match(textoDe(arbol), patron);
    }
  });

  it('tras un éxito, ocultar y consultar de nuevo con un error no deja los datos anteriores', async () => {
    let n = 0;
    const arbol = await montar({
      consultar: async () => {
        n += 1;
        if (n === 1) return respuesta;
        throw new ErrorClienteApi('x', 409, 'ACCESO_FICHA_CONTEXTO_CAMBIADO', undefined, { motivo: 'CONTEXTO_CAMBIADO' });
      },
    });
    await pulsar(arbol, 'Ver ficha médica');
    assert.match(textoDe(arbol), /penicilina-ficticia/);
    // Con los datos visibles no hay botón de consulta: se oculta y se consulta de nuevo.
    await pulsar(arbol, 'Ocultar ficha');
    await pulsar(arbol, 'Ver ficha médica');
    const texto = textoDe(arbol);
    assert.doesNotMatch(texto, /penicilina-ficticia|AB-/);
    assert.match(texto, /La coordinación cambió durante la consulta/);
  });

  it('"Ocultar ficha" borra los datos y vuelve el botón', async () => {
    const arbol = await montar({ consultar: async () => respuesta });
    await pulsar(arbol, 'Ver ficha médica');
    await pulsar(arbol, 'Ocultar ficha');
    const texto = textoDe(arbol);
    assert.doesNotMatch(texto, /penicilina-ficticia|salbutamol-ficticio|AB-/);
    assert.equal(botones(arbol, 'Ver ficha médica').length, 1);
  });

  it('los datos viven solo en el estado: ni el componente ni su servicio usan almacenamiento del navegador ni caché', () => {
    for (const archivo of ['./FichaMedicaIncidente.tsx', '../../services/fichaMedicaIncidente.ts', '../../lib/fichaMedicaIncidente.ts']) {
      const fuente = readFileSync(fileURLToPath(new URL(archivo, import.meta.url)), 'utf8');
      assert.doesNotMatch(fuente, /localStorage|sessionStorage|indexedDB|caches\.|offlineStorage/, archivo);
    }
  });
});
