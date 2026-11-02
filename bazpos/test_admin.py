from datetime import timedelta
from decimal import Decimal

from django.apps import apps
from django.conf import settings
from django.middleware.csrf import get_token
from django.contrib import admin
from django.contrib.admin.models import LogEntry
from django.contrib.auth.models import User
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings
from django.contrib.sessions.backends.signed_cookies import SessionStore
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils import timezone

from bazpos.admin_site import direct_correction, technical_edit
from chatApp.models import ChatMessage
from gerenteApp.models import PrecioHistorico, Proveedor, StoreConfig
from vendedorApp.models import (
    DetalleDevolucion, Devolucion, ItemPedidoProveedor,
    PedidoProveedorDia, Producto, StockHistorico, StockProductoUbicacion, Venta,
)


class TechnicalAdminTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.root = User.objects.create_superuser('developer', 'dev@example.com', 'password')
        cls.staff = User.objects.create_user('staff', password='password', is_staff=True)
        cls.proveedor = Proveedor.objects.create(nombre='Proveedor')
        cls.producto = Producto.objects.create(nombre='Pieza', codigo_producto='P1', oem='OEM', descripcion='Pieza', precio_costo=100, margen_utilidad=Decimal('30'), stock_minimo=0, stock_maximo=50, proveedor=cls.proveedor)

    def setUp(self):
        self.client.force_login(self.root)

    def test_every_business_model_registered_and_forms_render(self):
        for app in ('gerenteApp', 'vendedorApp', 'chatApp'):
            for model in apps.get_app_config(app).get_models():
                with self.subTest(model=model.__name__):
                    self.assertTrue(admin.site.is_registered(model))
                    url = reverse('admin:' + model._meta.app_label + '_' + model._meta.model_name + '_add')
                    response = self.client.get(url)
                    self.assertEqual(response.status_code, 200)

    def test_site_and_all_registered_models_reject_staff(self):
        self.client.force_login(self.staff)
        urls = ['/admin/', '/admin/logs/', '/admin/auth/user/', '/admin/auth/group/', '/admin/token_blacklist/outstandingtoken/']
        for model in admin.site._registry:
            urls.append(reverse('admin:' + model._meta.app_label + '_' + model._meta.model_name + '_changelist'))
        for url in urls:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 302)
        response = self.client.post('/admin/login/', {'username': 'staff', 'password': 'password'})
        self.assertEqual(response.status_code, 200)

    def test_index_logs_and_token_forms_render(self):
        for url in ('/admin/', '/admin/logs/', '/admin/token_blacklist/outstandingtoken/add/', '/admin/token_blacklist/blacklistedtoken/add/'):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 200)

    def test_price_correction_and_stock_inline_have_no_side_effects(self):
        product = self.producto
        product.ignorar_stock_permanente = True
        product.save()
        stock = StockProductoUbicacion.objects.create(producto=product, cantidad=2)
        product.ignorar_stock_permanente = True
        product.save()
        count = StockHistorico.objects.count()
        url = reverse('admin:vendedorApp_producto_change', args=[product.pk])
        data = dict(nombre=product.nombre, codigo_producto='P1', oem='OEM', descripcion='Pieza', precio_costo=100, margen_utilidad='30', precio=777, stock_minimo=0, stock_maximo=50, proveedor=self.proveedor.pk, ignorar_stock_permanente='on')
        data.update({'stocks_ubicacion-TOTAL_FORMS': '1', 'stocks_ubicacion-INITIAL_FORMS': '1', 'stocks_ubicacion-MIN_NUM_FORMS': '0', 'stocks_ubicacion-MAX_NUM_FORMS': '1000', 'stocks_ubicacion-0-id': stock.pk, 'stocks_ubicacion-0-producto': product.pk, 'stocks_ubicacion-0-ubicacion': '', 'stocks_ubicacion-0-cantidad': '9'})
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, 302, response.context and response.context['adminform'].form.errors)
        product.refresh_from_db()
        stock.refresh_from_db()
        self.assertEqual(product.precio, 777)
        self.assertTrue(product.ignorar_stock_permanente)
        self.assertEqual(stock.cantidad, 9)
        self.assertEqual(StockHistorico.objects.count(), count)
        entry = LogEntry.objects.filter(object_id=str(product.pk), content_type__model='producto').latest('action_time')
        self.assertIn('precio', entry.get_change_message().lower())
        self.assertFalse(technical_edit.get())
        stock.cantidad = 10
        stock.save()
        self.assertEqual(StockHistorico.objects.count(), count + 1)
        product.refresh_from_db()
        self.assertFalse(product.ignorar_stock_permanente)

    def test_automatic_date_correction_and_validation(self):
        message = ChatMessage.objects.create(user=self.root, name='Developer', content='Original')
        date = timezone.localtime(timezone.now() - timedelta(days=5)).replace(microsecond=0)
        url = reverse('admin:chatApp_chatmessage_change', args=[message.pk])
        data = {'user': self.root.pk, 'name': 'Developer', 'content': 'Corregido', 'override_created_at_0': date.strftime('%Y-%m-%d'), 'override_created_at_1': date.strftime('%H:%M:%S')}
        self.assertEqual(self.client.post(url, data).status_code, 302)
        message.refresh_from_db()
        self.assertEqual(message.created_at, date)
        data['override_created_at_0'] = 'fecha inválida'
        self.assertEqual(self.client.post(url, data).status_code, 200)
        message.refresh_from_db()
        self.assertEqual(message.created_at, date)

    def test_historical_prices_and_json_can_be_corrected(self):
        history = PrecioHistorico.objects.create(producto=self.producto, precio_costo_anterior=1, precio_costo_nuevo=2)
        response = self.client.get(reverse('admin:gerenteApp_preciohistorico_change', args=[history.pk]))
        self.assertFalse(response.context['adminform'].form.fields['precio_costo_nuevo'].disabled)
        date = timezone.localtime(history.fecha)
        response = self.client.post(reverse('admin:gerenteApp_preciohistorico_change', args=[history.pk]), {
            'producto': self.producto.pk, 'precio_costo_anterior': 1, 'precio_costo_nuevo': 987,
            'fecha_0': date.strftime('%Y-%m-%d'), 'fecha_1': date.strftime('%H:%M:%S'),
        })
        self.assertEqual(response.status_code, 302)
        history.refresh_from_db()
        self.assertEqual(history.precio_costo_nuevo, 987)
        config = StoreConfig.current()
        response = self.client.get(reverse('admin:gerenteApp_storeconfig_change', args=[config.pk]))
        form = response.context['adminform'].form
        self.assertIn('feature_flags', form.fields)
        self.assertIn('nombre', form.fields)
        data = {name: (form[name].value() if form[name].value() is not None else '') for name in form.fields}
        data.update({'feature_flags': '{"developer_tools": true}', 'nombre': 'Tienda técnica'})
        self.assertEqual(self.client.post(reverse('admin:gerenteApp_storeconfig_change', args=[config.pk]), data).status_code, 302)
        config.refresh_from_db()
        self.assertEqual(config.feature_flags, {'developer_tools': True})
        self.assertEqual(config.nombre, 'Tienda técnica')

    def test_correction_scope_resets_on_failure(self):
        with self.assertRaises(ValueError):
            with direct_correction():
                self.assertTrue(technical_edit.get())
                raise ValueError('failed save')
        self.assertFalse(technical_edit.get())

    def test_sale_correction_does_not_change_stock(self):
        sale = Venta.objects.create(usuario=self.root, monto_total=100)
        stock = StockProductoUbicacion.objects.create(producto=self.producto, cantidad=5)
        url = reverse('admin:vendedorApp_venta_change', args=[sale.pk])
        form = self.client.get(url).context['adminform'].form
        data = {}
        for name in form.fields:
            value = form[name].value()
            if value is not None:
                field = form.fields[name]
                if hasattr(field.widget, 'decompress'):
                    parts = field.widget.decompress(value)
                    for index, part in enumerate(parts):
                        data[f'{name}_{index}'] = str(part)
                else:
                    data[name] = value
        date = timezone.localtime(sale.fecha_venta)
        data.update({'fecha_venta_0': date.strftime('%Y-%m-%d'), 'fecha_venta_1': date.strftime('%H:%M:%S'), 'monto_total': 999, 'estado': 'CO'})
        for prefix in ('detalleventa_set', 'pagos'):
            data.update({f'{prefix}-TOTAL_FORMS': 0, f'{prefix}-INITIAL_FORMS': 0})
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, 302, response.context and response.context['adminform'].form.errors)
        sale.refresh_from_db()
        stock.refresh_from_db()
        self.assertEqual(sale.monto_total, 999)
        self.assertEqual(stock.cantidad, 5)

    def test_inline_automatic_date_is_editable(self):
        day = PedidoProveedorDia.objects.create(fecha=timezone.now().date())
        item = ItemPedidoProveedor.objects.create(dia=day, proveedor=self.proveedor, nombre_custom='Pieza')
        date = timezone.localtime(timezone.now() - timedelta(days=3)).replace(microsecond=0)
        url = reverse('admin:vendedorApp_pedidoproveedordia_change', args=[day.pk])
        created = timezone.localtime(day.created_at)
        data = {'fecha': str(day.fecha), 'override_created_at_0': created.strftime('%Y-%m-%d'), 'override_created_at_1': created.strftime('%H:%M:%S'),
                'items-TOTAL_FORMS': 1, 'items-INITIAL_FORMS': 1, 'items-0-id': item.pk, 'items-0-dia': day.pk, 'items-0-proveedor': self.proveedor.pk, 'items-0-nombre_custom': 'Pieza',
                'items-0-override_fecha_agregado_0': date.strftime('%Y-%m-%d'), 'items-0-override_fecha_agregado_1': date.strftime('%H:%M:%S')}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, 302, response.context and response.context['adminform'].form.errors)
        item.refresh_from_db()
        self.assertEqual(item.fecha_agregado, date)

    def test_protected_deletion_and_nullable_relation(self):
        sale = Venta.objects.create(usuario=self.root, monto_total=100)
        refund = Devolucion.objects.create(venta=sale, usuario=self.staff, motivo='Corrección')
        detail = DetalleDevolucion.objects.create(devolucion=refund, nombre='Pieza sin catálogo', cantidad=1)
        self.assertIn('Pieza sin catálogo', str(detail))
        response = self.client.get(reverse('admin:vendedorApp_detalledevolucion_change', args=[detail.pk]))
        self.assertEqual(response.status_code, 200)
        response = self.client.post(reverse('admin:auth_user_delete', args=[self.staff.pk]), {'post': 'yes'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(User.objects.filter(pk=self.staff.pk).exists())

    def test_anonymous_inactive_and_business_roles_denied(self):
        from django.contrib.auth.models import Group, Permission
        group = Group.objects.create(name='Gerente')
        group.permissions.set(Permission.objects.all())
        self.staff.groups.add(group)
        for user in (None, self.staff):
            self.client.logout()
            if user:
                self.client.force_login(user)
            self.assertEqual(self.client.get('/admin/').status_code, 302)
        self.root.is_active = False
        self.root.save()
        self.client.force_login(self.root)
        self.assertEqual(self.client.get('/admin/').status_code, 302)

    def test_duplicate_stock_location_returns_form_error(self):
        StockProductoUbicacion.objects.create(producto=self.producto, cantidad=2)
        url = reverse('admin:vendedorApp_stockproductoubicacion_add')
        response = self.client.post(url, {'producto': self.producto.pk, 'ubicacion': '', 'cantidad': 3})
        self.assertEqual(response.status_code, 200)
        self.assertIn('Ya existe stock', str(response.context['adminform'].form.errors))
        self.assertEqual(StockProductoUbicacion.objects.filter(producto=self.producto).count(), 1)


class AdminNavigationTests(SimpleTestCase):
    def setUp(self):
        self.request = RequestFactory().get('/admin/')
        self.request.user = User(pk=1, username='developer', is_staff=True, is_superuser=True)
        self.request.session = SessionStore()

    def assert_site_link(self, expected):
        context = admin.site.each_context(self.request)
        self.assertEqual(context['site_url'], expected)
        html = render_to_string('admin/base_site.html', context, request=self.request)
        self.assertIn(f'href="{expected}"', html)
        self.assertIn('href="/admin/"', html)
        self.assertIn('action="/admin/logout/"', html)

    @override_settings(DEBUG=True, FRONTEND_URL='')
    def test_development_site_link_uses_react(self):
        self.assert_site_link('http://localhost:5173/')

    @override_settings(DEBUG=False, FRONTEND_URL='')
    def test_production_site_link_uses_same_origin(self):
        self.assert_site_link('/')

    def test_custom_frontend_url_in_both_environments(self):
        for debug in (True, False):
            with self.subTest(debug=debug), override_settings(DEBUG=debug, FRONTEND_URL='https://frontend.example.test/'):
                self.assert_site_link('https://frontend.example.test/')

    def test_logout_clears_session_and_returns_to_admin_login(self):
        for debug in (True, False):
            with self.subTest(debug=debug), override_settings(DEBUG=debug):
                request = RequestFactory().post('/admin/logout/')
                request.META['HTTP_X_CSRFTOKEN'] = get_token(request)
                request.COOKIES[settings.CSRF_COOKIE_NAME] = request.META['CSRF_COOKIE']
                request.user = self.request.user
                request.session = SessionStore()
                request.session['_auth_user_id'] = '1'
                request.session['_auth_user_backend'] = 'django.contrib.auth.backends.ModelBackend'
                response = admin.site.logout(request)
                self.assertEqual(response.status_code, 302)
                self.assertEqual(response.url, reverse('admin:login'))
                self.assertNotIn('_auth_user_id', request.session)
                self.assertTrue(request.user.is_anonymous)
