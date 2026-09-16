from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .resend_client import ResendEmailError, send_ticket_email


class StoreNameView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"name": settings.STORE_NAME})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        groups = list(user.groups.values_list("name", flat=True))
        return Response(
            {
                "id": user.id,
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
                "is_superuser": user.is_superuser,
                "groups": groups,
            }
        )


class SupportTicketView(APIView):
    permission_classes = [IsAuthenticated]

    ALLOWED_TYPES = {"soporte", "sugerencia"}
    ALLOWED_PRIORITIES = {"baja", "media", "alta", "urgente"}

    def post(self, request):
        data = request.data or {}

        tipo = str(data.get("tipo", "soporte")).strip().lower()
        if tipo not in self.ALLOWED_TYPES:
            return Response(
                {"error": f"Tipo de ticket inválido. Debe ser uno de: {', '.join(self.ALLOWED_TYPES)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        prioridad = str(data.get("prioridad", "media")).strip().lower()
        if prioridad not in self.ALLOWED_PRIORITIES:
            return Response(
                {"error": f"Prioridad inválida. Debe ser una de: {', '.join(self.ALLOWED_PRIORITIES)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        descripcion = str(data.get("descripcion", "")).strip()
        if not descripcion or len(descripcion) < 5:
            return Response(
                {"error": "La descripción es obligatoria y debe tener al menos 5 caracteres."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        titulo = str(data.get("titulo", "")).strip()
        if len(titulo) > 200:
            titulo = titulo[:200]

        contexto = data.get("contexto", {}) if isinstance(data.get("contexto"), dict) else {}
        current_path = str(data.get("current_path") or contexto.get("current_path") or "-")
        app_version = str(data.get("app_version") or contexto.get("app_version") or "2.3.0")

        user = request.user
        user_roles = list(user.groups.values_list("name", flat=True))
        if user.is_superuser and "Superusuario" not in user_roles:
            user_roles.append("Superusuario")

        full_name = f"{user.first_name} {user.last_name}".strip()

        ticket_payload = {
            "tipo": tipo,
            "prioridad": prioridad,
            "titulo": titulo,
            "descripcion": descripcion,
            "usuario_username": user.username,
            "usuario_nombre": full_name or user.username,
            "usuario_email": user.email,
            "usuario_roles": user_roles,
            "store_name": getattr(settings, "STORE_NAME", "BAZPOS"),
            "app_version": app_version,
            "current_path": current_path,
            "user_agent": request.META.get("HTTP_USER_AGENT", "-"),
        }

        try:
            result = send_ticket_email(ticket_payload)
            return Response(result, status=status.HTTP_201_CREATED)
        except ResendEmailError as err:
            return Response(
                {"error": str(err), "details": err.response_data},
                status=err.status_code,
            )
        except Exception as err:
            return Response(
                {"error": f"Error interno al procesar el ticket: {str(err)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
