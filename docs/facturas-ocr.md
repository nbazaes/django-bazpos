# Ingresar facturas con foto y retomar borradores

En **Facturas → Nueva factura** se abre el formulario habitual. El botón **Ingresar con foto** ofrece **Subir foto o PDF** y **Usar cámara**. La captura solicita la cámara trasera cuando el navegador del teléfono lo admite; también puede ofrecer el selector de imágenes del sistema. Utilizar HTTPS al acceder desde otro equipo.

Con **Usar cámara**, primero se guarda el borrador en el servidor y se comprueba que siga disponible. Una vez guardado, el botón cambia a **Abrir cámara**: tocarlo abre el selector directamente, sin llamadas de red entre el toque y la apertura. Este segundo paso evita depender de una apertura asíncrona, que Safari antiguo puede bloquear sin mostrar un error. Al regresar, las fotos grandes se reducen antes de previsualizarlas y se adjuntan automáticamente al borrador. Así los campos y el documento adjunto se pueden recuperar si Android suspende o recarga la pestaña.

Al seleccionar archivos con **Subir foto o PDF**, revisar la vista previa, quitar las fotos que no sirvan y pulsar **Adjuntar al borrador**. Todos los adjuntos deben corresponder a una sola factura: máximo 5 archivos JPG/PNG/PDF, 5 páginas y 10 MB en total. Las imágenes admiten hasta 25 megapíxeles. Si el teléfono entrega HEIC, exportar o capturar en JPG/PNG. Los PDF deben estar sin contraseña.

Pulsar **Leer documentos** y después **Rellenar formulario con esta lectura**. Este último paso pide confirmación si ya hay campos completados. Revisar proveedor emisor, folio, fecha de emisión, códigos, cantidades y costos netos. El OCR puede equivocarse, especialmente con códigos borrosos, sellos o anotaciones manuscritas.

Las líneas sin coincidencia aparecen en **Líneas pendientes de vincular**. Buscar un producto o crear uno con los datos leídos; crear un producto requiere confirmar su formulario y no ingresa stock. También se puede excluir expresamente una línea. Los costos o cantidades fraccionarios/ilegibles quedan pendientes de corrección porque el sistema trabaja con enteros.

En la revisión final se muestran los totales impresos y calculados, junto con diferencias y descuentos. Marcar **Revisé los datos de la factura** y, si corresponde, reconocer las advertencias. Cualquier cambio posterior invalida las marcas de revisión. Solo **Guardar factura** ingresa existencias, actualiza costos y crea el historial.

## Borradores por usuario

Los borradores se guardan en el servidor, no en el navegador. **Mis borradores** permite continuar cualquiera de las facturas pendientes desde otro dispositivo con la misma cuenta. El autoguardado espera un segundo tras el último cambio: comprobar el indicador **Guardado** antes de cerrar la página. Si falla, usar **Reintentar guardado**. Los cambios aún sin guardar permanecen en el formulario abierto; no se garantiza recuperarlos después de cerrar la pestaña.

Una edición simultánea desde otro dispositivo produce un conflicto, sin sobrescribir el servidor. Recargar su versión antes de continuar; los cambios sin guardar siguen visibles hasta que finalice esa carga. Si aparece que un borrador ya no está disponible (por ejemplo, porque fue descartado desde otro dispositivo), no se borran los campos que sigan visibles. **Guardar como nuevo borrador** permite conservarlos bajo un identificador nuevo; esta acción no recupera documentos que ya no estén en el servidor.

Los borradores no caducan automáticamente. Solo su propietario puede verlos o acceder a sus documentos, incluso entre usuarios de gestión.

El antiguo borrador local no tiene propietario identificable: se ofrece importarlo con confirmación explícita a la cuenta actual. La copia antigua se elimina únicamente después de guardar la importación en el servidor, o cuando el usuario decide eliminarla.

Las fotos/PDF originales se conservan únicamente mientras exista el borrador. Confirmarlo o descartarlo los elimina de la base activa. Las copias de seguridad anteriores mantienen su retención habitual; no se borran retroactivamente. No quedan documentos adjuntos a la factura confirmada.

## Configurar OpenRouter o Gemini

