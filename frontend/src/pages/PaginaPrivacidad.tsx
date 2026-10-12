import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Database, Lock, Shield, Trash2 } from 'lucide-react';

export function PaginaPrivacidad() {
  return (
    <div className="px-6 py-6">
      <Link
        to="/senderista/perfil"
        className="flex items-center gap-1 text-sm text-muted-foreground mb-4"
      >
        <ChevronLeft size={18} /> Perfil
      </Link>

      <h2 className="text-xl font-bold mb-1">Configuración de privacidad</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Gestiona tus datos conforme a la Ley N° 29733 (ARCO).
      </p>

      <section className="mb-6">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
          Datos personales y sensibles
        </h3>
        <div className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
          <Lock size={20} className="text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            Tu ficha médica, contactos y rutas solo se usan para alertas y rescate autorizado.
          </p>
        </div>
      </section>

      <section className="mb-6">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
          Gestión de datos
        </h3>
        <div className="space-y-3">
          <Link
            to="/senderista/perfil/privacidad/solicitud?accion=eliminar_personal"
            className="flex items-center gap-3 bg-card border border-border rounded-2xl p-4"
          >
            <div className="w-10 h-10 bg-destructive/10 rounded-xl flex items-center justify-center">
              <Trash2 size={18} className="text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Solicitar eliminación de datos</p>
              <p className="text-xs text-muted-foreground">Ficha médica, contactos e historial</p>
            </div>
            <ChevronRight size={18} className="text-muted-foreground" />
          </Link>

          <Link
            to="/senderista/perfil/privacidad/solicitud?accion=anonimizar_rutas"
            className="flex items-center gap-3 bg-card border border-border rounded-2xl p-4"
          >
            <div className="w-10 h-10 bg-amber-500/15 rounded-xl flex items-center justify-center">
              <Database size={18} className="text-amber-700 dark:text-amber-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Anonimizar historial de rutas</p>
              <p className="text-xs text-muted-foreground">Conservar solo datos estadísticos</p>
            </div>
            <ChevronRight size={18} className="text-muted-foreground" />
          </Link>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
          Estado de privacidad
        </h3>
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Shield size={14} className="text-primary" /> Datos protegidos
            </span>
            <span className="text-xs font-semibold text-primary">Activo</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Consentimiento médico</span>
            <span className="text-xs text-muted-foreground">Requerido en ficha médica</span>
          </div>
        </div>
      </section>
    </div>
  );
}
