"use client";

import { ErrorNotice } from "@/app/components/ErrorNotice";
import { mapError } from "@/lib/errors/app-error";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page">
      <ErrorNotice error={mapError(error, { route: "workspace", digest: error.digest })} retry={reset} />
    </div>
  );
}
