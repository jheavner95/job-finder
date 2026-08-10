import { ImportJobsForm } from "./ImportJobsForm";

export const dynamic = "force-dynamic";

export default function ImportJobsPage() {
  return (
    <div className="page import-page">
      <header className="import-page-header">
        <p className="eyebrow">Controlled manual intake</p>
        <h1>Import</h1>
        <p>Paste a posting Job Finder has not found on its own. It is scored and checked for duplicates like any other, then appears in Opportunities.</p>
      </header>
      <ImportJobsForm />
      <p className="import-disclosure">Manual import only. No URL fetching, scraping, scheduled automation, AI extraction, applications, or employer communication.</p>
    </div>
  );
}
