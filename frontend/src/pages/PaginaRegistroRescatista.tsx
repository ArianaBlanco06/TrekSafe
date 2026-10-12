import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, Shield } from 'lucide-react';
import { registrarRescatista } from '@/services/autenticacion';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import { isStrongPassword, isValidEmail } from '@/lib/validation';
import { FieldLabel, MobileShell } from '@/components/Layout';

type EstadoVista = 'form' | 'success' | 'error';

export function PaginaRegistroRescatista() {
  const navigate = useNavigate();
  const { loginSession } = useAutenticacion();

  const [vista, setVista] = useState<EstadoVista>('form');
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [institucion, setInstitucion] = useState<'AGMP' | 'MINCETUR'>('AGMP');
  const [numeroCredencial, setNumeroCredencial] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [cargando, setCargando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorForm('');

    if (!nombreCompleto.trim() || !isValidEmail(correo) || !isStrongPassword(contrasena)) {
      setErrorForm('Complete todos los campos correctamente');
      return;
    }
    if (!numeroCredencial.trim() || !fechaNacimiento) {
      setErrorForm('Credencial y fecha de nacimiento son obligatorios');
      return;
    }

    setCargando(true);
    try {
      const res = await registrarRescatista({
        nombreCompleto: nombreCompleto.trim(),
        correoElectronico: correo.trim(),
        contrasena,
        institucion,
        numeroCredencial: numeroCredencial.trim(),
        fechaNacimiento,
      });
      loginSession(res.token, res.usuario);
      setVista('success');
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 403) {
        setVista('error');
      } else {
        setErrorForm(err instanceof Error ? err.message : 'Error al registrar');
      }
    } finally {
      setCargando(false);
    }
  };

  if (vista === 'success') {
    return (
      <MobileShell>
        <div className="px-6 flex flex-col items-center justify-center min-h-screen text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center">
              <Check size={32} className="text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-2">Credenciales Validadas</h1>
          <p className="text-muted-foreground text-sm mb-8">
            Tu cuenta de rescatista ha sido creada correctamente.
          </p>
          <button type="button" className="btn-primary" onClick={() => navigate('/rescatista')}>
            Ingresar al Panel de Rescate
          </button>
        </div>
      </MobileShell>
    );
  }

  if (vista === 'error') {
    return (
      <MobileShell>
        <div className="px-6 flex flex-col items-center justify-center min-h-screen text-center">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
            <div className="w-14 h-14 bg-destructive/20 border-2 border-destructive rounded-full flex items-center justify-center">
              <Shield size={28} className="text-destructive" />
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-2">No se Pudo Validar la Credencial</h1>
          <p className="text-muted-foreground text-sm mb-8">
            Los datos ingresados no coinciden con el registro simulado de credenciales
            institucionales (AGMP/MINCETUR).
          </p>
          <button type="button" className="btn-primary mb-3" onClick={() => setVista('form')}>
            Revisar datos
          </button>
          <Link to="/iniciar-sesion" className="text-sm text-muted-foreground hover:text-foreground">
            Volver al inicio
          </Link>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <div className="px-6 py-10">
        <Link
          to="/iniciar-sesion"
          className="flex items-center gap-1 text-xs text-muted-foreground mb-6 hover:text-foreground"
        >
          <ChevronLeft size={16} /> Volver
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center">
            <Shield size={20} className="text-secondary-foreground" />
          </div>
          <h1 className="text-xl font-bold">Registro de Rescatista</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-6">
          Valida tus credenciales institucionales para acceder al panel de rescate.
        </p>

        {errorForm && <div className="error-banner mb-4">{errorForm}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <FieldLabel>Nombre completo</FieldLabel>
            <input
              className="input-field"
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              placeholder="Carlos Mendoza Quispe"
            />
          </div>
          <div>
            <FieldLabel>Correo electrónico</FieldLabel>
            <input
              type="email"
              className="input-field"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="tu@institucion.pe"
            />
          </div>
          <div>
            <FieldLabel>Contraseña</FieldLabel>
            <input
              type="password"
              className="input-field"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              placeholder="Contraseña segura"
            />
          </div>
          <div>
            <FieldLabel>Institución</FieldLabel>
            <select
              className="input-field"
              value={institucion}
              onChange={(e) => setInstitucion(e.target.value as 'AGMP' | 'MINCETUR')}
            >
              <option value="AGMP">AGMP</option>
              <option value="MINCETUR">MINCETUR</option>
            </select>
          </div>
          <div>
            <FieldLabel>Número de credencial</FieldLabel>
            <input
              className="input-field"
              value={numeroCredencial}
              onChange={(e) => setNumeroCredencial(e.target.value)}
              placeholder="AGMP-2024-00158"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Prueba válida: <span className="font-semibold text-primary">AGMP-2024-00158</span>{' '}
              · Carlos Mendoza Quispe · 1985-03-14
            </p>
          </div>
          <div>
            <FieldLabel>Fecha de nacimiento</FieldLabel>
            <input
              type="date"
              className="input-field"
              value={fechaNacimiento}
              onChange={(e) => setFechaNacimiento(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-secondary flex items-center justify-center gap-2" disabled={cargando}>
            <Shield size={18} />
            {cargando ? 'Validando…' : 'Validar y crear cuenta'}
          </button>
        </form>
      </div>
    </MobileShell>
  );
}
