import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const carpeta = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(carpeta, '../..');
const leer = nombre => JSON.parse(fs.readFileSync(path.join(carpeta, nombre), 'utf8'));
const fuentes = leer('fuentes-criterios.json');
const fuentesPO = leer('fuentes-criterios-po.json');
// Los archivos señalan evidencia disponible; su existencia no equivale a una prueba aprobada.
const referencias = {
  26: ['backend/src/application/use-cases/EditarPlan.test.ts', 'backend/src/application/services/FachadaPlanExpedicion.test.ts'],
  27: ['backend/src/application/use-cases/CancelarPlan.test.ts', 'backend/migrations/tests/hu27_cancelar_salida_futura.test.sql'],
  28: ['backend/src/application/creacion-plan/CreadorDesdeHistorial.test.ts', 'frontend/src/testing/hu28RepetirExpedicion.test.tsx'],
  29: ['backend/src/application/services/servicioPlantillas.test.ts', 'backend/src/presentation/http/routes/rutasPlantillas.test.ts'],
  30: ['backend/migrations/tests/hu30_operaciones_equipo.test.sql', 'frontend/src/testing/hu30FlujoCompleto.integration.test.tsx'],
  31: ['backend/migrations/tests/hu31_preparacion.test.sql', 'frontend/src/testing/hu31FlujoCompleto.integration.test.tsx'],
  32: ['backend/src/application/services/servicioPuntosRuta.test.ts', 'backend/src/presentation/http/routes/rutasPuntosRuta.test.ts'],
  33: ['backend/src/presentation/http/routes/rutasRecorrido.test.ts', 'frontend/src/lib/copiarPuntosPlanNuevo.test.ts'],
  34: ['backend/src/application/use-cases/RegistrarAvance.test.ts', 'backend/src/presentation/http/routes/rutasAvancesExpedicion.test.ts'],
  35: ['backend/src/application/use-cases/AmpliarRetorno.test.ts', 'backend/src/infrastructure/jobs/cronFechaLimiteExpedicion.ampliacion.test.ts'],
  36: ['backend/migrations/tests/hu36_eventos_plan_solo_anexado.test.sql', 'frontend/src/pages/PaginaHistorialCambiosPlan.test.tsx'],
  37: ['backend/src/application/services/servicioBandejaAvisos.test.ts', 'frontend/src/pages/PaginaAvisos.test.tsx'],
  38: ['backend/src/application/services/servicioRecordatorioExpedicion.test.ts', 'backend/src/application/use-cases/ProcesarPlazosOperativos.test.ts'],
  39: ['backend/migrations/tests/hu39_asumir_coordinacion.test.sql', 'backend/src/application/use-cases/AsignarResponsable.test.ts'],
  40: ['backend/migrations/tests/hu40_transferir_coordinacion.test.sql', 'frontend/src/components/rescate/BloqueRelevo.test.tsx'],
  41: ['backend/migrations/tests/hu41_bitacora_incidente.test.sql', 'frontend/src/components/rescate/BitacoraIncidente.test.tsx'],
  42: ['backend/migrations/tests/hu42_cerrar_incidente.test.sql', 'frontend/src/components/rescate/CierreIncidente.test.tsx'],
  43: ['backend/src/domain/services/OrdenadorAlertas.test.ts', 'frontend/src/pages/PaginaConsolaRescate.test.tsx'],
  44: ['backend/migrations/tests/hu44_retorno.test.sql', 'backend/src/infrastructure/repositories/RepositorioExpedicion.retorno.test.ts'],
  45: ['backend/migrations/tests/hu45_reservas.test.sql', 'backend/src/application/services/WorkerOutboxNotificaciones.test.ts'],
  46: ['backend/migrations/tests/hu46_reintentos.test.sql', 'backend/src/presentation/http/routes/rutasEntregaIncidente.test.ts'],
  47: ['backend/src/application/use-cases/ConsultarEstadisticasRescate.test.ts', 'frontend/src/pages/PaginaEstadisticasRescate.test.tsx'],
  48: ['backend/src/application/use-cases/ExportarReporteIncidentes.test.ts', 'frontend/src/services/descargaCsvEstadisticas.test.ts'],
  49: ['backend/src/presentation/http/routes/rutasBorradores.test.ts', 'frontend/src/application/commands/CrearPlan.test.ts'],
  50: ['backend/migrations/tests/hu50_ficha_medica_responsable.test.sql', 'backend/src/presentation/http/routes/rutasFichaMedicaIncidente.test.ts'],
};
const escenarios = {
  26: 'Editar como propietario un plan futuro; probar otro usuario, fecha inválida y dos versiones concurrentes; comprobar persistencia y evento único.',
  27: 'Cancelar un plan futuro, repetir la solicitud y dejar pasar su salida; comprobar que no se activa ni alerta; rechazar actor ajeno.',
  28: 'Repetir un plan propio del historial; exigir fechas/contactos nuevos; comprobar nuevo id y ausencia de alertas, confirmaciones o ficha copiada.',
  29: 'Guardar, renombrar y borrar plantilla; consultar con segunda sesión; crear con nuevas fechas y comprobar que borrar no elimina expediciones.',
  30: 'Crear/editar/borrar lista; rechazar nombre vacío y actor ajeno; verificar marcas obligatorias y aislamiento entre dos cuentas.',
  31: 'Asociar lista y marcar equipo; recargar y cambiar lista base; comprobar copia independiente, contador persistente y retorno permitido.',
  32: 'Guardar/reordenar 20 puntos; rechazar punto 21 y coordenadas inválidas sin cambios parciales; conservar extremos.',
  33: 'Ver extremos, puntos y segmentos en su orden; bloquear proveedor de mapa y verificar alternativa de lista/coordenadas en dominio publicado.',
  34: 'Registrar avance online y repetir id; rechazar actor ajeno/estado inválido; comprobar hora servidor, un avance y plazo/alertas intactos.',
  35: 'Ampliar 1 y 120 minutos; rechazar 0/121 y límite vencido; enfrentar cron/ampliación concurrentes y comprobar conflicto sin sobrescritura.',
  36: 'Editar/cancelar/ampliar y consultar historial propio; rechazar actor ajeno; comprobar orden, antes/después y ausencia de secretos/salud.',
  37: 'Generar cada tipo de aviso; leer con dos sesiones; comprobar lectura persistida, evento único y enlace autorizado.',
  38: 'Elegir 15/30/60, comprobar inicial 30 y un aviso por umbral; modificarlo y comprobar que límite y alertas críticas permanecen activos.',
  39: 'Dos rescatistas validados asumen a la vez; exigir un ganador, conflicto con responsable actual y consola sin datos médicos.',
  40: 'Proponer relevo como responsable, rechazar otro actor; comprobar acceso anterior hasta aceptación y transferencia registrada; rechazar relevo paralelo/cerrado.',
  41: 'Añadir entradas como responsable; rechazar otro actor y edición/borrado; corregir añadiendo entrada y consultar orden estable/hora servidor.',
  42: 'Cerrar como responsable un incidente localizado con informe; rechazar vacío, ajeno y no localizado; conservar bitácora y no confirmar retorno.',
  43: 'Alternar ambos criterios con empates; comprobar orden fecha/id, explicación visible y ausencia de cambios de estado/plazo o inferencia médica.',
  44: 'Confirmar retorno y repetir; comprobar evento/outbox atómicos y destinatarios correspondientes; verificar recepción y contenido mínimo sin salud.',
  45: 'Crear pendiente, detener/reiniciar worker y usar fallo confirmado/ambiguo controlado; comprobar reservas, tres intentos máximos e incierto sin reenvío ciego.',
  46: 'Consultar como responsable, rechazar ajeno; repetir comando manual sobre fallido; comprobar enviado protegido e incierto pendiente de revisión.',
  47: 'Filtrar fechas/zona/resultado y comparar datos conocidos con varios relevos/entradas; comprobar incidentes únicos y ausencia de salud.',
  48: 'Exportar el mismo filtro sobre 1000 incidentes ficticios; revisar paginación sin duplicados, UTF-8/comillas y neutralización de fórmulas.',
  49: 'Crear borrador offline, reiniciar PWA y cambiar cuenta; reconectar, revisar fechas/contactos y repetir id; comprobar persistencia aislada y un solo plan.',
  50: 'Probar responsable con consentimiento, actor ajeno y consentimiento revocado; aceptar relevo y cerrar; comprobar autorización antes de descifrar, auditoría y correo sin salud.',
};
const refPO = {
  107: ['docs/cierre-r2/acreditacion-107-108.md', 'backend/src/application/services/desacoplamiento.test.ts'],
  108: ['docs/cierre-r2/acreditacion-107-108.md', 'backend/scripts/test-dep108-postgres.mjs', 'docs/cierre-r2/paquete-032/manifest.json'],
  109: ['docs/cierre-r2/integracion-operativa.md', 'backend/src/infrastructure/jobs/tareasOperativas.test.ts'],
  110: ['docs/cierre-r2/integracion-operativa.md', 'backend/migrations/032_dep110_estado_worker.sql'],
  111: ['frontend/src/services/clienteApi.test.ts', 'backend/src/presentation/http/cachePrivada.test.ts'],
  112: ['docs/cierre-r2/protocolo-aceptacion.md', 'docs/cierre-r2/acta-aceptacion.md'],
};
const pendientesPO = {
  107: 'Regresión y CI del candidato integrado, revisión independiente y cierre técnico trazado.',
  108: 'Ariana aplica y verifica solo 032 en DEV; registrar esquema real del nuevo proyecto académico y prueba de recuperación.',
  109: 'Flujo completo publicado, corte/reinicio y correo controlado con recepción confirmada.',
  110: 'Crear cuenta/recursos gratuitos, publicar candidato, medir consumo y ensayar recuperación con URLs/digest/esquema reales.',
  111: 'Completar medición de carga inicial, PWA/SW, mapa y privacidad contra el dominio publicado.',
  112: 'Ejecutar las 75 CA y regresiones R1 pertinentes, prueba de carga/fallos, cerrar bloqueantes y firmar aceptación PO.',
};
const historias = fuentes.historias.flatMap(h => h.criterios.split('\n').filter(Boolean).map(linea => {
  const encontrado = /^- \[([ x])\] \*\*(CA-\d+) — (.+?):\*\* (.+)$/.exec(linea);
  if (!encontrado) throw new Error(`Criterio no reconocido en HU${h.hu}`);
  return {
    id: `HU${h.hu}-${encontrado[2]}`, hu: h.hu, issue: h.issue, fuente: h.url,
    criterio: `${encontrado[3]}: ${encontrado[4]}`,
    issue_estado_capturado: h.estado_github,
    casilla_criterio_capturada: encontrado[1] === 'x',
    evidencia_disponible: referencias[h.hu],
    local: 'Referencias identificadas; resultado de suites por ejecución y revisión específica del criterio pendiente de consolidar.',
    dev: 'Inventario de solo lectura hasta 031; no se ejecutó esta CA funcionalmente en DEV durante este corte.',
    publicado: 'BLOQUEADO: entorno académico y URLs todavía no disponibles.',
    resultado_aceptacion: 'PENDIENTE',
    ejecucion_requerida: escenarios[h.hu],
  };
}));
if (historias.length !== 75 || new Set(historias.map(h => h.id)).size !== 75) throw new Error('Deben existir exactamente 75 CA únicas');
const tareas = fuentesPO.tareas.map(t => ({
  id: `TECH-${t.issue}`, issue: t.issue, titulo: t.titulo, fuente: t.url,
  criterios_originales: t.criterios, estado_github_capturado: t.estado,
  evidencia_disponible: refPO[t.issue],
  local: [107,108,109].includes(t.issue) ? 'Evidencia local aportada por agentes; requiere resultado integrado y CI.' : 'Preparación en curso; no acredita ejecución publicada.',
  dev: '032 pendiente de aplicación por Ariana; inventario hasta 031 disponible.',
  publicado: 'PENDIENTE', resultado_aceptacion: 'PENDIENTE', pendiente: pendientesPO[t.issue],
}));
for (const entrada of [...historias, ...tareas]) {
  for (const archivo of entrada.evidencia_disponible) {
    if (!fs.existsSync(path.join(raiz, archivo))) throw new Error(`Referencia inexistente: ${archivo}`);
  }
}
const matriz = {
  version: 1, corte_fuentes_utc: fuentes.consultado_utc, base_fuentes: fuentes.base,
  alcance: '75 CA de HU26-HU50 y seis tareas PO. Closed en GitHub no acredita cada CA ni aceptación publicada. Ningún smoke equivale a cobertura integral.',
  evidencia_ejecucion: 'Resultados de los agentes en dossiers; el informe del coordinador y CI deben identificar el SHA candidato final. No sumar suites solapadas como pruebas únicas.',
  historias, tareas,
};
fs.writeFileSync(path.join(carpeta, 'matriz-aceptacion.json'), `${JSON.stringify(matriz, null, 2)}\n`);
const limpiar = valor => valor.replaceAll('|', '\\|').replaceAll('\n', ' ');
let md = '# Matriz de aceptación R2\n\nFuente canónica: [JSON](matriz-aceptacion.json). Son 75 criterios y seis tareas PO. Cada fila conserva el criterio original, enlaces a pruebas y ejecución pendiente. **Todas las aceptaciones publicadas permanecen pendientes.** Las referencias de pruebas acreditan existencia; consultar sus ejecuciones en los dossiers y CI del candidato.\n\n';
md += '| CA | Criterio exacto | Evidencia disponible | Publicado |\n|---|---|---|---|\n';
for (const h of historias) md += `| [${h.id}](${h.fuente}) | ${limpiar(h.criterio)} | ${h.evidencia_disponible.map(p => `[${path.basename(p)}](../../${p.replace(/^docs\//,'')})`).join('; ')} | Pendiente |\n`;
// Enlaces desde docs/cierre-r2: dos niveles llevan a la raíz del repositorio.
md = md.replaceAll('(../../cierre-r2/', '(');
md += '\n## Asignaciones PO\n\n| Tarea | Evidencia | Condición pendiente |\n|---|---|---|\n';
for (const t of tareas) md += `| [#${t.issue}](${t.fuente}) | ${t.evidencia_disponible.map(p => `[${path.basename(p)}](${p.startsWith('docs/cierre-r2/') ? p.slice(15) : '../../'+p})`).join('; ')} | ${t.pendiente} |\n`;
md += '\nLas casillas originales de HU39–HU50 están sin marcar en la captura, aunque sus issues figuren cerrados. Se preservan en el JSON; no se corrigen por inferencia. El inventario DEV verifica objetos/permisos, no los 75 comportamientos.\n';
fs.writeFileSync(path.join(carpeta, 'matriz-aceptacion.md'), md);
console.log('Matriz comprobada: 75 CA únicas, 6 tareas y referencias existentes. Aceptación publicada: 0/75.');