Configurar las variables en el `.env` del **servidor Django**, nunca en variables `VITE_*`. Los dos proveedores están implementados; se selecciona uno por instalación y no se hacen llamadas de respaldo automáticas al otro.

OpenRouter:

```dotenv
BAZPOS_OCR_ENABLED=True
BAZPOS_OCR_PROVIDER=openrouter
BAZPOS_OCR_OPENROUTER_API_KEY=clave_de_openrouter
BAZPOS_OCR_MODEL=google/gemini-2.5-flash
```

Gemini directo:

```dotenv
BAZPOS_OCR_ENABLED=True
BAZPOS_OCR_PROVIDER=gemini
BAZPOS_OCR_GEMINI_API_KEY=clave_de_gemini
BAZPOS_OCR_MODEL=gemini-2.5-flash
```

Con modelo vacío se utiliza el valor predeterminado correspondiente al proveedor. Para OpenRouter, una clave explícita `BAZPOS_OCR_OPENROUTER_API_KEY` tiene prioridad; si no se define, se admite `BAZPOS_OCR_API_KEY` y después `BAZPOS_LLM_API_KEY` del entorno del servidor. Una variable explícitamente vacía no utiliza la alternativa. La clave de `frontend/.env` no se copia al backend ni se publica en el navegador.

Si se cambia de proveedor, actualizar también el modelo o dejarlo vacío. Un modelo personalizado debe aceptar imágenes, PDF nativo y JSON estructurado. La extracción envía los documentos al proveedor elegido y consume su cuota/saldo. No se envía el catálogo de productos. No es necesario configurar ambos proveedores.

El OCR viene desactivado por defecto; el formulario manual y los borradores funcionan sin clave. Se realizan hasta 3 extracciones por minuto por usuario, sin reintentos automáticos. La conexión al proveedor utiliza un timeout de 25 segundos; el cliente espera 35 segundos. Si falla, se conservan los documentos y campos para reintentar. Las credenciales y respuestas completas del proveedor no se escriben en logs de la aplicación.

Después de desplegar el código, instalar `requirements.txt` y ejecutar `python manage.py migrate`. En Compose, reconstruir las imágenes con el procedimiento habitual; las migraciones se ejecutan en el entrypoint. Un cambio solo de claves requiere recrear el servicio app para recargar `.env`. No se incrementan workers ni límites de memoria.

Los documentos se almacenan como BLOB privados en MariaDB, con lectura únicamente por endpoints autenticados que verifican el propietario. No se guardan bajo `/media/`, ni se requiere un volumen adicional. El respaldo existente de MariaDB incluye los borradores y documentos pendientes; dimensionar su retención según el uso.

## API

Todos los endpoints requieren sesión/JWT, rol Encargado o Gerente y permiso `gerenteApp.add_factura`.

- `GET /api/facturas-borradores/`: lista solo los borradores de la cuenta actual.
- `POST /api/facturas-borradores/`: crea un borrador con `datos` (`header`, `items`, `step`, `pending`, `excluded`).
- `GET/PATCH/DELETE /api/facturas-borradores/{uuid}/`: consulta, guarda o descarta. Las mutaciones requieren `revision`; una versión anterior devuelve 409.
- `POST .../{uuid}/documentos/`: multipart `archivos` y `revision`; agrega documentos.
- `GET/DELETE .../{uuid}/documentos/{id}/`: descarga privada sin caché o elimina un documento; DELETE requiere `revision`.
- `POST .../{uuid}/extraer/`: procesa los documentos almacenados, con `revision`; devuelve el borrador y su `ocr`, sin rellenar ni guardar la factura automáticamente. No mantiene bloqueos de base de datos durante la llamada externa.
- `POST .../{uuid}/confirmar/`: requiere `revision`, `revisado: true` y `acepta_advertencias: true` cuando existan advertencias. Valida las líneas y ubicaciones, aplica la lógica transaccional existente y elimina borrador/documentos. Una constancia mínima privada permite devolver la misma factura ante reintentos sin duplicar stock.

## Validación de las muestras

