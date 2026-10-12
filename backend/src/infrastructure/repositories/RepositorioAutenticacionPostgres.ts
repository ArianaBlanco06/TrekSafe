import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { getSupabaseAdmin, type UsuarioBd } from '../database/supabase.js';

export type CredencialInstitucional = {
  institucion: string;
  numero_credencial: string;
  nombre_completo: string;
  fecha_nacimiento: string;
  esta_activo: boolean;
};

export class RepositorioAutenticacionPostgres {
  private readonly supabase = getSupabaseAdmin();

  async buscarUsuarioPorCorreo(correo: string): Promise<UsuarioBd | null> {
    const { data, error } = await this.supabase
      .from('usuarios')
      .select('id, correo_electronico, hash_contrasena, rol')
      .eq('correo_electronico', correo.toLowerCase())
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, `Error al consultar usuario: ${error.message}`);
    return data as UsuarioBd | null;
  }

  async buscarUsuarioPorId(usuarioId: string): Promise<UsuarioBd | null> {
    const { data, error } = await this.supabase
      .from('usuarios')
      .select('id, correo_electronico, hash_contrasena, rol')
      .eq('id', usuarioId)
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, `Error al consultar usuario: ${error.message}`);
    return data as UsuarioBd | null;
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
    return data as CredencialInstitucional | null;
  }

  async registrarSenderista(datos: {
    correoElectronico: string;
    hashContrasena: string;
    nombreCompleto: string;
    idDocumento: string;
    telefono: string;
  }): Promise<{ id: string; correo_electronico: string; rol: 'senderista' }> {
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

    return usuario as { id: string; correo_electronico: string; rol: 'senderista' };
  }

  async registrarRescatista(datos: {
    correoElectronico: string;
    hashContrasena: string;
    nombreCompleto: string;
    numeroCredencial: string;
    fechaNacimiento: string;
  }): Promise<{ id: string; correo_electronico: string; rol: 'rescatista' }> {
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

    return usuario as { id: string; correo_electronico: string; rol: 'rescatista' };
  }
}
