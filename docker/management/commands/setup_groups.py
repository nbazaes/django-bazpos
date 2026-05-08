from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType


class Command(BaseCommand):
    """
    Crea los tres grupos de usuario con sus permisos respectivos:
      - Vendedor: solo vender y consultar inventario
      - Encargado: vender + facturas + inventario + usuarios
      - Gerente: permiso total
    """
    help = "Crea los grupos Vendedor, Encargado y Gerente con permisos."

    def handle(self, *args, **options):
        # ── Permisos por app/modelo ──
        # vendedorApp: Producto, Venta, DetalleVenta
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

        # ── 1. Vendedor ──
        vendedor, created = Group.objects.get_or_create(name='Vendedor')
        vendedor.permissions.clear()
        # Puede ver productos y vender
        vendedor.permissions.add(
            *producto_perms.filter(codename='view_producto'),
            *venta_perms,
            *detalle_venta_perms,
        )
        status = "creado" if created else "actualizado"
        self.stdout.write(self.style.SUCCESS(f"Grupo 'Vendedor' {status} con permisos."))

        # ── 2. Encargado ──
        encargado, created = Group.objects.get_or_create(name='Encargado')
        encargado.permissions.clear()
        # Puede vender
        encargado.permissions.add(*venta_perms, *detalle_venta_perms)
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

        # ── 3. Gerente ──
        gerente, created = Group.objects.get_or_create(name='Gerente')
        gerente.permissions.clear()
        # Permiso total sobre todas las entidades de la app
        gerente.permissions.add(
            *producto_perms,
            *venta_perms,
            *detalle_venta_perms,
            *proveedor_perms,
            *factura_perms,
            *detalle_factura_perms,
            *precio_historico_perms,
            *user_perms,
        )
        status = "creado" if created else "actualizado"
        self.stdout.write(self.style.SUCCESS(f"Grupo 'Gerente' {status} con permisos."))

        self.stdout.write(self.style.SUCCESS("¡Grupos configurados correctamente!"))
