# #110 — Paquete de despliegue académico y límites

Se preparó el [roadmap del PO](../../deployment/oci/README.md) desde la creación de su cuenta Oracle, dos VM Always Free, proyecto Supabase académico vacío y CI hasta validación publicada/recuperación/cierre. El alojamiento anterior de #106 se conserva como antecedente y se sustituye mediante D7; no se crean servicios de pago como alternativa automática.

Artefactos: Dockerfile multi-stage Node22 amd64 con revisión OCI, dockerignore sin `.env`/evidencias, Compose API+Caddy/worker separados por VM, configuración por rol, unidades systemd/DuckDNS, actualizador DNS sin token en argumentos, preflight local que no revela secretos, manifiestos vacíos y CI de imagen sin despliegue automático. GHCR permanece privado; solo las ramas confiables publican después de backend/frontend/persistencia, y el PR construye sin secretos ni push.

Los límites configurados son API512MB/worker512MB, heap320MB, Caddy128MB, logs3×5MB; el consumo real no se ha medido. Plazos60s/outbox15s/lote1/heartbeat180s/atraso600s y monitor externo5min son perfiles iniciales, no garantías de capacidad/detección inmediata.

La verificación local de este paquete comprende diez tests del preflight, compilación sintáctica Python, sintaxis Bash y revisión de aislamiento/secretos. No hay Docker en el host de preparación: la construcción real de imagen y la importación de API/worker dentro de ella quedan a cargo del check CI del PR, y deberá citarse su resultado antes de darlas por probadas. Tampoco hay Oracle/Supabase académico/URLs nuevas, costo observado, correo real o aceptación integral realizados por este paquete.

La validación de YAML/Compose mediante Docker también queda pendiente del check CI; la revisión local del texto y las pruebas Python no la sustituyen.

Para acreditar #110 faltan: capacidad Always Free y planes reales, imagen construida/privada/digest de CI, esquema aplicado y verificado en destino, URLs con SHA/digest/ledger contrastados, pruebas de monitoreo/reinicio/recuperación, métricas observadas y los resultados publicados. El manifiesto por sí solo es declarativo. #108 conserva 032DEV pendiente de Ariana; los cierres #109/#111/#112 requieren sus propias evidencias. No se cierra ninguna issue desde este agente.
