import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { obtenerFichaMedica, guardarFichaMedica } from '@/services/usuario';
import { FieldError, FieldLabel } from '@/components/Layout';

const TIPOS_SANGRE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export function PaginaFichaMedica() {
  const [tipoSangre, setTipoSangre] = useState<string>('O+');
  const [alergias, setAlergias] = useState('');
  const [condiciones, setCondiciones] = useState('');
  const [medicamentos, setMedicamentos] = useState('');
  const [consentimiento, setConsentimiento] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    obtenerFichaMedica()
      .then(({ fichaMedica }) => {
        if (!fichaMedica) return;
        setTipoSangre(fichaMedica.tipoSangre);
        setAlergias(fichaMedica.alergias);
        setCondiciones(fichaMedica.condiciones);
        setMedicamentos(fichaMedica.medicamentos);
        setConsentimiento(fichaMedica.consentimientoFirmado);
      })
      .catch(() => undefined);
  }, []);

  const puedeGuardar = consentimiento && tipoSangre;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeGuardar) return;
    setError('');
    setExito('');
    setCargando(true);
    try {
      await guardarFichaMedica({
        tipoSangre,
        alergias,
        condiciones,
        medicamentos,
        consentimientoFirmado: true,
      });
      setExito('Ficha médica guardada correctamente');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="px-6 py-6">
      <Link to="/senderista/perfil" className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
        <ChevronLeft size={16} /> Perfil
      </Link>

      <h2 className="text-xl font-bold mb-1">Ficha médica</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Datos cifrados en servidor (AES-256). Solo visibles en alerta activa.
      </p>

      {error && <div className="error-banner mb-4">{error}</div>}
      {exito && (
        <div className="bg-primary/10 border border-primary/30 text-primary rounded-xl p-3 text-sm mb-4">
          {exito}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <FieldLabel>Grupo sanguíneo</FieldLabel>
          <select className="input-field" value={tipoSangre} onChange={(e) => setTipoSangre(e.target.value)}>
            {TIPOS_SANGRE.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel>Alergias</FieldLabel>
          <input
            className="input-field"
            value={alergias}
            onChange={(e) => setAlergias(e.target.value)}
            placeholder="Ej: Penicilina"
          />
        </div>

        <div>
          <FieldLabel>Condiciones médicas</FieldLabel>
          <textarea
            className="input-field min-h-20 resize-none"
            value={condiciones}
            onChange={(e) => setCondiciones(e.target.value)}
            placeholder="Condiciones preexistentes relevantes"
          />
        </div>

        <div>
          <FieldLabel>Medicamentos habituales</FieldLabel>
          <input
            className="input-field"
            value={medicamentos}
            onChange={(e) => setMedicamentos(e.target.value)}
            placeholder="Ej: Ibuprofeno"
          />
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consentimiento}
            onChange={(e) => setConsentimiento(e.target.checked)}
            className="mt-1 w-4 h-4 accent-primary"
          />
          <span className="text-sm leading-relaxed">
            Autorizo revelar estos datos únicamente en situaciones de alerta activa (Ley N° 29733).
          </span>
        </label>
        {!consentimiento && <FieldError message="El consentimiento es obligatorio para guardar" />}

        <button type="submit" className="btn-primary" disabled={!puedeGuardar || cargando}>
          {cargando ? 'Guardando…' : 'Guardar ficha médica'}
        </button>
      </form>
    </div>
  );
}
