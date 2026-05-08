import Shell from "../components/Shell";
import PageCard from "../components/PageCard";

export default function StaticPage({ title, message }) {
  return (
    <Shell title={title}>
      <PageCard title={title}>
        <p className="mb-0">{message}</p>
      </PageCard>
    </Shell>
  );
}
