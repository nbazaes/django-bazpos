from django.contrib import admin
from gerenteApp.models import Tax

@admin.register(Tax)
class TaxAdmin(admin.ModelAdmin):
    list_display = ("id", "tax_percent")
