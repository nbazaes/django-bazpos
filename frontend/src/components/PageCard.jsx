export default function PageCard({ title, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <h6 className="card-title">{title}</h6>
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}
