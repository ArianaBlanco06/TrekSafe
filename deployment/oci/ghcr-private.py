#!/usr/bin/env python3
"""Gate CI de visibilidad; el token solo se lee del entorno, nunca se imprime."""
import json
import os
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

owner = os.environ['GITHUB_REPOSITORY_OWNER']
tipo = os.environ.get('OWNER_TYPE', 'User')
segmento = 'orgs' if tipo == 'Organization' else 'users'
url = f'https://api.github.com/{segmento}/{owner}/packages/container/treksafe-r2-academico'
posterior = '--after-push' in sys.argv
for intento in range(5 if posterior else 1):
    try:
        peticion = Request(url, headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
                            'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
        with urlopen(peticion, timeout=20) as respuesta:
            datos = json.load(respuesta)
        if datos.get('visibility') != 'private':
            sys.exit('GHCR: el paquete existente no es privado; publicación bloqueada.')
        print('GHCR: visibilidad privada confirmada')
        break
    except HTTPError as error:
        if error.code == 404 and not posterior:
            print('GHCR: paquete aún no visible; primer push crea paquete privado por defecto. Se verificará después.')
            break
        if error.code == 404 and intento < 4:
            time.sleep(3)
            continue
        sys.exit('GHCR: no fue posible acreditar visibilidad privada; publicación no acreditada.')
    except Exception:
        sys.exit('GHCR: consulta de visibilidad fallida; no continuar sin verificar.')
