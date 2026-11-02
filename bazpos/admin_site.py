"""Developer console: direct corrections are isolated from business workflows."""
from contextlib import contextmanager
from contextvars import ContextVar

from django import forms
from django.conf import settings
from django.contrib import admin
from django.contrib.admin.forms import AdminAuthenticationForm
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.admin.widgets import AdminSplitDateTime
from django.db import models
from django.urls import path

technical_edit = ContextVar('technical_admin_edit', default=False)


@contextmanager
def direct_correction():
    token = technical_edit.set(True)
    try:
        yield
    finally:
        technical_edit.reset(token)


class SuperuserAuthenticationForm(AdminAuthenticationForm):
    def confirm_login_allowed(self, user):
        AuthenticationForm.confirm_login_allowed(self, user)
        if not user.is_superuser:
            raise forms.ValidationError('Acceso exclusivo para superusuarios.', code='invalid_login')


class TechnicalAdminSite(admin.AdminSite):
    site_header = 'BAZPOS / Developer console'
    site_title = 'BAZPOS · Admin'
    index_title = 'Consola de datos'
    login_form = SuperuserAuthenticationForm
    index_template = 'admin/console_index.html'

    def has_permission(self, request):
        return request.user.is_active and request.user.is_superuser

    def get_urls(self):
        from .admin_views import admin_logs
        return [path('logs/', self.admin_view(admin_logs), name='logs')] + super().get_urls()

    def get_app_list(self, request, app_label=None):
        app_list = super().get_app_list(request, app_label)
        labels = {
            'proveedor': 'Proveedores', 'ubicacion': 'Ubicaciones',
            'anulacion': 'Anulaciones', 'devolucion': 'Devoluciones',
            'outstandingtoken': 'Tokens emitidos', 'blacklistedtoken': 'Tokens revocados',
            'stockproductoubicacion': 'Stock por ubicación', 'stockhistorico': 'Histórico de stock',
            'preciohistorico': 'Histórico de precios', 'detallefactura': 'Detalles de factura',
            'detalleventa': 'Detalles de venta', 'pagoventa': 'Pagos de ventas',
            'detalledevolucion': 'Detalles de devolución', 'pedidodetalle': 'Detalles de pedidos',
            'pedidoproveedordia': 'Pedidos a proveedores por día', 'itempedidoproveedor': 'Ítems de pedidos a proveedores',
            'storeconfig': 'Configuración de tienda', 'ajustestock': 'Ajustes de stock',
            'cierrecaja': 'Cierres de caja', 'chatmessage': 'Mensajes', 'chatpresence': 'Presencia',
        }
        for app in app_list:
            for model in app['models']:
                model['name'] = labels.get(model['object_name'].lower(), model['name'])
        return app_list

    def each_context(self, request):
        context = super().each_context(request)
        context["site_url"] = settings.FRONTEND_URL or ("http://localhost:5173/" if settings.DEBUG else "/")
        sections = {name: [] for name in ('Inventario', 'Compras', 'Ventas', 'Pedidos', 'Configuración', 'Usuarios y seguridad', 'Chat')}
        groups = {
            'producto': 'Inventario', 'ubicacion': 'Inventario', 'stockproductoubicacion': 'Inventario',
            'ajustestock': 'Inventario', 'stockhistorico': 'Inventario', 'preciohistorico': 'Inventario',
            'proveedor': 'Compras', 'factura': 'Compras', 'detallefactura': 'Compras',
            'pedidoproveedordia': 'Compras', 'itempedidoproveedor': 'Compras',
            'storeconfig': 'Configuración', 'pedido': 'Pedidos', 'pedidodetalle': 'Pedidos',
            'chatmessage': 'Chat', 'chatpresence': 'Chat',
        }
        for app in context['available_apps']:
            for model in app['models']:
                key = model['object_name'].lower()
                section = groups.get(key, 'Ventas' if app['app_label'] == 'vendedorApp' else 'Usuarios y seguridad')
                sections[section].append(model)
        context['console_sections'] = [dict(name=name, models=items) for name, items in sections.items() if items]
        return context


def save_automatic_dates(obj, cleaned_data):
    corrections = {
        field.name: cleaned_data['override_' + field.name]
        for field in obj._meta.fields
        if (getattr(field, 'auto_now', False) or getattr(field, 'auto_now_add', False))
        and cleaned_data.get('override_' + field.name) is not None
    }
    if corrections:
        type(obj).objects.filter(pk=obj.pk).update(**corrections)
        for name, value in corrections.items():
            setattr(obj, name, value)


