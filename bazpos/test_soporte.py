import json
from unittest.mock import MagicMock, patch
import urllib.error

from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from docker.test_utils import auth_client, create_business_groups, make_user


@override_settings(RESEND_API_KEY="re_test_123456789")
class SupportTicketApiTest(TestCase):
    def setUp(self):
        patcher = patch("bazpos.resend_client.urllib.request.urlopen")
        self.mock_urlopen = patcher.start()
        self.addCleanup(patcher.stop)
        response = self.mock_urlopen.return_value.__enter__.return_value
        response.read.return_value = b'{"id":"test-email-id"}'

    @classmethod
    def setUpTestData(cls):
        create_business_groups()
        cls.vendedor = make_user(
            "Vendedor",
            username="juan_vendedor",
            first_name="Juan",
            last_name="Perez",
            email="juan@bazpos.com",
        )
        cls.gerente = make_user(
            "Gerente",
            username="maria_gerente",
            first_name="Maria",
            last_name="Gomez",
            email="maria@bazpos.com",
        )

    def test_unauthenticated_rejected(self):
        client = APIClient()
        resp = client.post("/api/soporte/tickets/", {"tipo": "soporte", "descripcion": "Problema con la caja"})
        self.assertEqual(resp.status_code, 401)

    def test_vendedor_submit_ticket(self):
        client = auth_client(self.vendedor)
        payload = {
            "tipo": "soporte",
            "prioridad": "alta",
            "titulo": "Falla al imprimir comprobante",
            "descripcion": "El botón de imprimir comprobante en ventas no responde.",
            "current_path": "/ventas",
            "app_version": "2.3.0",
        }
        resp = client.post("/api/soporte/tickets/", payload, format="json")
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["status"], "sent")
        sent = json.loads(self.mock_urlopen.call_args.args[0].data)
        self.assertIn("BAZPOS", sent["subject"])
        self.assertIn("ALTA", sent["subject"])

    def test_gerente_submit_suggestion(self):
        client = auth_client(self.gerente)
        payload = {
            "tipo": "sugerencia",
            "prioridad": "media",
            "titulo": "Agregar exportación a Excel en stock",
            "descripcion": "Sería útil poder descargar el listado de inventario directamente a Excel.",
            "current_path": "/ventas/inventario",
            "app_version": "2.3.0",
        }
        resp = client.post("/api/soporte/tickets/", payload, format="json")
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["status"], "sent")
        self.assertIn("Sugerencia", json.loads(self.mock_urlopen.call_args.args[0].data)["subject"])

    def test_validation_missing_description(self):
        client = auth_client(self.vendedor)
        resp = client.post(
            "/api/soporte/tickets/",
            {"tipo": "soporte", "prioridad": "baja", "descripcion": "   "},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("descripción es obligatoria", resp.json()["error"])

    def test_validation_short_description(self):
        client = auth_client(self.vendedor)
        resp = client.post(
            "/api/soporte/tickets/",
            {"tipo": "soporte", "prioridad": "baja", "descripcion": "abc"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("al menos 5 caracteres", resp.json()["error"])

    def test_validation_invalid_type(self):
        client = auth_client(self.vendedor)
        resp = client.post(
            "/api/soporte/tickets/",
            {"tipo": "invalido", "prioridad": "baja", "descripcion": "Descripción válida"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Tipo de ticket inválido", resp.json()["error"])

    def test_validation_invalid_priority(self):
        client = auth_client(self.vendedor)
        resp = client.post(
            "/api/soporte/tickets/",
            {"tipo": "soporte", "prioridad": "extrema", "descripcion": "Descripción válida"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Prioridad inválida", resp.json()["error"])

    @override_settings(RESEND_API_KEY="re_test_123456789")
    @patch("urllib.request.urlopen")
    def test_resend_live_send_success(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({"id": "email_resend_id_123"}).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        client = auth_client(self.vendedor)
        payload = {
            "tipo": "soporte",
            "prioridad": "urgente",
            "titulo": "Error crítico en cierre",
            "descripcion": "No se puede cerrar la caja por un error 500.",
        }
        resp = client.post("/api/soporte/tickets/", payload, format="json")
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["status"], "sent")
        self.assertEqual(data["id"], "email_resend_id_123")

        # Verify request sent to Resend
        self.assertTrue(mock_urlopen.called)
        req = mock_urlopen.call_args[0][0]
        self.assertEqual(req.full_url, "https://api.resend.com/emails")
        self.assertEqual(req.headers.get("Authorization"), "Bearer re_test_123456789")
        sent_body = json.loads(req.data.decode("utf-8"))
        self.assertIn("URGENTE", sent_body["subject"])
        self.assertEqual(sent_body["reply_to"], "juan@bazpos.com")

    @override_settings(RESEND_API_KEY="re_test_123456789")
    @patch("urllib.request.urlopen")
    def test_resend_live_send_error(self, mock_urlopen):
        fp = MagicMock()
        fp.read.return_value = json.dumps({"message": "API key invalid"}).encode("utf-8")
        http_error = urllib.error.HTTPError(
            url="https://api.resend.com/emails",
            code=401,
            msg="Unauthorized",
            hdrs={},
            fp=fp,
        )
        mock_urlopen.side_effect = http_error

        client = auth_client(self.vendedor)
        resp = client.post(
            "/api/soporte/tickets/",
            {"tipo": "soporte", "prioridad": "media", "descripcion": "Prueba de error"},
            format="json",
        )
        self.assertEqual(resp.status_code, 502)
        self.assertIn("API key invalid", resp.json()["error"])

    @override_settings(RESEND_API_KEY="")
    def test_missing_key_returns_unavailable(self):
        response = auth_client(self.vendedor).post(
            "/api/soporte/tickets/", {"descripcion": "Problema con la caja"}, format="json",
        )
        self.assertEqual(response.status_code, 503)
        self.assertIn("no está configurado", response.json()["error"])
        self.mock_urlopen.assert_not_called()


@override_settings(RESEND_API_KEY="re_test_123456789")
class SupportEmailClientTest(SimpleTestCase):
    @patch("bazpos.resend_client.urllib.request.urlopen")
    def test_invalid_provider_responses_are_not_success(self, urlopen):
        from bazpos.resend_client import ResendEmailError, send_ticket_email
        response = urlopen.return_value.__enter__.return_value
        for body in ({}, {"id": None}, {"id": " "}, {"id": 123}, [], None):
            with self.subTest(body=body):
                response.read.return_value = json.dumps(body).encode()
                with self.assertRaises(ResendEmailError) as error:
                    send_ticket_email({"descripcion": "Prueba de soporte"})
                self.assertEqual(error.exception.status_code, 502)
        response.read.return_value = b'not-json'
        with self.assertRaises(ResendEmailError) as error:
            send_ticket_email({"descripcion": "Prueba de soporte"})
        self.assertEqual(error.exception.status_code, 502)

    @patch("bazpos.resend_client.urllib.request.urlopen")
    def test_connection_failures_are_not_success(self, urlopen):
        from bazpos.resend_client import ResendEmailError, send_ticket_email
        for failure in (TimeoutError(), urllib.error.URLError("connection refused")):
            with self.subTest(failure=type(failure).__name__):
                urlopen.side_effect = failure
                with self.assertRaises(ResendEmailError) as error:
                    send_ticket_email({"descripcion": "Prueba de soporte"})
                self.assertEqual(error.exception.status_code, 502)

    @override_settings(RESEND_API_KEY="  ")
    @patch("bazpos.resend_client.urllib.request.urlopen")
    def test_missing_key_never_calls_provider(self, urlopen):
        from bazpos.resend_client import ResendEmailError, send_ticket_email
        with self.assertRaises(ResendEmailError) as error:
            send_ticket_email({"descripcion": "Prueba de soporte"})
        self.assertEqual(error.exception.status_code, 503)
        urlopen.assert_not_called()
