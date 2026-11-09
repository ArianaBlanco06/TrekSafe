# HU-34 — Fase 7: entrega

8 de noviembre de 2026. Andriy Hitoshi Enciso Rojas (@Hitoshi). Issue #35, 5 SP.

Registro online de una llegada a un punto propio HU-32, nota opcional, hora servidor y último avance. Idempotencia por cuenta/solicitud; sin modificar estado, versión o plazo ni escribir en eventos_plan. Se conserva cancelación, ampliación y retorno existentes.

Migración `016_hu34_avances_expedicion.sql`, posterior a 002/010, pendiente de aplicar una sola vez en DEV con el equipo. Registro 016 condicional; no se inventa una aplicación ni se ejecuta remotamente.

Andriy autorizó Git, push y apertura de ambos PR el 8 de noviembre. HU-33 se entregó primero en PR #97 con CI aprobado; después ArianaBlanco06 lo integró. HU-34 parte de develop, actualizado al nuevo `8214042` que ya contiene HU-33 y la mejora de copia de puntos HU-28. Sus seis conflictos antiguos se revisaron conservando develop en `1f63856`; la segunda actualización combina las rutas de recorrido/avances y sus reglas NetworkOnly, sin descartar ninguna. El asistente no hizo merge de PR alguno hacia develop ni cambió whitespace histórico de migraciones ajenas.

Demo tras instalar 016 en el entorno acordado: guardar puntos antes de salir, abrir la expedición en progreso, registrar llegada con nota, consultar último avance y comprobar que temporizador/retorno no cambian. Desconectar impide registrar; reconectar requiere acción explícita. Otra cuenta no accede a los avances.

Para concurrencia, respuesta perdida, rollback o vencimiento usar el runner desechable, sin inyectar fallos en la base compartida. [Resultados](fase-6-integracion.md), [contrato](fase-2-contrato.md), [cuerpo del PR](borrador-pr.md). CI remoto, revisión técnica, aceptación del PO y migración DEV siguen sujetos a verificación del equipo. Ningún PR se mergea desde esta tarea.
