import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import PageCard from "../components/PageCard";
import ProductoForm from "../components/ProductoForm";
import { usePageTitle } from "../lib/usePageTitle";

export default function ProductoFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const codigo_producto = searchParams.get("codigo_producto") || "";
  const proveedor = searchParams.get("proveedor") || "";
  const fromFactura = searchParams.get("from_factura") === "1";
  const embed = searchParams.get("embed") === "1";
  usePageTitle(id ? "Editar producto" : "Crear producto");

  function handleSaved(saved) {
    if (fromFactura) {
      const message = {
        type: id ? "PRODUCT_UPDATED" : "PRODUCT_CREATED",
        producto: saved,
      };
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(message, window.location.origin);
        window.close();
        return;
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, window.location.origin);
        return;
      }
      return;
    }
    navigate("/productos");
  }

  const content = (
    <PageCard title={id ? "Editar producto" : "Crear producto"}>
      <ProductoForm
        productoId={id}
        initialCodigoProducto={codigo_producto}
        initialProveedor={proveedor}
        onSaved={handleSaved}
      />
    </PageCard>
  );

  if (embed) {
    return <div className="p-3">{content}</div>;
  }

  return content;
}