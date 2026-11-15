#!/usr/bin/env python3
"""Actualiza la IP detectada por DuckDNS sin mostrar el token en argumentos/logs."""
import re
import sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from preflight import leer_env

try:
    datos = leer_env(Path('/etc/treksafe/duckdns.env'))
    dominio, token = datos.get('DUCKDNS_SUBDOMAIN', ''), datos.get('DUCKDNS_TOKEN', '')
    if not re.fullmatch(r'[a-z0-9-]+', dominio) or not token:
        raise ValueError()
    parametros = urlencode({'domains': dominio, 'token': token, 'ip': ''})
    with urlopen('https://www.duckdns.org/update?' + parametros, timeout=15) as respuesta:
        if respuesta.read(128).decode().strip() != 'OK':
            raise ValueError()
    print('DuckDNS: actualización aceptada')
except Exception:
    print('DuckDNS: actualización fallida; revisar DNS y configuración protegida.', file=sys.stderr)
    sys.exit(1)
