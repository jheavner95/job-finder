"use client";

import { ErrorNotice } from "@/app/components/ErrorNotice";
import { mapError } from "@/lib/errors/app-error";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="page">
          <ErrorNotice error={mapError(error, { route: "application", digest: error.digest })} retry={reset} level="fatal" />
        </main>
      </body>
    </html>
  );
}
