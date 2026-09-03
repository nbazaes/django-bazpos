"""EUROCAS-specific order-line cost modifier.

This rule is a uniqueness of the original store and ships only as a reference
extension. Generic installs should delete this module and define their own
modifiers here instead.
"""
from decimal import Decimal

from gerenteApp.store_extensions import OrderLineCostModifier, register


@register
class StellantisCostModifier(OrderLineCostModifier):
    key = "stellantis"
    label = "Stellantis (descuento 20%)"

    def apply(self, costo):
        return costo * Decimal("0.80")