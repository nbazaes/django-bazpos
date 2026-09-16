import html
import json
import logging
import urllib.error
import urllib.request
from typing import Any, Dict

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


class ResendEmailError(Exception):
    """Excepción al fallar el envío a través del servicio Resend."""

    def __init__(self, message: str, status_code: int = 502, response_data: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_data = response_data


def get_priority_meta(prioridad: str) -> Dict[str, str]:
    mapping = {
        "urgente": {"label": "Urgente", "color": "#dc2626", "bg": "#fef2f2", "border": "#fca5a5"},
        "alta": {"label": "Alta", "color": "#ea580c", "bg": "#fff7ed", "border": "#fdba74"},
        "media": {"label": "Media", "color": "#ca8a04", "bg": "#fefce8", "border": "#fde047"},
        "baja": {"label": "Baja", "color": "#16a34a", "bg": "#f0fdf4", "border": "#86efac"},
    }
    return mapping.get(prioridad.lower(), mapping["media"])


def get_type_meta(tipo: str) -> Dict[str, str]:
    if tipo == "sugerencia":
        return {
            "label": "Sugerencia / Nueva Función",
            "badge_label": "Sugerencia",
            "color": "#7c3aed",
            "bg": "#f5f3ff",
            "border": "#c4b5fd",
            "icon": "💡",
        }
    return {
        "label": "Soporte Técnico / Problema",
        "badge_label": "Soporte",
        "color": "#2563eb",
        "bg": "#eff6ff",
        "border": "#93c5fd",
        "icon": "🛠️",
    }


def generate_ticket_html(ticket_data: Dict[str, Any]) -> str:
    """Genera una plantilla de correo HTML limpia y profesional."""
    tipo = ticket_data.get("tipo", "soporte")
    prioridad = ticket_data.get("prioridad", "media")
    titulo = html.escape(ticket_data.get("titulo", "") or "Sin asunto")
    descripcion = html.escape(ticket_data.get("descripcion", "")).replace("\n", "<br/>")

    tipo_meta = get_type_meta(tipo)
    prio_meta = get_priority_meta(prioridad)

    usuario_username = html.escape(str(ticket_data.get("usuario_username", "Anónimo")))
    usuario_nombre = html.escape(str(ticket_data.get("usuario_nombre", "")))
    usuario_email = html.escape(str(ticket_data.get("usuario_email", "") or "No especificado"))
    usuario_roles = html.escape(", ".join(ticket_data.get("usuario_roles", [])) or "Sin rol")
    store_name = html.escape(str(ticket_data.get("store_name", settings.STORE_NAME)))
    app_version = html.escape(str(ticket_data.get("app_version", "2.3.0")))
    current_path = html.escape(str(ticket_data.get("current_path", "-")))
    user_agent = html.escape(str(ticket_data.get("user_agent", "-")))
    fecha_envio = timezone.now().strftime("%Y-%m-%d %H:%M:%S UTC")

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket BazPos</title>
</head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    
    <!-- Encabezado -->
    <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 24px; color: #ffffff;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #e0e7ff;">BazPos Tickets</span>
        <span style="font-size: 12px; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 6px; color: #ffffff;">{store_name}</span>
      </div>
      <h1 style="margin: 0; font-size: 20px; font-weight: 700; line-height: 1.3;">{tipo_meta['icon']} {tipo_meta['label']}</h1>
    </div>

    <!-- Badges de Estado -->
    <div style="padding: 16px 24px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; display: flex; gap: 8px; flex-wrap: wrap;">
      <span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 6px; background-color: {tipo_meta['bg']}; color: {tipo_meta['color']}; border: 1px solid {tipo_meta['border']};">
        Tipo: {tipo_meta['badge_label']}
      </span>
      <span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 6px; background-color: {prio_meta['bg']}; color: {prio_meta['color']}; border: 1px solid {prio_meta['border']};">
        Prioridad: {prio_meta['label']}
      </span>
    </div>

    <!-- Cuerpo principal -->
    <div style="padding: 24px;">
      
      <!-- Asunto / Título -->
      <div style="margin-bottom: 20px;">
        <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">Asunto</div>
        <div style="font-size: 16px; font-weight: 600; color: #0f172a;">{titulo}</div>
      </div>

      <!-- Descripción -->
      <div style="margin-bottom: 24px;">
        <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">Descripción del Ticket</div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.6; color: #334155;">
          {descripcion}
        </div>
      </div>

      <!-- Tabla de Detalles / Contexto -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px;">
        <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 12px;">Información del Emisor y Sistema</div>
        
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 35%;"><strong>Usuario:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">{usuario_username} {f'({usuario_nombre})' if usuario_nombre else ''}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Email de contacto:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">{usuario_email}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Rol / Grupos:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">{usuario_roles}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Tienda:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">{store_name}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Versión BazPos:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">v{app_version}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Ruta / Pantalla:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;"><code>{current_path}</code></td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Fecha y Hora:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">{fecha_envio}</td>
          </tr>
        </table>
      </div>

    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 12px 24px; text-align: center; font-size: 11px; color: #94a3b8;">
      Enviado automáticamente por el módulo de soporte de BazPos &bull; Resend Service
    </div>

  </div>
</body>
</html>
"""


def generate_ticket_text(ticket_data: Dict[str, Any]) -> str:
    """Genera versión de texto plano para clientes de correo sin HTML."""
    tipo = ticket_data.get("tipo", "soporte")
    prioridad = ticket_data.get("prioridad", "media")
    titulo = ticket_data.get("titulo", "") or "Sin asunto"
    descripcion = ticket_data.get("descripcion", "")

    return f"""[BAZPOS TICKET]
Tipo: {tipo.upper()}
Prioridad: {prioridad.upper()}
Tienda: {ticket_data.get('store_name', settings.STORE_NAME)}
Asunto: {titulo}

DESCRIPCIÓN:
{descripcion}

INFORMACIÓN DEL USUARIO:
Usuario: {ticket_data.get('usuario_username', 'Anónimo')} ({ticket_data.get('usuario_nombre', '')})
Email: {ticket_data.get('usuario_email', 'No especificado')}
Rol: {', '.join(ticket_data.get('usuario_roles', []))}
Versión: v{ticket_data.get('app_version', '2.3.0')}
Ruta: {ticket_data.get('current_path', '-')}
"""


def send_ticket_email(ticket_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Envía el ticket de soporte o sugerencia a través del servicio Resend.
    Si RESEND_API_KEY no está configurada, registra la solicitud en los logs (modo desarrollo).
    """
    api_key = getattr(settings, "RESEND_API_KEY", "").strip()
    from_email = getattr(settings, "RESEND_FROM_EMAIL", "BazPos <onboarding@resend.dev>").strip()
    to_email = getattr(settings, "SUPPORT_EMAIL", "soporte@bazpos.com").strip()

    tipo = ticket_data.get("tipo", "soporte")
    prioridad = ticket_data.get("prioridad", "media").upper()
    store_name = ticket_data.get("store_name", settings.STORE_NAME)
    titulo_resumen = ticket_data.get("titulo", "").strip()
    if not titulo_resumen:
        desc_clean = ticket_data.get("descripcion", "").strip().split("\n")[0]
        titulo_resumen = (desc_clean[:47] + "...") if len(desc_clean) > 50 else desc_clean

    tipo_label = "💡 Sugerencia" if tipo == "sugerencia" else "🛠️ Soporte"
    subject = f"[{store_name}] [{prioridad}] {tipo_label}: {titulo_resumen}"

    html_content = generate_ticket_html(ticket_data)
    text_content = generate_ticket_text(ticket_data)

    if not api_key:
        logger.warning(
            "[RESEND_MOCK] RESEND_API_KEY no configurada. Simulando envío de ticket para %s: %s",
            ticket_data.get("usuario_username"),
            subject,
        )
        return {
            "id": "mock_ticket_dev",
            "status": "mocked",
            "message": "Ticket recibido correctamente (modo desarrollo sin RESEND_API_KEY)",
            "subject": subject,
        }

    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "BazPos/2.3.0",
    }
    payload: Dict[str, Any] = {
        "from": from_email,
        "to": [to_email] if isinstance(to_email, str) else to_email,
        "subject": subject,
        "html": html_content,
        "text": text_content,
    }

    user_email = ticket_data.get("usuario_email")
    if user_email and "@" in user_email:
        payload["reply_to"] = user_email

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return {
                "id": res_data.get("id"),
                "status": "sent",
                "message": "Ticket enviado exitosamente a soporte",
            }
    except urllib.error.HTTPError as err:
        try:
            error_body = json.loads(err.read().decode("utf-8"))
        except Exception:
            error_body = {"error": err.reason}
        logger.error("Error al enviar email vía Resend (HTTP %s): %s", err.code, error_body)
        raise ResendEmailError(
            f"Error al enviar email a Resend: {error_body.get('message', err.reason)}",
            status_code=502,
            response_data=error_body,
        ) from err
    except urllib.error.URLError as err:
        logger.error("Error de conexión al contactar a Resend: %s", err.reason)
        raise ResendEmailError(
            f"No se pudo conectar con el servicio de correo (Resend): {err.reason}",
            status_code=502,
        ) from err
    except Exception as err:
        logger.exception("Excepción inesperada al enviar ticket a Resend")
        raise ResendEmailError(f"Error inesperado al enviar el ticket: {str(err)}", status_code=500) from err
