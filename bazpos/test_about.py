from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory

from .api_views import StoreNameView


@override_settings(STORE_NAME="Mi tienda", BAZPOS_COMMERCIAL_CONTACT="")
class AboutApiTest(SimpleTestCase):
    def get_info(self):
        request = APIRequestFactory().get("/api/store-name/")
        response = StoreNameView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Mi tienda")
        return response.data["about"]

    @override_settings(BAZPOS_COMMERCIAL_BRANDING=False)
    def test_open_source_installation_has_no_company(self):
        self.assertEqual(self.get_info(), {"company": "", "contact": ""})

    @override_settings(BAZPOS_COMMERCIAL_BRANDING=True)
    def test_commercial_installation_without_contact(self):
        self.assertEqual(self.get_info(), {
            "company": "Bazaes Soluciones Digitales SpA", "contact": "",
        })

    @override_settings(BAZPOS_COMMERCIAL_BRANDING=True,
                       BAZPOS_COMMERCIAL_CONTACT="https://example.com/contacto")
    def test_commercial_contact_is_public(self):
        self.assertEqual(self.get_info(), {
            "company": "Bazaes Soluciones Digitales SpA",
            "contact": "https://example.com/contacto",
        })

    @override_settings(BAZPOS_COMMERCIAL_BRANDING=False,
                       BAZPOS_COMMERCIAL_CONTACT="contacto@example.com")
    def test_contact_is_hidden_when_branding_is_disabled(self):
        self.assertEqual(self.get_info(), {"company": "", "contact": ""})
