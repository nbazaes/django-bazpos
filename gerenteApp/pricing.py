from decimal import Decimal, ROUND_HALF_UP, ROUND_UP

from .models import StoreConfig


def current_config():
    return StoreConfig.current()


def tax_multiplier() -> Decimal:
    config = current_config()
    return Decimal("1") + (config.tax_percent / Decimal("100"))


def apply_tax(amount) -> int:
    total = Decimal(str(amount)) * tax_multiplier()
    return int(total.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def round_price(amount) -> int:
    config = current_config()
    n = config.price_round_to
    if n <= 1:
        return int(amount)
    return int((Decimal(str(amount)) / n).to_integral_value(rounding=ROUND_UP) * n)


def round_sale_total(amount) -> int:
    config = current_config()
    n = config.total_round_to
    if n <= 1:
        return int(amount)
    remainder = int(amount) % n
    if remainder >= config.total_round_threshold:
        return ((int(amount) // n) + 1) * n
    return (int(amount) // n) * n