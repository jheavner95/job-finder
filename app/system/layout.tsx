import { SystemNav } from "./SystemNav";

/**
 * System — one workspace, not five sidebar items.
 *
 * Everything under here is operational: how discovery runs, whether it is
 * working, and what to do when it is not. A daily user should be able to ignore
 * it entirely, which is the whole reason it exists as a boundary rather than as
 * peers of Today.
 */
export default function SystemLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="system-workspace">
      <SystemNav />
      {children}
    </div>
  );
}