Se probaron las tres fotos de referencia con OpenRouter y `google/gemini-2.5-flash`: Mannheim (3 líneas, folio 3458262, total $271.639), Adriazola (9 líneas, folio 1198069, total $608.923) y Refax (4 líneas, folio 4430284, total $1.150.425). La transcripción conserva los separadores impresos y Django interpreta los puntos de miles/comas decimales; no se confía en una conversión numérica del modelo. Los códigos borrosos de Mannheim variaron entre ejecuciones y siguen requiriendo revisión humana. Esto es una comprobación de estas muestras, no una garantía de exactitud para todas las facturas.

Las pruebas automatizadas usan proveedores simulados para verificar permisos, privacidad, conflictos, límites, formatos numéricos y ausencia de efectos de stock antes de confirmar.

La preparación de fotos de cámara se verifica con `node frontend/src/lib/__tests__/cameraPhoto.test.js` (reducción de imágenes, conservación de archivos pequeños y liberación de memoria).

## Despliegue en staging y producción

En staging, editar `ops/staging/.env.generated`. Tanto `deploy-stack.sh` como `update-images.sh` sincronizan las variables OCR al `.env` de la VM; `start.sh` también sincroniza si hay archivo local. Para aplicar solo configuración sin cambiar imágenes, ejecutar `ops/staging/scripts/sync-runtime-config.sh` y recrear únicamente `app` con `docker compose -f compose.prod.yaml up -d --no-deps --force-recreate app` en la VM.

El host de staging/VPS necesita Python 3 además de Docker Compose; los scripts de bootstrap de staging lo instalan. El helper usa solo biblioteca estándar y no necesita instalar las dependencias Django en el host.

Para producción por GitHub Actions, configurar en **Settings → Secrets and variables → Actions** del repositorio:

| Tipo | Nombre | Ejemplo / uso |
|---|---|---|
| Variable | `BAZPOS_OCR_ENABLED` | `True` para activar; `False` para desactivar |
| Variable | `BAZPOS_OCR_PROVIDER` | `gemini` u `openrouter` |
| Variable | `BAZPOS_OCR_MODEL` | `gemini-3.5-flash-lite` directo o `google/gemini-3.5-flash-lite` en OpenRouter |
| Secret | `BAZPOS_OCR_GEMINI_API_KEY` | Clave de Gemini directo |
| Secret | `BAZPOS_OCR_OPENROUTER_API_KEY` | Clave de OpenRouter |
| Secret opcional | `BAZPOS_OCR_API_KEY` | Alias anterior para OpenRouter |

Configurar únicamente la clave del proveedor elegido. Estas variables no son argumentos de build ni variables del frontend: llegan a Django al desplegar el contenedor.

Un push a `main` que pase CI construye imágenes y activa `deploy.yml`. El workflow transfiere un paquete temporal privado por el entorno SSH (base64 con valor derivado enmascarado), actualiza solo OCR e imágenes en el `.env` del VPS y ejecuta Compose. Conserva los secretos de base de datos y las variables de OCR del servidor cuando GitHub no proporciona reemplazos. Un valor vacío o ausente de Actions no borra la configuración existente; para desactivar usar explícitamente `BAZPOS_OCR_ENABLED=False`. Para eliminar una clave del servidor, editar el `.env` remoto; para rotarla, actualizar el secret de Actions.

Las imágenes quedan persistidas en el `.env` del VPS para que un reinicio posterior mantenga la misma versión. Los despliegues de producción se serializan para no mezclar paquetes de configuración. El workflow verifica la salud del stack y la configuración efectiva de Django. No hace llamadas OCR pagadas como parte de cada deploy.

Los paquetes de configuración se escriben con permisos `600`, se transfieren por SSH y se eliminan al terminar. Se excluyen `.deploy/` y el directorio de staging del contexto de Docker para evitar incorporar secretos a las imágenes. La comprobación de configuración muestra `ocr_enabled`, `provider`, `model` y `key_configured`, sin valores de claves.

La actualización selectiva rechaza OCR activado sin una clave efectiva del proveedor antes de escribir el `.env`. Las pruebas del despliegue se ejecutan con `python3 -m unittest discover -s ops/deploy -p 'test_*.py' -v` y están incluidas en CI.
