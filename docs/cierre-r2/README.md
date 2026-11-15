# Cierre técnico y aceptación de Release 2

El corte de GitHub registra las **25 HU de R2 cerradas** y las **seis asignaciones PO #107–112 abiertas**. El cierre de una HU en el tablero no prueba su aceptación en el entorno publicado. Esta carpeta conserva criterios, evidencia local, inventario DEV y el procedimiento para completar la aceptación.

**La entrega publicada y la aceptación integral siguen pendientes.** El PO todavía no tiene cuenta Oracle, no se ha creado el nuevo proyecto académico y la migración 032 no está aplicada en DEV. No hay URLs públicas verificadas de este candidato ni recepción real de correo acreditada en esta ejecución.

| Necesidad | Artefacto |
|---|---|
| Criterios exactos capturados y fecha | [25 HU / 75 CA](fuentes-criterios.json), [seis tareas PO](fuentes-criterios-po.json) |
| Revisión #107 y #108, comandos y límites | [Acreditación backend/datos](acreditacion-107-108.md) |
| Estado DEV de solo lectura | [Inventario](dev-inventario.json), [comparación de funciones](comparacion-funciones-dev-local.json), [revalidación puntual del 15/11](dev-revalidacion-20261115.json) |
| Aplicación incremental a cargo de Ariana | [Paquete 032 y verificación](paquete-032/README.md) |
| Nueva base académica sin cuentas conocidas | [Orden de instalación](../../backend/migrations/academico/README.md) |
| Integración de ciclos, outbox y disponibilidad | [Dossier operativo](integracion-operativa.md) |
| Consultas compartidas, login y prueba publicada parcial | [Dossier PWA](pwa-validacion.md) |
| Despliegue manual desde cuenta Oracle y recuperación | [Roadmap del PO](../../deployment/oci/README.md), [alcance de #110](despliegue-academico.md) |
| Resultados integrados con candidato y límites | [Resumen persistente](evidencia-integrada.json) |
| Cada criterio y su evidencia identificada | [Matriz legible](matriz-aceptacion.md), [JSON canónico](matriz-aceptacion.json) |
| Carga, correo, fallos, privacidad y PWA publicados | [Protocolo del PO](protocolo-aceptacion.md) |
| Registro final y decisión humana | [Acta pendiente](acta-aceptacion.md) |
| Revisión independiente y comprobación de evidencia | [Informe QA](revision-independiente.md) |

Los dossiers de PWA y despliegue están incorporados. El coordinador adjunta el enlace al PR/CI del candidato final. Los recuentos de pruebas de ejecuciones solapadas no deben sumarse como pruebas únicas; los grupos SQL condicionales omitidos se distinguen del alcance ejecutado por el runner PostgreSQL/PostgREST y su informe específico.

Para regenerar y comprobar la matriz base: `node docs/cierre-r2/generar-matriz.mjs`. Comprueba 75 identificadores únicos y existencia de referencias; no ejecuta los criterios funcionales ni concede aceptación. El generador reemplaza la matriz base: conservar los resultados reales en un registro fechado separado por ejecución, enlazado desde el acta, para evitar perderlos al regenerar. Los estados de esta matriz base se mantienen pendientes.

Orden de cierre: validar candidato y revisión requerida → aplicar/verificar lo pendiente por entorno → desplegar siguiendo roadmap → ejecutar protocolo y matriz → resolver bloqueantes → decisión documentada del PO → actualizar asignaciones y release. No se estima una fecha de cierre sin disponibilidad gratuita, publicación y duración real de las correcciones. El ensayo publicado propuesto ocupa 45 minutos una vez preparados entornos y fixtures; no incluye aprovisionamiento ni corrección de defectos.
