#!/usr/bin/env python3
"""Preflight local: nunca imprime valores secretos ni crea recursos cloud."""
import argparse
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from urllib.parse import urlsplit


def exigir(condicion, mensaje):
    if not condicion:
        raise ValueError(mensaje)


def leer_env(ruta, proteger=True):
    if proteger:
        info = ruta.stat()
        exigir(info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o600,
               f'{ruta.name}: requiere root:root y modo 600')
    datos = {}
    for linea in ruta.read_text(encoding='utf-8').splitlines():
        if not linea or linea.lstrip().startswith('#'):
            continue
        exigir('=' in linea, f'{ruta.name}: formato CLAVE=valor requerido')
        clave, valor = linea.split('=', 1)
        exigir(re.fullmatch(r'[A-Z][A-Z0-9_]*', clave), f'{ruta.name}: clave inválida')
        exigir(clave not in datos, f'{ruta.name}: clave duplicada {clave}')
        exigir(not valor.startswith(('"', "'")) and '\x00' not in valor,
               f'{ruta.name}: valores literales sin comillas requeridos')
        datos[clave] = valor
    return datos


def origen_https(valor):
    u = urlsplit(valor)
    return (u.scheme == 'https' and bool(u.hostname) and not u.username and
            not u.password and u.path in ('', '/') and not u.query and not u.fragment and
            u.hostname not in ('localhost', '127.0.0.1', '::1') and
            not u.hostname.endswith(('.invalid', '.example', '.test')))


def validar(role, deploy, app):
    exigir(role in ('api', 'worker'), 'Rol api o worker requerido')
    exigir(deploy.get('OCI_ALWAYS_FREE_CONFIRMED') == 'true',
           'Falta comprobación manual Always Free y costo cero en OCI')
    exigir(re.fullmatch(r'ghcr\.io/[a-z0-9._-]+/treksafe-r2-academico@sha256:[0-9a-f]{64}',
                        deploy.get('TREKSAFE_IMAGE', '')), 'Falta digest inmutable GHCR')
    exigir(re.fullmatch(r'[0-9a-f]{40}', deploy.get('DEPLOYMENT_COMMIT', '')),
           'Falta commit completo de publicación')
    exigir(deploy.get('SCHEMA_VERSION') == '032', 'Esquema 032 verificado requerido')
    exigir(re.fullmatch(r'[a-z0-9-]+\.duckdns\.org', deploy.get('API_HOST', '')),
           'Falta hostname DuckDNS válido')
    if role == 'api':
        exigir(re.fullmatch(r'(docker\.io/library/)?caddy@sha256:[0-9a-f]{64}',
                            deploy.get('CADDY_IMAGE', '')), 'Falta digest de Caddy oficial')
        exigir('@' in deploy.get('ACME_EMAIL', ''), 'Falta correo ACME')
    for clave in ('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET',
                  'MEDICAL_ENCRYPTION_KEY', 'CORS_ORIGIN', 'PUBLIC_APP_URL'):
        exigir(bool(app.get(clave)), f'Falta variable {clave}')
    u = urlsplit(app['SUPABASE_URL'])
    exigir(u.scheme == 'https' and bool(u.hostname) and u.hostname.endswith('.supabase.co') and
           not u.username and not u.password and not u.query and not u.fragment,
           'SUPABASE_URL: proyecto HTTPS requerido')
    exigir(u.hostname != 'ibnwggvqgjpeqcretjak.supabase.co',
           'No desplegar el entorno académico contra DEV compartido')
    exigir(len(app['JWT_SECRET']) >= 32 and len(app['MEDICAL_ENCRYPTION_KEY']) >= 32,
           'JWT_SECRET y MEDICAL_ENCRYPTION_KEY requieren al menos 32 caracteres')
    exigir(origen_https(app['PUBLIC_APP_URL']) and origen_https(app['CORS_ORIGIN']) and
           app['PUBLIC_APP_URL'].rstrip('/') == app['CORS_ORIGIN'].rstrip('/'),
           'PUBLIC_APP_URL y CORS_ORIGIN deben ser el mismo origen HTTPS publicado')
    esperados = {'NODE_ENV': 'production', 'PORT': '3000', 'API_PREFIX': '/api',
                 'CRON_ENABLED': 'true' if role == 'worker' else 'false',
                 'MAIL_DEV_FALLBACK': 'false', 'CRON_INTERVAL_MS': '60000',
                 'OUTBOX_INTERVAL_MS': '15000', 'OUTBOX_BATCH_SIZE': '1',
                 'WORKER_HEARTBEAT_MAX_AGE_MS': '180000',
                 'OUTBOX_PENDING_MAX_AGE_MS': '600000'}
    for clave, esperado in esperados.items():
        exigir(app.get(clave) == esperado, f'{clave}: valor del perfil operativo requerido')
    exigir(not any(clave.startswith('VITE_') for clave in app), 'Secretos no pertenecen al frontend')
    if role == 'worker':
        exigir(bool(app.get('BREVO_API_KEY')) and '@' in app.get('SMTP_FROM', ''),
               'Worker requiere API Brevo y remitente verificado manualmente')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('role', choices=('api', 'worker'))
    args = parser.parse_args()
    exigir(hasattr(os, 'geteuid') and os.geteuid() == 0, 'Ejecutar como root en la VM destino')
    base = Path('/etc/treksafe')
    deploy = leer_env(base / 'deployment.env')
    app = leer_env(base / f'{args.role}.env')
    validar(args.role, deploy, app)
    version = subprocess.check_output(['docker', 'compose', 'version', '--short'], text=True).strip()
    partes = re.search(r'(\d+)\.(\d+)\.(\d+)', version)
    exigir(partes and tuple(map(int, partes.groups())) >= (2, 30, 0), 'Docker Compose >=2.30.0 requerido')
    inspeccion = json.loads(subprocess.check_output(['docker', 'image', 'inspect', deploy['TREKSAFE_IMAGE']], text=True))[0]
    labels = inspeccion['Config'].get('Labels') or {}
    exigir(labels.get('org.opencontainers.image.revision') == deploy['DEPLOYMENT_COMMIT'],
           'Imagen local y commit declarado no coinciden')
    exigir(labels.get('org.opencontainers.image.source') == 'https://github.com/ArianaBlanco06/TrekSafe',
           'La imagen no identifica este repositorio')
    exigir(inspeccion['Architecture'] == 'amd64', 'Imagen amd64 requerida por OCI AMD')
    print(f'Preflight {args.role}: configuración y revisión de imagen coherentes. No acredita costo, esquema remoto ni aceptación.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError, KeyError, json.JSONDecodeError) as error:
        # Mensajes de subprocess no incluyen entorno ni valores de archivos.
        print(str(error) if isinstance(error, ValueError) else 'Preflight falló: revisar archivos, Docker e imagen local.', file=sys.stderr)
        sys.exit(1)
