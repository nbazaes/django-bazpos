from gerenteApp.models import StoreConfig

PARTS_FIELDS = {
    "productos": {"oem", "codigo_proveedor", "marca"},
    "ventas": {"producto_oem", "producto_marca"},
}

_TEXT_PLACEHOLDER = {
    True: "Nombre, OEM o código",
    False: "Nombre o código",
}


def parts_fields_enabled():
    config = StoreConfig.current()
    return bool((config.feature_flags or {}).get("product_oem_fields", False))


def filtered_fields(dataset_key, fields):
    if parts_fields_enabled():
        return fields
    excluded = PARTS_FIELDS.get(dataset_key, set())
    return [f for f in fields if f["key"] not in excluded]


def filtered_filters(dataset_key, filters):
    show_parts = parts_fields_enabled()
    result = []
    for f in filters:
        if f["key"] == "marcas" and not show_parts:
            continue
        item = dict(f)
        if item["key"] == "texto":
            item["placeholder"] = _TEXT_PLACEHOLDER[show_parts]
        result.append(item)
    return result


def dataset_fields(dataset_key):
    dataset = DATASETS.get(dataset_key)
    if not dataset:
        return []
    return filtered_fields(dataset_key, dataset["fields"])


def _text_placeholder():
    return _TEXT_PLACEHOLDER[parts_fields_enabled()]


def _field(key, label, type_="text"):
    return {"key": key, "label": label, "type": type_}


PRODUCTOS_FIELDS = [
    _field("codigo_producto", "Código"),
    _field("nombre", "Nombre"),
    _field("oem", "OEM"),
    _field("marca", "Marca"),
    _field("descripcion", "Descripción"),
    _field("codigo_proveedor", "Código proveedor"),
    _field("proveedor_nombre", "Proveedor"),
    _field("precio_costo", "Precio costo", "money"),
    _field("precio", "Precio venta", "money"),
    _field("margen_utilidad", "Margen (%)", "number"),
    _field("stock_actual", "Stock total", "number"),
    _field("stock_minimo", "Stock mínimo", "number"),
    _field("stock_maximo", "Stock máximo", "number"),
    _field("ultima_factura_fecha", "Última factura (fecha)", "date"),
    _field("ultima_factura_numero", "Última factura (N°)", "number"),
    _field("ultima_factura_proveedor", "Última factura (proveedor)"),
]

VENTAS_FIELDS = [
    _field("fecha_venta", "Fecha", "datetime"),
    _field("tipo_documento", "Tipo"),
    _field("documento", "Documento"),
    _field("cliente_nombre", "Cliente"),
    _field("vendedor", "Vendedor"),
    _field("producto_codigo", "Código producto"),
    _field("producto_nombre", "Producto"),
    _field("producto_oem", "OEM"),
    _field("producto_marca", "Marca"),
    _field("ubicacion_nombre", "Ubicación"),
    _field("cantidad", "Cantidad", "number"),
    _field("precio_unitario", "Precio unitario", "money"),
    _field("subtotal", "Subtotal", "money"),
]

PRODUCTOS_FILTERS = [
    {"key": "ubicaciones", "label": "Ubicaciones", "type": "multiselect"},
    {"key": "proveedores", "label": "Proveedores", "type": "multiselect"},
    {"key": "marcas", "label": "Marcas", "type": "multiselect"},
    {"key": "texto", "label": "Búsqueda", "type": "text", "placeholder": "Nombre, OEM o código"},
    {"key": "stock_fecha", "label": "Stock al día", "type": "date"},
    {"key": "sin_stock", "label": "Solo sin stock", "type": "boolean"},
    {"key": "con_stock", "label": "Solo con stock", "type": "boolean"},
    {"key": "bajo_minimo", "label": "Solo bajo stock mínimo", "type": "boolean"},
]

VENTAS_FILTERS = [
    {"key": "fecha_desde", "label": "Fecha desde", "type": "date"},
    {"key": "fecha_hasta", "label": "Fecha hasta", "type": "date"},
    {"key": "vendedores", "label": "Vendedores", "type": "multiselect"},
    {"key": "ubicaciones", "label": "Ubicaciones", "type": "multiselect"},
    {"key": "texto", "label": "Producto", "type": "text", "placeholder": "Nombre, OEM o código"},
]

DATASETS = {
    "productos": {
        "key": "productos",
        "label": "Productos",
        "description": "Catálogo de productos con stock y última factura de compra.",
        "fields": PRODUCTOS_FIELDS,
        "filters": PRODUCTOS_FILTERS,
    },
    "ventas": {
        "key": "ventas",
        "label": "Ventas",
        "description": "Líneas de venta de ventas completadas (sin cotizaciones ni pedidos).",
        "fields": VENTAS_FIELDS,
        "filters": VENTAS_FILTERS,
    },
}

DYNAMIC_STOCK_FIELD_PREFIX = "stock_ubic_"

DYNAMIC_FIELDS_META = {
    "productos": {
        "filter_key": "ubicaciones",
        "prefix": DYNAMIC_STOCK_FIELD_PREFIX,
        "label_template": "Stock · {label}",
    },
}


def get_dataset(key):
    return DATASETS.get(key)


def get_dataset_fields(dataset_key):
    return dataset_fields(dataset_key)


def resolve_field_metas(dataset_key, requested_keys, ubicaciones_labels=None):
    """Devuelve la lista de metadatos de campos solicitados, válidos y únicos."""
    dataset = DATASETS.get(dataset_key)
    if not dataset:
        return []
    by_key = {meta["key"]: meta for meta in dataset_fields(dataset_key)}
    metas = []
    seen = set()
    if requested_keys:
        for key in requested_keys:
            if key in seen:
                continue
            meta = by_key.get(key)
            if meta:
                metas.append(meta)
                seen.add(key)
                continue
            dynamic = _dynamic_field_meta(dataset_key, key, ubicaciones_labels)
            if dynamic:
                metas.append(dynamic)
                seen.add(key)
    if not metas:
        return list(dataset_fields(dataset_key))
    return metas


def _dynamic_field_meta(dataset_key, key, ubicaciones_labels):
    config = DYNAMIC_FIELDS_META.get(dataset_key)
    if not config or not key.startswith(config["prefix"]):
        return None
    suffix = key[len(config["prefix"]):]
    if not suffix.isdigit():
        return None
    label = (ubicaciones_labels or {}).get(suffix, suffix)
    return {
        "key": key,
        "label": config["label_template"].format(label=label),
        "type": "number",
    }


def schema_payload(options_sources):
    datasets = []
    for dataset in DATASETS.values():
        filters = filtered_filters(dataset["key"], dataset["filters"])
        for filtro in filters:
            item = dict(filtro)
            source = options_sources.get(item["key"])
            if source is not None:
                item["options"] = source()
        payload = {
            "key": dataset["key"],
            "label": dataset["label"],
            "description": dataset["description"],
            "fields": [dict(meta) for meta in filtered_fields(dataset["key"], dataset["fields"])],
            "filters": filters,
        }
        if dataset["key"] in DYNAMIC_FIELDS_META:
            payload["dynamic_fields"] = dict(DYNAMIC_FIELDS_META[dataset["key"]])
        datasets.append(payload)
    return {"datasets": datasets}
