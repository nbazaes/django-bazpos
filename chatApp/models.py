from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

IDLE_TTL = timedelta(hours=8)
ACTIVE_WINDOW = timedelta(seconds=45)
PRESENCE_TTL = timedelta(minutes=5)
MAX_CONTENT_LENGTH = 1000


def display_name(user):
    full = f"{user.first_name} {user.last_name}".strip()
    return full if full else user.username


class ChatMessage(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="chat_messages",
    )
    name = models.CharField(max_length=150)
    content = models.CharField(max_length=MAX_CONTENT_LENGTH)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]


class ChatPresence(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_presence",
    )
    last_seen = models.DateTimeField(auto_now=True)


def purge_expired():
    """Limpia el chat si lleva IDLE_TTL sin actividad (reseteo diario)."""
    now = timezone.now()
    last_message = (
        ChatMessage.objects.order_by("-created_at")
        .values_list("created_at", flat=True)
        .first()
    )
    last_presence = (
        ChatPresence.objects.order_by("-last_seen")
        .values_list("last_seen", flat=True)
        .first()
    )
    last_activity = max((t for t in (last_message, last_presence) if t), default=None)
    if last_activity is not None and now - last_activity > IDLE_TTL:
        ChatMessage.objects.all().delete()
        ChatPresence.objects.all().delete()
        return
    ChatPresence.objects.filter(last_seen__lt=now - PRESENCE_TTL).delete()


def touch_presence(user):
    ChatPresence.objects.update_or_create(
        user=user, defaults={"last_seen": timezone.now()}
    )