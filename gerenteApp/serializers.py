from django.contrib.auth.models import Group, User
from django.db import transaction
from rest_framework import serializers

from gerenteApp.models import DetalleFactura, Factura, PrecioHistorico, Proveedor
from vendedorApp.models import Producto, StockProductoUbicacion, Ubicacion


class ProveedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Proveedor
        fields = [
            "proveedor_id",
            "rut",
            "nombre",
            "persona_contacto",
            "telefono",
            "correo",
            "direccion",
            "fecha_creacion",
        ]


class UserSerializer(serializers.ModelSerializer):
    group_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    groups = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "is_active",
            "password",
            "group_id",
            "groups",
        ]

    def get_groups(self, obj):
        return list(obj.groups.values("id", "name"))

    def create(self, validated_data):
        group_id = validated_data.pop("group_id", None)
        password = validated_data.pop("password", None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        if group_id:
            group = Group.objects.get(id=group_id)
            user.groups.set([group])
        return user

    def update(self, instance, validated_data):
        group_id = validated_data.pop("group_id", None)
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        if group_id is not None:
            if group_id:
                group = Group.objects.get(id=group_id)
                instance.groups.set([group])
            else:
                instance.groups.clear()
        return instance


class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ["id", "name"]


class FacturaDetalleInputSerializer(serializers.Serializer):
    producto_id = serializers.IntegerField()
    precio = serializers.IntegerField(min_value=0)
    cantidad = serializers.IntegerField(min_value=1)


class FacturaSerializer(serializers.ModelSerializer):
    proveedor_nombre = serializers.CharField(source="proveedor.nombre", read_only=True)
    cantidad_productos = serializers.SerializerMethodField()

    class Meta:
        model = Factura
        fields = [
            "id",
            "numero_factura",
            "proveedor",
            "proveedor_nombre",
            "fecha",
            "monto_total",
            "cantidad_productos",
        ]

    def get_cantidad_productos(self, obj):
        return obj.detalles.count()


class DetalleFacturaSerializer(serializers.ModelSerializer):
    nombre = serializers.CharField(source="producto.nombre", read_only=True)
    marca = serializers.CharField(source="producto.marca", read_only=True)
    codigo_producto = serializers.CharField(source="producto.codigo_producto", read_only=True)
    codigo_oem = serializers.CharField(source="producto.oem", read_only=True)

    class Meta:
        model = DetalleFactura
        fields = [
            "id",
            "producto",
            "nombre",
            "marca",
            "codigo_producto",
            "codigo_oem",
            "cantidad",
            "costo_compra",
        ]


class FacturaDetalleSerializer(serializers.ModelSerializer):
    proveedor_nombre = serializers.CharField(source="proveedor.nombre", read_only=True)
    detalles = DetalleFacturaSerializer(many=True, read_only=True)

    class Meta:
        model = Factura
        fields = [
            "id",
            "numero_factura",
            "proveedor",
            "proveedor_nombre",
            "fecha",
            "monto_total",
            "detalles",
        ]


class FacturaUpsertSerializer(serializers.Serializer):
    numero_factura = serializers.IntegerField()
    proveedor_id = serializers.IntegerField()
    fecha = serializers.DateField()
    productos = FacturaDetalleInputSerializer(many=True)

    def _apply_items(self, factura, productos):
        monto_total = sum(int(item["precio"]) * int(item["cantidad"]) for item in productos)
        factura.monto_total = monto_total
        factura.save()

        ubicacion_default = Ubicacion.objects.first()

        for item in productos:
            producto = Producto.objects.select_for_update().get(producto_id=item["producto_id"])
            nuevo_costo = int(item["precio"])
            cantidad = int(item["cantidad"])

            DetalleFactura.objects.create(
                factura=factura,
                producto=producto,
                cantidad=cantidad,
                costo_compra=nuevo_costo,
            )

            precio_costo_anterior = producto.precio_costo
            precio_venta_anterior = producto.precio
            if precio_costo_anterior != nuevo_costo:
                producto.precio_costo = nuevo_costo
                producto.save()
                PrecioHistorico.objects.create(
                    producto=producto,
                    precio_costo_anterior=precio_costo_anterior,
                    precio_costo_nuevo=nuevo_costo,
                    precio_venta_anterior=precio_venta_anterior,
                    precio_venta_nuevo=producto.precio,
                    factura=factura,
                )

            if ubicacion_default:
                stock, _ = StockProductoUbicacion.objects.get_or_create(
                    producto=producto,
                    ubicacion=ubicacion_default,
                    defaults={"cantidad": 0},
                )
                stock.cantidad += cantidad
                stock.save()

    @transaction.atomic
    def create(self, validated_data):
        numero_factura = validated_data["numero_factura"]
        proveedor = Proveedor.objects.get(pk=validated_data["proveedor_id"])
        productos = validated_data["productos"]

        factura = Factura.objects.create(
            numero_factura=numero_factura,
            proveedor=proveedor,
            fecha=validated_data["fecha"],
            monto_total=0,
        )
        self._apply_items(factura, productos)
        return factura

    @transaction.atomic
    def update(self, instance, validated_data):
        proveedor = Proveedor.objects.get(pk=validated_data["proveedor_id"])
        productos = validated_data["productos"]

        ubicacion_default = Ubicacion.objects.first()

        detalles_anteriores = DetalleFactura.objects.filter(factura=instance).select_related("producto")
        for detalle in detalles_anteriores:
            producto = detalle.producto
            if ubicacion_default:
                stock_qs = StockProductoUbicacion.objects.filter(
                    producto=producto, ubicacion=ubicacion_default
                )
                if stock_qs.exists():
                    stock = stock_qs.first()
                    stock.cantidad = max(0, stock.cantidad - detalle.cantidad)
                    stock.save()

        PrecioHistorico.objects.filter(factura=instance).delete()
        detalles_anteriores.delete()

        instance.proveedor = proveedor
        instance.fecha = validated_data["fecha"]
        instance.save()

        self._apply_items(instance, productos)
        return instance
