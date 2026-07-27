export type DetectedCompanySource = {
  providerId: string;
  providerName: string;
  connectorKey: string;
  endpointLabel: string;
};

const PROVIDERS: Array<{
  id: string;
  name: string;
  detect: (url: URL) => string | null;
}> = [
  {
    id: "greenhouse",
    name: "Greenhouse",
    detect: (url) => {
      const parts = url.pathname.split("/").filter(Boolean);
      if (["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname)) {
        return parts[0] ?? null;
      }
      if (url.hostname.endsWith(".greenhouse.io")) return url.searchParams.get("for");
      return null;
    },
  },
  {
    id: "lever",
    name: "Lever",
    detect: (url) =>
      ["jobs.lever.co", "jobs.eu.lever.co"].includes(url.hostname)
        ? url.pathname.split("/").filter(Boolean)[0] ?? null
        : null,
  },
  {
    id: "ashby",
    name: "Ashby",
    detect: (url) =>
      url.hostname === "jobs.ashbyhq.com"
        ? url.pathname.split("/").filter(Boolean)[0] ?? null
        : null,
  },
  {
    id: "smartrecruiters",
    name: "SmartRecruiters",
    detect: (url) =>
      url.hostname === "jobs.smartrecruiters.com"
        ? url.pathname.split("/").filter(Boolean)[0] ?? null
        : null,
  },
  {
    id: "recruitee",
    name: "Recruitee",
    detect: (url) =>
      url.hostname.endsWith(".recruitee.com")
        ? url.hostname.split(".")[0] ?? null
        : null,
  },
  {
    id: "workable",
    name: "Workable",
    detect: (url) =>
      ["apply.workable.com", "careers.workable.com"].includes(url.hostname)
        ? url.pathname.split("/").filter(Boolean)[0] ?? null
        : null,
  },
  {
    id: "workday",
    name: "Workday",
    detect: (url) =>
      url.hostname.endsWith(".myworkdayjobs.com")
        ? url.hostname.split(".")[0]?.split("-")[0] ?? null
        : null,
  },
];

export function detectCompanySource(value: string): DetectedCompanySource | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  for (const provider of PROVIDERS) {
    const connectorKey = provider.detect(url)?.trim();
    if (!connectorKey) continue;
    return {
      providerId: provider.id,
      providerName: provider.name,
      connectorKey,
      endpointLabel: `${provider.name} public jobs feed`,
    };
  }
  return null;
}