def technical_form(model):
    automatic = [f for f in model._meta.fields if getattr(f, 'auto_now', False) or getattr(f, 'auto_now_add', False)]

    class CorrectionForm(forms.ModelForm):
        class Meta:
            fields = '__all__'

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            for field in automatic:
                alias = 'override_' + field.name
                self.initial[alias] = getattr(self.instance, field.name, None)
                self.fields[alias].required = bool(self.instance.pk)

        def clean(self):
            cleaned = super().clean()
            # ubicacion_key is generated by MariaDB and excluded from model-form
            # uniqueness checks. Validate its source fields before saving.
            if model._meta.label_lower.lower() == 'vendedorapp.stockproductoubicacion' and cleaned.get('producto'):
                duplicates = model.objects.filter(producto=cleaned['producto'], ubicacion=cleaned.get('ubicacion'))
                if self.instance.pk:
                    duplicates = duplicates.exclude(pk=self.instance.pk)
                if duplicates.exists():
                    raise forms.ValidationError('Ya existe stock para este producto y ubicación.')
            return cleaned

        def save(self, commit=True):
            obj = super().save(commit=commit)
            if commit:
                save_automatic_dates(obj, self.cleaned_data)
            return obj

    attrs = {}
    for field in automatic:
        if isinstance(field, models.DateTimeField):
            form_field = forms.SplitDateTimeField(widget=AdminSplitDateTime, required=False)
        else:
            form_field = forms.DateField(widget=admin.widgets.AdminDateWidget, required=False)
        form_field.label = field.verbose_name
        form_field.help_text = 'Corrección directa. Vacío al crear: fecha automática.'
        attrs['override_' + field.name] = form_field
    return type(model.__name__ + 'CorrectionForm', (CorrectionForm,), attrs)


class TechnicalModelAdmin(admin.ModelAdmin):
    change_form_template = 'admin/technical_change_form.html'
    list_per_page = 50
    show_full_result_count = False
    save_on_top = True
    list_select_related = True

    def __init__(self, model, admin_site):
        self.form = technical_form(model)
        self.readonly_fields = self.readonly_fields + tuple(f.name for f in model._meta.fields if f.primary_key or isinstance(f, models.GeneratedField))
        super().__init__(model, admin_site)

    def get_fieldsets(self, request, obj=None):
        if self.fieldsets:
            return self.fieldsets
        groups = {'Datos del registro': [], 'Relaciones': [], 'Datos estructurados': [], 'Datos técnicos y fechas': []}
        for name in self.get_fields(request, obj):
            source = name.removeprefix('override_')
            field = self.model._meta.get_field(source)
            if field.primary_key or isinstance(field, (models.GeneratedField, models.DateField)):
                group = 'Datos técnicos y fechas'
            elif field.is_relation:
                group = 'Relaciones'
            elif isinstance(field, models.JSONField):
                group = 'Datos estructurados'
            else:
                group = 'Datos del registro'
            groups[group].append(name)
        return [(label, {'fields': fields}) for label, fields in groups.items() if fields]

    def changeform_view(self, request, object_id=None, form_url='', extra_context=None):
        with direct_correction():
            return super().changeform_view(request, object_id, form_url, extra_context)

    def save_model(self, request, obj, form, change):
        if obj._meta.label_lower.lower() == 'vendedorapp.producto':
            # The technical console persists the submitted price. Normal model
            # saves outside this admin still calculate it from cost and margin.
            models.Model.save(obj)
        else:
            super().save_model(request, obj, form, change)
        save_automatic_dates(obj, form.cleaned_data)


def register_models(model_module, configurations=None):
    """Explicit app registrations with consistent relation widgets and search."""
    configurations = configurations or {}
    for model in vars(model_module).values():
        if not isinstance(model, type) or not issubclass(model, models.Model) or model.__module__ != model_module.__name__:
            continue
        text_fields = tuple(f.name for f in model._meta.fields if isinstance(f, (models.CharField, models.TextField)))
        relations = tuple(f.name for f in model._meta.fields if isinstance(f, (models.ForeignKey, models.OneToOneField)))
        columns = [model._meta.pk.name] + [f.name for f in model._meta.fields if not f.primary_key and not isinstance(f, (models.TextField, models.JSONField, models.GeneratedField))][:5]
        attrs = dict(search_fields=('=' + model._meta.pk.name,) + text_fields, autocomplete_fields=relations, list_display=tuple(columns))
        attrs.update(configurations.get(model.__name__, {}))
        admin.site.register(model, type(model.__name__ + 'Admin', (TechnicalModelAdmin,), attrs))


class StockInlineFormSet(forms.BaseInlineFormSet):
    def clean(self):
        super().clean()
        locations = set()
        for form in self.forms:
            if not form.cleaned_data or form.cleaned_data.get('DELETE'):
                continue
            location = form.cleaned_data.get('ubicacion')
            key = location.pk if location else None
            if key in locations:
                raise forms.ValidationError('Cada ubicación puede aparecer una sola vez por producto.')
            locations.add(key)


def inline(model, **kwargs):
    attrs = dict(model=model, form=technical_form(model), extra=0, show_change_link=True,
                 autocomplete_fields=tuple(f.name for f in model._meta.fields if isinstance(f, models.ForeignKey)), **kwargs)
    if model._meta.label_lower.lower() == 'vendedorapp.stockproductoubicacion':
        attrs['formset'] = StockInlineFormSet
        attrs['verbose_name_plural'] = 'Stock por ubicación'
    return type(model.__name__ + 'Inline', (admin.TabularInline,), attrs)
