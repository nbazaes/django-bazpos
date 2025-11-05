THIRD-PARTY NOTICES
===================

Este archivo contiene la lista mínima de componentes de terceros incluidos en el repositorio y sus licencias, para cumplir con las obligaciones de atribución.

Resumen (acción mínima tomada):
- Mantener los ficheros de terceros en `static/vendor/` y `static/` tal como están.
- Añadir este archivo en la raíz que documenta las licencias y enlaces. No se han cambiado ni eliminado los archivos de terceros.

Componentes incluidos y licencias
---------------------------------

1) SB Admin 2
   - Path(s) ejemplo: `static/css/sb-admin-2.css`, `static/js/sb-admin-2.min.js`
   - Licencia: MIT
   - Enlace: https://startbootstrap.com/theme/sb-admin-2
   - Nota: Archivos en `static/` incluyen cabeceras con la licencia MIT.

2) Bootstrap
   - Path: `static/vendor/bootstrap/`
   - Licencia: MIT
   - Enlace: https://github.com/twbs/bootstrap/blob/main/LICENSE

3) Font Awesome Free
   - Path: `static/vendor/fontawesome-free/`
   - Licencias: Icons (CC BY 4.0), Fonts (SIL OFL 1.1), Code (MIT)
   - Enlace de licencia: https://fontawesome.com/license/free

4) Chart.js
   - Path: `static/vendor/chart.js/`
   - Licencia: MIT
   - Enlace: https://www.chartjs.org/

5) DataTables (jQuery DataTables)
   - Path: `static/vendor/datatables/`
   - Licencia: MIT
   - Enlace: https://datatables.net/

6) jQuery
   - Path: `static/vendor/jquery/`
   - Licencia: MIT
   - Enlace: https://jquery.org/license/

7) jquery-easing
   - Path: `static/vendor/jquery-easing/`
   - Licencia: MIT
   - Enlace: https://github.com/gdsmith/jquery.easing/blob/master/LICENSE

Notas legales y de cumplimiento (mínimas):
- Todas las dependencias listadas son software de licencia permisiva (MIT, CC BY 4.0 para algunos iconos, SIL OFL para fuentes). Mantener las cabeceras de licencia que ya están en los archivos distribuidos.
- Si distribuyes el software binario o empaquetado, asegúrate de incluir este archivo o las licencias correspondientes en el paquete de distribución.
- No hay objetos con licencia no permisiva detectados en `static/`.

Si quieres, puedo realizar cualquiera de las siguientes acciones adicionales (elige 1):
- A) Añadir copias de los textos de licencia (por ejemplo `LICENSE-bootstrap.txt`, `LICENSE-sb-admin-2.txt`) dentro de `static/vendor/` o en una carpeta `licenses/`.
- B) Configurar `STATIC_ROOT` en `bazpos/settings.py` y añadir `/staticfiles/` a `.gitignore` para preparar despliegue.
- C) No hacer más cambios.

Hecho: archivo creado con la documentación mínima de licencias.

Licencias añadidas en el repositorio
-----------------------------------

Se han añadido copias mínimas y referencias a los textos de licencia en la carpeta `licenses/`:

- `licenses/LICENSE-BOOTSTRAP.txt`
- `licenses/LICENSE-SB_ADMIN_2.txt`
- `licenses/LICENSE-CHARTJS.txt`
- `licenses/LICENSE-DATATABLES.txt`
- `licenses/LICENSE-JQUERY.txt`
- `licenses/LICENSE-JQUERY-EASING.txt`
- `licenses/LICENSE-FONT-AWESOME.txt`

Incluye también `licenses/README.txt` con instrucciones cortas de cumplimiento.
