import Link from "next/link";
import { notFound } from "next/navigation";

import { evaluateContextLibrary } from "@/lib/context-readiness";
import { presentContextDocument } from "@/lib/context-presentation";

export const dynamic = "force-dynamic";

export default async function ContextDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const readiness = await evaluateContextLibrary();
  const source = readiness.documents.find((document) => document.id === id);
  if (!source) notFound();
  const document = presentContextDocument(source);

  return (
    <div className="page context-detail-page">
      <Link className="back-button context-back" href="/context">← Job Finder</Link>
      <header className="context-detail-header">
        <div>
          <p className="eyebrow">Job Finder profile area</p>
          <h1>{document.name}</h1>
          <p>{document.purpose}</p>
        </div>
        <span className={`readiness-pill readiness-${document.readiness}`}>{document.readinessLabel}</span>
      </header>
      <section className="context-detail-card" aria-labelledby="needed-title">
        <p className="eyebrow">What improves confidence</p>
        <h2 id="needed-title">{document.missingInformation}</h2>
        <p>This area is maintained from a private local source. Update verified information there and Job Finder will reflect its current profile status.</p>
        <dl>
          <div><dt>Contribution</dt><dd>{document.impact}</dd></div>
          <div><dt>Readiness</dt><dd>{document.readinessLabel}</dd></div>
          <div><dt>Private source</dt><dd><code>context/{document.file}</code></dd></div>
          <div><dt>Last updated</dt><dd>{document.lastUpdated}</dd></div>
        </dl>
      </section>
    </div>
  );
}
