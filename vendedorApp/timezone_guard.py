"""Failsafe para el cruce de día local (America/Santiago) en registros de dinero.

El backend opera en UTC (TIME_ZONE="UTC"), por lo que el "día de negocio"
usado en cierres de caja, dashboard y reportes es la fecha UTC. Santiago
queda detrás de UTC (UTC-3 en verano, UTC-4 en invierno), así que un
registro creado después de las 20:00 (invierno) o 21:00 (verano) hora local
cae en el día UTC siguiente y queda atribuido al día equivocado en los
cierres.

La tienda no registra ventas después de las 18:00 local, por lo que esto
nunca debería ocurrir: este módulo solo detecta el caso y lo deja
evidenciado (log + aviso en el cierre de caja), sin alterar ningún dato.
"""

import logging
from datetime import datetime as dt_datetime
from datetime import timezone as dt_timezone
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

LOCAL_TZ = ZoneInfo("America/Santiago")
UTC = dt_timezone.utc

# Campo de fecha (siempre aware UTC, USE_TZ=True) por modelo de dinero.
_CAMPO_FECHA = {
    "Venta": "fecha_venta",
    "Devolucion": "fecha_devolucion",
    "Anulacion": "fecha_anulacion",
}


def cruce_de_dia(dt):
    """True si la fecha UTC de ``dt`` difiere de su fecha local (Santiago).

    Ocurre exactamente en la ventana de peligro (20:00-24:00 local en
    invierno, 21:00-24:00 en verano), por lo que no hace falta mantener
    ningún cutoff: la frontera se adapta sola al cambio de hora.

    Un ``date`` puro (sin hora, p.ej. Factura.fecha) nunca cruza: ya es
    una fecha de negocio. Naive datetimes se ignoran por seguridad.
    """
    if not isinstance(dt, dt_datetime) or dt.tzinfo is None:
        return False
    return dt.astimezone(UTC).date() != dt.astimezone(LOCAL_TZ).date()


def log_cruce(instance, actor=None):
    """Advierte (sin bloquear) si ``instance`` cruza el cambio de día local.

    Solo aplica a Venta/Devolucion/Anulacion; cualquier otro modelo se
    ignora silenciosamente. Nunca lanza excepciones.
    """
    try:
        campo = _CAMPO_FECHA.get(type(instance).__name__)
        if campo is None:
            return
        dt = getattr(instance, campo, None)
        if not cruce_de_dia(dt):
            return
        local = dt.astimezone(LOCAL_TZ)
        logger.warning(
            "CRUCE DE DIA: %s id=%s creado a las %s hora local cae en el día UTC %s "
            "y se atribuirá al %s en cierres/reportes. usuario=%s",
            type(instance).__name__,
            instance.pk,
            local.strftime("%d/%m/%Y %H:%M"),
            dt.astimezone(UTC).date().isoformat(),
            local.date().isoformat(),
            getattr(actor, "username", None),
        )
    except Exception:
        logger.exception("Failsafe cruce de día falló (no bloquea la operación)")


def cruce_rows(records):
    """Filas de detalle para registros cuyo día local difiere del día UTC.

    ``records`` es un iterable de tuplas ``(tipo, id, datetime, monto)``.
    Devuelve una lista de dicts lista para exponer en la API.
    """
    rows = []
    for tipo, rid, dt, monto in records:
        if dt is None or not cruce_de_dia(dt):
            continue
        rows.append(
            {
                "tipo": tipo,
                "id": rid,
                "fecha_utc": dt.isoformat(),
                "fecha_local": dt.astimezone(LOCAL_TZ).isoformat(),
                "monto": monto,
            }
        )
    return rows
