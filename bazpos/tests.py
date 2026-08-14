from django.test import TestCase
from rest_framework.test import APIClient

from docker.test_utils import create_business_groups, make_user


class HealthTest(TestCase):
    def test_health_ok(self):
        resp = self.client.get("/health/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["ok"])


class AuthFlowTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_business_groups()
        cls.user = make_user("Vendedor")

    def test_token_obtain_and_me(self):
        resp = self.client.post(
            "/api/auth/token/",
            {"username": self.user.username, "password": "testpass123"},
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        access = resp.data["access"]
        refresh = resp.data["refresh"]

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        me = client.get("/api/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["username"], self.user.username)
        self.assertIn("Vendedor", me.data["groups"])

        refresh_resp = client.post(
            "/api/auth/token/refresh/",
            {"refresh": refresh},
            format="json",
        )
        self.assertEqual(refresh_resp.status_code, 200)
        self.assertIn("access", refresh_resp.data)


class ProtectedEndpointTest(TestCase):
    def test_dashboard_requires_auth(self):
        resp = self.client.get("/api/dashboard/stats/")
        self.assertEqual(resp.status_code, 401)
