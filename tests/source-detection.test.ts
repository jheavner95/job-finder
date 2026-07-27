import { describe, expect, it } from "vitest";

import { detectCompanySource } from "../lib/job-sources/detection";

describe("company career provider detection", () => {
  it.each([
    ["https://boards.greenhouse.io/instrumentl", "greenhouse", "instrumentl"],
    ["https://job-boards.greenhouse.io/openai", "greenhouse", "openai"],
    ["https://jobs.lever.co/instrumentl", "lever", "instrumentl"],
    ["https://jobs.ashbyhq.com/mondoo", "ashby", "mondoo"],
    ["https://jobs.smartrecruiters.com/ExampleCompany", "smartrecruiters", "ExampleCompany"],
    ["https://example.recruitee.com", "recruitee", "example"],
    ["https://apply.workable.com/example-company", "workable", "example-company"],
    ["https://example.wd5.myworkdayjobs.com/en-US/careers", "workday", "example"],
  ])("detects %s", (url, providerId, connectorKey) => {
    expect(detectCompanySource(url)).toMatchObject({ providerId, connectorKey });
  });

  it("fails closed for unknown or invalid career URLs", () => {
    expect(detectCompanySource("https://careers.example.com")).toBeNull();
    expect(detectCompanySource("not a url")).toBeNull();
  });
});
