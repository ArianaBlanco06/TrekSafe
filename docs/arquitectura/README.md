# Arquitectura de despliegue — TrekSafe R2

Entrega de diseño de [DEP-01 / issue #106](https://github.com/ArianaBlanco06/TrekSafe/issues/106). Responsable: **Marko Antonio Lopez Bernuy, PO (@marKoGit13)**. Fecha de corte: **2026-11-10, America/Lima (UTC−05:00)**.

La arquitectura objetivo conserva Vercel, Fly.io, Supabase y Brevo/SMTP, con **API y procesador en máquinas separadas y monitoreo continuo**. Esta entrega modifica documentación. No crea máquinas, aplica SQL, cambia contratos públicos ni acredita un despliegue R2 completo.

## Lectura y entregables

| Documento | Pregunta que resuelve |
|---|---|
| [Estado actual](estado-actual.md) | ¿Qué existe, qué está integrado y qué se pudo verificar? |
| [Arquitectura objetivo](arquitectura-objetivo.md) | ¿Qué ejecutará cada componente y cómo se comunicarán? |
| [Decisiones y costos](decisiones.md) | ¿Por qué esta alternativa y qué recursos supone? |
| [Contratos y operación](contratos-y-operacion.md) | ¿Qué interfaces, configuración y manejo de fallos deben respetarse? |
| [Transición y validación](transicion-y-validacion.md) | ¿Cómo llegar al objetivo sin perder pendientes o confundir entornos? |
| [Matriz de trazabilidad](matriz-trazabilidad.md) | ¿Qué issue y prueba cubren cada requisito? |
| [Evidencias de esta entrega](evidencias.md) | ¿Qué se comprobó para #106 y qué sigue sin verificarse? |

## Versiones y significado de los estados

La base de código inspeccionada es `develop` en `8508bb449fe731342834a528327fa40b15a83b94`; `main` está en `f89d6afa8454ffe89090c868233ab678a0ffc19c`. El PR de esta documentación añade únicamente el diseño sobre esa base. Su commit de entrega se identifica en el historial del PR, evitando una referencia circular al hash del propio documento.

- **Implementado:** existe código en una revisión identificada; no implica integración ni publicación.
- **Integrado:** forma parte de la base `develop` identificada; no implica despliegue.
- **Verificado en DEV:** hay evidencia específica del proyecto DEV; no se extrapola al entorno académico.
- **Publicado verificado:** se identifican entorno y versión mediante evidencia del proveedor y pruebas contra ese destino.
- **Objetivo:** requisito para las siguientes issues; todavía no es comportamiento acreditado.
- **No verificado:** el acceso o la evidencia no permiten concluir; no equivale a inexistencia o caída.

## Cobertura de aceptación de #106

| Criterio de la issue | Entregable y comprobación |
|---|---|
| Diagramas actuales/objetivo ligados a versión | Estado actual y arquitectura objetivo; Mermaid y vistas SVG verificadas |
| Responsabilidad, datos y secretos por componente | Tablas de componentes, límites de confianza y contratos |
| Alternativas, recursos, operación y costo verificado | Decisiones, comparación de una/dos máquinas y cálculo fechado; costos de cuenta no disponibles identificados |
| Matriz requisito–componente–issue–prueba | Matriz DEP-01 a DEP-07, HU y regresiones enlazadas |
| README dirige a configuración y procedimientos vigentes | README principal actualizado, separación DEV/publicado y secuencia de transición |

Las verificaciones de documentación están en [evidencias](evidencias.md). El cierre operativo del conjunto corresponde a [#112](https://github.com/ArianaBlanco06/TrekSafe/issues/112); el diseño de #106 no sustituye sus pruebas.
