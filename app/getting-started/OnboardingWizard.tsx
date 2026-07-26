"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { ErrorNotice } from "@/app/components/ErrorNotice";
import { createAppError, mapError, type AppError } from "@/lib/errors/app-error";
import {
  addOnboardingProject,
  approveResumeExperience,
  archiveOnboardingProjects,
  completeOnboarding,
  goToOnboardingStep,
  removeAllUnstartedOnboardingProjects,
  removeOnboardingProjects,
  rerunResumeExtraction,
  restoreOnboardingProjects,
  savePreferences,
  saveProjectProgress,
  uploadResume,
} from "./actions";

type ExperienceRecord = {
  employer: string;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  responsibilities?: string[];
  leadership?: string[];
  domains?: string[];
  industries?: string[];
  products?: string[];
  technologies?: string[];
  methods?: string[];
  collaboration?: string[];
  research?: string[];
  accessibility?: string[];
  ai?: string[];
  designSystems?: string[];
  enterprise?: string[];
  sourceExcerpt?: string;
  sourceLines?: string[];
  confidence?: "High confidence" | "Medium confidence" | "Low confidence" | "Unknown";
  needsReview?: boolean;
  editing?: boolean;
  skipped?: boolean;
};

type ImportPreview = {
  id: string;
  fileName: string;
  fileType?: string;
  status?: string;
  createdAt?: string;
  sourceText: string;
  records: unknown[];
  sectionsNeedingReview?: number;
};

const STEPS = ["Import Resume", "Review Experience", "Portfolio Projects", "Career Preferences", "Finish"];
const REMAINING = ["12–15 min", "8–10 min", "5–8 min", "3–5 min", "Less than 1 min"];

function normalizeRecords(records: unknown[]): ExperienceRecord[] {
  return records.filter((item): item is ExperienceRecord => Boolean(
    item && typeof item === "object"
    && "employer" in item && typeof item.employer === "string"
    && "title" in item && typeof item.title === "string",
  )).map((item) => ({ ...item, editing: item.needsReview ?? false }));
}

