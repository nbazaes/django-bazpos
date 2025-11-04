from django.urls import path
from .views import proveedores_api, ver_proveedores, crearProveedor, listarProveedores, editarProveedor, eliminarProveedor, registro, editarUsuario, listarUsuarios, eliminarUsuario

urlpatterns = [
    path("api/proveedores/", proveedores_api, name="proveedores_api"),
    path("proveedores/", ver_proveedores, name="proveedores"),
    path("proveedores/crearproveedor/", crearProveedor, name="crearProveedor"),
    path("proveedores/editarproveedor/<int:id>", editarProveedor, name="editarProveedor"),
    path("proveedores/eliminarproveedor/<int:id>", eliminarProveedor, name="eliminarProveedor"),
    path("proveedores/proveedores/", listarProveedores, name="listarProveedores"),
    path("usuarios/registro/", registro, name="crearUsuario"),
    path("usuarios/editarusuario/<str:username>", editarUsuario, name="editarUsuario"),
    path("usuarios/eliminarusuario/<str:username>", eliminarUsuario, name="eliminarUsuario"),
    path("usuarios/usuarios/", listarUsuarios, name="listarUsuarios")
]
