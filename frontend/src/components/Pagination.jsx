export default function Pagination({ page, totalPages, onPageChange, count, pageSize }) {
  if (totalPages <= 1) return null;

  const start = Math.min((page - 1) * pageSize + 1, count);
  const end = Math.min(page * pageSize, count);

  return (
    <div className="pagination-bar flex flex-wrap items-center justify-between gap-3 mt-4">
      <div className="text-sm text-secondary">
        Mostrando <strong>{start}</strong> - <strong>{end}</strong> de <strong>{count}</strong> registros
      </div>
      <div className="btn-group">
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
        >
          Primera
        </button>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Anterior
        </button>
        <span className="btn btn-sm" style={{ cursor: "default" }}>
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Siguiente
        </button>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
        >
          Última
        </button>
      </div>
    </div>
  );
}