export function OnboardingWizard(props: {
  initialStep: number;
  completed: boolean;
  baselineReadiness: number;
  currentReadiness: number;
  latestImport: ImportPreview | null;
  importHistory: Array<{ id: string; fileName: string; fileType: string; status: string; createdAt: string }>;
  projects: Array<{ id: string; name: string; readiness: number; status: string; notes: string; screenshotName: string; hasEvidence: boolean }>;
  archivedProjects: Array<{ id: string; name: string; readiness: number }>;
  preferences: Record<string, string>;
  resumeCount: number;
  capabilityCoverage: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(props.initialStep);
  const [preview, setPreview] = useState<ImportPreview | null>(props.latestImport);
  const [records, setRecords] = useState<ExperienceRecord[]>(normalizeRecords(props.latestImport?.records ?? []));
  const [error, setError] = useState<AppError | null>(null);
  const [dragging, setDragging] = useState(false);
  const [managingProjects, setManagingProjects] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const progress = step * 20;
  const completedProjects = props.projects.filter((project) => project.status === "Complete").length;
  const improvement = Math.max(0, props.currentReadiness - props.baselineReadiness);
  const approvedRecords = records.filter((record) => !record.skipped).length;
  const responsibilityCount = records.reduce(
    (total, record) => total + (record.responsibilities?.length ?? 0),
    0,
  );
  const reviewCount = records.filter((record) => record.needsReview && !record.skipped).length
    + (preview?.sectionsNeedingReview ?? 0);

  const go = (next: number) => {
    setError(null);
    setStep(next);
    startTransition(async () => {
      try {
        await goToOnboardingStep(next);
      } catch (cause) {
        setError(mapError(cause, { route: "/getting-started", operation: "change-step" }));
      }
    });
  };

  const handleFile = (file?: File) => {
    if (!file) return;
    const data = new FormData();
    data.set("resume", file);
    setError(null);
    startTransition(async () => {
      try {
        const result = await uploadResume(data);
        if (!result.ok) return setError(result.error);
        const nextPreview = { ...result.data, fileType: file.name.split(".").pop()?.toUpperCase(), status: "Preview" };
        setPreview(nextPreview);
        setRecords(normalizeRecords(result.data.records));
        setStep(2);
      } catch (cause) {
        setError(mapError(cause, { route: "/getting-started", operation: "resume-import" }));
      }
    });
  };

  const addExperience = () => setRecords((items) => [...items, {
    employer: "",
    title: "",
    startDate: "",
    endDate: "",
    responsibilities: [],
    sourceExcerpt: "",
    sourceLines: [],
    confidence: "Unknown",
    needsReview: true,
    editing: true,
  }]);

  const updateRecord = (index: number, patch: Partial<ExperienceRecord>) => {
    setRecords((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const submitExperience = () => {
    if (!preview) return setError(createAppError("VALIDATION_ERROR", { field: "resume" }));
    setError(null);
    startTransition(async () => {
      try {
        await approveResumeExperience(preview.id, JSON.stringify(records));
        setStep(3);
      } catch (cause) {
        setError(mapError(cause, { route: "/getting-started", operation: "approve-experience" }));
      }
    });
  };

  const rerunExtraction = () => {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await rerunResumeExtraction(preview.id);
        setPreview(result);
        setRecords(normalizeRecords(result.records));
        setStep(2);
      } catch (cause) {
        setError(mapError(cause, { route: "/getting-started", operation: "resume-extraction" }));
      }
    });
  };

  const finish = () => startTransition(async () => {
    try {
      await completeOnboarding();
    } catch (cause) {
      setError(mapError(cause, { route: "/getting-started", operation: "complete-onboarding" }));
    }
  });

  const refreshProjects = () => {
    setSelectedProjects([]);
    router.refresh();
  };

  const addProject = () => {
    if (!newProjectName.trim()) return setError(createAppError("VALIDATION_ERROR", { field: "project name" }));
    setError(null);
    startTransition(async () => {
      try {
        await addOnboardingProject(newProjectName);
        setNewProjectName("");
        refreshProjects();
      } catch (cause) {
        setError(mapError(cause, { route: "/getting-started", operation: "add-project" }));
      }
    });
  };

  const archiveProjects = (ids: string[]) => {
    if (!ids.length || !window.confirm(
      `Archive ${ids.length === 1 ? "this project" : `${ids.length} selected projects`}? Archived projects remain recoverable in Career Evidence.`,
    )) return;
    startTransition(async () => {
      await archiveOnboardingProjects(ids);
      refreshProjects();
    });
  };

  const removeProjects = (ids: string[], hasEvidence = false) => {
    if (!ids.length || !window.confirm(
      hasEvidence
        ? "Permanently remove this project and its linked evidence? Choose Archive if you may want to restore it later."
        : `Permanently remove ${ids.length === 1 ? "this project" : `${ids.length} selected projects`}? This cannot be undone.`,
    )) return;
    startTransition(async () => {
      await removeOnboardingProjects(ids);
      refreshProjects();
    });
  };

  const restoreProjects = (ids: string[]) => {
    if (!ids.length) return;
    startTransition(async () => {
      await restoreOnboardingProjects(ids);
      refreshProjects();
    });
  };

  const removeUnstarted = () => {
    if (!window.confirm("Remove every active project with 0% readiness? This cannot be undone.")) return;
    startTransition(async () => {
      await removeAllUnstartedOnboardingProjects();
      refreshProjects();
    });
  };

  return (
    <div className="onboarding-shell">
      <aside className="onboarding-steps" aria-label="Onboarding progress">
        <p className="eyebrow">Job Finder setup</p>
        <ol>
          {STEPS.map((label, index) => {
            const number = index + 1;
            return (
              <li key={label} className={number === step ? "active" : number < step ? "done" : ""}>
                <button type="button" onClick={() => go(number)}>
                  <span>{number < step ? "✓" : number}</span>
                  <div><strong>{label}</strong><small>{number < step ? "Complete" : number === step ? "In progress" : "Not started"}</small></div>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="onboarding-safety"><strong>Nothing leaves this computer.</strong><p>Your resume and evidence stay in this private, local workspace.</p></div>
      </aside>

      <section className="onboarding-workspace">
        <header className="wizard-progress">
          <div><strong>Step {step} of 5</strong><span>Estimated remaining time: {REMAINING[step - 1]}</span></div>
          <div className="progress-track" aria-label={`${progress}% complete`}><span style={{ width: `${progress}%` }} /></div>
          <b>{progress}%</b>
        </header>

        {error && <ErrorNotice error={error} level="inline" />}

        {step === 1 && (
          <div className="wizard-step">
            <p className="eyebrow">Start with your strongest source</p>
            <h2>Import your verified resume</h2>
            <p className="wizard-lead">We’ll extract explicit experience for your review. Nothing is added to your profile until you approve it.</p>
            <div
              className={`resume-dropzone${dragging ? " dragging" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                handleFile(event.dataTransfer.files[0]);
              }}
            >
              <input ref={inputRef} type="file" accept=".pdf,.docx,.md,.txt" onChange={(event) => handleFile(event.target.files?.[0])} />
              <span className="upload-mark">⇧</span>
              <h3>Drop your resume here</h3>
              <p>PDF, DOCX, Markdown, or TXT · up to 10 MB</p>
              <button className="primary-button" type="button" disabled={isPending} onClick={() => inputRef.current?.click()}>
                {isPending ? "Parsing resume…" : props.resumeCount ? "Replace Resume" : "Browse Files"}
              </button>
            </div>
            {preview && (
              <div className="resume-preview-summary">
                <div><span>Most recent import</span><strong>{preview.fileName}</strong><small>{preview.status ?? "Preview"} · Review required</small></div>
                <div className="resume-preview-actions">
                  <button type="button" onClick={() => { setRecords(normalizeRecords(preview.records)); go(2); }}>Review imported resume →</button>
                  <button type="button" disabled={isPending} onClick={rerunExtraction}>Re-run extraction</button>
                </div>
              </div>
            )}
            <details className="import-history">
              <summary>View import history ({props.importHistory.length})</summary>
              {props.importHistory.length ? props.importHistory.map((item) => (
                <div key={item.id}><strong>{item.fileName}</strong><span>{item.fileType} · {item.status} · {new Date(item.createdAt).toLocaleDateString()}</span></div>
              )) : <p>No resume imports yet.</p>}
            </details>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-step">
            <p className="eyebrow">Review before saving</p>
            <h2>Confirm your experience</h2>
            <p className="wizard-lead">Approve, edit, or skip each explicit record. Blank values remain Unknown.</p>
            <div className="experience-summary" aria-label="Resume extraction summary">
              <strong>Found</strong>
              <span><b>{records.length}</b> experience records</span>
              <span><b>{responsibilityCount}</b> responsibilities</span>
              <span><b>{reviewCount}</b> sections needing review</span>
            </div>
            {preview && <details className="source-preview"><summary>Preview extracted resume text</summary><pre>{preview.sourceText}</pre></details>}
            <div className="experience-list">
              {records.map((record, index) => (
                <article key={`${index}-${record.employer}`} className={record.skipped ? "skipped" : ""}>
                  <header>
                    <span>Experience {index + 1}</span>
                    <div className="experience-review-actions">
                      <button type="button" onClick={() => updateRecord(index, { skipped: false, editing: false, needsReview: false })}>Approve</button>
                      <button type="button" onClick={() => updateRecord(index, { skipped: false, editing: true })}>Edit</button>
                      <button type="button" onClick={() => updateRecord(index, { skipped: true, editing: false })}>{record.skipped ? "Skipped" : "Skip"}</button>
                    </div>
                  </header>
                  <div className="extraction-meta">
                    <span className={`confidence-badge confidence-${(record.confidence ?? "Unknown").toLowerCase().replaceAll(" ", "-")}`}>
                      {record.confidence ?? "Unknown"}
                    </span>
                    {record.needsReview && !record.skipped && <span>Needs review</span>}
                  </div>
                  <div className="field-grid">
                    <label>Employer<input disabled={!record.editing} value={record.employer} onChange={(event) => updateRecord(index, { employer: event.target.value })} /></label>
                    <label>Title<input disabled={!record.editing} value={record.title} onChange={(event) => updateRecord(index, { title: event.target.value })} /></label>
                    <label>Start date<input disabled={!record.editing} value={record.startDate ?? ""} placeholder="Unknown" onChange={(event) => updateRecord(index, { startDate: event.target.value })} /></label>
                    <label>End date<input disabled={!record.editing} value={record.endDate ?? ""} placeholder="Unknown" onChange={(event) => updateRecord(index, { endDate: event.target.value })} /></label>
                    <label>Location<input disabled={!record.editing} value={record.location ?? ""} placeholder="Unknown" onChange={(event) => updateRecord(index, { location: event.target.value })} /></label>
                  </div>
                  <label>Explicit responsibilities<textarea disabled={!record.editing} value={(record.responsibilities ?? []).join("\n")} placeholder="Unknown" onChange={(event) => updateRecord(index, { responsibilities: event.target.value.split("\n").filter(Boolean) })} /></label>
                  <details className="record-source">
                    <summary>Source excerpt</summary>
                    <pre>{record.sourceExcerpt || "Not detected — review required"}</pre>
                  </details>
                </article>
              ))}
              {!records.length && <div className="wizard-empty"><strong>We found resume text, but could not confidently identify employment records.</strong><p>The resume text is available above. Add only experience you can verify directly from it.</p></div>}
            </div>
            <button className="secondary-button" type="button" onClick={addExperience}>+ Add verified experience</button>
            <div className="wizard-actions"><button type="button" onClick={() => go(1)}>Back</button><button className="primary-button" type="button" disabled={isPending || !preview} onClick={submitExperience}>Approve {approvedRecords} records and continue</button></div>
          </div>
        )}

        {step === 3 && (
          <div className="wizard-step">
            <p className="eyebrow">One project at a time</p>
            <h2>Build portfolio evidence</h2>
            <p className="wizard-lead">Add only the projects you want Job Finder to use as career evidence. Portfolio evidence is optional during onboarding.</p>
            <div className="project-toolbar">
              <div className="add-project-control">
                <label htmlFor="new-project-name">Project name</label>
                <input id="new-project-name" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Add a verified project" />
                <button className="secondary-button" type="button" disabled={isPending} onClick={addProject}>Add project</button>
              </div>
              <button type="button" onClick={() => setManagingProjects((value) => !value)}>
                {managingProjects ? "Cancel management" : "Manage projects"}
              </button>
            </div>
            {managingProjects && (
              <section className="project-manager" aria-label="Manage portfolio projects">
                <header><strong>Select projects</strong><span>{selectedProjects.length} selected</span></header>
                <div>
                  {props.projects.map((project) => (
                    <label key={project.id}>
                      <input
                        type="checkbox"
                        checked={selectedProjects.includes(project.id)}
                        onChange={(event) => setSelectedProjects((current) =>
                          event.target.checked
                            ? [...current, project.id]
                            : current.filter((id) => id !== project.id))}
                      />
                      <span>{project.name}</span><small>{project.readiness}% ready</small>
                    </label>
                  ))}
                </div>
                <footer>
                  <button type="button" disabled={!selectedProjects.length || isPending} onClick={() => archiveProjects(selectedProjects)}>Archive selected</button>
                  <button type="button" disabled={!selectedProjects.length || isPending} onClick={() => removeProjects(
                    selectedProjects,
                    props.projects.some((project) =>
                      selectedProjects.includes(project.id) && project.hasEvidence),
                  )}>Remove selected</button>
                  <button type="button" disabled={isPending || !props.projects.some((project) => project.readiness === 0)} onClick={removeUnstarted}>Remove all 0% ready</button>
                  <button type="button" onClick={() => { setManagingProjects(false); setSelectedProjects([]); }}>Cancel</button>
                </footer>
              </section>
            )}
            {props.archivedProjects.length > 0 && (
              <details className="archived-projects">
                <summary>Restore archived projects ({props.archivedProjects.length})</summary>
                {props.archivedProjects.map((project) => (
                  <div key={project.id}>
                    <span><strong>{project.name}</strong><small>{project.readiness}% ready when archived</small></span>
                    <button type="button" disabled={isPending} onClick={() => restoreProjects([project.id])}>Restore</button>
                  </div>
                ))}
              </details>
            )}
            {props.projects.length ? (
              <div className="onboarding-projects">
                {props.projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onArchive={() => archiveProjects([project.id])}
                    onRemove={() => removeProjects([project.id], project.hasEvidence)}
                  />
                ))}
              </div>
            ) : (
              <div className="wizard-empty portfolio-empty">
                <strong>No portfolio projects added yet.</strong>
                <p>Add a project above, or continue without portfolio evidence.</p>
                <button className="primary-button" type="button" onClick={() => go(4)}>Continue without portfolio evidence</button>
              </div>
            )}
            <div className="wizard-actions"><button type="button" onClick={() => go(2)}>Back</button><button className="primary-button" type="button" onClick={() => go(4)}>{props.projects.length ? `Continue with ${completedProjects} completed` : "Continue without portfolio evidence"}</button></div>
          </div>
        )}

        {step === 4 && (
          <form className="wizard-step" action={(formData) => startTransition(async () => { await savePreferences(formData); setStep(5); })}>
            <p className="eyebrow">Shape the search</p>
            <h2>Set career preferences</h2>
            <p className="wizard-lead">Keep this simple. These settings remain editable in Job Finder.</p>
            <div className="preference-form">
              <label>Preferred roles<input name="preferredRoles" defaultValue={props.preferences.preferredRoles} placeholder="Staff Product Designer, Principal Product Designer" /><small>Separate multiple values with commas.</small></label>
              <label>Preferred industries<input name="preferredIndustries" defaultValue={props.preferences.preferredIndustries} placeholder="FinTech, healthcare, developer tools" /></label>
              <label>Work mode<select name="workMode" defaultValue={props.preferences.workMode}><option value="">No preference</option><option>Remote</option><option>Hybrid</option><option>Remote or Hybrid</option></select></label>
              <label>Compensation<input name="compensation" defaultValue={props.preferences.compensation} placeholder="Your verified target or range" /></label>
              <label>Company exclusions<input name="companyExclusions" defaultValue={props.preferences.companyExclusions} placeholder="Companies to exclude" /></label>
              <label>Employment type<input name="employmentTypes" defaultValue={props.preferences.employmentTypes} placeholder="Full-time, contract" /></label>
            </div>
            <div className="wizard-actions"><button type="button" onClick={() => go(3)}>Back</button><button className="primary-button" type="submit" disabled={isPending}>Save preferences and continue</button></div>
          </form>
        )}

        {step === 5 && (
          <div className="wizard-step finish-step">
            <span className="finish-mark">✓</span>
            <p className="eyebrow">Ready for better guidance</p>
            <h2>Your Job Finder workspace is set up.</h2>
            <p className="wizard-lead">You can keep adding evidence one project at a time. Unknown information remains Unknown.</p>
            <div className="readiness-change">
              <div><span>Before</span><strong>{props.baselineReadiness}%</strong></div><b>→</b><div><span>Now</span><strong>{props.currentReadiness}%</strong></div>
            </div>
            <div className="finish-results">
              <div><strong>{props.resumeCount}</strong><span>Resume records</span></div>
              <div><strong>{props.capabilityCoverage}%</strong><span>Profile coverage</span></div>
              <div><strong>{completedProjects}</strong><span>Projects completed</span></div>
              <div><strong>+{improvement}</strong><span>Readiness points</span></div>
            </div>
            {props.completed ? (
              <Link className="primary-button" href="/">Go to Dashboard</Link>
            ) : (
              <button className="primary-button" type="button" disabled={isPending} onClick={finish}>Complete onboarding</button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectCard({ project, onArchive, onRemove }: {
  project: { id: string; name: string; readiness: number; status: string; notes: string; screenshotName: string; hasEvidence: boolean };
  onArchive: () => void;
  onRemove: () => void;
}) {
  const [status, setStatus] = useState(project.status);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const statusClass = status.toLowerCase().replaceAll(" ", "-");
  return (
    <form className="onboarding-project-card" action={(formData) => startTransition(async () => {
      await saveProjectProgress(formData);
      setSaved(true);
    })}>
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="status" value={status} />
      <header><div><h3>{project.name}</h3><span className={`evidence-status status-${statusClass}`}>{status}</span></div><strong>{project.readiness}% ready</strong></header>
      <label>Optional notes<textarea name="notes" defaultValue={project.notes} placeholder="Add only facts you can verify." /></label>
      <label className="screenshot-field">Optional screenshot<input type="file" name="screenshot" accept="image/png,image/jpeg,image/webp" /><small>{project.screenshotName || "No screenshot selected"}</small></label>
      <div>
        <button type="button" onClick={() => { setStatus("Complete"); setSaved(false); }}>Complete now</button>
        <button type="button" onClick={() => { setStatus("Skipped"); setSaved(false); }}>Skip for now</button>
        <button className="save-project" type="submit" disabled={isPending}>{isPending ? "Saving…" : saved ? "Saved" : "Save notes"}</button>
        <button type="button" onClick={onArchive}>Archive</button>
        <button className="remove-project" type="button" onClick={onRemove}>Remove</button>
      </div>
    </form>
  );
}
