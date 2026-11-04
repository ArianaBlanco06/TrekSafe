import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crearBorradorListaEquipo, datosListaEquipo, nuevoItemEquipo, validarBorradorListaEquipo } from './listasEquipoFormulario.ts';
import type { ListaEquipo } from '../services/listasEquipo.ts';

describe('Formulario de listas de equipo: contrato de datos', () => {
  it('permite una lista inicialmente vacía y exige su nombre', () => {
    const borrador = crearBorradorListaEquipo();
    assert.ok(validarBorradorListaEquipo(borrador).nombre);
    borrador.nombre = '  Montaña  ';
    assert.deepEqual(validarBorradorListaEquipo(borrador), { items: {} });
    assert.deepEqual(datosListaEquipo(borrador), { nombre: 'Montaña', items: [] });
  });

  it('rechaza nombres de espacios e indica el ítem que requiere corrección', () => {
    const item = nuevoItemEquipo();
    const errores = validarBorradorListaEquipo({ nombre: '\t\u00a0', items: [item] });
    assert.ok(errores.nombre);
    assert.ok(errores.items[item.claveLocal]);
  });

  it('asigna claves locales distintas sin convertirlas en ids persistidos', () => {
    const primero = nuevoItemEquipo();
    const segundo = nuevoItemEquipo();
    assert.notEqual(primero.claveLocal, segundo.claveLocal);
    assert.equal(primero.obligatorio, false);
    primero.nombre = ' Casco ';
    primero.obligatorio = true;
    const datos = datosListaEquipo({ nombre: 'Equipo', items: [primero] });
    assert.deepEqual(datos.items, [{ nombre: 'Casco', obligatorio: true }]);
    assert.equal('claveLocal' in datos.items[0], false);
    assert.equal('id' in datos.items[0], false);
  });

  it('conserva ids y orden al editar sin modificar la lista original', () => {
    const lista: ListaEquipo = {
      id: 'lista', senderistaId: 'propietario', nombre: 'Equipo', creadoEn: 'fecha', actualizadoEn: 'fecha',
      items: [{ id: 'casco', nombre: 'Casco', obligatorio: true }, { id: 'camara', nombre: 'Cámara', obligatorio: false }],
    };
    const borrador = crearBorradorListaEquipo(lista);
    borrador.items.reverse();
    borrador.items[0].nombre = '  Cámara nueva  ';
    borrador.items[0].obligatorio = true;
    const datos = datosListaEquipo(borrador);
    assert.deepEqual(datos.items.map((item) => item.id), ['camara', 'casco']);
    assert.equal(datos.items[0].nombre, 'Cámara nueva');
    assert.equal(lista.items[1].nombre, 'Cámara');
    assert.equal(lista.items[1].obligatorio, false);
    assert.equal('senderistaId' in datos, false);
    assert.equal('id' in datos, false);
  });
});
