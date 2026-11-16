# Arquitectura objetivo

**Estado: diseño aprobado para implementación en DEP-02 a DEP-06.** Base y comprobaciones: [estado actual](estado-actual.md). Decisiones: [registro](decisiones.md).

## Contexto y límites de confianza

```mermaid
flowchart TB
    U["Senderista / rescatista"]
    subgraph B["Navegador: entorno no confiable"]
        P["PWA React"]
    end
    V["Vercel: recursos públicos"]
    subgraph T["Servidor: lógica y credenciales privadas"]
        A["API TrekSafe"]
        W["Procesador TrekSafe"]
    end
    S[("Supabase: datos y outbox")]
    E["Proveedor de correo"]
    M["OpenStreetMap"]
    U --> P
    V -->|"HTTPS: archivos estáticos"| P
    P -->|"HTTPS: REST + JWT propio"| A
    P -->|"HTTPS: mapas"| M
    A -->|"HTTPS: consultas / RPC"| S
    W -->|"HTTPS: consultas / RPC"| S
    W -->|"TLS: notificaciones mínimas"| E
```

[Vista SVG](diagramas/arquitectura-objetivo-1.svg). La base valida actor, propiedad y transacciones a través de los contratos del backend/RPC; el navegador nunca recibe `service_role`. API y procesador son programas distintos del mismo sistema, con privilegios de servidor: separarlos no crea aislamiento de credenciales dentro de una misma app Fly.

## Despliegue por entorno

```mermaid
flowchart TB
    U["Navegador / PWA"]
    V["Vercel: build frontend/dist"]
    subgraph F["Una app Fly por entorno, región iad"]
        I["Una imagen Docker / un commit"]
        A["Grupo api: 1 máquina, 256 MB, CPU compartida"]
        W["Grupo worker: 1 máquina, 256 MB, CPU compartida"]
        I -.-> A
        I -.-> W
    end
    subgraph S["Proyecto Supabase propio del entorno"]
        D[("Datos, eventos, reservas y outbox")]
    end
    E["Brevo API / SMTP"]
    U -->|"HTTPS"| V
    U -->|"HTTPS público, interno 3000"| A
    A -->|"HTTPS: Data API / RPC"| D
    W -->|"HTTPS: Data API / RPC"| D
    W -->|"HTTPS 443 o SMTP TLS"| E
```

[Vista SVG](diagramas/arquitectura-objetivo-2.svg). Las conexiones representan acceso a través de la Data API de Supabase, no SQL directo por HTTPS. El `worker` no tendrá servicio HTTP público ni dependerá de peticiones de usuarios para continuar. Ambos grupos permanecerán activos. Se dimensiona inicialmente una máquina por grupo; los despliegues pueden necesitar capacidad temporal adicional.

## Componentes, entradas y resultados

| Componente | Responsabilidad y entrada | Resultado y persistencia | Límite / responsable |
|---|---|---|---|
| PWA | Formularios, mapas, sesión y sincronización permitida | Peticiones REST, interfaz y borradores autorizados por sesión | Sin claves de servidor; #111 |
| Vercel | Distribuir build estático por HTTPS | HTML, JS, CSS y Service Worker públicos | `VITE_API_URL` se incorpora al compilar; #110 |
| API | Autenticar JWT, autorizar y ejecutar casos de uso | JSON y cambios transaccionales con eventos/pendientes | Sin temporizadores ni envíos directos de flujos migrados; #107/#109 |
| Procesador | Evaluar plazos/recordatorios y reclamar pendientes | Cambios de estado, avisos y resultados de despacho | Reservas persistentes, reintento y recuperación; #109 |
| PostgreSQL / Data API | Guardar datos, aplicar restricciones, transacciones y exclusión concurrente | Estado duradero entre procesos y reinicios | Tablas/RPC privadas; #108 |
| Brevo/SMTP | Intentar transmisión de mensajes mínimos | Aceptación, fallo o resultado incierto | Aceptado no equivale a recibido; #109/#112 |
| OpenStreetMap | Proveer teselas usadas por Leaflet | Imágenes de mapa | La consulta no necesita enviar fichas ni contactos; dependencia externa de interfaz; #111 |
| GitHub Actions | Verificar cambios antes de publicar | Resultados y artefactos de validación | El CI actual no acredita CD; publicación en #110 |

Los datos médicos permanecen cifrados en la base y se descifran en el servidor después de autorizar y verificar consentimiento/responsable. La outbox y los logs tampoco deben contener fichas médicas; el correo objetivo proporciona un enlace a la aplicación con autorización vigente, sin tokens de acceso incrustados. Estos son requisitos pendientes, no garantías del código base.

## Secuencia objetivo de una alerta

```mermaid
sequenceDiagram
    participant W as Procesador
    participant D as PostgreSQL vía RPC
    participant E as Brevo o SMTP
    participant A as API
    participant P as PWA autorizada
    W->>D: Evaluar expediciones vencidas
    D->>D: Transacción: estado + evento + aviso pendiente
    D-->>W: Confirmar transacción
    W->>D: Reclamar lote con reserva temporal
    D-->>W: Pendientes y propiedad de reserva
    W->>E: Intentar envío fuera de la transacción SQL
    alt Aceptación confirmada
        E-->>W: Aceptado por proveedor
        W->>D: Registrar aceptación y liberar reserva
    else Fallo temporal confirmado
        E-->>W: Error de envío
        W->>D: Registrar intento y próxima ejecución
    else Timeout o aceptación incierta
        W->>D: Registrar incierto para conciliación
    end
    P->>A: Consultar estado con JWT
    A->>D: Consultar solo recursos autorizados
    D-->>A: Estado duradero del negocio y del aviso
    A-->>P: Resultado sin confundir pendiente con entregado
```

[Vista SVG](diagramas/arquitectura-objetivo-3.svg). El mismo principio se aplica a retorno seguro y avisos que requieran persistencia. Los recordatorios in-app se guardan como avisos; no todo aviso exige correo. Se conservan las reglas de cada HU.

Una interrupción antes del commit revierte estado y pendiente; después del commit deja el pendiente recuperable. Un envío aceptado seguido de caída antes de registrar el resultado puede quedar ambiguo. La reserva y la clave de evento reducen concurrencia/duplicación interna, pero no garantizan una sola entrega externa. Ver [contratos](contratos-y-operacion.md).
