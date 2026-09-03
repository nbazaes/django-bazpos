from django.db.models import Q

from .models import StoreConfig


def product_search_q(texto, prefix=""):
    """Build a case-insensitive OR Q filter over the configured product search fields."""
    fields = StoreConfig.current().effective_product_search_fields()
    query = Q()
    for field in fields:
        query |= Q(**{f"{prefix}{field}__icontains": texto})
    return query