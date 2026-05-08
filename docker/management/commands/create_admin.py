import os
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand

User = get_user_model()

class Command(BaseCommand):
    """
    Comando para crear un superusuario de forma no interactiva.
    Lee las credenciales de las variables de entorno:
    - ADMIN_USER
    - ADMIN_EMAIL
    - ADMIN_PASS
    Asigna al usuario al grupo 'Gerente' si existe.
    """
    help = "Crea un superusuario de forma no interactiva."

    def handle(self, *args, **options):
        username = os.environ.get('ADMIN_USER')
        email = os.environ.get('ADMIN_EMAIL')
        password = os.environ.get('ADMIN_PASS')

        if not all([username, email, password]):
            self.stdout.write(self.style.ERROR(
                "Faltan variables de entorno (ADMIN_USER, ADMIN_EMAIL, ADMIN_PASS)"
            ))
            return

        if User.objects.filter(username=username).exists():
            user = User.objects.get(username=username)
            self.stdout.write(self.style.SUCCESS(
                f"El superusuario '{username}' ya existe. No se hace nada."
            ))
        else:
            user = User.objects.create_superuser(
                username=username,
                email=email,
                password=password
            )
            self.stdout.write(self.style.SUCCESS(
                f"Superusuario '{username}' creado exitosamente."
            ))

        # Asignar al grupo Gerente si existe
        try:
            gerente_group = Group.objects.get(name='Gerente')
            if not user.groups.filter(name='Gerente').exists():
                user.groups.add(gerente_group)
                self.stdout.write(self.style.SUCCESS(
                    f"Usuario '{username}' asignado al grupo 'Gerente'."
                ))
        except Group.DoesNotExist:
            self.stdout.write(self.style.WARNING(
                "Grupo 'Gerente' no encontrado. Ejecute setup_groups primero."
            ))
