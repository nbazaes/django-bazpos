"""Minimal per-store pricing extension seam.

Store-specific order-line cost modifiers live as modules in this package and
self-register. Generic core code only knows the registry: it applies whichever
modifier keys are stored on a line's ``cost_modifiers`` JSON field. New stores
ship with an empty registry unless they add modules here.
"""
import importlib
import pkgutil
from decimal import Decimal


class OrderLineCostModifier:
    """Base class for a per-line cost modifier applied to a pedido line."""

    key = ""
    label = ""

    def apply(self, costo):
        return costo


_REGISTRY = {}


def register(modifier_cls):
    _REGISTRY[modifier_cls.key] = modifier_cls
    return modifier_cls


def get_modifier(key):
    return _REGISTRY.get(key)


def all_modifiers():
    return list(_REGISTRY.values())


def apply_modifiers(costo, keys):
    result = Decimal(str(costo))
    for key in keys or []:
        modifier = _REGISTRY.get(key)
        if modifier:
            result = modifier().apply(result)
    return result


def labels_for(keys):
    return {key: _REGISTRY[key].label for key in keys if key in _REGISTRY}


def _autodiscover():
    for module in pkgutil.iter_modules(__path__):
        importlib.import_module(f"{__name__}.{module.name}")


_autodiscover()