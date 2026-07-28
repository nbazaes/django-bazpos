from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from vendedorApp.models import (
    AjusteStock,
    Anulacion,
    DetalleDevolucion,
    DetalleVenta,
    Devolucion,
    ItemPedidoProveedor,
    Pedido,
    PedidoDetalle,
    PedidoProveedorDia,
    Producto,
    Ubicacion,
    Venta,
)


class UbicacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ubicacion
        fields = ["id", "nombre", "descripcion"]


class ProductoSerializer(serializers.ModelSerializer):
    proveedor_nombre = serializers.CharField(source="proveedor.nombre", read_only=True)
    stock_actual = serializers.IntegerField(read_only=True)
    ubicaciones_stock = serializers.SerializerMethodField()

    class Meta:
        model = Producto
        fields = [
            "producto_id",
            "nombre",
            "codigo_producto",
            "oem",
            "oem_alternativo",
            "codigo_proveedor",
            "marca",
            "descripcion",
            "precio",
            "precio_costo",
            "stock_minimo",
            "stock_maximo",
            "stock_actual",
            "margen_utilidad",
            "proveedor",
            "proveedor_nombre",
            "ubicaciones_stock",
        ]

    def get_ubicaciones_stock(self, obj):
        stocks = getattr(obj, "_prefetched_stocks", None)
        if stocks is None:
            stocks = obj.stocks_ubicacion.select_related("ubicacion").all()
        return [
            {
                "ubicacion_id": s.ubicacion.id if s.ubicacion else None,
                "nombre": s.ubicacion.nombre if s.ubicacion else "Sin ubicación",
                "cantidad": s.cantidad,
            }
            for s in stocks
            if s.cantidad > 0
        ]


class VentaDetalleInputSerializer(serializers.Serializer):
    producto_id = serializers.IntegerField()
    cantidad = serializers.IntegerField(min_value=1)
    precio = serializers.IntegerField(min_value=0)


class DetalleVentaSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.CharField(source="producto.nombre", read_only=True)
    codigo_producto = serializers.CharField(source="producto.codigo_producto", read_only=True)
    producto_oem = serializers.CharField(source="producto.oem", read_only=True)

    class Meta:
        model = DetalleVenta
        fields = [
            "id",
            "producto",
            "codigo_producto",
            "producto_oem",
            "producto_nombre",
            "cantidad",
            "precio_unitario",
            "precio_descontado",
            "subtotal",
        ]


class VentaSerializer(serializers.ModelSerializer):
    detalles = DetalleVentaSerializer(many=True, source="detalleventa_set", read_only=True)
    usuario_nombre = serializers.CharField(source="usuario.username", read_only=True)
    tipo_documento_display = serializers.CharField(source="get_tipo_documento_display", read_only=True)
    estado_display = serializers.CharField(source="get_estado_display", read_only=True)
    productos_devueltos = serializers.SerializerMethodField()
    monto_descuento = serializers.SerializerMethodField()

    class Meta:
        model = Venta
        fields = [
            "id",
            "usuario",
            "usuario_nombre",
            "fecha_venta",
            "monto_total",
            "monto_subtotal",
            "descuento_porcentaje",
            "monto_descuento",
            "estado",
            "estado_display",
            "tipo_documento",
            "tipo_documento_display",
            "venta_origen",
            "cliente_nombre",
            "detalles",
            "productos_devueltos",
        ]

    def get_monto_descuento(self, obj):
        if obj.descuento_porcentaje and obj.monto_subtotal:
            return obj.monto_subtotal - obj.monto_total
        return 0

    def get_productos_devueltos(self, obj):
        devueltos = (
            DetalleDevolucion.objects
            .filter(devolucion__venta=obj)
            .values("producto_id")
            .annotate(total=Sum("cantidad"))
        )
        return {d["producto_id"]: d["total"] for d in devueltos}


