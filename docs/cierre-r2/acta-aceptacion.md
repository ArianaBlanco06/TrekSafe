# Acta de aceptación de Release 2

**Estado: ACEPTADO por el Product Owner el 16/11/2026.** Marko Antonio Lopez Bernuy confirmó las comprobaciones end to end realizadas por el equipo y autorizó el cierre de Release 2 en [#112, confirmación del PO](https://github.com/ArianaBlanco06/TrekSafe/issues/112#issuecomment-6908004890). Este documento transcribe esa decisión; no representa una nueva ejecución independiente de la aceptación integral.

| Dato | Registro y fuente |
|---|---|
| PO que valida | Marko Antonio Lopez Bernuy (`marKoGit13`) |
| Fecha de la confirmación | 16/11/2026 05:15:56 UTC / 16/11/2026 00:15:56, America/Lima |
| Decisión y tareas | Aceptación y cierre autorizados para #109, #110, #111 y #112 y el hito Release 2, según la confirmación enlazada |
| Candidato aceptado | `931c0b13d78dee4814659983b79f1eb7fe765501`, merge de #141; identificado en [PR #142](https://github.com/ArianaBlanco06/TrekSafe/pull/142) |
| Imagen académica publicada | `ghcr.io/arianablanco06/treksafe-r2-academico@sha256:c9664d3e50fbbf1cf73fc3a06348630f5440ba3ccdb5deee1b072862876ee64a`, revisión `931c0b13d78dee4814659983b79f1eb7fe765501`, `linux/amd64`, visibilidad pública; [CI y artefacto de identidad](https://github.com/ArianaBlanco06/TrekSafe/actions/runs/43794165943) |
| Identidad de API y worker en ejecución | PR #142 informa el despliegue de esa imagen en Oracle Cloud. Los endpoints públicos acreditan disponibilidad, no el digest ejecutado; este documento no sustituye la comprobación de las VM |
| Frontend publicado | [treksafe-r2.vercel.app](https://treksafe-r2.vercel.app); corrección final del login en [#143](https://github.com/ArianaBlanco06/TrekSafe/pull/143). El commit del despliegue final se comprobará después de integrar los cambios de cierre |
| Proyecto académico | `treksafe-academico-r2`, referencia `yboghlevvipskyangcod`, separado de DEV; asiento 032 confirmado por consulta directa el 16/11/2026 |
| URLs de API y disponibilidad | [API: salud](https://treksafe-v2.duckdns.org/api/salud) y [worker: disponibilidad](https://treksafe-v2.duckdns.org/api/disponibilidad); ambos HTTP 200, disponibilidad `operativo`, observados el 16/11/2026 durante esta actualización |
| Evidencia de 032 DEV | [Seguimiento técnico del 15/11/2026](https://github.com/ArianaBlanco06/TrekSafe/issues/112#issuecomment-6903405662) y [registro de aplicación](../../backend/migrations/REGISTRO_APLICACION.md) |
| Validaciones automáticas | [CI del candidato](https://github.com/ArianaBlanco06/TrekSafe/actions/runs/43881592845): backend, frontend, persistencia y construcción de imagen aprobados. #142 debe volver a validarse sobre su commit definitivo |

## Alcance de la evidencia de aceptación

La confirmación del PO atribuye la validación end to end al equipo. No incorpora un desglose nuevo de los 75 criterios, cifras de correos recibidos, mediciones de carga 10+2/observación, consumo cloud ni resultados individuales de reinicio y restauración. Por ello no se inventan esos valores ni se convierten en aprobados los registros históricos de la [matriz de aceptación](matriz-aceptacion.md). El detalle técnico debe citar su evidencia de ejecución cuando se incorpore al expediente.

Las restricciones offline y del alojamiento académico permanecen documentadas en el [protocolo](protocolo-aceptacion.md), la [validación PWA](pwa-validacion.md) y el [roadmap de despliegue](../../deployment/oci/README.md). La aceptación no promete ausencia total de errores ni disponibilidad continua de los servicios gratuitos.

## Correcciones finales y cuentas académicas

- #143 corrige la visibilidad del acceso rápido: las cuentas demo de DEV no existen en el entorno académico.
- Por instrucción del PO, el 16/11/2026 se añadieron directamente al proyecto académico tres identidades ficticias de rescatista, cada una con registro institucional activo, usuario y perfil vinculados. La operación fue transaccional y conservó los cinco usuarios previos; después se verificaron ocho usuarios, tres perfiles de rescatista y tres registros del padrón. No se modificó DEV ni el esquema.
- Las credenciales se entregan al PO por canal privado y se excluyen de este acta, del repositorio y de la publicación. Estas cuentas son datos de demostración; no acreditan identidad ni afiliación institucional reales.
- La aceptación del PO, la integración de develop en main y la publicación de `v2.0.0` son eventos distintos. Al actualizar este acta, #143 y #142 están abiertos; falta la integración del acta, verificar la versión publicada final y etiquetar el commit definitivo de main. La congelación de develop solo admite las correcciones de cierre coordinadas.

**Decisión del PO: ACEPTADO.** Confirmación verificable: [comentario del PO en #112](https://github.com/ArianaBlanco06/TrekSafe/issues/112#issuecomment-6908004890).
