import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle, ChevronLeft, Database, Trash2 } from 'lucide-react';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import { revocarDatosPersonales, type AccionRevocacion } from '@/services/usuario';

export function PaginaRevocacionDatos() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { logout } = useAutenticacion();
  const [modal, setModal] = useState<AccionRevocacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  useEffect(() => {
    const accion = searchParams.get('accion');
    if (accion === 'eliminar_personal' || accion === 'anonimizar_rutas') {
      setModal(accion);
    }
  }, [searchParams]);

  const handleConfirmar = async () => {
    if (!modal) return;
    setCargando(true);
    setError('');
    setExito('');
    try {
      const resultado = await revocarDatosPersonales(modal);
      setExito(resultado.mensaje);
      setModal(null);
      if (modal === 'eliminar_personal') {
        setTimeout(() => {
          logout();
          navigate('/iniciar-sesion', { replace: true });
        }, 2000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar la solicitud');
      setModal(null);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="px-6 py-6 pb-8">
      <Link
        to="/senderista/perfil/privacidad"
        className="flex items-center gap-1 text-sm text-muted-foreground mb-4"
      >
        <ChevronLeft size={18} /> Privacidad
      </Link>

      <h2 className="text-xl font-bold mb-1">Solicitud de datos personales</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Ejerce tus derechos de acceso, rectificación, cancelación y oposición.
      </p>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3 mb-6">
        <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900 dark:text-amber-100 leading-relaxed">
          No puedes revocar datos si tienes una expedición en curso o en alerta activa.
        </p>
      </div>

      {error && <div className="error-banner mb-4">{error}</div>}
      {exito && (
        <div className="mb-4 p-3 rounded-xl bg-primary/10 text-primary text-sm font-medium flex items-center gap-2">
          <CheckCircle size={16} /> {exito}
        </div>
      )}

      <div className="space-y-4">
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <Trash2 size={20} className="text-destructive" />
            <h3 className="font-bold">Eliminar mis datos</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Elimina ficha médica, contactos de emergencia y expediciones finalizadas o programadas.
          </p>
          <button
            type="button"
            onClick={() => setModal('eliminar_personal')}
            className="w-full py-3 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl font-semibold text-sm"
          >
            Solicitar eliminación
          </button>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <Database size={20} className="text-amber-600" />
            <h3 className="font-bold">Anonimizar historial</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Conserva el conteo de expediciones completadas sin ubicaciones ni cordada identificable.
          </p>
          <button
            type="button"
            onClick={() => setModal('anonimizar_rutas')}
            className="w-full py-3 bg-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-500/30 rounded-xl font-semibold text-sm"
          >
            Solicitar anonimización
          </button>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !cargando && setModal(null)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="revocar-dialog-titulo"
            className="relative w-full max-w-sm bg-card rounded-3xl p-6 shadow-2xl"
          >
            <h3 id="revocar-dialog-titulo" className="font-bold text-lg mb-2 text-center">
              Confirmar solicitud
            </h3>
            <p className="text-sm text-muted-foreground text-center mb-5 leading-relaxed">
              {modal === 'eliminar_personal'
                ? 'Se eliminarán datos personales sensibles de forma irreversible.'
                : 'Las rutas completadas quedarán anonimizadas en el sistema.'}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setModal(null)}
                disabled={cargando}
                className="flex-1 py-3 border border-border rounded-xl font-medium text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmar}
                disabled={cargando}
                className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm"
              >
                {cargando ? 'Procesando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
