# HU-34 — Fase 5: interfaz online

8 de noviembre de 2026. `PanelAvancesExpedicion` se integra en la pantalla activa y reutiliza puntos HU-32. No bloquea retorno, ampliación o temporizador, ni modifica `servicioExpedicion.ts`.

Selección de punto y nota opcional; último avance con hora del servidor y texto seguro. Sin puntos, error de carga, falta de red o estado distinto de progreso, se impiden nuevas llegadas. Se indica que un avance no confirma retorno ni cambia el plazo.

Una respuesta incierta conserva solicitud y contenido en memoria, bloquea la edición y ofrece reintento explícito con el mismo ID. Reconectar no envía automáticamente. Preparar otra llegada exige confirmar que la anterior pudo guardarse. Tras confirmar se consulta el último real para no mostrar un reenvío antiguo como si fuese el más reciente.

No se persisten notas/solicitudes en storage; recargar pierde la edición no confirmada. Cambio de sesión/expedición remonta el componente y descarta callbacks anteriores. Cliente HTTP con protecciones de sesión y no-store; regla explícita NetworkOnly de avances en Vite, conservando las existentes.

Tres pruebas de formulario con respuestas controladas y cinco con cadena real verifican estos flujos. Ver [integración](fase-6-integracion.md).
