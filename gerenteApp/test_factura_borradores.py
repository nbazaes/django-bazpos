import io
import json
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch, MagicMock
from urllib.error import URLError

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, SimpleTestCase, override_settings
from PIL import Image
from pypdf import PdfWriter

from docker.test_utils import create_business_groups, make_user, auth_client
from gerenteApp.factura_ocr import extract, validate_document, OCRUnavailable, reconciliation, parse_printed_number
from gerenteApp.models import (Proveedor, Factura, FacturaBorrador, FacturaBorradorDocumento,
                               FacturaBorradorConfirmacion, PrecioHistorico)
from vendedorApp.models import Producto, Ubicacion, StockProductoUbicacion


def photo(name="foto.png"):
    stream = io.BytesIO()
    Image.new("RGB", (30, 40), "white").save(stream, format="PNG")
    return SimpleUploadedFile(name, stream.getvalue(), content_type="image/png")


def pdf(pages=1, encrypted=False):
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    if encrypted:
        writer.encrypt("secret")
    stream = io.BytesIO()
    writer.write(stream)
    return SimpleUploadedFile("factura.pdf", stream.getvalue(), content_type="application/pdf")


def extracted(**overrides):
    return {
        "proveedor_nombre": "Proveedor", "proveedor_rut": "93.725.000-2",
        "numero_factura": 3458262, "fecha": "2026-11-04", "neto": "2000.0000",
        "iva": "380.0000", "total": "2380.0000", "advertencias": [],
        "lineas": [{"codigo": "SUP1", "descripcion": "Filtro", "cantidad": "2.0000", "costo_neto": "1000.0000",
                    "total_neto": "2000.0000", "descuento": "0.0000", "archivo": 1, "pagina": 1}], **overrides,
    }


class InvoiceDraftTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_business_groups()
        cls.user = make_user("Gerente")
        cls.other = make_user("Encargado")
        cls.seller = make_user("Vendedor")
        cls.provider = Proveedor.objects.create(nombre="Proveedor", tax_id="93725000-2")
        cls.product = Producto.objects.create(nombre="Filtro", codigo_producto="INT1", codigo_proveedor="SUP1",
            oem="OEM", proveedor=cls.provider, precio_costo=500, margen_utilidad=30, stock_minimo=1, stock_maximo=50)
        cls.location = Ubicacion.objects.create(nombre="Central")

    def setUp(self):
        cache.clear()
        self.client = auth_client(self.user)
        self.data = {"header": {"numero_factura": 3458262, "proveedor_id": self.provider.pk, "fecha": "2026-11-04"},
                     "items": [{"producto_id": self.product.pk, "cantidad": 2, "precio": 1000}],
                     "step": "items", "pending": [], "excluded": []}
        response = self.client.post("/api/facturas-borradores/", {"datos": self.data}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.draft = response.data
        self.url = f'/api/facturas-borradores/{self.draft["id"]}/'

    def upload(self):
        response = self.client.post(self.url + "documentos/", {"revision": self.draft["revision"], "archivos": photo()}, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        self.draft = response.data
        return response.data["documentos"][0]["id"]

    def confirm(self, **extra):
        return self.client.post(self.url + "confirmar/", {"revision": self.draft["revision"], "revisado": True, **extra}, format="json")

    def test_owner_isolation_for_all_operations(self):
        doc_id = self.upload()
        other = auth_client(self.other)
        self.assertEqual(other.get("/api/facturas-borradores/").data, [])
        for method, suffix, body in [("get", "", None), ("patch", "", {"revision": 2, "datos": self.data}),
                ("delete", "", {"revision": 2}), ("post", "extraer/", {"revision": 2}),
                ("post", "confirmar/", {"revision": 2, "revisado": True}),
                ("get", f"documentos/{doc_id}/", None), ("delete", f"documentos/{doc_id}/", {"revision": 2})]:
            response = getattr(other, method)(self.url + suffix, body, format="json")
            self.assertEqual(response.status_code, 404, (method, suffix, response.data))

    def test_seller_cannot_access_drafts(self):
        self.assertEqual(auth_client(self.seller).get("/api/facturas-borradores/").status_code, 403)

    def test_revision_conflict_preserves_data(self):
        first = self.client.patch(self.url, {"revision": 1, "datos": self.data}, format="json")
        self.assertEqual(first.status_code, 200)
        second = self.client.patch(self.url, {"revision": 1, "datos": {**self.data, "items": []}}, format="json")
        self.assertEqual(second.status_code, 409)
        self.assertEqual(self.client.get(self.url).data["datos"]["items"], self.data["items"])

    def test_multiple_drafts_and_resume(self):
        self.client.post("/api/facturas-borradores/", {"datos": self.data}, format="json")
        self.assertEqual(len(self.client.get("/api/facturas-borradores/").data), 2)
        self.assertEqual(auth_client(self.user).get(self.url).data["datos"]["header"], self.data["header"])

    def test_private_document_and_discard_cleanup(self):
        doc_id = self.upload()
        response = self.client.get(self.url + f"documentos/{doc_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/png")
        self.assertEqual(response["Cache-Control"], "private, no-store")
        response = self.client.delete(self.url, {"revision": self.draft["revision"]}, format="json")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(FacturaBorradorDocumento.objects.exists())

    def test_document_limits(self):
        response = self.client.post(self.url + "documentos/", {"revision": 1, "archivos": [photo(str(i)) for i in range(6)]}, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(FacturaBorradorDocumento.objects.exists())
        response = self.client.post(self.url + "documentos/", {"revision": 1, "archivos": SimpleUploadedFile("bad.jpg", b"text")}, format="multipart")
        self.assertEqual(response.status_code, 400)

    @patch("gerenteApp.factura_borradores.extract")
    def test_extraction_has_no_business_side_effects(self, mock):
        self.upload()
        mock.return_value = extracted()
        response = self.client.post(self.url + "extraer/", {"revision": self.draft["revision"]}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        result = response.data["ocr"]
        self.assertEqual(result["proveedor_id"], self.provider.pk)
        self.assertEqual(result["lineas"][0]["candidatos"][0]["producto_id"], self.product.pk)
        self.assertFalse(Factura.objects.exists())
        self.assertFalse(StockProductoUbicacion.objects.exists())
        self.assertFalse(PrecioHistorico.objects.exists())
        self.product.refresh_from_db()
        self.assertEqual(self.product.precio_costo, 500)

    @patch("gerenteApp.factura_borradores.extract")
    def test_extraction_conflict_does_not_overwrite(self, mock):
        self.upload()
        def update_while_extracting(_):
            FacturaBorrador.objects.filter(pk=self.draft["id"]).update(revision=3)
            return extracted()
        mock.side_effect = update_while_extracting
        self.assertEqual(self.client.post(self.url + "extraer/", {"revision": 2}, format="json").status_code, 409)
        self.assertFalse(FacturaBorrador.objects.get(pk=self.draft["id"]).ocr)

    def test_confirm_once_and_clean_documents(self):
        self.upload()
        first = self.confirm()
        self.assertEqual(first.status_code, 201, first.data)
        self.assertFalse(FacturaBorrador.objects.exists())
        self.assertFalse(FacturaBorradorDocumento.objects.exists())
        second = self.confirm()
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data["id"], first.data["id"])
        self.assertEqual(Factura.objects.count(), 1)
        self.assertEqual(StockProductoUbicacion.objects.get().cantidad, 2)
        self.assertEqual(PrecioHistorico.objects.count(), 1)
        self.assertEqual(FacturaBorradorConfirmacion.objects.count(), 1)

    def test_confirmation_requires_human_review(self):
        self.assertEqual(self.confirm(revisado=False).status_code, 400)
        self.assertFalse(Factura.objects.exists())

    def test_missing_ocr_line_cannot_be_silently_dropped(self):
        FacturaBorrador.objects.filter(pk=self.draft["id"]).update(ocr=extracted())
        self.assertEqual(self.confirm().status_code, 400)
        self.data["excluded"] = [0]
        response = self.client.patch(self.url, {"revision": 1, "datos": self.data}, format="json")
        self.draft = response.data
        self.assertEqual(self.confirm().status_code, 201)

    def test_discrepancy_requires_acknowledgement(self):
        self.data["items"][0]["ocr_line"] = 0
        draft = FacturaBorrador.objects.get(pk=self.draft["id"])
        draft.datos = self.data
        draft.ocr = extracted(neto="9000")
        draft.save()
        self.assertEqual(self.confirm().status_code, 400)
        self.assertFalse(Factura.objects.exists())
        self.assertEqual(self.confirm(acepta_advertencias=True).status_code, 201)

    def test_duplicate_invoice_preserves_draft(self):
        Factura.objects.create(proveedor=self.provider, numero_factura=3458262, fecha="2026-11-04")
        self.assertEqual(self.confirm().status_code, 409)
        self.assertTrue(FacturaBorrador.objects.exists())
        self.assertFalse(StockProductoUbicacion.objects.exists())

    def test_invalid_stock_distribution_rolls_back(self):
        draft = FacturaBorrador.objects.get(pk=self.draft["id"])
        self.data["items"][0]["ubicaciones"] = [{"ubicacion_id": self.location.pk, "cantidad": 1}]
        draft.datos = self.data
        draft.save()
        self.assertEqual(self.confirm().status_code, 400)
        self.assertFalse(Factura.objects.exists())

    def test_pending_or_empty_items_cannot_confirm(self):
        draft = FacturaBorrador.objects.get(pk=self.draft["id"])
        draft.datos = {**self.data, "pending": [{"ocr_line": 0}]}
        draft.save()
        self.assertEqual(self.confirm().status_code, 400)
        draft.datos = {**self.data, "items": []}
        draft.save()
        self.assertEqual(self.confirm().status_code, 400)


class OCRAdapterTests(SimpleTestCase):
    def test_chilean_printed_numbers(self):
        for printed, expected in [("4.990", "4990"), ("85.272,00", "85272.00"), ("1.150.425", "1150425"),
                                  ("2,00", "2.00"), ("25.000,00", "25000.00"), ("228.268", "228268"), ("4.99", "4.99")]:
            self.assertEqual(parse_printed_number(printed), expected)
        self.assertIsNone(parse_printed_number("ilegible"))

    def test_validation_pdf_and_images(self):
        self.assertEqual(validate_document(photo())[1:], ("image/png", 1))
        self.assertEqual(validate_document(pdf(5))[1:], ("application/pdf", 5))
        for file in (pdf(6), pdf(encrypted=True), SimpleUploadedFile("wrong.png", b"fake")):
            with self.assertRaises(Exception):
                validate_document(file)

    def response(self, payload):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(payload).encode()
        return response

    @override_settings(BAZPOS_OCR_ENABLED=True, BAZPOS_OCR_PROVIDER="openrouter", BAZPOS_OCR_OPENROUTER_API_KEY="test", BAZPOS_OCR_MODEL="")
    @patch("gerenteApp.factura_ocr.urlopen")
    def test_openrouter_image_and_pdf_schema(self, mock):
        mock.return_value = self.response({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(extracted())}}]})
        docs = [SimpleNamespace(id=1, contenido=b"image", mime="image/png", paginas=1), SimpleNamespace(id=2, contenido=b"pdf", mime="application/pdf", paginas=2)]
        result = extract(docs)
        self.assertEqual(result["fecha"], "2026-11-04")
        body = json.loads(mock.call_args.args[0].data)
        self.assertEqual(body["response_format"]["type"], "json_schema")
        self.assertEqual(body["messages"][0]["content"][1]["type"], "image_url")
        self.assertEqual(body["messages"][0]["content"][2]["type"], "file")
        self.assertEqual(mock.call_args.kwargs["timeout"], 25)

    @override_settings(BAZPOS_OCR_ENABLED=True, BAZPOS_OCR_PROVIDER="gemini", BAZPOS_OCR_GEMINI_API_KEY="test", BAZPOS_OCR_MODEL="")
    @patch("gerenteApp.factura_ocr.urlopen")
    def test_gemini_direct_schema(self, mock):
        mock.return_value = self.response({"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": json.dumps(extracted())}]}}]})
        extract([SimpleNamespace(id=1, contenido=b"image", mime="image/png", paginas=1)])
        request = mock.call_args.args[0]
        self.assertIn("generativelanguage.googleapis.com", request.full_url)
        self.assertNotIn("test", request.full_url)
        self.assertIn("responseJsonSchema", json.loads(request.data)["generationConfig"])

    @override_settings(BAZPOS_OCR_ENABLED=True, BAZPOS_OCR_PROVIDER="openrouter", BAZPOS_OCR_OPENROUTER_API_KEY="test", BAZPOS_OCR_MODEL="")
    @patch("gerenteApp.factura_ocr.urlopen")
    def test_invalid_and_incomplete_responses_are_rejected(self, mock):
        for payload in ({}, {"choices": [{"finish_reason": "length"}]}, {"choices": [{"finish_reason": "stop", "message": {"content": "{}"}}]}):
            mock.return_value = self.response(payload)
            with self.assertRaises(OCRUnavailable):
                extract([])
        mock.side_effect = URLError("secret provider details")
        with self.assertRaises(OCRUnavailable) as context:
            extract([])
        self.assertNotIn("secret", str(context.exception))

    @override_settings(BAZPOS_OCR_ENABLED=False)
    def test_disabled_ocr(self):
        with self.assertRaises(OCRUnavailable):
            extract([])

    def test_totals_and_discount_warnings(self):
        data = {"items": [{"precio": 1000, "cantidad": 2}]}
        self.assertEqual(reconciliation(data, extracted(), Decimal(19)), [])
        self.assertTrue(reconciliation(data, extracted(total="1000"), Decimal(19)))
