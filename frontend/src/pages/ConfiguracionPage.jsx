import { useEffect, useState } from "react";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../components/Shell";
import { useStoreConfig, useUpdateStoreConfig } from "../lib/queries";
import { useToast } from "../lib/toast";
import { fetchStoreConfig } from "../lib/store";

export default function ConfiguracionPage() {
  usePageTitle("Configuración");

  const { data: configData, isLoading } = useStoreConfig();
  const updateMutation = useUpdateStoreConfig();
  const addToast = useToast();

  const [data, setData] = useState({ telefono: "", direccion: "", tax_percent: "", timezone: "America/Santiago" });


  useEffect(() => {
    if (configData?.length) {
      const cfg = configData[0];
      setData({
        id: cfg.id,
        telefono: cfg.telefono || "",
        direccion: cfg.direccion || "",
        tax_percent: cfg.tax_percent != null ? String(cfg.tax_percent) : "19",
        timezone: cfg.timezone || "America/Santiago",
      });
    }
  }, [configData]);

  function submit(event) {
    event.preventDefault();
    if (!data.id) return;
    updateMutation.mutate(
      {
        id: data.id,
        data: {
          telefono: data.telefono,
          direccion: data.direccion,
          tax_percent: data.tax_percent,
          timezone: data.timezone,
        },
      },
      {
        onSuccess: () => {
          fetchStoreConfig();
          addToast("Guardado con éxito", "success");
        },
      }
    );
  }

  if (isLoading && !data.id) {
    return <PageCard title="Configuración"><p className="text-center text-muted">Cargando...</p></PageCard>;
  }

  return (
    <PageCard title="Configuración">
      <form onSubmit={submit}>
        <div className="row">
          <div className="col-md-6 form-group">
            <label>Teléfono</label>
            <input
              className="form-control"
              value={data.telefono}
              onChange={(e) => setData({ ...data, telefono: e.target.value })}
              placeholder="+56 9 1234 5678"
            />
          </div>
          <div className="col-md-6 form-group">
            <label>IVA (%)</label>
            <input
              className="form-control"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={data.tax_percent}
              onChange={(e) => setData({ ...data, tax_percent: e.target.value })}
              required
            />
          </div>
        </div>
        <div className="row">
          <div className="col-md-6 form-group">
            <label>Zona horaria</label>
            <input
              className="form-control"
              value={data.timezone}
              onChange={(e) => setData({ ...data, timezone: e.target.value })}
              placeholder="America/Santiago"
              list="timezone-list"
            />
            <datalist id="timezone-list">
              <option value="America/Santiago" />
              <option value="America/Punta_Arenas" />
              <option value="Pacific/Easter" />
              <option value="America/Argentina/Buenos_Aires" />
              <option value="America/Lima" />
              <option value="America/Bogota" />
              <option value="America/Mexico_City" />
              <option value="America/Sao_Paulo" />
              <option value="America/New_York" />
              <option value="America/Los_Angeles" />
              <option value="Europe/Madrid" />
              <option value="Europe/London" />
              <option value="Etc/GMT+4" />
            </datalist>
          </div>
        </div>
        <div className="form-group">
          <label>Dirección</label>
          <textarea
            className="form-control"
            rows="3"
            value={data.direccion}
            onChange={(e) => setData({ ...data, direccion: e.target.value })}
            placeholder="Av. Principal 123, Comuna, Ciudad"
          />
        </div>
        <button
          className="btn btn-primary"
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? "Guardando..." : "Guardar"}
        </button>
      </form>
    </PageCard>
  );
}
