from django.contrib.auth.models import Group, User
from django.db import transaction
from rest_framework import serializers

from gerenteApp.models import DetalleFactura, Factura, PrecioHistorico, Proveedor, StoreConfig
from vendedorApp.models import Producto, StockProductoUbicacion, Ubicacion


class ProveedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Proveedor
        fields = [
            "proveedor_id",
            "tax_id",
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
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

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
        if not password:
            raise serializers.ValidationError({"password": ["Este campo es requerido."]})
        user = User(**validated_data)
        user.set_password(password)
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


class UbicacionCantidadInputSerializer(serializers.Serializer):
    ubicacion_id = serializers.IntegerField(required=False, allow_null=True)
    cantidad = serializers.IntegerField(min_value=1)


class FacturaDetalleInputSerializer(serializers.Serializer):
    producto_id = serializers.IntegerField()
    precio = serializers.IntegerField(min_value=0)
    cantidad = serializers.IntegerField(min_value=1)
    ubicaciones = UbicacionCantidadInputSerializer(many=True, required=False)


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
    codigo_proveedor = serializers.CharField(source="producto.codigo_proveedor", read_only=True)
    codigo_oem = serializers.CharField(source="producto.oem", read_only=True)
    proveedor_nombre = serializers.CharField(source="producto.proveedor.nombre", read_only=True)
    margen_utilidad = serializers.DecimalField(source="producto.margen_utilidad", max_digits=5, decimal_places=2, read_only=True)

    class Meta:
        model = DetalleFactura
        fields = [
            "id",
            "producto",
            "nombre",
            "marca",
            "codigo_producto",
            "codigo_proveedor",
            "codigo_oem",
            "cantidad",
            "costo_compra",
            "margen_utilidad",
            "proveedor_nombre",
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
    numero_factura = serializers.IntegerField(max_value=999999999999)
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

            ubicaciones_prod = item.get("ubicaciones", [])
            if ubicaciones_prod:
                for ub in ubicaciones_prod:
                    ubicacion = Ubicacion.objects.get(pk=ub["ubicacion_id"])
                    stock, _ = StockProductoUbicacion.objects.get_or_create(
                        producto=producto,
                        ubicacion=ubicacion,
                        defaults={"cantidad": 0},
                    )
                    stock.cantidad += ub["cantidad"]
                    stock.save()
            elif ubicacion_default:
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

        detalles_anteriores = DetalleFactura.objects.filter(factura=instance).select_related("producto")
        for detalle in detalles_anteriores:
            producto = detalle.producto
            restante = detalle.cantidad
            stocks = StockProductoUbicacion.objects.filter(
                producto=producto
            ).order_by("-cantidad")
            for stock in stocks:
                if restante <= 0:
                    break
                deducir = min(stock.cantidad, restante)
                stock.cantidad -= deducir
                restante -= deducir
                stock.save()

        PrecioHistorico.objects.filter(factura=instance).delete()
        detalles_anteriores.delete()

        instance.proveedor = proveedor
        instance.fecha = validated_data["fecha"]
        instance.save()

        self._apply_items(instance, productos)
        return instance


class StoreConfigSerializer(serializers.ModelSerializer):
    nombre = serializers.CharField(read_only=True)
    locale = serializers.CharField(read_only=True)
    ubicacion_por_defecto_nombre = serializers.SerializerMethodField()
    effective_payment_methods = serializers.SerializerMethodField()
    effective_document_types = serializers.SerializerMethodField()
    effective_product_search_fields = serializers.SerializerMethodField()
    is_setup_complete = serializers.SerializerMethodField()

    class Meta:
        model = StoreConfig
        fields = [
            "id",
            "nombre",
            "telefono",
            "direccion",
            "tax_percent",
            "timezone",
            "currency_code",
            "locale",
            "price_round_to",
            "total_round_to",
            "total_round_threshold",
            "default_shipping_cost",
            "default_margin_percent",
            "feature_flags",
            "payment_methods",
            "document_types",
            "effective_payment_methods",
            "effective_document_types",
            "product_search_fields",
            "effective_product_search_fields",
            "is_setup_complete",
            "ubicacion_por_defecto",
            "ubicacion_por_defecto_nombre",
        ]

    def get_ubicacion_por_defecto_nombre(self, obj):
        return obj.ubicacion_por_defecto.nombre if obj.ubicacion_por_defecto else None

    def get_effective_payment_methods(self, obj):
        return obj.active_payment_methods()

    def get_effective_document_types(self, obj):
        return obj.active_document_types()

    def get_effective_product_search_fields(self, obj):
        return obj.effective_product_search_fields()

    def get_is_setup_complete(self, obj):
        return bool(obj.nombre)
