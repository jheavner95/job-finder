import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getOnboardingState } from "@/lib/onboarding";
import { AppShell } from "./components/AppShell";
import "./globals.css";

export function generateMetadata(): Metadata {
  const title = "Job Finder";
  const description = "A private, evidence-backed workspace for discovering, evaluating, and preparing for job opportunities.";
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary", title, description },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootLayoutContent>{children}</RootLayoutContent>;
}

async function RootLayoutContent({ children }: Readonly<{ children: React.ReactNode }>) {
  const onboarding = await getOnboardingState(prisma);
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <AppShell showGettingStarted={onboarding?.shouldShowPrimary ?? false}>{children}</AppShell>
      </body>
    </html>
  );
}
