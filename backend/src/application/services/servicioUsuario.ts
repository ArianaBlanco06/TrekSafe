import type { EntradaActualizarFichaMedica, EntradaCrearContacto } from '../dto/usuario.dto.js';
import type { EntradaRevocacionDatos } from '../dto/privacidad.dto.js';
import { RepositorioUsuario } from '../../infrastructure/repositories/RepositorioUsuario.js';

export class ServicioUsuario {
  constructor(private readonly repo = new RepositorioUsuario()) {}

  async actualizarFichaMedica(senderistaId: string, entrada: EntradaActualizarFichaMedica) {
    await this.repo.verificarEsSenderista(senderistaId);

    const encriptado = this.repo.encriptarCarga({
      alergias: entrada.alergias,
      condiciones: entrada.condiciones,
      medicamentos: entrada.medicamentos,
    });

    await this.repo.actualizarFichaMedica(senderistaId, entrada.tipoSangre, encriptado);

    return {
      tipoSangre: entrada.tipoSangre,
      alergias: entrada.alergias,
      condiciones: entrada.condiciones,
      medicamentos: entrada.medicamentos,
      consentimientoFirmado: true,
    };
  }

  async obtenerFichaMedica(senderistaId: string) {
    await this.repo.verificarEsSenderista(senderistaId);
    const ficha = await this.repo.obtenerFichaMedica(senderistaId);
    if (!ficha) return null;

    return {
      tipoSangre: ficha.tipoSangre,
      alergias: ficha.carga.alergias,
      condiciones: ficha.carga.condiciones,
      medicamentos: ficha.carga.medicamentos,
      consentimientoFirmado: ficha.consentimientoFirmado,
    };
  }

  async listarContactos(senderistaId: string) {
    await this.repo.verificarEsSenderista(senderistaId);
    return this.repo.listarContactos(senderistaId);
  }

  async crearContacto(senderistaId: string, entrada: EntradaCrearContacto) {
    await this.repo.verificarEsSenderista(senderistaId);
    return this.repo.crearContacto(senderistaId, {
      nombreCompleto: entrada.nombreCompleto,
      parentesco: entrada.parentesco,
      telefono: entrada.telefono,
      correoElectronico: entrada.correoElectronico,
    });
  }

  async eliminarContacto(senderistaId: string, contactoId: string) {
    await this.repo.verificarEsSenderista(senderistaId);
    await this.repo.eliminarContacto(senderistaId, contactoId);
  }

  async revocarDatosPersonales(senderistaId: string, entrada: EntradaRevocacionDatos) {
    await this.repo.verificarEsSenderista(senderistaId);

    if (entrada.accion === 'eliminar_personal') {
      const resultado = await this.repo.eliminarDatosPersonales(senderistaId);
      return {
        mensaje: 'Datos personales eliminados según solicitud ARCO',
        accion: entrada.accion,
        ...resultado,
      };
    }

    const resultado = await this.repo.anonimizarHistorialRutas(senderistaId);
    return {
      mensaje: 'Historial de rutas anonimizado correctamente',
      accion: entrada.accion,
      ...resultado,
    };
  }
}
