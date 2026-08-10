import Link from "next/link";

import { PageHeader } from "@/app/components/PageHeader";
import { WorkspaceLayout } from "@/app/components/PageLayout";
import { prisma } from "@/lib/db";
import { ago, getSystemHealth } from "@/lib/system-health";

export const dynamic = "force-dynamic";

/**
 * System overview — the answer, then the detail.
 *
 * Six questions used to need five pages: is discovery working, when did it last
 * run, is anything failing, what did the last scan produce, can I run something
 * now, and where do I go to dig. They are all here, in that order, and a
 * healthy engine says almost nothing.
 */
export default async function SystemPage() {
  const health = await getSystemHealth(prisma);
  const quiet = health.state === "healthy";

  return (
    <WorkspaceLayout className="system-page">
      <PageHeader title="System" subtitle="How Job Finder finds opportunities, and whether it is working." />

      <section className={`system-verdict system-verdict-${health.state}`} aria-labelledby="system-verdict-title">
        <h2 id="system-verdict-title">
          {/* Named, not coloured: the state has to survive a greyscale screen. */}
          <span className="system-dot" aria-hidden="true" />
          {health.headline}
        </h2>
        <p>
          {health.lastScanAt
            ? `Last checked ${ago(health.lastScanAt)}`
            : "Nothing has been checked yet"}
          <span aria-hidden="true"> · </span>
          {health.companiesMonitored.toLocaleString()} companies monitored
          {health.nextRunAt ? (
            <>
              <span aria-hidden="true"> · </span>next run scheduled
            </>
          ) : (
            <>
              <span aria-hidden="true"> · </span>manual scanning only
            </>
          )}
        </p>
      </section>

      {/* Only when something is actually wrong. A healthy engine gets no table. */}
      {health.failingProviders.length > 0 && (
        <section className="system-block" aria-labelledby="system-failures-title">
          <h2 id="system-failures-title">Not responding</h2>
          <ul className="system-failures">
            {health.failingProviders.map((provider) => (
              <li key={provider.name}>
                <strong>{provider.name}</strong>
                <span>
                  {provider.companies} {provider.companies === 1 ? "company" : "companies"}
                </span>
              </li>
            ))}
          </ul>
          <p className="system-quiet">
            These companies were reachable before. <Link href="/system/sources">See source detail</Link>.
          </p>
        </section>
      )}

      <section className="system-block" aria-labelledby="system-last-title">
        <h2 id="system-last-title">Last scan</h2>
        {health.lastScanAt ? (
          <p>
            {health.lastScanStatus === "CompletedWithErrors" ? "Completed with warnings" : "Completed"}{" "}
            {ago(health.lastScanAt)} and added{" "}
            <strong>
              {health.lastScanImported} new{" "}
              {health.lastScanImported === 1 ? "opportunity" : "opportunities"}
            </strong>
            . <Link href="/system/scans">See what each source contributed</Link>.
          </p>
        ) : (
          <p className="system-quiet">
            Discovery has never run. <Link href="/system/scans">Run a scan</Link> to start finding roles.
          </p>
        )}
      </section>

      <section className="system-block" aria-labelledby="system-do-title">
        <h2 id="system-do-title">Run something now</h2>
        <p className="system-actions">
          <Link className="secondary-button button-link" href="/system/scans">
            Scan for opportunities
          </Link>
          <Link className="secondary-button button-link" href="/system/import">
            Import a posting by hand
          </Link>
          <Link className="text-button" href="/system/schedules">
            Change when scans run
          </Link>
        </p>
      </section>

      {quiet && (
        /* The reassurance a quiet page needs: nothing is hidden, there is
           simply nothing to report. */
        <p className="system-quiet">
          Nothing needs your attention here. Discovery reports problems on this page when it
          has them.
        </p>
      )}
    </WorkspaceLayout>
  );
}
