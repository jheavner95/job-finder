export const teamtailorJob = {
  type: "jobs",
  id: "tt-101",
  attributes: {
    title: "Staff Product Designer",
    pitch: "Shape a complex product platform.",
    body: "<p>Lead enterprise product design and design systems.</p>",
    "careersite-job-url": "https://example.teamtailor.com/jobs/tt-101-staff-product-designer",
    "careersite-job-apply-url": "https://example.teamtailor.com/jobs/tt-101-staff-product-designer/applications/new",
    "remote-status": "hybrid",
    "employment-type": "full-time",
    "created-at": "2026-07-01T12:00:00Z",
    "updated-at": "2026-07-20T15:30:00Z",
  },
  relationships: {
    department: { data: { type: "departments", id: "dep-1" } },
    locations: { data: [{ type: "locations", id: "loc-1" }] },
  },
};

export const teamtailorSecondJob = {
  type: "jobs",
  id: "tt-102",
  attributes: {
    title: "Senior Product Designer",
    body: "<p>Design customer workflows.</p>",
    "careersite-job-url": "https://example.teamtailor.com/jobs/tt-102-senior-product-designer",
    "remote-status": "fully",
  },
  relationships: {
    locations: { data: [{ type: "locations", id: "loc-2" }] },
  },
};

export const teamtailorIncluded = [
  { type: "departments", id: "dep-1", attributes: { name: "Product Design" } },
  { type: "locations", id: "loc-1", attributes: { name: "Chicago" } },
  { type: "locations", id: "loc-2", attributes: { name: "Remote — United States" } },
];

export function teamtailorPage(
  data: unknown[],
  next: string | null = null,
) {
  return {
    data,
    included: teamtailorIncluded,
    links: { next },
    meta: { "record-count": data.length, "page-count": next ? 2 : 1 },
  };
}

export function teamtailorDetail(resource = teamtailorJob) {
  return { data: resource, included: teamtailorIncluded };
}
