import { Mountain, Shield } from 'lucide-react';
import type { ReactNode } from 'react';

export function MobileShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground max-w-sm mx-auto">
      {children}
    </div>
  );
}

type LogoHeaderVariant = 'senderista' | 'rescatista';

export function LogoHeader({ variant = 'senderista' }: { variant?: LogoHeaderVariant }) {
  const esRescatista = variant === 'rescatista';
  const Icono = esRescatista ? Shield : Mountain;

  return (
    <div className="flex flex-col items-center mb-8">
      <div
        className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg ${
          esRescatista
            ? 'bg-secondary shadow-secondary/30'
            : 'bg-primary shadow-primary/30'
        }`}
      >
        <Icono size={30} className={esRescatista ? 'text-secondary-foreground' : 'text-primary-foreground'} />
      </div>
      <h1 className="text-3xl font-bold tracking-tight">TrekSafe</h1>
      <p className="text-muted-foreground text-sm mt-1">
        {esRescatista
          ? 'Consola de rescate y monitoreo'
          : 'Seguridad en expediciones de montaña'}
      </p>
    </div>
  );
}

export function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-semibold mb-1.5">
      {children}
    </label>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="field-error">{message}</p>;
}
