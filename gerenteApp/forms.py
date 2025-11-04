from django import forms
from django.contrib.auth.models import User, Group
from django.contrib.auth.forms import UserCreationForm, UserChangeForm
from gerenteApp.models import Proveedor

class ProveedorForm(forms.ModelForm):
    class Meta:
        model = Proveedor
        fields = ['nombre', 'persona_contacto', 'telefono', 'correo', 'direccion']
        widgets = {
            'nombre':forms.TextInput(attrs={'class':'form-control'}),
            'persona_contacto':forms.TextInput(attrs={'class':'form-control'}),
            'telefono':forms.TextInput(attrs={'class':'form-control'}),
            'correo':forms.TextInput(attrs={'class':'form-control'}),
            'direccion':forms.Textarea(attrs={'class':'form-control','rows':'3'})
        }

class ProveedorFiltro(forms.Form):
    texto = forms.CharField(required=False,widget=forms.TextInput(attrs={'class':'form-control'}))

class RegistroForm(UserCreationForm):
    first_name = forms.CharField(max_length=30, required=True, help_text='Nombre')
    last_name = forms.CharField(max_length=30, required=True, help_text='Apellido')
    group = forms.ModelChoiceField(queryset=Group.objects.all(), required=True, help_text='Grupo')

    class Meta:
        model = User
        fields = ['username', 'first_name', 'last_name', 'password1', 'password2', 'group']

class EditarUsuarioForm(UserChangeForm):
    password = forms.CharField(widget=forms.PasswordInput, required=False, help_text='Déjalo en blanco si no quieres cambiarla.')
    group = forms.ModelChoiceField(queryset=Group.objects.all(), required=False, help_text='Grupo')

    class Meta:
        model = User
        fields = ['username', 'first_name', 'last_name', 'password', 'group']


class UsersFiltro(forms.Form):
    texto = forms.CharField(required=False,widget=forms.TextInput(attrs={'class':'form-control'}))

    
