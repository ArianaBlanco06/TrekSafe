import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Mountain, Shield } from 'lucide-react';
import { iniciarSesion } from '@/services/autenticacion';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import { FieldLabel, LogoHeader, MobileShell } from '@/components/Layout';

type TabLogin = 'senderista' | 'rescatista';

export function PaginaIniciarSesion() {
  const navigate = useNavigate();
  const { loginSession, estaAutenticado, usuario } = useAutenticacion();
  const [tab, setTab] = useState<TabLogin>('senderista');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  if (estaAutenticado && usuario) {
    return (
      <Navigate to={usuario.rol === 'rescatista' ? '/rescatista' : '/senderista'} replace />
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const res = await iniciarSesion({ correoElectronico: correo, contrasena });
      if (res.usuario.rol !== tab) {
        setError(
          res.usuario.rol === 'rescatista'
            ? 'Esta cuenta es de rescatista. Cambia al tab Rescatista para continuar.'
            : 'Esta cuenta es de senderista. Cambia al tab Senderista para continuar.',
        );
        return;
      }
      loginSession(res.token, res.usuario);
      navigate(res.usuario.rol === 'rescatista' ? '/rescatista' : '/senderista');
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error al iniciar sesión';
      setError(mensaje);
    } finally {
      setCargando(false);
    }
  };

  const demoLogin = async (demoCorreo: string, demoContrasena: string) => {
    setCorreo(demoCorreo);
    setContrasena(demoContrasena);
    setError('');
    setCargando(true);
    try {
      const res = await iniciarSesion({ correoElectronico: demoCorreo, contrasena: demoContrasena });
      loginSession(res.token, res.usuario);
      navigate(res.usuario.rol === 'rescatista' ? '/rescatista' : '/senderista');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error en acceso demo');
    } finally {
      setCargando(false);
    }
  };

  const esRescatista = tab === 'rescatista';
  const inputClass = esRescatista ? 'input-field input-field-secondary' : 'input-field';
  const btnClass = esRescatista ? 'btn-secondary' : 'btn-primary';
  const linkClass = esRescatista
    ? 'text-secondary font-semibold hover:underline'
    : 'text-primary font-semibold hover:underline';

  return (
    <MobileShell>
      <div className="px-6 flex flex-col py-10">
        <LogoHeader variant={tab} />

        <div className="flex bg-muted rounded-xl p-1 mb-5">
          {(['senderista', 'rescatista'] as const).map((t) => {
            const activo = tab === t;
            const TabIcon = t === 'rescatista' ? Shield : Mountain;
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setError('');
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all inline-flex items-center justify-center gap-1.5 ${
                  activo
                    ? t === 'rescatista'
                      ? 'bg-secondary text-secondary-foreground shadow-sm'
                      : 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground'
                }`}
              >
                <TabIcon size={14} />
                {t === 'senderista' ? 'Senderista' : 'Rescatista'}
              </button>
            );
          })}
        </div>

        <h2 className="text-xl font-bold mb-4">Iniciar sesión</h2>

        {error && <div className="error-banner mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4 mb-4">
          <div>
            <FieldLabel htmlFor="login-correo">Correo electrónico</FieldLabel>
            <input
              id="login-correo"
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="tu@correo.pe"
              className={inputClass}
              required
              aria-required="true"
              autoComplete="email"
            />
          </div>
          <div>
            <FieldLabel htmlFor="login-contrasena">Contraseña</FieldLabel>
            <input
              id="login-contrasena"
              type="password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              className={inputClass}
              required
              aria-required="true"
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className={btnClass} disabled={cargando}>
            {cargando ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mb-8">
          ¿No tienes cuenta?{' '}
          <Link
            to={esRescatista ? '/registro/rescatista' : '/registro/senderista'}
            className={linkClass}
          >
            Crear cuenta
          </Link>
        </p>

        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-border" />
            <p className="text-xs text-muted-foreground font-medium whitespace-nowrap">
              Acceso rápido para demo
            </p>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="space-y-3">
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-bold text-primary">Senderista</p>
                  <p className="text-xs text-muted-foreground">senderista@treksafe.pe</p>
                </div>
                <Mountain size={18} className="text-primary" />
              </div>
              <button
                type="button"
                onClick={() => demoLogin('senderista@treksafe.pe', 'Treksafe123!')}
                className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl"
                disabled={cargando}
              >
                Entrar como Senderista
              </button>
            </div>

            <div className="bg-secondary/5 border border-secondary/20 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-bold text-secondary">Rescatista</p>
                  <p className="text-xs text-muted-foreground">rescatista@treksafe.pe</p>
                </div>
                <Shield size={18} className="text-secondary" />
              </div>
              <button
                type="button"
                onClick={() => demoLogin('rescatista@treksafe.pe', 'Treksafe123!')}
                className="w-full py-2.5 bg-secondary text-secondary-foreground text-sm font-semibold rounded-xl"
                disabled={cargando}
              >
                Entrar como Rescatista
              </button>
            </div>
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
