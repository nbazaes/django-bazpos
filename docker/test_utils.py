from django.contrib.auth.models import Group, User
from django.core.management import call_command
from rest_framework.test import APIClient


ROLES = ["Vendedor", "Encargado", "Bodeguero", "Gerente"]


def create_business_groups():
    """Crea/actualiza los grupos de negocio con sus permisos."""
    call_command("setup_groups")


def get_group(name):
    return Group.objects.get(name=name)


def make_user(role, username=None, **kwargs):
    """Crea un usuario y lo asigna al grupo de negocio indicado."""
    username = username or f"user_{role.lower()}_{User.objects.count()}"
    user = User.objects.create_user(
        username=username,
        password="testpass123",
        **kwargs,
    )
    user.groups.set([get_group(role)])
    return user


def make_superuser(username="admin"):
    return User.objects.create_superuser(
        username=username,
        password="testpass123",
        email="admin@example.com",
    )


def auth_client(user):
    """Cliente API autenticado con force_authenticate."""
    client = APIClient()
    client.force_authenticate(user=user)
    return client
