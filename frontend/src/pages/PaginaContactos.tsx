import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { crearContacto, eliminarContacto, obtenerContactos, type ContactoEmergencia } from '@/services/usuario';
import { cachearContactos } from '@/lib/offlineContacts';
import { FieldError, FieldLabel } from '@/components/Layout';
import { isValidEmail, isValidPhone } from '@/lib/validation';

export function PaginaContactos() {
  const [contactos, setContactos] = useState<ContactoEmergencia[]>([]);
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [parentesco, setParentesco] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const cargar = () => {
    obtenerContactos()
      .then((r) => {
        setContactos(r.contactos);
        void cachearContactos(r.contactos);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar'));
  };

  useEffect(() => {
    cargar();
  }, []);

  const puedeAgregar =
    nombreCompleto.trim().length >= 2 &&
    parentesco.trim().length >= 2 &&
    isValidPhone(telefono) &&
    isValidEmail(correo);

  const handleAgregar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeAgregar) return;
    setError('');
    setCargando(true);
    try {
      await crearContacto({ nombreCompleto, parentesco, telefono, correoElectronico: correo });
      setNombreCompleto('');
      setParentesco('');
      setTelefono('');
      setCorreo('');
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear contacto');
    } finally {
      setCargando(false);
    }
  };

  const handleEliminar = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Eliminar a ${nombre} de tus contactos de emergencia?`)) return;
    try {
      await eliminarContacto(id);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  return (
    <div className="px-6 py-6">
      <Link to="/senderista/perfil" className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
        <ChevronLeft size={16} /> Perfil
      </Link>

      <h2 className="text-xl font-bold mb-6">Contactos de emergencia</h2>

      {error && <div className="error-banner mb-4">{error}</div>}

      <div className="space-y-3 mb-8">
        {contactos.map((c) => (
          <div key={c.id} className="bg-card border border-border rounded-2xl p-4 flex justify-between gap-3">
            <div>
              <p className="font-semibold">{c.nombreCompleto}</p>
              <p className="text-xs text-muted-foreground">{c.parentesco}</p>
              <p className="text-sm mt-1">{c.telefono}</p>
              <p className="text-sm text-muted-foreground">{c.correoElectronico}</p>
            </div>
            <button
              type="button"
              onClick={() => handleEliminar(c.id, c.nombreCompleto)}
              aria-label="Eliminar"
              className="btn-touch"
            >
              <Trash2 size={18} className="text-destructive" />
            </button>
          </div>
        ))}
        {contactos.length === 0 && (
          <p className="text-sm text-muted-foreground">Aún no tienes contactos registrados.</p>
        )}
      </div>

      <h3 className="font-semibold mb-3">Agregar contacto</h3>
      <form onSubmit={handleAgregar} className="space-y-3">
        <div>
          <FieldLabel>Nombre completo</FieldLabel>
          <input className="input-field" value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Parentesco</FieldLabel>
          <input className="input-field" value={parentesco} onChange={(e) => setParentesco(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Teléfono</FieldLabel>
          <input className="input-field" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          {!telefono || isValidPhone(telefono) ? null : <FieldError message="Teléfono inválido" />}
        </div>
        <div>
          <FieldLabel>Correo</FieldLabel>
          <input
            type="email"
            className="input-field"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
          {!correo || isValidEmail(correo) ? null : <FieldError message="Correo inválido" />}
        </div>
        <button type="submit" className="btn-primary" disabled={!puedeAgregar || cargando}>
          {cargando ? 'Guardando…' : 'Agregar contacto'}
        </button>
      </form>
    </div>
  );
}
