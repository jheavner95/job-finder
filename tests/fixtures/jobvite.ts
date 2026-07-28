export const jobviteJob = {
  eId: "jv-101",
  companyId: "company-42",
  title: "Staff Product Designer",
  description: "<p>Lead enterprise product design.</p>",
  detailLink: "https://jobs.jobvite.com/example/job/jv-101",
  applyLink: "https://jobs.jobvite.com/example/job/jv-101/apply",
  category: "Product",
  jobType: "Full-time",
  location: "San Francisco",
  locationState: "California",
  locationCountry: "United States",
  jobState: "Open",
  postingType: "External",
  distribution: true,
  internalOnly: false,
  private: false,
  sentDate: 1_725_235_200_000,
  lastUpdatedDate: 1_725_321_600_000,
};

export const jobviteSecondJob = {
  ...jobviteJob,
  eId: "jv-102",
  title: "Senior Product Designer",
  detailLink: "https://jobs.jobvite.com/example/job/jv-102",
  applyLink: "https://jobs.jobvite.com/example/job/jv-102/apply",
};

export const jobviteClosedJob = {
  ...jobviteJob,
  eId: "jv-closed",
  jobState: "Filled",
};

export function jobvitePage(
  jobs: unknown[],
  next: string | null = null,
) {
  return { jobs, links: { next } };
}
