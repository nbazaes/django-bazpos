"""Run via docker compose exec -T app python - < ops/deploy/check_ocr.py."""
import json
import os
import re

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "bazpos.settings")
from django.conf import settings

provider = settings.BAZPOS_OCR_PROVIDER
key = (settings.BAZPOS_OCR_OPENROUTER_API_KEY if provider == "openrouter"
       else settings.BAZPOS_OCR_GEMINI_API_KEY if provider == "gemini" else "")
model = settings.BAZPOS_OCR_MODEL or ("google/gemini-2.5-flash" if provider == "openrouter" else "gemini-2.5-flash")
print(json.dumps({"ocr_enabled": settings.BAZPOS_OCR_ENABLED, "provider": provider,
                  "model": model, "key_configured": bool(key)}))
if settings.BAZPOS_OCR_ENABLED and (provider not in ("gemini", "openrouter") or not key):
    raise SystemExit("ERROR: OCR activado sin proveedor/clave válidos en el contenedor.")

if settings.BAZPOS_OCR_ENABLED and provider == "gemini" and not re.fullmatch(r"[a-zA-Z0-9._-]+", model):
    raise SystemExit("ERROR: el modelo de Gemini directo no es válido.")

if settings.BAZPOS_OCR_ENABLED and provider == "openrouter" and "/" not in model:
    raise SystemExit("ERROR: el modelo de OpenRouter debe incluir proveedor/modelo.")
