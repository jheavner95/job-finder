import { ImportJobsForm } from "./ImportJobsForm";

export const dynamic = "force-dynamic";

export default function ImportJobsPage() {
  return (
    <div className="page import-page">
      <header className="import-page-header">
        <p className="eyebrow">Controlled manual intake</p>
        <h1>Import Jobs</h1>
        <p>Preserve a real posting, review its details, check for duplicates, and confirm the match assessment before it enters your Review Queue.</p>
      </header>
      <ImportJobsForm />
      <p className="import-disclosure">Manual import only. No URL fetching, scraping, scheduled automation, AI extraction, applications, or employer communication.</p>
    </div>
  );
}
