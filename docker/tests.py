from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import TestCase

from docker.test_utils import create_business_groups


class SetupGroupsTest(TestCase):
    def test_groups_created(self):
        create_business_groups()
        names = set(Group.objects.values_list("name", flat=True))
        self.assertEqual(names, {"Vendedor", "Encargado", "Bodeguero", "Gerente"})

    def test_idempotent(self):
        create_business_groups()
        perms1 = {
            (g.name, p.codename)
            for g in Group.objects.all()
            for p in g.permissions.all()
        }
        create_business_groups()
        perms2 = {
            (g.name, p.codename)
            for g in Group.objects.all()
            for p in g.permissions.all()
        }
        self.assertEqual(perms1, perms2)

    def test_command_runs(self):
        call_command("setup_groups")
        self.assertEqual(Group.objects.count(), 4)
