from django.contrib.admin.views.decorators import staff_member_required
from django.shortcuts import render

from bazpos.middleware import get_request_log


@staff_member_required
def admin_logs(request):
    if not request.user.is_superuser:
        from django.http import HttpResponseForbidden
        return HttpResponseForbidden("Solo superusuarios.")

    query = request.GET.get("q", "").lower()
    all_logs = get_request_log()

    if query:
        logs = [e for e in all_logs if query in e["path"].lower()]
    else:
        logs = all_logs

    return render(request, "admin/logs.html", {
        "logs": logs,
        "query": query,
        "title": "Logs en vivo",
    })
