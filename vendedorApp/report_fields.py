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
    dataset = DATASETS.get(dataset_key)
    if not dataset:
        return []
    return dataset["fields"]


def resolve_field_metas(dataset_key, requested_keys, ubicaciones_labels=None):
    """Devuelve la lista de metadatos de campos solicitados, válidos y únicos."""
    dataset = DATASETS.get(dataset_key)
    if not dataset:
        return []
    by_key = {meta["key"]: meta for meta in dataset["fields"]}
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
        return list(dataset["fields"])
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
        filters = []
        for filtro in dataset["filters"]:
            item = dict(filtro)
            source = options_sources.get(item["key"])
            if source is not None:
                item["options"] = source()
            filters.append(item)
        payload = {
            "key": dataset["key"],
            "label": dataset["label"],
            "description": dataset["description"],
            "fields": [dict(meta) for meta in dataset["fields"]],
            "filters": filters,
        }
        if dataset["key"] in DYNAMIC_FIELDS_META:
            payload["dynamic_fields"] = dict(DYNAMIC_FIELDS_META[dataset["key"]])
        datasets.append(payload)
    return {"datasets": datasets}
