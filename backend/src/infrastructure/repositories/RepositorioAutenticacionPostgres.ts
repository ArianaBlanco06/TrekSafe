import type {
  UsuarioAutenticacion,
  CredencialInstitucional,
  IRepositorioAutenticacionPostgres,
} from '../../application/ports/RepositorioAutenticacionPostgres.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { getSupabaseAdmin, type UsuarioBd } from '../database/supabase.js';

type FilaCredencialInstitucional = {
  institucion: string;
  numero_credencial: string;
  nombre_completo: string;
  fecha_nacimiento: string;
  esta_activo: boolean;
};

export function mapearUsuarioPersistido(fila: UsuarioBd): UsuarioAutenticacion {
  return {
    id: fila.id,
    correoElectronico: fila.correo_electronico,
    hashContrasena: fila.hash_contrasena,
    rol: fila.rol,
  };
}

export function mapearCredencialPersistida(fila: FilaCredencialInstitucional): CredencialInstitucional {
  return {
    institucion: fila.institucion,
    numeroCredencial: fila.numero_credencial,
    nombreCompleto: fila.nombre_completo,
    fechaNacimiento: fila.fecha_nacimiento,
    estaActivo: fila.esta_activo,
  };
}

export class RepositorioAutenticacionPostgres implements IRepositorioAutenticacionPostgres {
  constructor(private readonly supabase = getSupabaseAdmin()) {}

  async buscarUsuarioPorCorreo(correo: string): Promise<UsuarioAutenticacion | null> {
    const { data, error } = await this.supabase
      .from('usuarios')
      .select('id, correo_electronico, hash_contrasena, rol')
      .eq('correo_electronico', correo.toLowerCase())
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, `Error al consultar usuario: ${error.message}`);
    return data ? mapearUsuarioPersistido(data as UsuarioBd) : null;
  }

  async buscarUsuarioPorId(usuarioId: string): Promise<UsuarioAutenticacion | null> {
    const { data, error } = await this.supabase
      .from('usuarios')
      .select('id, correo_electronico, hash_contrasena, rol')
      .eq('id', usuarioId)
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, `Error al consultar usuario: ${error.message}`);
    return data ? mapearUsuarioPersistido(data as UsuarioBd) : null;
  }

  async obtenerNombreCompletoPerfil(
    usuarioId: string,
    rol: 'senderista' | 'rescatista',
  ): Promise<string | null> {
    const tabla = rol === 'rescatista' ? 'perfiles_rescatista' : 'perfiles_senderista';
    const { data, error } = await this.supabase
      .from(tabla)
      .select('nombre_completo')
      .eq('usuario_id', usuarioId)
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, `Error al consultar perfil: ${error.message}`);
    return data?.nombre_completo ?? null;
  }

  async existeDocumentoSenderista(idDocumento: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('perfiles_senderista')
      .select('usuario_id')
      .eq('id_documento', idDocumento)
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, `Error al consultar DNI: ${error.message}`);
    return data !== null;
  }

  async buscarCredencialInstitucionalActiva(
    institucion: string,
    numeroCredencial: string,
    nombreCompleto: string,
    fechaNacimiento: string,
  ): Promise<CredencialInstitucional | null> {
    const { data, error } = await this.supabase
      .from('registros_institucionales_rescatista')
      .select('institucion, numero_credencial, nombre_completo, fecha_nacimiento, esta_activo')
      .eq('institucion', institucion)
      .eq('numero_credencial', numeroCredencial)
      .eq('nombre_completo', nombreCompleto)
      .eq('fecha_nacimiento', fechaNacimiento)
      .eq('esta_activo', true)
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, `Error al validar credencial: ${error.message}`);
    return data ? mapearCredencialPersistida(data as FilaCredencialInstitucional) : null;
  }

  async registrarSenderista(datos: {
    correoElectronico: string;
    hashContrasena: string;
    nombreCompleto: string;
    idDocumento: string;
    telefono: string;
  }): Promise<{ id: string; correoElectronico: string; rol: 'senderista' }> {
    const { data: usuario, error: errorUsuario } = await this.supabase
      .from('usuarios')
      .insert({
        correo_electronico: datos.correoElectronico.toLowerCase(),
        hash_contrasena: datos.hashContrasena,
        rol: 'senderista',
      })
      .select('id, correo_electronico, rol')
      .single();

    if (errorUsuario || !usuario) {
      throw new ErrorAplicacion(500, errorUsuario?.message ?? 'Error al crear usuario');
    }

    const { error: errorPerfil } = await this.supabase.from('perfiles_senderista').insert({
      usuario_id: usuario.id,
      nombre_completo: datos.nombreCompleto,
      telefono: datos.telefono,
      id_documento: datos.idDocumento,
    });

    if (errorPerfil) {
      await this.supabase.from('usuarios').delete().eq('id', usuario.id);
      throw new ErrorAplicacion(500, errorPerfil.message);
    }

    return { id: usuario.id, correoElectronico: usuario.correo_electronico, rol: 'senderista' };
  }

  async registrarRescatista(datos: {
    correoElectronico: string;
    hashContrasena: string;
    nombreCompleto: string;
    numeroCredencial: string;
    fechaNacimiento: string;
  }): Promise<{ id: string; correoElectronico: string; rol: 'rescatista' }> {
    const { data: usuario, error: errorUsuario } = await this.supabase
      .from('usuarios')
      .insert({
        correo_electronico: datos.correoElectronico.toLowerCase(),
        hash_contrasena: datos.hashContrasena,
        rol: 'rescatista',
      })
      .select('id, correo_electronico, rol')
      .single();

    if (errorUsuario || !usuario) {
      throw new ErrorAplicacion(500, errorUsuario?.message ?? 'Error al crear usuario');
    }

    const { error: errorPerfil } = await this.supabase.from('perfiles_rescatista').insert({
      usuario_id: usuario.id,
      numero_credencial: datos.numeroCredencial,
      nombre_completo: datos.nombreCompleto,
      fecha_nacimiento: datos.fechaNacimiento,
    });

    if (errorPerfil) {
      await this.supabase.from('usuarios').delete().eq('id', usuario.id);
      throw new ErrorAplicacion(500, errorPerfil.message);
    }

    return { id: usuario.id, correoElectronico: usuario.correo_electronico, rol: 'rescatista' };
  }
}
