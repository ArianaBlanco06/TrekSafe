import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Backpack, ChevronLeft, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { FormularioListaEquipo } from '@/components/equipo/FormularioListaEquipo';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';
import { useListasEquipo } from '@/hooks/useListasEquipo';
import { listasEquipoApi, type ListaEquipo, type ListasEquipoApi } from '@/services/listasEquipo';

export function PaginaListasEquipo() {
  const { usuario } = useAutenticacion();
  // Un cambio de sesión descarta todo el estado privado de la pantalla anterior.
  return <GestionListasEquipo key={usuario?.id} api={listasEquipoApi} />;
}

export function GestionListasEquipo({ api }: { api: ListasEquipoApi }) {
  const enLinea = useEstadoEnLinea();
  const equipo = useListasEquipo(api, enLinea);
  const [editor, setEditor] = useState<{ lista?: ListaEquipo } | null>(null);
  const bloqueado = equipo.ocupado || equipo.cargando;

  function cerrarEditor() {
    setEditor(null);
    equipo.limpiarMensajes();
  }

  async function editar(id: string) {
    const lista = await equipo.obtenerParaEditar(id);
    if (lista) setEditor({ lista });
  }

  async function eliminar(lista: ListaEquipo) {
    if (window.confirm(`¿Eliminar la lista «${lista.nombre}» y todos sus ítems?`)) await equipo.eliminar(lista.id);
  }

  return (
    <div className="px-6 py-6">
      {editor ? (
        <button type="button" disabled={equipo.ocupado} onClick={cerrarEditor}
          className="flex items-center gap-1 text-xs text-muted-foreground mb-4 min-h-10 disabled:opacity-50">
          <ChevronLeft size={16} aria-hidden="true" /> Mis listas
        </button>
      ) : (
        <Link to="/senderista/perfil" className="flex items-center gap-1 text-xs text-muted-foreground mb-4 min-h-10">
          <ChevronLeft size={16} aria-hidden="true" /> Perfil
        </Link>
      )}
      <h2 className="text-xl font-bold">{editor ? editor.lista ? 'Editar lista' : 'Nueva lista' : 'Mis listas de equipo'}</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        {editor ? 'Organiza el equipo que quieres llevar.' : 'Prepara listas personales para tus próximas salidas.'}
      </p>

      {editor ? (
        <FormularioListaEquipo key={editor.lista?.id ?? 'nueva'} lista={editor.lista}
          ocupado={bloqueado} enLinea={enLinea} error={equipo.errorOperacion}
          onCancelar={cerrarEditor}
          onGuardar={async (datos) => {
            if (await equipo.guardar(datos, editor.lista?.id)) setEditor(null);
          }} />
      ) : (
        <>
          {equipo.mensaje && <p role="status" className="text-sm text-primary mb-4">{equipo.mensaje}</p>}
          {equipo.errorOperacion && <p role="alert" className="error-banner mb-4">{equipo.errorOperacion}</p>}
          <button type="button" className="btn-primary inline-flex justify-center items-center gap-2 mb-5"
            disabled={bloqueado || !enLinea} onClick={() => { equipo.limpiarMensajes(); setEditor({}); }}>
            <Plus size={18} aria-hidden="true" /> Nueva lista
          </button>
          {equipo.errorCarga && (
            <div role="alert" className="error-banner mb-4">
              <p>{equipo.errorCarga}</p>
              <button type="button" disabled={bloqueado || !enLinea} onClick={() => { void equipo.cargar(); }}
                className="min-h-12 inline-flex items-center gap-2 font-semibold disabled:opacity-50">
                <RefreshCw size={16} aria-hidden="true" /> Reintentar
              </button>
            </div>
          )}
          {equipo.cargando && <p role="status" className="text-sm text-muted-foreground">Cargando listas…</p>}
          {!equipo.cargando && !equipo.errorCarga && equipo.listas.length === 0 && (
            <div className="py-8 text-center">
              <Backpack size={36} className="mx-auto mb-3 text-primary" aria-hidden="true" />
              <p className="font-semibold">Aún no tienes listas</p>
              <p className="text-sm text-muted-foreground mt-2">Crea tu primera lista y añade los ítems cuando quieras.</p>
            </div>
          )}
          {!enLinea && <p role="status" className="text-sm text-muted-foreground mb-4">Conéctate para consultar o modificar tus listas.</p>}
          <ul className="space-y-3" aria-label="Listas personales de equipo" aria-busy={bloqueado}>
            {equipo.listas.map((lista) => (
              <li key={lista.id} className="bg-card border border-border rounded-2xl p-4">
                <h3 className="font-semibold break-words">{lista.nombre}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {lista.items.length === 0 ? 'Sin ítems todavía' : `${lista.items.length} ${lista.items.length === 1 ? 'ítem' : 'ítems'} · ${lista.items.filter((item) => item.obligatorio).length} obligatorios`}
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={bloqueado || !enLinea} onClick={() => { void editar(lista.id); }}
                    aria-label={`Editar lista ${lista.nombre}`}
                    className="flex-1 min-h-12 inline-flex justify-center items-center gap-2 rounded-xl bg-muted text-sm font-semibold disabled:opacity-50">
                    <Pencil size={16} aria-hidden="true" /> Editar
                  </button>
                  <button type="button" disabled={bloqueado || !enLinea} onClick={() => { void eliminar(lista); }}
                    aria-label={`Eliminar lista ${lista.nombre}`}
                    className="min-h-12 px-3 inline-flex justify-center items-center gap-2 rounded-xl text-destructive text-sm font-semibold disabled:opacity-50">
                    <Trash2 size={16} aria-hidden="true" /> Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {equipo.ocupado && <p role="status" className="text-sm text-muted-foreground mt-3">Procesando…</p>}
        </>
      )}
    </div>
  );
}
