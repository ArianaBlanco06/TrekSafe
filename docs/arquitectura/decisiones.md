# Decisiones de arquitectura y costos

> **Actualización de implementación R2 (15/11/2026):** por decisión posterior del PO de usar únicamente recursos gratuitos, D7 sustituye el alojamiento Fly de D1–D3/D5. La evidencia de #106 y sus costos se conserva como antecedente; el [roadmap vigente](../../deployment/oci/README.md) usa Oracle Always Free y no autoriza aprovisionamiento pagado.

## D7 — Dos VM Oracle Always Free y publicación manual del PO

Conservar Vercel Hobby, Supabase Free académico nuevo y Brevo Free; alojar API y worker en **dos AMD VM.Standard.E2.1.Micro**, 1 GB RAM y boot de 50 GB cada una, Ubuntu LTS x86. Una imagen GHCR privada amd64 por digest, construida por CI, se ejecuta con entradas diferentes. API expone HTTPS mediante Caddy/DuckDNS; worker no tiene puertos de aplicación. Cada VM conserva configuración por rol, reinicio Docker/systemd, límites de memoria/logs y apagado ordenado. La separación no constituye alta disponibilidad de la base, proveedor o cuenta.

El PO aún no tiene cuenta Oracle; capacidad gratuita y consumo no se han observado. Dos VM y 100 GB de boot caben en los límites publicados, pero disponibilidad de capacidad y aprobación de cuenta son gates reales. No se sustituyen por recursos de pago si fallan. La reclamación de instancias inactivas, pausa Supabase, cuotas de correo y monitoreo de cinco minutos limitan la continuidad. Costo objetivo **US$0 de recursos contratados**, sujeto a comprobar plan/cupo/tarifa antes y después; no es una factura observada ni un SLA.