def _round_total(amount):
    remainder = amount % 1000
    if remainder >= 900:
        return ((amount // 1000) + 1) * 1000
    return (amount // 1000) * 1000


def _distribute_discount(monto_subtotal, monto_total, descuento_porcentaje, items_data):
    if descuento_porcentaje == 0:
        return [precio_unit for _, _, precio_unit, _ in items_data]

    n = len(items_data)
    shares = [sub * monto_total / monto_subtotal for _, _, _, sub in items_data]
    floored = [int(s // 1000) * 1000 for s in shares]
    remainders = [shares[i] - floored[i] for i in range(n)]

    total_floor = sum(floored)
    gap = (monto_total - total_floor) // 1000

    sorted_idx = sorted(range(n), key=lambda i: remainders[i], reverse=True)
    for k in range(gap):
        floored[sorted_idx[k % n]] += 1000

    return [floored[i] // items_data[i][0] for i in range(n)]


class RegistrarVentaSerializer(serializers.Serializer):
    productos = VentaDetalleInputSerializer(many=True)
    total = serializers.IntegerField(min_value=0)
    descuento_porcentaje = serializers.IntegerField(min_value=0, max_value=100, default=0, required=False)
    monto_subtotal = serializers.IntegerField(min_value=0, required=False)
    tipo_documento = serializers.ChoiceField(
        choices=Venta.TipoDocumento.choices,
        default=Venta.TipoDocumento.VENTA,
        required=False,
    )
    venta_origen = serializers.IntegerField(required=False, allow_null=True)
    cliente_nombre = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")

    def validate_venta_origen(self, value):
        if value is None:
            return None
        try:
            origen = Venta.objects.get(id=value)
        except Venta.DoesNotExist:
            raise serializers.ValidationError("La cotización de origen no existe")
        if origen.tipo_documento != Venta.TipoDocumento.COTIZACION:
            raise serializers.ValidationError("El origen debe ser una cotización")
        return value

    def validate(self, data):
        subtotal = data.get("monto_subtotal")
        total = data.get("total")
        descuento = data.get("descuento_porcentaje", 0)

        if descuento > 0:
            if not subtotal:
                raise serializers.ValidationError({"monto_subtotal": "Requerido cuando se aplica descuento"})

            discounted = int(subtotal * (1 - descuento / 100))
            expected = _round_total(discounted)

            if total != expected:
                raise serializers.ValidationError({
                    "total": f"El total con descuento no coincide con el redondeo esperado. "
                             f"Subtotal={subtotal}, descuento={descuento}%, esperado={expected}, recibido={total}"
                })

        return data

    @transaction.atomic
    def create(self, validated_data):
        request = self.context["request"]
        productos = validated_data["productos"]
        total = validated_data["total"]
        descuento_porcentaje = validated_data.get("descuento_porcentaje", 0)
        monto_subtotal = validated_data.get("monto_subtotal", total)
        tipo_documento = validated_data.get("tipo_documento", Venta.TipoDocumento.VENTA)
        estado = Venta.Estado.COMPLETADA if tipo_documento == Venta.TipoDocumento.VENTA else Venta.Estado.PENDIENTE

        items_data = []
        for item in productos:
            producto = Producto.objects.select_for_update().get(producto_id=item["producto_id"])
            cantidad = item["cantidad"]
            subtotal = item["precio"]

            if producto.stock_actual < cantidad:
                raise serializers.ValidationError(
                    {"productos": f"Stock insuficiente para {producto.nombre}"}
                )

            items_data.append((cantidad, producto, subtotal))

        precios_descontados = _distribute_discount(
            monto_subtotal, total, descuento_porcentaje,
            [(cant, producto.precio, producto.precio, subtotal) for cant, producto, subtotal in items_data],
        )

        venta = Venta.objects.create(
            usuario=request.user,
            monto_total=total,
            monto_subtotal=monto_subtotal,
            descuento_porcentaje=descuento_porcentaje,
            estado=estado,
            tipo_documento=tipo_documento,
            venta_origen_id=validated_data.get("venta_origen"),
            cliente_nombre=validated_data.get("cliente_nombre", "") or "",
        )

        for i, (cantidad, producto, subtotal) in enumerate(items_data):
            DetalleVenta.objects.create(
                venta=venta,
                producto=producto,
                cantidad=cantidad,
                precio_unitario=producto.precio,
                precio_descontado=precios_descontados[i],
                subtotal=subtotal,
            )

        return venta


class AnulacionInputSerializer(serializers.Serializer):
    motivo = serializers.CharField(trim_whitespace=False)

    class RestauracionItem(serializers.Serializer):
        producto_id = serializers.IntegerField()
        ubicacion_id = serializers.IntegerField()
        cantidad = serializers.IntegerField(min_value=1)

    restauraciones = RestauracionItem(many=True)


class AnulacionSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source="usuario.username", read_only=True)

    class Meta:
        model = Anulacion
        fields = ["id", "venta", "usuario_nombre", "motivo", "fecha_anulacion"]
        read_only_fields = ["id", "fecha_anulacion"]


class DetalleDevolucionSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.CharField(source="producto.nombre", read_only=True)
    codigo_producto = serializers.CharField(source="producto.codigo_producto", read_only=True)

    class Meta:
        model = DetalleDevolucion
        fields = ["id", "producto", "codigo_producto", "producto_nombre", "cantidad", "reponer_stock"]


class DevolucionSerializer(serializers.ModelSerializer):
    detalles = DetalleDevolucionSerializer(many=True, read_only=True)
    usuario_nombre = serializers.CharField(source="usuario.username", read_only=True)
    venta_fecha = serializers.DateTimeField(source="venta.fecha_venta", read_only=True)
    venta_usuario = serializers.CharField(source="venta.usuario.username", read_only=True)
    monto_devuelto = serializers.SerializerMethodField()

    class Meta:
        model = Devolucion
        fields = ["id", "venta", "venta_fecha", "venta_usuario", "usuario_nombre", "motivo", "fecha_devolucion", "monto_devuelto", "detalles"]
        read_only_fields = ["id", "fecha_devolucion"]

    def get_monto_devuelto(self, obj):
        if obj.monto_devuelto > 0:
            return obj.monto_devuelto

        total = 0
        for detalle in obj.detalles.all():
            dv = DetalleVenta.objects.filter(
                venta=obj.venta, producto_id=detalle.producto_id
            ).first()
            if dv:
                price = dv.precio_descontado if dv.precio_descontado > 0 else dv.precio_unitario
                total += detalle.cantidad * price
        return total


class DevolucionInputSerializer(serializers.Serializer):
    motivo = serializers.CharField(trim_whitespace=False)

    class ProductoItem(serializers.Serializer):
        producto_id = serializers.IntegerField()
        cantidad = serializers.IntegerField(min_value=1)
        reponer_stock = serializers.BooleanField(default=True)
        ubicacion_id = serializers.IntegerField(required=False, allow_null=True)

    productos = ProductoItem(many=True)


class AjusteItemSerializer(serializers.Serializer):
    ubicacion_id = serializers.IntegerField(required=False, allow_null=True)
    cantidad = serializers.IntegerField(min_value=0)


class AjustarStockInputSerializer(serializers.Serializer):
    ajustes = AjusteItemSerializer(many=True)
    motivo = serializers.CharField(trim_whitespace=False)
    fecha = serializers.DateField(required=False)

    def validate_ajustes(self, value):
        if not value:
            raise serializers.ValidationError("Debe especificar al menos un ajuste")
        ids = [item["ubicacion_id"] for item in value]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("No puede haber ubicaciones duplicadas")
        return value


class AjusteStockSerializer(serializers.ModelSerializer):
    ubicacion_nombre = serializers.CharField(source="ubicacion.nombre", read_only=True)
    usuario_nombre = serializers.CharField(source="usuario.username", read_only=True)

    class Meta:
        model = AjusteStock
        fields = [
            "id",
            "producto",
            "ubicacion",
            "ubicacion_nombre",
            "cantidad_anterior",
            "cantidad_nueva",
            "motivo",
            "fecha_ajuste",
            "usuario_nombre",
        ]


class PedidoDetalleSerializer(serializers.ModelSerializer):
    proveedor_nombre = serializers.CharField(source="proveedor.nombre", read_only=True)
    producto_id = serializers.IntegerField(source="producto.producto_id", read_only=True)

    class Meta:
        model = PedidoDetalle
        fields = [
            "id",
            "producto_id",
            "codigo_proveedor",
            "proveedor",
            "proveedor_nombre",
            "oem",
            "nombre",
            "precio_costo",
            "porcentaje_utilidad",
            "precio_final",
            "sumar_envio",
            "stellantis",
        ]


class PedidoSerializer(serializers.ModelSerializer):
    detalles = PedidoDetalleSerializer(many=True, read_only=True)
    usuario_nombre = serializers.CharField(source="usuario.username", read_only=True)
    metodo_pago_display = serializers.CharField(source="get_metodo_pago_display", read_only=True)
    estado_display = serializers.CharField(source="get_estado_display", read_only=True)
    estado_documento_display = serializers.CharField(source="get_estado_documento_display", read_only=True)
    es_cotizacion = serializers.BooleanField(read_only=True)
    pedido_origen = serializers.PrimaryKeyRelatedField(read_only=True, allow_null=True)
    convertido = serializers.SerializerMethodField()

    class Meta:
        model = Pedido
        fields = [
            "id",
            "usuario",
            "usuario_nombre",
            "nombre_cliente",
            "telefono_cliente",
            "monto_subtotal",
            "monto_total",
            "costo_envio",
            "metodo_pago",
            "metodo_pago_display",
            "estado",
            "estado_display",
            "estado_documento",
            "estado_documento_display",
            "persona_retiro",
            "fecha_retiro",
            "stock_descontado",
            "activo",
            "venta",
            "es_cotizacion",
            "pedido_origen",
            "convertido",
            "fecha_creacion",
            "detalles",
        ]

    def get_convertido(self, obj):
        if not obj.es_cotizacion:
            return False
        return Pedido.objects.filter(pedido_origen=obj, activo=True).exists()


class PedidoDetalleInputSerializer(serializers.Serializer):
    producto_id = serializers.IntegerField(required=False, allow_null=True)
    codigo_proveedor = serializers.CharField(max_length=50)
    proveedor_id = serializers.IntegerField()
    oem = serializers.CharField(max_length=50)
    nombre = serializers.CharField(max_length=200)
    precio_costo = serializers.IntegerField(min_value=0)
    porcentaje_utilidad = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal(0))
    sumar_envio = serializers.BooleanField(default=True)
    stellantis = serializers.BooleanField(default=False)


class CrearPedidoSerializer(serializers.Serializer):
    nombre_cliente = serializers.CharField(max_length=200)
    telefono_cliente = serializers.CharField(max_length=50)
    metodo_pago = serializers.ChoiceField(choices=Pedido._meta.get_field("metodo_pago").choices)
    items = PedidoDetalleInputSerializer(many=True)
    es_cotizacion = serializers.BooleanField(default=False)

    def _calcular_item(self, precio_costo, porcentaje_utilidad, costo_envio, sumar_envio=True, stellantis=False):
        from decimal import ROUND_HALF_UP, ROUND_UP
        costo = Decimal(precio_costo)
        if stellantis:
            costo = costo * Decimal("0.80")
        utilidad = Decimal(porcentaje_utilidad) / Decimal(100)
        base = costo * (Decimal(1) + utilidad)
        con_iva = base * Decimal("1.19")
        if sumar_envio:
            con_envio = con_iva + Decimal(costo_envio)
        else:
            con_envio = con_iva
        item_total = int((con_envio / Decimal(100)).to_integral_value(rounding=ROUND_UP) * Decimal(100))
        return int(base.to_integral_value(rounding=ROUND_HALF_UP)), item_total

    @transaction.atomic
    def create(self, validated_data):
        request = self.context["request"]
        items = validated_data["items"]
        costo_envio = 4500
        es_cotizacion = validated_data.get("es_cotizacion", False)

        monto_subtotal = 0
        monto_total = 0
        for item in items:
            base, item_total = self._calcular_item(
                item["precio_costo"],
                item["porcentaje_utilidad"],
                costo_envio,
                sumar_envio=item.get("sumar_envio", True),
                stellantis=item.get("stellantis", False),
            )
            monto_subtotal += base
            monto_total += item_total

        pedido = Pedido.objects.create(
            usuario=request.user,
            nombre_cliente=validated_data["nombre_cliente"],
            telefono_cliente=validated_data["telefono_cliente"],
            monto_subtotal=monto_subtotal,
            monto_total=monto_total,
            costo_envio=costo_envio,
            metodo_pago=validated_data["metodo_pago"],
            estado=Pedido.Estado.PENDIENTE_RETIRAR,
            estado_documento=Pedido.EstadoDocumento.SIN_BOLETEAR,
            es_cotizacion=es_cotizacion,
        )

        for item in items:
            base, item_total = self._calcular_item(
                item["precio_costo"],
                item["porcentaje_utilidad"],
                costo_envio,
                sumar_envio=item.get("sumar_envio", True),
                stellantis=item.get("stellantis", False),
            )
            producto_id = item.get("producto_id")
            producto = None
            if producto_id:
                try:
                    producto = Producto.objects.get(producto_id=producto_id)
                except Producto.DoesNotExist:
                    producto = None

            PedidoDetalle.objects.create(
                pedido=pedido,
                producto=producto,
                codigo_proveedor=item["codigo_proveedor"],
                proveedor_id=item["proveedor_id"],
                oem=item["oem"],
                nombre=item["nombre"],
                precio_costo=item["precio_costo"],
                porcentaje_utilidad=item["porcentaje_utilidad"],
                precio_final=item_total,
                sumar_envio=item.get("sumar_envio", True),
                stellantis=item.get("stellantis", False),
            )

        if not es_cotizacion:
            venta = Venta.objects.create(
                usuario=request.user,
                monto_total=monto_total,
                monto_subtotal=monto_subtotal,
                estado=Venta.Estado.COMPLETADA,
                tipo_documento=Venta.TipoDocumento.PEDIDO,
            )
            pedido.venta = venta
            pedido.save(update_fields=["venta"])

        return pedido


class ItemPedidoProveedorSerializer(serializers.ModelSerializer):
    producto_id = serializers.IntegerField(source="producto.producto_id", read_only=True)
    codigo_producto = serializers.CharField(source="producto.codigo_producto", read_only=True)
    codigo_proveedor = serializers.CharField(source="producto.codigo_proveedor", read_only=True)
    oem = serializers.CharField(source="producto.oem", read_only=True)
    nombre = serializers.CharField(source="producto.nombre", read_only=True)
    precio_costo = serializers.IntegerField(source="producto.precio_costo", read_only=True)
    stock_actual = serializers.IntegerField(source="producto.stock_actual", read_only=True)
    stock_maximo = serializers.IntegerField(source="producto.stock_maximo", read_only=True)
    proveedor_nombre = serializers.CharField(source="proveedor.nombre", read_only=True)

    class Meta:
        model = ItemPedidoProveedor
        fields = [
            "id",
            "producto_id",
            "codigo_producto",
            "codigo_proveedor",
            "oem",
            "nombre",
            "precio_costo",
            "stock_actual",
            "stock_maximo",
            "proveedor",
            "proveedor_nombre",
            "pedido",
        ]


class PedidoProveedorDiaSerializer(serializers.ModelSerializer):
    proveedores = serializers.SerializerMethodField()

    class Meta:
        model = PedidoProveedorDia
        fields = ["id", "fecha", "finalizado", "created_at", "proveedores"]

    def get_proveedores(self, obj):
        items = obj.items.select_related("producto", "proveedor").all().order_by("proveedor__nombre")
        grouped = {}
        for item in items:
            pid = item.proveedor_id
            if pid not in grouped:
                grouped[pid] = {
                    "proveedor_id": pid,
                    "proveedor_nombre": item.proveedor.nombre,
                    "items": [],
                }
            grouped[pid]["items"].append(ItemPedidoProveedorSerializer(item).data)
        return list(grouped.values())


class PedidoProveedorDiaHistorialSerializer(serializers.ModelSerializer):
    total_items = serializers.SerializerMethodField()
    total_pedidos = serializers.SerializerMethodField()

    class Meta:
        model = PedidoProveedorDia
        fields = ["id", "fecha", "finalizado", "created_at", "total_items", "total_pedidos"]

    def get_total_items(self, obj):
        return obj.items.count()

    def get_total_pedidos(self, obj):
        return obj.items.filter(pedido=True).count()


class AgregarItemPedidoProveedorSerializer(serializers.Serializer):
    producto_id = serializers.IntegerField()
