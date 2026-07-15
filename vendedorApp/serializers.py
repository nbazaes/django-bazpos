from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from vendedorApp.models import Anulacion, DetalleDevolucion, DetalleVenta, Devolucion, Producto, Ubicacion, Venta


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
            {"nombre": s.ubicacion.nombre, "cantidad": s.cantidad}
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

    class Meta:
        model = Venta
        fields = [
            "id",
            "usuario",
            "usuario_nombre",
            "fecha_venta",
            "monto_total",
            "estado",
            "estado_display",
            "tipo_documento",
            "tipo_documento_display",
            "detalles",
            "productos_devueltos",
        ]

    def get_productos_devueltos(self, obj):
        devueltos = (
            DetalleDevolucion.objects
            .filter(devolucion__venta=obj)
            .values("producto_id")
            .annotate(total=Sum("cantidad"))
        )
        return {d["producto_id"]: d["total"] for d in devueltos}


class RegistrarVentaSerializer(serializers.Serializer):
    productos = VentaDetalleInputSerializer(many=True)
    total = serializers.IntegerField(min_value=0)
    tipo_documento = serializers.ChoiceField(
        choices=Venta.TipoDocumento.choices,
        default=Venta.TipoDocumento.VENTA,
        required=False,
    )

    @transaction.atomic
    def create(self, validated_data):
        request = self.context["request"]
        productos = validated_data["productos"]
        total = validated_data["total"]
        tipo_documento = validated_data.get("tipo_documento", Venta.TipoDocumento.VENTA)
        estado = Venta.Estado.COMPLETADA if tipo_documento == Venta.TipoDocumento.VENTA else Venta.Estado.PENDIENTE

        venta = Venta.objects.create(
            usuario=request.user,
            monto_total=total,
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
