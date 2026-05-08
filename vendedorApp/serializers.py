from django.db import transaction
from rest_framework import serializers

from vendedorApp.models import DetalleVenta, Producto, Ubicacion, Venta


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
        ]


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
