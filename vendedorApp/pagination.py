from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class ProductoPagination(DefaultPagination):
    pass


class VentaPagination(DefaultPagination):
    pass


class DevolucionPagination(DefaultPagination):
    pass


class PedidoPagination(DefaultPagination):
    pass


class DashboardStockPagination(DefaultPagination):
    page_size = 10
    max_page_size = 50

    def get_page_number(self, request, paginator):
        page = super().get_page_number(request, paginator)
        try:
            # Stock alerts can disappear while the user is on the last page.
            return min(int(page), paginator.num_pages)
        except (TypeError, ValueError):
            return page
