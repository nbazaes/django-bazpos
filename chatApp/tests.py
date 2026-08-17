from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from chatApp.models import (
    ACTIVE_WINDOW,
    IDLE_TTL,
    PRESENCE_TTL,
    ChatMessage,
    ChatPresence,
)
from docker.test_utils import auth_client, create_business_groups, make_user


class ChatApiTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_business_groups()
        cls.ana = make_user("Vendedor", username="ana", first_name="Ana", last_name="Perez")
        cls.luis = make_user("Vendedor", username="luis", first_name="Luis", last_name="Rojas")

    def test_state_returns_empty(self):
        client = auth_client(self.ana)
        resp = client.get("/api/chat/state/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["messages"], [])
        self.assertEqual([u["id"] for u in data["active_users"]], [self.ana.id])

    def test_send_and_receive(self):
        client = auth_client(self.ana)
        resp = client.post("/api/chat/messages/", {"content": "hola"}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["name"], "Ana Perez")
        state = client.get("/api/chat/state/").json()
        self.assertEqual(len(state["messages"]), 1)
        self.assertEqual(state["messages"][0]["content"], "hola")
        self.assertEqual(state["messages"][0]["user_id"], self.ana.id)

    def test_content_required(self):
        client = auth_client(self.ana)
        resp = client.post("/api/chat/messages/", {"content": "   "}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_fallback_name_uses_username(self):
        solo = make_user("Vendedor", username="solo")
        resp = auth_client(solo).post(
            "/api/chat/messages/", {"content": "hola"}, format="json"
        )
        self.assertEqual(resp.json()["name"], "solo")

    def test_presence_active_across_users(self):
        auth_client(self.luis).get("/api/chat/state/")
        state = auth_client(self.ana).get("/api/chat/state/").json()
        ids = [u["id"] for u in state["active_users"]]
        self.assertIn(self.ana.id, ids)
        self.assertIn(self.luis.id, ids)

    def test_stale_presence_excluded_and_purged(self):
        auth_client(self.luis).get("/api/chat/state/")
        ChatPresence.objects.filter(user=self.luis).update(
            last_seen=timezone.now() - PRESENCE_TTL - timedelta(seconds=60)
        )
        state = auth_client(self.ana).get("/api/chat/state/").json()
        self.assertNotIn(self.luis.id, [u["id"] for u in state["active_users"]])
        self.assertFalse(ChatPresence.objects.filter(user=self.luis).exists())

    def test_recent_message_not_purged(self):
        auth_client(self.ana).post(
            "/api/chat/messages/", {"content": "reciente"}, format="json"
        )
        auth_client(self.ana).get("/api/chat/state/")
        self.assertEqual(ChatMessage.objects.count(), 1)

    def test_idle_purge_wipes_chat(self):
        client = auth_client(self.ana)
        client.post("/api/chat/messages/", {"content": "viejo"}, format="json")
        msg = ChatMessage.objects.get()
        stale = timezone.now() - IDLE_TTL - timedelta(minutes=1)
        ChatMessage.objects.filter(pk=msg.pk).update(created_at=stale)
        ChatPresence.objects.filter(user=self.ana).update(last_seen=stale)
        client.get("/api/chat/state/")
        self.assertFalse(ChatMessage.objects.filter(pk=msg.pk).exists())