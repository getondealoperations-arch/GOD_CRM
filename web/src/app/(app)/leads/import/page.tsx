import { requireUser } from "@/lib/auth";
import { Importer } from "@/components/importer";

export default async function ImportPage() {
  await requireUser("lead.import");
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">Import leads</h1>
        <a href="/lead-import-template.csv" download className="btn-ghost">Download template</a>
      </div>
      <Importer />
    </>
  );
}
