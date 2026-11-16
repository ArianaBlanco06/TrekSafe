import { useEffect, useRef, useState } from 'react';
import { useAutenticacion } from '@/context/ContextoAutenticacion';
import { useEstadoEnLinea } from '@/hooks/useEstadoEnLinea';
import { getSessionScope } from '@/lib/sesion';
import { puntosRutaApi, type PuntoRuta } from '@/services/puntosRuta';
import { ErrorClienteApi } from '@/services/clienteApi';
import { avancesExpedicionApi, type AvanceExpedicion, type SolicitudAvance } from '@/services/avancesExpedicion';

type Props = { expedicionId: string; estado: string };
export function PanelAvancesExpedicion(props: Props) {
  const { usuario } = useAutenticacion();
  return <FormularioAvance key={`${usuario?.id}:${getSessionScope()}:${props.expedicionId}`} {...props} />;
}

function FormularioAvance({ expedicionId, estado }: Props) {
  const enLinea = useEstadoEnLinea();
  const [puntos, setPuntos] = useState<PuntoRuta[]>([]);
  const [ultimo, setUltimo] = useState<AvanceExpedicion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [errorEnvio, setErrorEnvio] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [puntoId, setPuntoId] = useState('');
  const [nota, setNota] = useState('');
  const [pendiente, setPendiente] = useState<SolicitudAvance | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [intento, setIntento] = useState(0);
  const ocupado = useRef(false);
  const scope = useRef(getSessionScope());
  const montado = useRef(true);
  const vigente = () => montado.current && scope.current === getSessionScope();
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  useEffect(() => {
    let valida = true;
    setCargando(true); setErrorCarga('');
    Promise.all([puntosRutaApi.consultar(expedicionId), avancesExpedicionApi.ultimo(expedicionId)])
      .then(([ruta, resultado]) => {
        if (!valida || !vigente()) return;
        setPuntos([...ruta.puntos].sort((a, b) => a.orden - b.orden)); setUltimo(resultado.ultimoAvance);
      })
      .catch(error => { if (valida && vigente()) setErrorCarga(error instanceof Error ? error.message : 'No se pudieron consultar los avances.'); })
      .finally(() => { if (valida && vigente()) setCargando(false); });
    return () => { valida = false; };
  }, [expedicionId, intento]);

  const notaNormal = nota.replace(/\r\n?/g, '\n').replace(/^[ \t\n]+|[ \t\n]+$/g, '');
  const puedeNuevo = estado === 'en_progreso' && enLinea && !cargando && !errorCarga && puntos.length > 0;

  async function enviar() {
    if (ocupado.current || !enLinea || (!pendiente && !puedeNuevo)) return;
    if (!pendiente && (!puntos.some(p => p.id === puntoId) || Array.from(notaNormal).length > 500)) {
      setErrorEnvio('Selecciona un punto y escribe una nota de hasta 500 caracteres.'); return;
    }
    const solicitud = pendiente ?? Object.freeze({ solicitudId: crypto.randomUUID(), puntoId, nota: notaNormal || null });
    ocupado.current = true; setEnviando(true); setErrorEnvio(''); setMensaje(''); setPendiente(solicitud);
    try {
      const respuesta = await avancesExpedicionApi.registrar(expedicionId, solicitud);
      if (!vigente()) return;
      setPendiente(null); setNota(''); setPuntoId('');
      setMensaje(respuesta.repetida ? 'El avance ya estaba registrado. Recuperamos su confirmación.' : 'Avance registrado.');
      // Consultar el último real: un reenvío antiguo no debe reemplazar uno posterior.
      try {
        const resultado = await avancesExpedicionApi.ultimo(expedicionId);
        if (vigente()) setUltimo(resultado.ultimoAvance);
      } catch { if (vigente()) setErrorEnvio('El avance está confirmado, pero no se pudo actualizar el último registro. Usa «Actualizar avances».'); }
    } catch (error) {
      if (!vigente()) return;
      if (error instanceof ErrorClienteApi && error.status > 0 && error.status < 500) {
        setPendiente(null);
        setErrorEnvio(error.message);
      } else {
        setErrorEnvio('No pudimos confirmar el envío. Reintenta para recuperar su resultado sin duplicarlo.');
      }
    } finally {
      ocupado.current = false;
      if (vigente()) setEnviando(false);
    }
  }

  return <section aria-label="Avances manuales" className="rounded-2xl border border-border bg-card p-4 my-5 space-y-4">
    <h3 className="font-semibold">Avance manual</h3>
    <p className="text-sm text-muted-foreground">Registrar un avance no confirma tu retorno ni cambia el plazo.</p>
    {cargando && <p role="status">Cargando avances…</p>}
    {errorCarga && <p role="alert" className="error-banner">{errorCarga}</p>}
    <button type="button" disabled={!enLinea || enviando || cargando} className="min-h-11 text-primary font-semibold disabled:opacity-50"
      onClick={() => setIntento(valor => valor + 1)}>Actualizar avances</button>
    {ultimo ? <div aria-label="Último avance" className="rounded-xl bg-muted p-3 text-sm space-y-1">
      <p className="font-semibold">Último avance: {ultimo.punto.orden}. {ultimo.punto.nombre}</p>
      <p>{new Date(ultimo.registradoEn).toLocaleString('es-PE')}</p>
      {ultimo.nota && <p className="whitespace-pre-wrap break-words">{ultimo.nota}</p>}
    </div> : !cargando && !errorCarga && <p className="text-sm">Todavía no registraste avances.</p>}
    {!cargando && !errorCarga && puntos.length === 0 && <p className="text-sm">Esta ruta no tiene puntos intermedios registrados.</p>}
    {estado !== 'en_progreso' && <p className="text-sm">Solo se pueden registrar nuevas llegadas mientras la expedición está en progreso.</p>}
    {!enLinea && <p role="status" className="text-sm">Sin conexión. Los avances se registran únicamente online.</p>}
    {mensaje && <p role="status" className="text-sm text-primary">{mensaje}</p>}
    {errorEnvio && <p role="alert" className="error-banner">{errorEnvio}</p>}
    <form onSubmit={event => { event.preventDefault(); void enviar(); }} className="space-y-3">
      <fieldset disabled={!puedeNuevo || enviando || !!pendiente} className="space-y-3">
        <label htmlFor="avance-punto" className="block text-sm font-semibold">Punto alcanzado</label>
        <select id="avance-punto" className="input-field" value={puntoId} onChange={event => setPuntoId(event.target.value)}>
          <option value="">Selecciona un punto</option>
          {puntos.map(punto => <option key={punto.id} value={punto.id}>{punto.orden}. {punto.nombre}</option>)}
        </select>
        <label htmlFor="avance-nota" className="block text-sm font-semibold">Nota del avance (opcional)</label>
        <textarea id="avance-nota" className="input-field min-h-24" value={nota} onChange={event => setNota(event.target.value)} />
        <p className="text-xs text-muted-foreground">{Array.from(notaNormal).length}/500 caracteres</p>
      </fieldset>
      <button type="submit" className="btn-primary" disabled={enviando || !enLinea || (!pendiente && (!puedeNuevo || !puntoId))}>
        {enviando ? 'Registrando avance…' : pendiente ? 'Reintentar envío de avance' : 'Registrar avance'}
      </button>
      {pendiente && !enviando && <button type="button" className="min-h-11 text-sm underline" onClick={() => {
        if (window.confirm('El envío anterior pudo haberse guardado. ¿Quieres preparar otra llegada con una solicitud diferente?')) {
          setPendiente(null); setErrorEnvio(''); setMensaje('Puedes preparar otra llegada; el envío anterior puede existir en el servidor.');
        }
      }}>Preparar otra llegada</button>}
    </form>
  </section>;
}
