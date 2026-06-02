import time
from collections import deque
from threading import Lock

_request_log = deque(maxlen=500)
_request_lock = Lock()


def get_request_log():
    with _request_lock:
        return list(_request_log)


class RequestLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.time()
        response = self.get_response(request)
        elapsed = time.time() - start

        entry = {
            "time": time.strftime("%d/%b/%Y %H:%M:%S", time.localtime(start)),
            "method": request.method,
            "path": request.path,
            "status": response.status_code,
            "size": len(response.content) if hasattr(response, "content") else 0,
            "elapsed": elapsed,
        }
        with _request_lock:
            _request_log.appendleft(entry)

        return response
