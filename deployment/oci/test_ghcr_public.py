import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import sys
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError


class GhcrPublicTest(unittest.TestCase):
    def respuesta(self, datos):
        respuesta = MagicMock()
        respuesta.__enter__.return_value = io.StringIO(json.dumps(datos))
        return respuesta

    def ejecutar(self, respuestas, posterior=False):
        salida = io.StringIO()
        argumentos = ['ghcr-public.py'] + (['--after-push'] if posterior else [])
        with patch.dict(os.environ, {
            'GITHUB_REPOSITORY_OWNER': 'prueba', 'OWNER_TYPE': 'User',
            'GH_TOKEN': 'token-ficticio-no-publicar',
        }), patch.object(sys, 'argv', argumentos), \
                patch('urllib.request.urlopen', side_effect=respuestas) as abrir, \
                patch('time.sleep'), contextlib.redirect_stdout(salida):
            runpy.run_path(str(Path(__file__).with_name('ghcr-public.py')))
        self.assertNotIn('token-ficticio-no-publicar', salida.getvalue())
        return abrir, salida.getvalue()

    def test_publico_admitido_antes_y_despues(self):
        for posterior in (False, True):
            with self.subTest(posterior=posterior):
                abrir, salida = self.ejecutar([self.respuesta({'visibility': 'public'})], posterior)
                self.assertIn('pública confirmada', salida)
                self.assertTrue(abrir.call_args.args[0].full_url.endswith(
                    '/users/prueba/packages/container/treksafe-r2-academico'))

    def test_privado_interno_o_sin_visibilidad_rechazados(self):
        for visibilidad in ('private', 'internal', None):
            with self.subTest(visibilidad=visibilidad), self.assertRaisesRegex(SystemExit, 'bloqueada'):
                self.ejecutar([self.respuesta({'visibility': visibilidad})])

    def test_error_de_permisos_no_se_acepta(self):
        with self.assertRaisesRegex(SystemExit, 'no acreditada'):
            self.ejecutar([HTTPError('https://api.github.com', 403, 'Forbidden', {}, None)])

    def test_paquete_inexistente_no_habilita_primer_push(self):
        with self.assertRaisesRegex(SystemExit, 'no acreditada'):
            self.ejecutar([HTTPError('https://api.github.com', 404, 'Not Found', {}, None)])

    def test_reintento_posterior_solo_acepta_publico(self):
        abrir, _ = self.ejecutar([
            HTTPError('https://api.github.com', 404, 'Not Found', {}, None),
            self.respuesta({'visibility': 'public'}),
        ], posterior=True)
        self.assertEqual(abrir.call_count, 2)


if __name__ == '__main__':
    unittest.main()
