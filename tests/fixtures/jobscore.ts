export const jobScoreSingleJob = {
  publisher: "JobScore",
  publisher_url: "https://www.jobscore.com",
  company: "Example Products",
  company_url: "https://example.com",
  jobs: [{
    id: "JS-101",
    title: "Staff Product Designer",
    department: "Product Design",
    location: "Chicago, IL",
    city: "Chicago",
    state: "IL",
    country: "US",
    description: "<p>Lead enterprise product design strategy and design systems.</p>",
    apply_url: "https://careers.jobscore.com/careers/example/apply/JS-101",
    detail_url: "https://careers.jobscore.com/careers/example/jobs/JS-101",
    opened_date: "2026-07-01T12:00:00Z",
    last_updated_date: "2026-07-20T15:30:00Z",
    custom_fields: [{ label: "Employment Type", content: "Full-time" }],
  }],
};

export const jobScoreMultipleJobs = {
  ...jobScoreSingleJob,
  jobs: [
    jobScoreSingleJob.jobs[0],
    {
      ...jobScoreSingleJob.jobs[0],
      id: "JS-102",
      title: "Senior UX Researcher",
      department: "Research",
      location: "New York, NY",
      detail_url: "https://careers.jobscore.com/careers/example/jobs/JS-102",
      apply_url: "https://careers.jobscore.com/careers/example/apply/JS-102",
    },
  ],
};

export const jobScoreMissingOptionalFields = {
  publisher: "JobScore",
  company: "Example Products",
  jobs: [{
    id: "JS-103",
    title: "Product Designer",
    description: "Design a complex product.",
    detail_url: "https://careers.jobscore.com/careers/example/jobs/JS-103",
  }],
};

export const jobScoreEmptyFeed = {
  publisher: "JobScore",
  company: "Example Products",
  jobs: [],
};
