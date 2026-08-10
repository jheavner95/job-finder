export type CpiEvent = { type: string; eventAt: Date };
export type CpiInterview = { type: string; round: string; scheduledAt: Date };
export type CpiDocument = {
  kind: string;
  versionLabel: string;
  submittedAt: Date | null;
};
export type CpiFollowUp = { completedAt: Date | null };

export type CpiApplication = {
  id: string;
  status: string;
  outcome: string | null;
  appliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sourceProvider: string | null;
  industry: string | null;
  role: string;
  matchScore: number | null;
  timeline: CpiEvent[];
  interviews: CpiInterview[];
  documents: CpiDocument[];
  followUps: CpiFollowUp[];
};

export type CpiMetric = {
  label: string;
  value: number | null;
  unit?: "percent" | "days";
  sufficient: boolean;
  sampleSize: number;
  trend: number | null;
  definition: string;
};

export type CpiGroup = {
  label: string;
  applications: number;
  responses: number;
  interviews: number;
  offers: number;
  interviewRate: number | null;
  offerRate: number | null;
  averageResponseDays: number | null;
  noResponseRate: number | null;
  averageMatchScore: number | null;
  sufficient: boolean;
};

const CLOSED = new Set(["Accepted", "Declined", "Rejected", "Withdrawn", "Closed"]);
const RESPONSE_TYPES = /application viewed|recruiter contacted|recruiter screen|email received|phone received|interview scheduled/i;

function percent(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : null;
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, (end.getTime() - start.getTime()) / 86_400_000);
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function firstResponse(application: CpiApplication) {
  if (!application.appliedAt) return null;
  return application.timeline
    .filter((event) => event.eventAt >= application.appliedAt! && RESPONSE_TYPES.test(event.type))
    .sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime())[0]?.eventAt ?? null;
}

function offered(application: CpiApplication) {
  return application.status === "Offer"
    || application.outcome === "Accepted"
    || application.timeline.some((event) => /offer/i.test(event.type));
}

function interviewed(application: CpiApplication) {
  return application.interviews.length > 0
    // A recorded Interviewing state is itself the evidence. Before UX-4 this
    // looked only for scheduled-interview rows, which only the unused ATS
    // subsystem ever created, so a real interview counted as none.
    || application.status === "Interviewing"
    || application.timeline.some((event) => /interview/i.test(event.type));
}

function completed(application: CpiApplication) {
  return Boolean(application.outcome) || CLOSED.has(application.status);
}

function closureDate(application: CpiApplication) {
  return application.timeline
    .filter((event) => /accepted|declined|rejected|withdrawn|closed|no response/i.test(event.type))
    .sort((a, b) => b.eventAt.getTime() - a.eventAt.getTime())[0]?.eventAt
    ?? (completed(application) ? application.updatedAt : null);
}

function rateMetric(
  label: string,
  numerator: number,
  denominator: number,
  threshold: number,
  definition: string,
): CpiMetric {
  return {
    label,
    value: denominator >= threshold ? percent(numerator, denominator) : null,
    unit: "percent",
    sufficient: denominator >= threshold,
    sampleSize: denominator,
    trend: null,
    definition,
  };
}

function groupApplications(
  applications: CpiApplication[],
  label: (application: CpiApplication) => string | null,
  threshold: number,
) {
  const groups = new Map<string, CpiApplication[]>();
  for (const application of applications.filter((item) => item.appliedAt)) {
    const key = label(application)?.trim();
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), application]);
  }
  return [...groups.entries()].map(([groupLabel, items]): CpiGroup => {
    const responses = items.filter((item) => firstResponse(item)).length;
    const interviews = items.filter(interviewed).length;
    const offers = items.filter(offered).length;
    const responseDays = items.flatMap((item) => {
      const response = firstResponse(item);
      return response && item.appliedAt ? [daysBetween(item.appliedAt, response)] : [];
    });
    const scores = items.flatMap((item) => item.matchScore === null ? [] : [item.matchScore]);
    const sufficient = items.length >= threshold;
    return {
      label: groupLabel,
      applications: items.length,
      responses,
      interviews,
      offers,
      interviewRate: sufficient ? percent(interviews, items.length) : null,
      offerRate: sufficient ? percent(offers, items.length) : null,
      averageResponseDays: sufficient ? average(responseDays) : null,
      noResponseRate: sufficient ? percent(items.length - responses, items.length) : null,
      averageMatchScore: sufficient ? average(scores) : null,
      sufficient,
    };
  }).sort((a, b) => b.applications - a.applications || a.label.localeCompare(b.label));
}

