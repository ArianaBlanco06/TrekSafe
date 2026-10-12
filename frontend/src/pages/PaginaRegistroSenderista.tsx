import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronLeft } from 'lucide-react';
import { registrarSenderista } from '@/services/autenticacion';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import {
  getPasswordStrength,
  isStrongPassword,
  isValidDni,
  isValidEmail,
  isValidPhone,
} from '@/lib/validation';
import { FieldError, FieldLabel, MobileShell } from '@/components/Layout';

export function PaginaRegistroSenderista() {
  const navigate = useNavigate();
  const { loginSession } = useAutenticacion();

  const [nombreCompleto, setNombreCompleto] = useState('');
  const [idDocumento, setIdDocumento] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmarContrasena, setConfirmarContrasena] = useState('');
  const [consentimiento, setConsentimiento] = useState(false);
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [exito, setExito] = useState(false);

  const fortaleza = useMemo(() => getPasswordStrength(contrasena), [contrasena]);

  const errores = {
    nombreCompleto: !nombreCompleto.trim() ? 'Nombre completo obligatorio' : '',
    idDocumento: !isValidDni(idDocumento) ? 'DNI de 8 dígitos requerido' : '',
    correo: !isValidEmail(correo) ? 'Correo inválido' : '',
    telefono: !isValidPhone(telefono) ? 'Celular inválido' : '',
    contrasena: !isStrongPassword(contrasena) ? 'Contraseña no cumple requisitos' : '',
    confirmarContrasena:
      confirmarContrasena !== contrasena ? 'Las contraseñas no coinciden' : '',
    consentimiento: !consentimiento
      ? 'Debe aceptar el tratamiento de datos (Ley N° 29733)'
      : '',
  };

  const puedeEnviar =
    !Object.values(errores).some(Boolean) &&
    consentimiento &&
    nombreCompleto &&
    idDocumento &&
    correo &&
    telefono &&
    contrasena &&
    confirmarContrasena;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTocados({
      nombreCompleto: true,
      idDocumento: true,
      correo: true,
      telefono: true,
      contrasena: true,
      confirmarContrasena: true,
      consentimiento: true,
    });
    if (!puedeEnviar) return;

    setError('');
    setCargando(true);
    try {
      const res = await registrarSenderista({
        nombreCompleto: nombreCompleto.trim(),
        idDocumento: idDocumento.trim(),
        correoElectronico: correo.trim(),
        telefono: telefono.trim(),
        contrasena,
        consentimientoPrivacidad: true,
      });
      loginSession(res.token, res.usuario);
      setExito(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar');
    } finally {
      setCargando(false);
    }
  };

  if (exito) {
    return (
      <MobileShell>
        <div className="px-6 flex flex-col items-center justify-center min-h-screen text-center">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
              <Check size={36} className="text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-3">Cuenta creada correctamente</h1>
          <p className="text-muted-foreground text-sm mb-8">
            Tu perfil de senderista está listo. Puedes continuar al panel principal.
          </p>
          <button type="button" className="btn-primary" onClick={() => navigate('/senderista')}>
            Ir al inicio
          </button>
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

        <h1 className="text-2xl font-bold mb-1">Registro de Senderista</h1>
        <p className="text-muted-foreground text-sm mb-6">Paso 1 — Información de cuenta</p>

        {error && <div className="error-banner mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <FieldLabel htmlFor="reg-nombre">Nombre completo</FieldLabel>
            <input
              id="reg-nombre"
              className={`input-field ${tocados.nombreCompleto && errores.nombreCompleto ? 'input-error' : ''}`}
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              onBlur={() => setTocados((t) => ({ ...t, nombreCompleto: true }))}
              placeholder="Tu nombre completo"
              aria-required="true"
            />
            <FieldError message={tocados.nombreCompleto ? errores.nombreCompleto : undefined} />
          </div>

          <div>
            <FieldLabel htmlFor="reg-dni">DNI</FieldLabel>
            <input
              id="reg-dni"
              className={`input-field ${tocados.idDocumento && errores.idDocumento ? 'input-error' : ''}`}
              value={idDocumento}
              onChange={(e) => setIdDocumento(e.target.value.replace(/\D/g, '').slice(0, 8))}
              onBlur={() => setTocados((t) => ({ ...t, idDocumento: true }))}
              placeholder="45879632"
              inputMode="numeric"
              aria-required="true"
            />
            <FieldError message={tocados.idDocumento ? errores.idDocumento : undefined} />
          </div>

          <div>
            <FieldLabel htmlFor="reg-correo">Correo electrónico</FieldLabel>
            <input
              id="reg-correo"
              type="email"
              className={`input-field ${tocados.correo && errores.correo ? 'input-error' : ''}`}
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              onBlur={() => setTocados((t) => ({ ...t, correo: true }))}
              placeholder="tu@correo.pe"
              autoComplete="email"
              aria-required="true"
            />
            <FieldError message={tocados.correo ? errores.correo : undefined} />
          </div>

          <div>
            <FieldLabel htmlFor="reg-celular">Celular</FieldLabel>
            <input
              id="reg-celular"
              type="tel"
              className={`input-field ${tocados.telefono && errores.telefono ? 'input-error' : ''}`}
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              onBlur={() => setTocados((t) => ({ ...t, telefono: true }))}
              placeholder="+51987654321"
              aria-required="true"
            />
            <FieldError message={tocados.telefono ? errores.telefono : undefined} />
          </div>

          <div>
            <FieldLabel htmlFor="reg-contrasena">Contraseña</FieldLabel>
            <input
              id="reg-contrasena"
              type="password"
              className={`input-field ${tocados.contrasena && errores.contrasena ? 'input-error' : ''}`}
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              onBlur={() => setTocados((t) => ({ ...t, contrasena: true }))}
              placeholder="Mín. 8 caracteres, mayúscula, minúscula y número"
              autoComplete="new-password"
              aria-required="true"
            />
            {contrasena && (
              <p className="text-xs mt-1 text-muted-foreground">
                Fortaleza: <span className="font-semibold">{fortaleza.label}</span>
              </p>
            )}
            <FieldError message={tocados.contrasena ? errores.contrasena : undefined} />
          </div>

          <div>
            <FieldLabel htmlFor="reg-confirmar">Confirmar contraseña</FieldLabel>
            <input
              id="reg-confirmar"
              type="password"
              className={`input-field ${tocados.confirmarContrasena && errores.confirmarContrasena ? 'input-error' : ''}`}
              value={confirmarContrasena}
              onChange={(e) => setConfirmarContrasena(e.target.value)}
              onBlur={() => setTocados((t) => ({ ...t, confirmarContrasena: true }))}
              autoComplete="new-password"
              aria-required="true"
            />
            <FieldError message={tocados.confirmarContrasena ? errores.confirmarContrasena : undefined} />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              id="reg-consentimiento"
              type="checkbox"
              checked={consentimiento}
              onChange={(e) => setConsentimiento(e.target.checked)}
              onBlur={() => setTocados((t) => ({ ...t, consentimiento: true }))}
              className="mt-1 w-4 h-4 accent-primary"
              aria-required="true"
            />
            <span className="text-sm leading-relaxed">
              Acepto el tratamiento de mis datos personales conforme a la{' '}
              <strong>Ley N° 29733</strong> de protección de datos personales.
            </span>
          </label>
          <FieldError message={tocados.consentimiento ? errores.consentimiento : undefined} />

          <button type="submit" className="btn-primary mt-2" disabled={!puedeEnviar || cargando}>
            {cargando ? 'Creando cuenta…' : 'Continuar'}
          </button>
        </form>
      </div>
    </MobileShell>
  );
}
