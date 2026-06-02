import { usePageTitle } from "../components/Shell";
import PageCard from "../components/PageCard";

export default function StaticPage({ title, message }) {
  usePageTitle(title);
  return (
    <PageCard title={title}>
        <p className="mb-0">{message}</p>
      </PageCard>
  );
}