function documentGroups(applications: CpiApplication[], threshold: number) {
  const links = new Map<string, Set<string>>();
  for (const application of applications.filter((item) => item.appliedAt)) {
    for (const document of application.documents.filter((item) => item.submittedAt)) {
      const key = `${document.kind} · ${document.versionLabel}`;
      const ids = links.get(key) ?? new Set<string>();
      ids.add(application.id);
      links.set(key, ids);
    }
  }
  return [...links.entries()].map(([label, ids]): CpiGroup => {
    const items = applications.filter((item) => ids.has(item.id));
    const interviews = items.filter(interviewed).length;
    const offers = items.filter(offered).length;
    const sufficient = items.length >= threshold;
    return {
      label,
      applications: items.length,
      responses: items.filter((item) => firstResponse(item)).length,
      interviews,
      offers,
      interviewRate: sufficient ? percent(interviews, items.length) : null,
      offerRate: sufficient ? percent(offers, items.length) : null,
      averageResponseDays: null,
      noResponseRate: null,
      averageMatchScore: null,
      sufficient,
    };
  }).sort((a, b) => b.applications - a.applications || a.label.localeCompare(b.label));
}

export function calculateCareerPerformance(
  applications: CpiApplication[],
  threshold = 5,
  now = new Date(),
) {
  const submitted = applications.filter((item) => item.appliedAt);
  const active = applications.filter((item) => item.appliedAt && !completed(item));
  const completedApplications = submitted.filter(completed);
  const responses = submitted.filter((item) => firstResponse(item));
  const interviews = submitted.filter(interviewed);
  const offers = submitted.filter(offered);
  const responseDays = submitted.flatMap((item) => {
    const response = firstResponse(item);
    return response && item.appliedAt ? [daysBetween(item.appliedAt, response)] : [];
  });
  const processDays = completedApplications.flatMap((item) => {
    const closed = closureDate(item);
    return closed && item.appliedAt ? [daysBetween(item.appliedAt, closed)] : [];
  });
  const followUps = applications.flatMap((item) => item.followUps);

  const overview: CpiMetric[] = [
    { label: "Applications submitted", value: submitted.length, sufficient: true, sampleSize: submitted.length, trend: null, definition: "Applications with a recorded external submission date." },
    { label: "Applications active", value: active.length, sufficient: true, sampleSize: active.length, trend: null, definition: "Submitted applications without a recorded final outcome." },
    rateMetric("Interview rate", interviews.length, submitted.length, threshold, "Submitted applications with at least one recorded interview."),
    rateMetric("Offer rate", offers.length, submitted.length, threshold, "Submitted applications with a recorded offer event or outcome."),
    rateMetric("Response rate", responses.length, submitted.length, threshold, "Submitted applications with a factual recruiter, view, or interview response event."),
    { label: "Average days to first response", value: responseDays.length >= threshold ? average(responseDays) : null, unit: "days", sufficient: responseDays.length >= threshold, sampleSize: responseDays.length, trend: null, definition: "Calendar days from submission to the first recorded response event." },
    { label: "Average hiring process length", value: processDays.length >= threshold ? average(processDays) : null, unit: "days", sufficient: processDays.length >= threshold, sampleSize: processDays.length, trend: null, definition: "Calendar days from submission to a factual final outcome." },
    rateMetric("No response rate", submitted.filter((item) => item.outcome === "No response").length, completedApplications.length, threshold, "Completed applications explicitly marked No response."),
    rateMetric("Follow-up completion rate", followUps.filter((item) => item.completedAt).length, followUps.length, threshold, "Recorded follow-ups marked complete."),
  ];

  const currentStart = new Date(now.getTime() - 90 * 86_400_000);
  const previousStart = new Date(now.getTime() - 180 * 86_400_000);
  const cohort = (start: Date, end: Date) =>
    submitted.filter((item) => item.appliedAt! >= start && item.appliedAt! < end);
  const currentCohort = cohort(currentStart, now);
  const previousCohort = cohort(previousStart, currentStart);
  const cohortStats = (items: CpiApplication[]) => {
    const completedItems = items.filter(completed);
    const responseValues = items.flatMap((item) => {
      const response = firstResponse(item);
      return response && item.appliedAt ? [daysBetween(item.appliedAt, response)] : [];
    });
    const processValues = completedItems.flatMap((item) => {
      const closed = closureDate(item);
      return closed && item.appliedAt ? [daysBetween(item.appliedAt, closed)] : [];
    });
    return {
      submitted: items.length,
      interviewRate: percent(items.filter(interviewed).length, items.length),
      offerRate: percent(items.filter(offered).length, items.length),
      responseRate: percent(items.filter((item) => firstResponse(item)).length, items.length),
      responseDays: average(responseValues),
      processDays: average(processValues),
      completed: completedItems.length,
      noResponseRate: percent(completedItems.filter((item) => item.outcome === "No response").length, completedItems.length),
      responseSamples: responseValues.length,
      processSamples: processValues.length,
    };
  };
  const currentStats = cohortStats(currentCohort);
  const previousStats = cohortStats(previousCohort);
  const trendByLabel = new Map<string, number>();
  if (currentStats.submitted >= threshold && previousStats.submitted >= threshold) {
    trendByLabel.set("Applications submitted", currentStats.submitted - previousStats.submitted);
    for (const [label, key] of [
      ["Interview rate", "interviewRate"],
      ["Offer rate", "offerRate"],
      ["Response rate", "responseRate"],
    ] as const) {
      const current = currentStats[key];
      const previous = previousStats[key];
      if (current !== null && previous !== null) trendByLabel.set(label, current - previous);
    }
  }
  if (currentStats.responseSamples >= threshold && previousStats.responseSamples >= threshold
    && currentStats.responseDays !== null && previousStats.responseDays !== null) {
    trendByLabel.set("Average days to first response", Math.round((currentStats.responseDays - previousStats.responseDays) * 10) / 10);
  }
  if (currentStats.processSamples >= threshold && previousStats.processSamples >= threshold
    && currentStats.processDays !== null && previousStats.processDays !== null) {
    trendByLabel.set("Average hiring process length", Math.round((currentStats.processDays - previousStats.processDays) * 10) / 10);
  }
  if (currentStats.completed >= threshold && previousStats.completed >= threshold
    && currentStats.noResponseRate !== null && previousStats.noResponseRate !== null) {
    trendByLabel.set("No response rate", currentStats.noResponseRate - previousStats.noResponseRate);
  }
  for (const metric of overview) metric.trend = trendByLabel.get(metric.label) ?? null;

  const interviewTypes = [
    "Phone screen",
    "Hiring manager",
    "Panel",
    "Portfolio",
    "Technical",
    "Executive",
    "Reference",
  ].map((label) => ({
    label,
    count: applications.reduce((sum, item) =>
      sum + item.interviews.filter((interview) =>
        `${interview.round} ${interview.type}`.toLowerCase().includes(label.toLowerCase()),
      ).length, 0),
  }));

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const monthApplications = submitted.filter((item) => item.appliedAt! >= date && item.appliedAt! < next);
    return {
      label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
      applications: monthApplications.length,
      interviews: monthApplications.filter(interviewed).length,
      offers: monthApplications.filter(offered).length,
      responses: monthApplications.filter((item) => firstResponse(item)).length,
    };
  });

  return {
    threshold,
    totalApplications: applications.length,
    submitted: submitted.length,
    completed: completedApplications.length,
    overview,
    applicationMetrics: {
      submitted: submitted.length,
      completed: completedApplications.length,
      withdrawn: submitted.filter((item) => item.outcome === "Withdrawn").length,
      rejected: submitted.filter((item) => item.outcome === "Rejected").length,
      accepted: submitted.filter((item) => item.outcome === "Accepted").length,
      ghosted: submitted.filter((item) => item.outcome === "No response").length,
      averageAgeDays: average(active.flatMap((item) => item.appliedAt ? [daysBetween(item.appliedAt, now)] : [])),
      averageClosureDays: processDays.length >= threshold ? average(processDays) : null,
    },
    interviewMetrics: {
      types: interviewTypes,
      interviewToOfferRate: interviews.length >= threshold ? percent(offers.length, interviews.length) : null,
      averagePerApplication: submitted.length >= threshold
        ? average(submitted.map((item) => item.interviews.length))
        : null,
      sampleSize: submitted.length,
    },
    documents: documentGroups(applications, threshold),
    providers: groupApplications(applications, (item) => item.sourceProvider, threshold),
    industries: groupApplications(applications, (item) => item.industry, threshold),
    titles: groupApplications(applications, (item) => item.role, threshold),
    trends: {
      sufficient: submitted.length >= threshold,
      months,
    },
  };
}
