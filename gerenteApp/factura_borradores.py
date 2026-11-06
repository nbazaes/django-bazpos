"""User-owned invoice drafts, private attachments and explicit final confirmation."""
import json
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from bazpos.permissions import has_any_role, ROLE_ENCARGADO, ROLE_GERENTE
from gerenteApp.factura_ocr import MAX_BYTES, extract, normalize_rut, reconciliation, validate_document
from gerenteApp.models import (Factura, FacturaBorrador, FacturaBorradorDocumento,
                               FacturaBorradorConfirmacion, Proveedor, StoreConfig)
from gerenteApp.serializers import FacturaDetalleSerializer, FacturaUpsertSerializer
from vendedorApp.models import Producto, Ubicacion


class Conflict(APIException):
    status_code = 409
    default_detail = "Este borrador cambió en otro dispositivo. Recarga la versión del servidor antes de continuar."


class CanDraftInvoice(BasePermission):
    def has_permission(self, request, view):
        return has_any_role(request.user, [ROLE_ENCARGADO, ROLE_GERENTE]) and request.user.has_perm("gerenteApp.add_factura")


class OCRThrottle(UserRateThrottle):
    rate = "3/min"
    scope = "factura_ocr"


class DraftDataSerializer(serializers.Serializer):
    header = serializers.DictField()
    items = serializers.ListField(child=serializers.DictField(), max_length=300)
    step = serializers.ChoiceField(choices=["header", "items"], default="header")
    pending = serializers.ListField(child=serializers.DictField(), max_length=300, default=list)
    excluded = serializers.ListField(child=serializers.IntegerField(min_value=0), max_length=300, default=list)

    def validate(self, data):
        for item in data["items"]:
            source = item.get("ocr_line")
            if source is not None and (type(source) is not int or source < 0):
                raise ValidationError("La referencia de línea OCR no es válida.")
        if len(json.dumps(data).encode()) > 512 * 1024:
            raise ValidationError("El borrador es demasiado grande.")
        return data


def draft_output(draft):
    return {
        "id": str(draft.id), "revision": draft.revision, "datos": draft.datos,
        "ocr": draft.ocr, "actualizado": draft.actualizado,
        "documentos": list(draft.documentos.values("id", "nombre", "mime", "paginas", "tamano")),
    }


def check_revision(draft, request):
    revision = serializers.IntegerField(min_value=1).run_validation(request.data.get("revision"))
    if revision != draft.revision:
        raise Conflict()


def save_revision(draft):
    draft.revision += 1
    draft.save()


class FacturaBorradorViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, CanDraftInvoice]
    parser_classes = [JSONParser, MultiPartParser]
    lookup_value_regex = "[0-9a-f-]{36}"

    def get_queryset(self):
        return FacturaBorrador.objects.filter(usuario=self.request.user)

    def locked(self):
        return get_object_or_404(self.get_queryset().select_for_update(), pk=self.kwargs["pk"])

    def list(self, request):
        return Response([{
            "id": str(d.id), "revision": d.revision, "header": d.datos.get("header", {}),
            "productos": len(d.datos.get("items", [])), "actualizado": d.actualizado,
        } for d in self.get_queryset().only("id", "revision", "datos", "actualizado")])

    def retrieve(self, request, *args, **kwargs):
        return Response(draft_output(self.get_object()))

    def create(self, request):
        serializer = DraftDataSerializer(data=request.data.get("datos", {}))
        serializer.is_valid(raise_exception=True)
        draft = FacturaBorrador.objects.create(usuario=request.user, datos=serializer.validated_data)
        return Response(draft_output(draft), status=201)

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        draft = self.locked()
        check_revision(draft, request)
        serializer = DraftDataSerializer(data=request.data.get("datos", {}))
        serializer.is_valid(raise_exception=True)
        draft.datos = serializer.validated_data
        save_revision(draft)
        return Response(draft_output(draft))

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        draft = self.locked()
        check_revision(draft, request)
        draft.delete()
        return Response(status=204)

    @action(detail=True, methods=["post"])
    def documentos(self, request, pk=None):
        self.get_object()  # Check ownership before parsing file contents.
        files = request.FILES.getlist("archivos")
        if not files or len(files) > 5:
            raise ValidationError({"detail": "Selecciona entre 1 y 5 documentos."})
        if sum(f.size for f in files) > MAX_BYTES:
            raise ValidationError({"detail": "Los documentos no pueden superar 10 MB en total."})
        validated = [(f, *validate_document(f)) for f in files]
        with transaction.atomic():
            draft = self.locked()
            check_revision(draft, request)
            existing = list(draft.documentos.values("tamano", "paginas"))
            if (len(existing) + len(files) > 5 or
                    sum(d["tamano"] for d in existing) + sum(len(v[1]) for v in validated) > MAX_BYTES or
                    sum(d["paginas"] for d in existing) + sum(v[3] for v in validated) > 5):
                raise ValidationError({"detail": "Máximo 5 archivos, 5 páginas y 10 MB por borrador."})
            for upload, content, mime, pages in validated:
                FacturaBorradorDocumento.objects.create(
                    borrador=draft, nombre=upload.name[:200], contenido=content,
                    mime=mime, paginas=pages, tamano=len(content))
            # Existing extraction no longer covers the complete set of documents.
            draft.ocr = {}
            save_revision(draft)
            return Response(draft_output(draft), status=201)

    @action(detail=True, methods=["get", "delete"], url_path=r"documentos/(?P<documento_id>[0-9]+)")
    def documento(self, request, pk=None, documento_id=None):
        if request.method == "DELETE":
            with transaction.atomic():
                draft = self.locked()
                check_revision(draft, request)
                get_object_or_404(draft.documentos, pk=documento_id).delete()
                draft.ocr = {}
                save_revision(draft)
                return Response(draft_output(draft))
        draft = self.get_object()
        document = get_object_or_404(draft.documentos, pk=documento_id)
        response = HttpResponse(bytes(document.contenido), content_type=document.mime)
        response["Content-Disposition"] = 'inline; filename="documento.' + {"application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png"}[document.mime] + '"'
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    @action(detail=True, methods=["post"], throttle_classes=[OCRThrottle])
    def extraer(self, request, pk=None):
        draft = self.get_object()
        check_revision(draft, request)
        documents = list(draft.documentos.all())
        if not documents:
            raise ValidationError({"detail": "Primero agrega una foto o PDF."})
        result = extract(documents)  # No DB lock held during external request.
        providers = [p for p in Proveedor.objects.all() if normalize_rut(p.tax_id) and normalize_rut(p.tax_id) == normalize_rut(result["proveedor_rut"])]
        provider = providers[0] if len(providers) == 1 else None
        result["proveedor_id"] = provider.pk if provider else None
        codes = {(line.get("codigo") or "").strip() for line in result["lineas"]} - {""}
        query = Q(codigo_producto__in=codes)
        if provider:
            query |= Q(proveedor=provider, codigo_proveedor__in=codes)
        products = list(Producto.objects.select_related("proveedor").filter(query))
        for index, line in enumerate(result["lineas"]):
            line["ocr_line"] = index
            code = (line.get("codigo") or "").strip()
            candidates = {p.pk: p for p in products if code and (
                p.codigo_producto == code or (provider and p.proveedor_id == provider.pk and p.codigo_proveedor == code))}
            line["candidatos"] = [{"producto_id": p.pk, "nombre": p.nombre,
                                   "codigo_producto": p.codigo_producto, "codigo_proveedor": p.codigo_proveedor,
                                   "proveedor_nombre": p.proveedor.nombre, "margen_utilidad": str(p.margen_utilidad)} for p in candidates.values()]
        with transaction.atomic():
            draft = self.locked()
            check_revision(draft, request)
            draft.ocr = result
            save_revision(draft)
            return Response(draft_output(draft))

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def confirmar(self, request, pk=None):
        # Receipt is private as well; retaining it makes retries safe after draft deletion.
        receipt = FacturaBorradorConfirmacion.objects.filter(pk=pk, usuario=request.user).first()
        if receipt:
            if not receipt.factura_id:
                return Response({"detail": "La factura confirmada fue eliminada."}, status=410)
            return Response(FacturaDetalleSerializer(receipt.factura).data)
        draft = self.locked()
        check_revision(draft, request)
        if request.data.get("revisado") is not True:
            raise ValidationError({"detail": "Confirma que revisaste los datos de la factura."})
        data = draft.datos
        if data.get("pending"):
            raise ValidationError({"detail": "Vincula o excluye todas las líneas pendientes."})
        items = data.get("items", [])
        if not items:
            raise ValidationError({"detail": "Agrega al menos un producto."})
        covered = set(data.get("excluded", []))
        covered.update(it.get("ocr_line") for it in items)
        if any(i not in covered for i in range(len(draft.ocr.get("lineas", [])))):
            raise ValidationError({"detail": "Hay líneas leídas sin vincular ni excluir."})
        header = data.get("header", {})
        serializer = FacturaUpsertSerializer(data={**header, "productos": items})
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        provider = get_object_or_404(Proveedor.objects.select_for_update(), pk=validated["proveedor_id"])
        existing = Factura.objects.filter(proveedor=provider, numero_factura=validated["numero_factura"]).first()
        if existing:
            return Response({"detail": "Esta factura ya fue ingresada.", "factura_id": existing.pk}, status=409)
        ids = [it["producto_id"] for it in validated["productos"]]
        if Producto.objects.filter(pk__in=ids).count() != len(set(ids)):
            raise ValidationError({"detail": "Un producto ya no existe. Revisa las líneas."})
        for item in validated["productos"]:
            locations = item.get("ubicaciones", [])
            if locations and (sum(u["cantidad"] for u in locations) != item["cantidad"] or
                              len({u["ubicacion_id"] for u in locations}) != len(locations) or
                              Ubicacion.objects.filter(pk__in=[u["ubicacion_id"] for u in locations]).count() != len(locations)):
                raise ValidationError({"detail": "Revisa las ubicaciones y cantidades de cada producto."})
        config = StoreConfig.objects.first()
        notes = reconciliation(data, draft.ocr, Decimal(str(config.tax_percent if config else 19)))
        if notes and request.data.get("acepta_advertencias") is not True:
            raise ValidationError({"detail": "Revisa y reconoce las diferencias y advertencias.", "advertencias": notes})
        factura = serializer.save()
        # Keep the current post-save order reconciliation UI working.
        from gerenteApp.api import FacturaViewSet
        coincidencias = FacturaViewSet()._coincidencias_factura(factura)
        FacturaBorradorConfirmacion.objects.create(id=draft.id, usuario=request.user, factura=factura)
        draft.delete()
        return Response({**FacturaDetalleSerializer(factura).data, "coincidencias": coincidencias}, status=status.HTTP_201_CREATED)
