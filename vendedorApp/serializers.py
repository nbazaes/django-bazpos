from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from vendedorApp.models import AjusteStock, Anulacion, DetalleDevolucion, DetalleVenta, Devolucion, Producto, Ubicacion, Venta


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
            {"ubicacion_id": s.ubicacion.id, "nombre": s.ubicacion.nombre, "cantidad": s.cantidad}
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

    class Meta:
        model = DetalleVenta
        fields = [
            "id",
            "producto",
            "codigo_producto",
            "producto_nombre",
            "cantidad",
            "precio_unitario",
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

        venta = Venta.objects.create(
            usuario=request.user,
            monto_total=total,
            monto_subtotal=monto_subtotal,
            descuento_porcentaje=descuento_porcentaje,
            estado=estado,
            tipo_documento=tipo_documento,
        )

        for item in productos:
            producto = Producto.objects.select_for_update().get(producto_id=item["producto_id"])
            cantidad = item["cantidad"]
            subtotal = item["precio"]

            if producto.stock_actual < cantidad:
                raise serializers.ValidationError(
                    {"productos": f"Stock insuficiente para {producto.nombre}"}
                )

            DetalleVenta.objects.create(
                venta=venta,
                producto=producto,
                cantidad=cantidad,
                precio_unitario=producto.precio,
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
        detalles = obj.detalles.all()
        if not hasattr(obj, "_prefetched_detalles"):
            pass
        total = 0
        for detalle in detalles:
            dv = DetalleVenta.objects.filter(
                venta=obj.venta, producto_id=detalle.producto_id
            ).first()
            precio = dv.precio_unitario if dv else 0
            total += detalle.cantidad * precio
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
    ubicacion_id = serializers.IntegerField()
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
