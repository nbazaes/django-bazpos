from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType


class Command(BaseCommand):
    """
    Crea los grupos de usuario con sus permisos respectivos:
      - Vendedor: solo vender y consultar inventario
      - Encargado: vender + facturas + inventario + usuarios
      - Bodeguero: gestionar inventario y ubicaciones
      - Gerente: permiso total
    """
    help = "Crea los grupos Vendedor, Bodeguero, Encargado y Gerente con permisos."

    def handle(self, *args, **options):
        # ── Permisos por app/modelo ──
        # vendedorApp: Producto, Venta, DetalleVenta, Anulacion, Devolucion, DetalleDevolucion
        producto_perms = Permission.objects.filter(
            content_type__app_label='vendedorApp',
            content_type__model='producto',
        )
        venta_perms = Permission.objects.filter(
            content_type__app_label='vendedorApp',
            content_type__model='venta',
        )
        detalle_venta_perms = Permission.objects.filter(
            content_type__app_label='vendedorApp',
            content_type__model='detalleventa',
        )
        anulacion_perms = Permission.objects.filter(
            content_type__app_label='vendedorApp',
            content_type__model='anulacion',
        )
        devolucion_perms = Permission.objects.filter(
            content_type__app_label='vendedorApp',
            content_type__model='devolucion',
        )
        detalle_devolucion_perms = Permission.objects.filter(
            content_type__app_label='vendedorApp',
            content_type__model='detalledevolucion',
        )

        # gerenteApp: Proveedor, Factura, DetalleFactura, PrecioHistorico
        proveedor_perms = Permission.objects.filter(
            content_type__app_label='gerenteApp',
            content_type__model='proveedor',
        )
        factura_perms = Permission.objects.filter(
            content_type__app_label='gerenteApp',
            content_type__model='factura',
        )
        detalle_factura_perms = Permission.objects.filter(
            content_type__app_label='gerenteApp',
            content_type__model='detallefactura',
        )
        precio_historico_perms = Permission.objects.filter(
            content_type__app_label='gerenteApp',
            content_type__model='preciohistorico',
        )

        # auth: User
        user_perms = Permission.objects.filter(
            content_type__app_label='auth',
            content_type__model='user',
        )

        # vendedorApp: Pedido, PedidoDetalle
        pedido_perms = Permission.objects.filter(
            content_type__app_label='vendedorApp',
            content_type__model='pedido',
        )
        detalle_pedido_perms = Permission.objects.filter(
            content_type__app_label='vendedorApp',
            content_type__model='pedidodetalle',
        )

        # vendedorApp: AjusteStock, StockProductoUbicacion, Ubicacion
        ajuste_stock_perms = Permission.objects.filter(
            content_type__app_label='vendedorApp',
            content_type__model='ajustestock',
        )
        stock_ubicacion_perms = Permission.objects.filter(
            content_type__app_label='vendedorApp',
            content_type__model='stockproductoubicacion',
        )
        ubicacion_perms = Permission.objects.filter(
            content_type__app_label='vendedorApp',
            content_type__model='ubicacion',
        )

        # ── 1. Vendedor ──
        vendedor, created = Group.objects.get_or_create(name='Vendedor')
        vendedor.permissions.clear()
        # Puede ver productos y vender
        vendedor.permissions.add(
            *producto_perms.filter(codename='view_producto'),
            *venta_perms,
            *detalle_venta_perms,
            *pedido_perms,
            *detalle_pedido_perms,
        )
        status = "creado" if created else "actualizado"
        self.stdout.write(self.style.SUCCESS(f"Grupo 'Vendedor' {status} con permisos."))

        # ── 2. Encargado ──
        encargado, created = Group.objects.get_or_create(name='Encargado')
        encargado.permissions.clear()
        # Puede vender
        encargado.permissions.add(*venta_perms, *detalle_venta_perms, *anulacion_perms, *devolucion_perms, *detalle_devolucion_perms)
        encargado.permissions.add(*pedido_perms, *detalle_pedido_perms)
        # Puede gestionar productos (inventario)
        encargado.permissions.add(*producto_perms)
        # Puede gestionar facturas
        encargado.permissions.add(*factura_perms, *detalle_factura_perms, *precio_historico_perms)
        # Puede ver proveedores (necesario para facturas)
        encargado.permissions.add(*proveedor_perms.filter(codename='view_proveedor'))
        # Puede gestionar usuarios
        encargado.permissions.add(*user_perms)
        status = "creado" if created else "actualizado"
        self.stdout.write(self.style.SUCCESS(f"Grupo 'Encargado' {status} con permisos."))

        # ── 3. Bodeguero ──
        bodeguero, created = Group.objects.get_or_create(name='Bodeguero')
        bodeguero.permissions.clear()
        bodeguero.permissions.add(
            *producto_perms.filter(codename__in=['view_producto', 'add_producto', 'change_producto']),
        )
        bodeguero.permissions.add(*venta_perms, *detalle_venta_perms)
        bodeguero.permissions.add(*pedido_perms, *detalle_pedido_perms)
        bodeguero.permissions.add(*ajuste_stock_perms)
        bodeguero.permissions.add(*stock_ubicacion_perms)
        bodeguero.permissions.add(*ubicacion_perms)
        status = "creado" if created else "actualizado"
        self.stdout.write(self.style.SUCCESS(f"Grupo 'Bodeguero' {status} con permisos."))

        # ── 4. Gerente ──
        gerente, created = Group.objects.get_or_create(name='Gerente')
        gerente.permissions.clear()
        # Permiso total sobre todas las entidades de la app
        gerente.permissions.add(
            *producto_perms,
            *venta_perms,
            *detalle_venta_perms,
            *anulacion_perms,
            *devolucion_perms,
            *detalle_devolucion_perms,
            *pedido_perms,
            *detalle_pedido_perms,
            *proveedor_perms,
            *factura_perms,
            *detalle_factura_perms,
            *precio_historico_perms,
            *user_perms,
        )
        status = "creado" if created else "actualizado"
        self.stdout.write(self.style.SUCCESS(f"Grupo 'Gerente' {status} con permisos."))

        self.stdout.write(self.style.SUCCESS("¡Grupos configurados correctamente!"))
