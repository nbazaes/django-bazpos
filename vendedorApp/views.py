from django.shortcuts import render,redirect
from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required, permission_required
from django.contrib import messages
from vendedorApp.models import Producto, Venta, DetalleVenta
from gerenteApp.models import Proveedor
from .forms import ProductoForm, ProductoFiltro
import json

@login_required(login_url='/accounts/login/')
def inicio(request):
    return render(request, 'index.html') 

def ver_pedido(request):
    return render(request, 'ventas/pedidos.html')

def ventas(request):
    return render(request, 'ventas/venta.html')

def listar_inventario(request):
    return render(request, 'ventas/inventario.html')

def datos_api(request):
    datos = Producto.objects.select_related('proveedor').values(
        'producto_id', 
        'nombre', 
        'codigo', 
        'descripcion', 
        'precio', 
        'precio_costo', 
        'stock_minimo', 
        'stock_maximo', 
        'stock_actual', 
        'margen_utilidad', 
        'proveedor__nombre'
    )
    return JsonResponse(list(datos), safe=False)

@csrf_exempt
def validar_stock(request):
    data = json.loads(request.body)
    productos = data.get('productos', [])
    
    for producto in productos:
        p = Producto.objects.get(codigo=producto['codigo'])
        if p.stock_actual < producto['cantidad']:
            return JsonResponse({'stock_valido': False})
    
    return JsonResponse({'stock_valido': True})

@csrf_exempt
def registrar_venta(request):
    data = json.loads(request.body)
    productos = data.get('productos', [])
    total = data.get('total')
    fecha = data.get('fecha')
    
    # Crear venta
    venta = Venta.objects.create(
        fecha_venta=fecha,
        monto_total=total,
        estado='CO',  # Completada
        usuario=request.user
    )
    
    # Crear detalles de venta y actualizar stock
    for producto in productos:
        p = Producto.objects.get(codigo=producto['codigo'])
        
        DetalleVenta.objects.create(
            venta=venta,
            producto=p,
            cantidad=producto['cantidad'],
            precio_unitario=p.precio,
            subtotal=producto['precio']
        )
        
        # Actualizar stock
        p.stock_actual -= producto['cantidad']
        p.save()
    
    return JsonResponse({
        'id': venta.id, 
        'mensaje': 'Venta registrada exitósamente'
    })

@permission_required('vendedorApp.add_producto',login_url='/')
def crearProducto(request):
    form = ProductoForm()               
    data = {
        'titulo':'Crear producto',
        'formulario':form
    }
    if request.method == 'POST':
        form = ProductoForm(request.POST)
        if form.is_valid():
            form.save()
            messages.success(request,'¡Producto creado con éxito!')
    return render(request,'ventas/productos/create.html',data)

@permission_required('vendedorApp.view_producto',login_url='/')
def listarProductos(request):
    #cargamos el formulario con filtro
    form = ProductoFiltro()
    productos = Producto.objects.all()
    #verificamos si el formulario trae datos
    if request.method == 'POST':
        form = ProductoFiltro(request.POST)
        proveedor = request.POST.get('proveedores')
        texto = request.POST.get('texto')
        #preguntamos si es diferente del inicial
        if proveedor != '':
            #luego filtramos según la opción seleccionada
            productos = productos.filter(proveedor = proveedor)
        if texto != '':
            #icontains indica que contiene la palabra
            productos = productos.filter(Q(nombre__icontains=texto) | Q(codigo__icontains=texto))
    #pasamos el formulario al data
    data = {'lista': productos,'form':form}
    return render(request,'ventas/productos/producto.html',data)

@permission_required('vendedorApp.delete_producto',login_url='/')
def eliminarProducto(request,id):
    producto = Producto.objects.get(pk=id)
    producto.delete()
    return redirect('/ventas/productos/productos')

@permission_required('vendedorApp.change_producto',login_url='/')
def editarProducto(request,id):
    producto = Producto.objects.get(pk=id)
    form = ProductoForm(instance=producto)
    if request.method == 'POST':
        #capturamos el post pero sin olvidar los datos traidos en producto
        form = ProductoForm(request.POST,instance=producto)
        if form.is_valid():
            form.save()
            messages.success(request,'Producto editado con éxito.')
    
    data = {
        'titulo':'Editar producto',
        'formulario':form
    }        
    return render(request,'ventas/productos/create.html',data)

