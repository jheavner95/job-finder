import type { ReactNode } from "react";

type PageLayoutProps = {
  children: ReactNode;
  className?: string;
};

function classes(variant: "reading" | "workspace", className?: string) {
  return ["page", "page-layout", `${variant}-layout`, className]
    .filter(Boolean)
    .join(" ");
}

export function ReadingLayout({ children, className }: PageLayoutProps) {
  return <div className={classes("reading", className)}>{children}</div>;
}

export function WorkspaceLayout({ children, className }: PageLayoutProps) {
  return <div className={classes("workspace", className)}>{children}</div>;
}
