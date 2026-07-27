import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { WorkspaceLayout } from "@/app/components/PageLayout";
import { prisma } from "@/lib/db";

import { createApplicationAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const { jobId } = await searchParams;
  if (!jobId) notFound();
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { company: true, source: true, application: true },
  });
  if (!job) notFound();
  if (job.application) redirect(`/applications/${job.application.id}`);

  return (
    <WorkspaceLayout className="application-conversion-page">
      <Link className="back-link" href={`/jobs/${job.id}`}>← Back to opportunity</Link>
      <header>
        <p className="eyebrow">Begin application</p>
        <h1>Prepare your application</h1>
        <p>Confirm this private tracking record before opening the employer&apos;s posting. Nothing is submitted automatically.</p>
      </header>
      <form action={createApplicationAction} className="application-conversion-form">
        <input type="hidden" name="jobId" value={job.id} />
        <section>
          <h2>Application details</h2>
          <div className="application-form-grid">
            <label>Company<input name="company" defaultValue={job.company.name} required /></label>
            <label>Role<input name="role" defaultValue={job.title} required /></label>
            <label>Location<input name="location" defaultValue={job.location ?? ""} /></label>
            <label>Salary<input name="salary" defaultValue={job.compensationText ?? ""} /></label>
            <label>Industry<input name="industry" placeholder="Optional factual category" /></label>
            <label className="wide">Application URL<input name="applicationUrl" type="url" defaultValue={job.sourceUrl} /></label>
          </div>
        </section>
        <section>
          <h2>Known contacts</h2>
          <div className="application-form-grid">
            <label>Recruiter<input name="recruiter" placeholder="Optional" /></label>
            <label>Hiring manager<input name="hiringManager" placeholder="Optional" /></label>
          </div>
        </section>
        <section>
          <h2>Preparation note</h2>
          <label><span className="sr-only">Preparation note</span><textarea name="notes" rows={4} placeholder="What needs to be ready before you apply?" /></label>
        </section>
        <div className="conversion-actions">
          <button className="primary-button" type="submit">Create preparation workspace</button>
          <Link className="secondary-button button-link" href={job.sourceUrl} target="_blank" rel="noreferrer">Open original posting</Link>
          <small>You will mark the application as Applied after submitting externally.</small>
        </div>
      </form>
    </WorkspaceLayout>
  );
}
