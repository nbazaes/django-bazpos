from rest_framework.permissions import BasePermission


ROLE_VENDEDOR = "Vendedor"
ROLE_ENCARGADO = "Encargado"
ROLE_GERENTE = "Gerente"


def get_user_roles(user):
    if not user or not user.is_authenticated:
        return set()
    return set(user.groups.values_list("name", flat=True))


def has_any_role(user, allowed_roles):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    roles = get_user_roles(user)
    return bool(roles.intersection(set(allowed_roles)))


class RoleActionPermission(BasePermission):
    """
    Permission class that validates role access by DRF action.

    Views should define `role_action_map` as:
      {
        "list": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE],
        "create": [ROLE_ENCARGADO, ROLE_GERENTE],
      }
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        role_action_map = getattr(view, "role_action_map", {})
        action = getattr(view, "action", None)
        if not action:
            return False

        if action == "metadata":
            return True

        allowed_roles = role_action_map.get(action, role_action_map.get("*"))
        if allowed_roles is None:
            return False

        return has_any_role(request.user, allowed_roles)


class HasKnownRole(BasePermission):
    """Allow authenticated users with one of the configured business roles."""

    known_roles = [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE]

    def has_permission(self, request, view):
        return has_any_role(request.user, self.known_roles)
