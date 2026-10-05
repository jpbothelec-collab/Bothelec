from django.http import HttpResponse


class ApiCorsMiddleware:
    """Allow browser clients (Expo web during development) to call /api/v1/.

    Safe to open to any origin: the API authenticates with bearer tokens, not cookies.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith("/api/v1/"):
            return self.get_response(request)
        response = HttpResponse() if request.method == "OPTIONS" else self.get_response(request)
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
        response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return response
