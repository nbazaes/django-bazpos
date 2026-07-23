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
