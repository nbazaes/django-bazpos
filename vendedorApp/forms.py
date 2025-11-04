from django import forms
from .models import Producto
from gerenteApp.models import Proveedor

class ProductoForm(forms.ModelForm):
    class Meta:
        model = Producto
        fields = ['nombre', 'codigo', 'descripcion', 'precio_costo', 'stock_minimo', 'stock_maximo', 'stock_actual', 'margen_utilidad', 'proveedor']
        widgets = {
            'nombre':forms.TextInput(attrs={'class':'form-control'}),
            'codigo':forms.TextInput(attrs={'class':'form-control'}),
            'descripcion':forms.Textarea(attrs={'class':'form-control','rows':'3'}),
            'precio_costo':forms.NumberInput(attrs={'class':'form-control'}),
            'stock_minimo':forms.NumberInput(attrs={'class':'form-control'}),
            'stock_maximo':forms.NumberInput(attrs={'class':'form-control'}),
            'stock_actual':forms.NumberInput(attrs={'class':'form-control'}),
            'margen_utilidad':forms.NumberInput(attrs={'class':'form-control'}),
            'proveedor':forms.Select(attrs={'class':'form-control'})
        }

class ProductoFiltro(forms.Form):
    proveedores = forms.ModelChoiceField(queryset=Proveedor.objects.all(),
                                    empty_label='Todos los proveedores',
                                    required=False,
                                    widget=forms.Select(attrs={'class':'form-select'}))
    #filtro para texto
    texto = forms.CharField(required=False,widget=forms.TextInput(attrs={'class':'form-control'}))
    
