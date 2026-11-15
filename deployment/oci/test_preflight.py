import tempfile
import unittest
from pathlib import Path
from preflight import leer_env, validar


class PreflightTest(unittest.TestCase):
    def setUp(self):
        carpeta = Path(__file__).parent
        self.app = leer_env(carpeta / 'worker.env.example', proteger=False)
        self.deploy = leer_env(carpeta / 'deployment.env.example', proteger=False)
        self.deploy.update(TREKSAFE_IMAGE='ghcr.io/prueba/treksafe-r2@sha256:' + 'a' * 64,
                           CADDY_IMAGE='caddy@sha256:' + 'b' * 64,
                           DEPLOYMENT_COMMIT='c' * 40, API_HOST='prueba.duckdns.org',
                           ACME_EMAIL='ficticio@example.invalid', OCI_ALWAYS_FREE_CONFIRMED='true')
        self.app.update(SUPABASE_URL='https://proyecto-ficticio.supabase.co',
                        SUPABASE_SERVICE_ROLE_KEY='ficticio-no-es-una-clave', JWT_SECRET='j' * 40,
                        MEDICAL_ENCRYPTION_KEY='m' * 40, CORS_ORIGIN='https://prueba.vercel.app',
                        PUBLIC_APP_URL='https://prueba.vercel.app', BREVO_API_KEY='ficticio',
                        SMTP_FROM='Ficticio <ficticio@example.invalid>')

    def test_worker_coherente(self):
        validar('worker', self.deploy, self.app)

    def test_api_no_activa_tareas(self):
        with self.assertRaisesRegex(ValueError, 'CRON_ENABLED'):
            validar('api', self.deploy, self.app)
        self.app['CRON_ENABLED'] = 'false'
        validar('api', self.deploy, self.app)

    def test_ejemplos_vacios_no_aprueban(self):
        carpeta = Path(__file__).parent
        with self.assertRaises(ValueError):
            validar('worker', leer_env(carpeta / 'deployment.env.example', False), self.app)

    def test_sin_confirmacion_costos_no_avanza(self):
        self.deploy['OCI_ALWAYS_FREE_CONFIRMED'] = 'false'
        with self.assertRaisesRegex(ValueError, 'Always Free'):
            validar('worker', self.deploy, self.app)

    def test_tag_mutable_rechazado(self):
        self.deploy['TREKSAFE_IMAGE'] = 'ghcr.io/prueba/treksafe-r2:latest'
        with self.assertRaisesRegex(ValueError, 'digest'):
            validar('worker', self.deploy, self.app)

    def test_dev_compartido_rechazado(self):
        self.app['SUPABASE_URL'] = 'https://ibnwggvqgjpeqcretjak.supabase.co'
        with self.assertRaisesRegex(ValueError, 'DEV'):
            validar('worker', self.deploy, self.app)

    def test_origenes_no_validos(self):
        for origen in ('http://prueba.vercel.app', 'https://prueba.vercel.app/ruta',
                       'https://u:p@prueba.vercel.app', 'https://localhost',
                       'https://prueba.vercel.app?token=ficticio'):
            with self.subTest(origen=origen), self.assertRaisesRegex(ValueError, 'origen'):
                app = {**self.app, 'PUBLIC_APP_URL': origen}
                validar('worker', self.deploy, app)

    def test_origenes_distintos_rechazados(self):
        self.app['CORS_ORIGIN'] = 'https://otra.vercel.app'
        with self.assertRaisesRegex(ValueError, 'origen'):
            validar('worker', self.deploy, self.app)

    def test_sin_correo_real_configurado_no_arranca(self):
        self.app['BREVO_API_KEY'] = ''
        with self.assertRaisesRegex(ValueError, 'Brevo'):
            validar('worker', self.deploy, self.app)

    def test_parser_no_ejecuta_shell_y_rechaza_duplicados(self):
        with tempfile.TemporaryDirectory() as temporal:
            ruta = Path(temporal) / 'prueba.env'
            ruta.write_text('TOKEN=$(comando)\n', encoding='utf-8')
            self.assertEqual(leer_env(ruta, False)['TOKEN'], '$(comando)')
            ruta.write_text('TOKEN=uno\nTOKEN=dos\n', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'duplicada'):
                leer_env(ruta, False)


if __name__ == '__main__':
    unittest.main()
