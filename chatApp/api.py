from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from bazpos.permissions import HasKnownRole
from chatApp.models import (
    ACTIVE_WINDOW,
    MAX_CONTENT_LENGTH,
    ChatMessage,
    ChatPresence,
    display_name,
    purge_expired,
    touch_presence,
)
from chatApp.serializers import ChatMessageSerializer


class ChatStateView(APIView):
    permission_classes = [IsAuthenticated, HasKnownRole]

    def get(self, request):
        purge_expired()
        touch_presence(request.user)
        messages = list(ChatMessage.objects.order_by("-id")[:100][::-1])
        now = timezone.now()
        active = []
        for p in (
            ChatPresence.objects.select_related("user")
            .filter(last_seen__gte=now - ACTIVE_WINDOW)
            .order_by("last_seen")
        ):
            active.append({"id": p.user_id, "name": display_name(p.user)})
        return Response(
            {
                "messages": ChatMessageSerializer(messages, many=True).data,
                "active_users": active,
            }
        )


class ChatMessageCreateView(APIView):
    permission_classes = [IsAuthenticated, HasKnownRole]

    def post(self, request):
        content = (request.data.get("content") or "").strip()
        if not content:
            return Response(
                {"content": ["Este campo es requerido."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        purge_expired()
        touch_presence(request.user)
        message = ChatMessage.objects.create(
            user=request.user,
            name=display_name(request.user),
            content=content[:MAX_CONTENT_LENGTH],
        )
        return Response(
            ChatMessageSerializer(message).data, status=status.HTTP_201_CREATED
        )