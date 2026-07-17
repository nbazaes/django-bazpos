THIRD-PARTY NOTICES
===================

Este archivo contiene la lista mínima de componentes de terceros incluidos en el repositorio y sus licencias, para cumplir con las obligaciones de atribución.

Resumen (acción mínima tomada):
- Mantener los ficheros de terceros en `static/vendor/` y `static/` tal como están.
- Añadir este archivo en la raíz que documenta las licencias y enlaces. No se han cambiado ni eliminado los archivos de terceros.

Componentes incluidos y licencias
---------------------------------

1) Bootstrap
   - Path: `static/vendor/bootstrap/`
   - Licencia: MIT
   - Enlace: https://github.com/twbs/bootstrap/blob/main/LICENSE

2) Font Awesome Free
   - Path: `static/vendor/fontawesome-free/`
   - Licencias: Icons (CC BY 4.0), Fonts (SIL OFL 1.1), Code (MIT)
   - Enlace de licencia: https://fontawesome.com/license/free

3) Chart.js
   - Path: `static/vendor/chart.js/`
   - Licencia: MIT
   - Enlace: https://www.chartjs.org/

4) DataTables (jQuery DataTables)
   - Path: `static/vendor/datatables/`
   - Licencia: MIT
   - Enlace: https://datatables.net/

5) jQuery
   - Path: `static/vendor/jquery/`
   - Licencia: MIT
   - Enlace: https://jquery.org/license/

6) jquery-easing
   - Path: `static/vendor/jquery-easing/`
   - Licencia: MIT
   - Enlace: https://github.com/gdsmith/jquery.easing/blob/master/LICENSE

Notas legales y de cumplimiento (mínimas):
- Todas las dependencias listadas son software de licencia permisiva (MIT, CC BY 4.0 para algunos iconos, SIL OFL para fuentes). Mantener las cabeceras de licencia que ya están en los archivos distribuidos.
- Si distribuyes el software binario o empaquetado, asegúrate de incluir este archivo o las licencias correspondientes en el paquete de distribución.
- No hay objetos con licencia no permisiva detectados en `static/`.

Si quieres, puedo realizar cualquiera de las siguientes acciones adicionales (elige 1):
- A) Añadir copias de los textos de licencia (por ejemplo `LICENSE-bootstrap.txt`) dentro de `static/vendor/` o en una carpeta `licenses/`.
- B) Configurar `STATIC_ROOT` en `bazpos/settings.py` y añadir `/staticfiles/` a `.gitignore` para preparar despliegue.
- C) No hacer más cambios.

Hecho: archivo creado con la documentación mínima de licencias.

Licencias añadidas en el repositorio
-----------------------------------

Se han añadido copias mínimas y referencias a los textos de licencia en la carpeta `licenses/`:

- `licenses/LICENSE-BOOTSTRAP.txt`
- `licenses/LICENSE-CHARTJS.txt`
- `licenses/LICENSE-DATATABLES.txt`
- `licenses/LICENSE-JQUERY.txt`
- `licenses/LICENSE-JQUERY-EASING.txt`
- `licenses/LICENSE-FONT-AWESOME.txt`

Incluye también `licenses/README.txt` con instrucciones cortas de cumplimiento.