La CI valida la imagen en PR y publica en GHCR solo tras pruebas en ramas confiables; no despliega. PO aplica esquema nuevo con bootstrap vacío, registra ledger/digest/SHA/deployment Vercel y ejecuta aceptación en URLs reales antes del cierre. La actualización DEV 032 sigue separada, bajo responsabilidad de Ariana. [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [GHCR](https://docs.github.com/en/billing/concepts/product-billing/github-packages), [recursos y operación](../../deployment/oci/README.md).

## Antecedente D1–D6 de #106

Fecha: **2026-11-10**. Las decisiones D1–D6 son la arquitectura objetivo acordada por el PO. Implementación y dimensionamiento efectivo: #107–#111; evidencia operativa: #112.

## D1 — Mantener plataformas y monolito modular

Conservar React/Vite en Vercel, Node/Express en Fly, PostgreSQL en Supabase y Brevo/SMTP. Mantener el mismo repositorio, contratos REST/JWT y código de negocio compartido. Esto reutiliza el trabajo existente y concentra el cambio en el despliegue y la recuperación de notificaciones. La inversión de dependencias se completa gradualmente en #107.

## D2 — Dos programas en máquinas distintas

Elegir una app Fly por entorno, una imagen y grupos `api` y `worker`, cada uno con una máquina. Solo `api` se asocia a `http_service`. La publicación debe indicar ambos grupos; no basta con iniciar un segundo temporizador dentro de `main.ts`.

| Alternativa | Beneficio | Costo / límite | Decisión |
|---|---|---|---|
| Una máquina y un proceso con temporizadores | Configuración histórica y menor cómputo | Reinicio común, acoplamiento de recursos/arranque | Base actual, reemplazar |
| Una máquina y dos programas | Separación lógica con menor cómputo | Recursos y caída de máquina compartidos; supervisión adicional | Alternativa descartada por preferencia del PO |
| Dos máquinas, grupos api/worker | Reinicios y recursos independientes; misma imagen | Más cómputo, publicación y salud de dos grupos | Objetivo elegido |

Fly documenta que cada grupo usa máquinas propias; siguen compartiendo app, base, región y proveedores. Esta separación no constituye alta disponibilidad. [Grupos de procesos](https://docs.fly.io/launch/processes).

## D3 — Continuidad, región y recursos iniciales

Mantener ambos grupos activos y desactivar suspensión automática. Base de diseño: `iad`, una CPU compartida y 256 MB por máquina, manteniendo la región ya configurada. La DB DEV observada está en `us-east-2`; no se afirma que su latencia sea óptima ni se migra de región por documentación.

#110 medirá memoria, CPU, consultas, tiempos y actividad de tareas antes de dimensionar el entorno publicado. El modo continuo exige que DB y proveedor de correo estén disponibles; no ofrece un SLA 24/7 sobre servicios académicos o límites de planes gratuitos.

## D4 — Outbox transaccional en PostgreSQL

Guardar cambio de negocio, evento y pendiente requerido en una transacción. Separar aceptación del proveedor de recepción real. Implementar reclamación concurrente, reservas vencidas, reintentos y conciliación de inciertos. Reutilizar HU-45/HU-46 y cerrar sus brechas de integración; no agregar un intermediario de mensajes en esta versión.

La outbox resuelve la ventana entre escritura de negocio y publicación del aviso; el consumidor debe contemplar posibles duplicados. [Patrón outbox, AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).

## D5 — Entornos y confianza

DEV y entorno académico tendrán proyectos/datos, claves JWT/cifrado, destinos de correo y configuración separados. Se conservará `service_role` solo en servidor, con controles de actor/propiedad en API/RPC; esa clave evita RLS y no sustituye la autorización del negocio. [Claves de Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

La app Fly comparte secretos entre sus grupos: no se promete aislamiento entre API y worker. Ambos usan el proyecto del mismo entorno. Los accesos de base, operaciones de migración y pruebas deben identificar explícitamente su destino. El plan de la cuenta y el proyecto académico de Supabase siguen sin verificarse.

## D6 — Evolución compatible y evidencia

Publicar esquema compatible antes que consumidores. Mantener HTTP/JWT y las reglas de negocio vigentes; cualquier cambio requerido tendrá regresión y trazabilidad. Las comprobaciones de documentación no sustituyen pruebas funcionales. Una aprobación histórica no acredita el componente modificado.

## Estimación fechada

Modelo: 30 días, 720 horas, dos máquinas activas en `iad`, sin volúmenes propios ni IP dedicada seleccionados. Es un **cálculo de diseño**, no una lectura de factura ni autorización de aprovisionamiento.

| Concepto | Una máquina histórica comparable | Objetivo de dos máquinas | Fuente / condición |
|---|---:|---:|---|
| Cómputo, CPU compartida y 256 MB | US$2,19 | **US$4,38** | Precio unitario × máquinas, 30 días continuos |
| Salida Fly a Internet | Variable | US$0,02 × GB facturables en Norteamérica | No se conoce volumen ni tarifa contractual de la organización |
| Almacenamiento de máquinas detenidas / despliegues | No calculado | Variable | Máquinas temporales o detenidas pueden añadir cargos |
| IP de egreso fija | No asumida | US$0 base del modelo; si se necesita, ~US$3,60/mes por IP | No se asigna por defecto; revisar solo si el proveedor lo requiere |
| Supabase | Cuenta no verificada | Plan y consumo desconocidos | No asumir costo cero por disponer de DEV |
| Vercel | Cuenta no verificada | Plan y consumo desconocidos | El dominio histórico devuelve 404; falta identificar proyecto/plan |
| Brevo/SMTP | Cuenta no verificada | Plan, cuota y consumo desconocidos | No se probó correo real ni facturación |
| Impuestos, moneda, otros extras | No calculados | Adicionales según cuenta | No incluidos en US$4,38 |

El incremento comparable de cómputo es US$2,19 por 30 días, no el incremento total de la factura. Un mes de 31 días, otros tamaños, región, máquinas adicionales o cambios de precios alteran el cálculo. Tarifas consultadas: [Fly](https://docs.fly.io/about/pricing), [Supabase](https://supabase.com/pricing), [Vercel](https://vercel.com/pricing) y [Brevo](https://www.brevo.com/pricing/). La página de Brevo no proporcionó un desglose legible en esta consulta; no se inventa un precio.

Supabase publica un plan gratuito con pausa por inactividad y límites, y un plan Pro desde US$25/mes; esto es una comparación pública, no el plan observado de TrekSafe. La continuidad efectiva depende del plan y estado que se verifiquen en #110. No se crearán proyectos ni se cambiarán suscripciones desde #106.

**Total mensual del sistema: no verificado.** Fórmula a completar en #110: cómputo + transferencia + cargos efectivos de Supabase/Vercel/correo + extras/impuestos. La cifra US$4,38 solo cubre la parte de cómputo descrita.
