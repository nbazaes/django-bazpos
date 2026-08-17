from rest_framework import serializers

from chatApp.models import ChatMessage


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ["id", "user_id", "name", "content", "created_at"]
        read_only_fields = ["id", "user_id", "name", "created_at"]