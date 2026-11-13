# Revisión PO Sprint 2 — cinco PR

Fecha: 2026-11-13. Revisión y correcciones por Codex por delegación de Marko; se conserva la autoría de los PR. Código conjunto probado: `903274c`. Base `develop`: `6ad98a9`.

## Entrega y orden

Los PR se preparan como una cadena hacia develop: **#126 → #115 → #90 → #93 → #94**. Cada rama incorpora las anteriores mediante merges normales; cuando estas se integren, su contenido desaparecerá del diff de las siguientes. No se usa force-push ni se modifica main.

| HU / issue | PR | Revisión de criterios |
|---|---|---|
| HU-42 / #43 | #126 | [Cierre atómico y estados separados](../hu-42/evidencias/revision-po.md) |
| HU-49 / #51 | #115 | [Borrador e identidad persistente](../hu-49/revision-po.md) |
| HU-45 / #47 | #90 | [Reservas, intentos y recuperación](../hu-45/revision-po.md) |
| HU-44 / #46 | #93 | [Retorno y destinatarios](../hu-44/revision-po.md) |
| HU-46 / #48 | #94 | [Responsable y reintento manual](../hu-46/revision-po.md) |

## Validación conjunta local

- Node 22.23.4: **996 backend**, **242 frontend**; 2 frontend condicionales omitidas, no contadas como aprobadas. Tipos y builds de ambos componentes aprobados.
- PostgreSQL 17.11/PostgREST 16.5 desechables: **33 escenarios** de instalación/actualización/rollback/permisos y SDK real; incluyen **80 pruebas TS** de contratos HU-30/31/36/41/42, sin omisiones.
- SDK real: dos workers, token vencido, caída SQL después de aceptación, resultado incierto, reintento manual concurrente y tras otra instancia, retorno atómico e idempotente. Transportes sustituidos; ningún envío real.
- Edge headless: **13 UI + 28 PWA**, incluido 401 y lectura/escritura/respuesta tardía entre sesiones.
- Runner HU-40: **77 escenarios** de SQL/concurrencia aprobados. Runner HU-42: **39 escenarios** aprobados en la revisión individual. HU-49: **13 SQL** aprobados contra el núcleo 022.

Los conteos se superponen: no sumarlos como pruebas únicas. Los scripts crean y detienen bases propias en loopback; no eligen Supabase ni leen .env. El resultado local no acredita DEV, publicación ni recepción real del correo.

## Handoff de migraciones a Ariana

**Aprobación final y merge pendientes de DEV.** Última consulta de esta revisión: no hay asientos 020/025/026/027/028. Comparar también objetos/funciones; un asiento ausente no prueba ausencia de DDL. Antes de ejecutar, actualizar esta consulta por si otro integrante ya aplicó alguno.

| Versión | PR | Prerrequisitos ya existentes / previos | SHA256 Git/LF |
|---|---|---|---|
| 020 | #115 | 002, 014, 022 | `b23bb87b7f373b952d7af5bc4753f6a74163a58749676545130be2815ce9c597` |
| 025 | #126 | 017, 019, 021 | `38ecbead5abf46efb551733c792ff753be174d22660b5a135a74559048ad41ac` |
| 026 | #90 | 015 | `54ba54bc0464cd4b89b69bd921a9d6596d5d68942aa92441490054620642e84d` |
| 027 | #93 | 015, 017, 026 | `537e98f54019c07c9602205adcfe0b1e8dfaa851c784873dad6596efe15e5e7b` |
| 028 | #94 | 017, 026 | `582e6b233f95f4f8c362dad94b1d08114f15a224e1d0f932c259da2cb2f0ba2a` |

Orden del paquete: **020 → 025 → 026 → 027 → 028**, aplicando únicamente lo que realmente falte. 020 depende de 022 ya existente; **021 debe preceder a 025**. 027/028 dependen de 026. Conservar 015 y 022–024; no repetir 000/init_schema ni borrar objetos, asientos o datos para reinstalar.

Para instalación nueva usar el orden explícito del runner, no un glob alfabético. Los números son identidades, no un orden total de dependencias. Los esqueletos 026/027/028 se generaron con Supabase CLI migration new y se adaptaron a la convención NNN.

1. Confirmar el proyecto DEV del equipo `ibnwggvqgjpeqcretjak`, objetos, funciones y catálogo. Revisar advisories antes/después. Pausar cron/transporte real para la comprobación controlada.
2. Verificar hashes contra `manifest.json`, aplicar solo el SQL pendiente y recargar el esquema PostgREST (026/027/028 ya incluyen NOTIFY; hacerlo explícitamente tras 020/025).
3. Registrar archivo, revisión, fecha UTC, entorno, ejecutor humano y resultado real en REGISTRO_APLICACION.md. Los archivos insertan su asiento; no inventar registros de ejecución antes de aplicar.
4. Ejecutar `validar-dev.sql` (solo lectura): RLS, SECURITY INVOKER, permisos exclusivos service_role y privilegios de columnas de incidentes. Contrastar los objetos con el SQL exacto aplicado.
5. Avisar en los PR con el commit del registro y el resultado de la aplicación. Codex repetirá las verificaciones controladas de DEV antes de aprobar/merge; datos ficticios dentro de rollback, sin correo real ni cron.

Las migraciones son aditivas. Ante una falla, conservar datos y pendientes, registrar el estado real y preparar una corrección incremental; no prometer reversión destructiva automática. Si Ariana aún no aplica, los PR quedan listos técnicamente y sin aprobación anticipada. No se cierran issues anteriores ajenas al alcance ni se declara cumplido #109–#112.
