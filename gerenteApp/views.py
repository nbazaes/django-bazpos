from django.shortcuts import render,redirect
from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required, permission_required
from django.contrib.auth.models import User, Group
from django.contrib import messages
from .models import Proveedor
from .forms import ProveedorForm, ProveedorFiltro, RegistroForm, UsersFiltro, EditarUsuarioForm

def proveedores_api(request):
    datos = Proveedor.objects.values(
        'proveedor_id', 
        'nombre', 
        'persona_contacto', 
        'telefono', 
        'correo', 
        'direccion', 
        'fecha_creacion'
    )
    return JsonResponse(list(datos), safe=False)

@permission_required('gerenteApp.view_proveedor',login_url='/')
def ver_proveedores(request):
    return render(request, 'gerencia/proveedores.html')

@permission_required('gerenteApp.add_proveedor',login_url='/')
def crearProveedor(request):
    form = ProveedorForm()               
    data = {
        'titulo':'Crear proveedor',
        'formulario':form
    }
    if request.method == 'POST':
        form = ProveedorForm(request.POST)
        if form.is_valid():
            form.save()
            messages.success(request,'¡Proveedor creado con éxito!')
    return render(request,'gerencia/proveedores/create.html',data)

@permission_required('gerenteApp.view_proveedor',login_url='/')
def listarProveedores(request):
    #cargamos el formulario con filtro
    form = ProveedorFiltro()
    proveedores = Proveedor.objects.all()
    #verificamos si el formulario trae datos
    if request.method == 'POST':
        form = ProveedorFiltro(request.POST)
        texto = request.POST.get('texto')
        #preguntamos si es diferente del inicial
        if texto != '':
            #icontains indica que contiene la palabra
            proveedores = proveedores.filter(Q(nombre__icontains=texto))
    #pasamos el formulario al data
    data = {'lista': proveedores,'form':form}
    return render(request,'gerencia/proveedores/lista_proveedores.html',data)

@permission_required('gerenteApp.delete_proveedor',login_url='/')
def eliminarProveedor(request,id):
    proveedor = Proveedor.objects.get(pk=id)
    proveedor.delete()
    return redirect('/gerencia/proveedores/proveedores')

@permission_required('gerenteApp.change_proveedor',login_url='/')
def editarProveedor(request,id):
    proveedor = Proveedor.objects.get(pk=id)
    form = ProveedorForm(instance=proveedor)
    if request.method == 'POST':
        #capturamos el post pero sin olvidar los datos traidos en producto
        form = ProveedorForm(request.POST,instance=proveedor)
        if form.is_valid():
            form.save()
            messages.success(request,'Proveedor editado con éxito.')
    
    data = {
        'titulo':'Editar proveedor',
        'formulario':form
    }        
    return render(request,'gerencia/proveedores/create.html',data)

@permission_required('auth.add_user',login_url='/')
def registro(request):
    if request.method == 'POST':
        form = RegistroForm(request.POST)
        if form.is_valid():
            user = form.save(commit=False)
            user.save()
            # Asignar el usuario al grupo seleccionado
            group = form.cleaned_data.get('group')
            user.groups.add(group)
            messages.success(request, '¡Usuario registrado con éxito! Ya puede iniciar sesión.') # Redirigir de vuelta al registro o a otra vista
    else:
        form = RegistroForm()
    
    data = {
        'titulo':'Registrar usuario',
        'formulario':form
    }


    return render(request, 'gerencia/usuarios/create.html', data)

@permission_required('auth.view_user',login_url='/')
def listarUsuarios(request):
    #cargamos el formulario con filtro
    form = UsersFiltro()
    usuarios = User.objects.all()
    #verificamos si el formulario trae datos
    if request.method == 'POST':
        form = UsersFiltro(request.POST)
        texto = request.POST.get('texto')
        #preguntamos si es diferente del inicial
        if texto != '':
            #icontains indica que contiene la palabra
            usuarios = usuarios.filter(Q(first_name__icontains=texto) | Q(last_name__icontains=texto) | Q(username__icontains=texto))
    #pasamos el formulario al data
    data = {'lista': usuarios,'form':form}
    return render(request,'gerencia/usuarios/usuarios.html',data)

@permission_required('auth.delete_user',login_url='/')
def eliminarUsuario(request,username):
    usuario = User.objects.get(username=username)
    usuario.delete()
    return redirect('/gerencia/usuarios/usuarios')

@permission_required('auth.change_user',login_url='/')
def editarUsuario(request,username):
    usuario = User.objects.get(username=username)
    if request.method == 'POST':
        #capturamos el post pero sin olvidar los datos traidos en producto
        form = EditarUsuarioForm(request.POST,instance=usuario)
        if form.is_valid():
            user = form.save(commit=False)
            group_id = request.POST.get('group')
            if group_id:
                group = Group.objects.get(id=group_id)
                user.groups.clear()
                user.groups.add(group)
            messages.success(request,'Usuario editado con éxito.')
    else:
        form = EditarUsuarioForm(instance=usuario)
    
    current_group = usuario.groups.first()
    groups = Group.objects.all()
    data = {
        'titulo':'Editar usuario',
        'formulario':form,
        'current_group':current_group,
        'groups':groups
    }        
    return render(request,'gerencia/usuarios/editar.html',data)

