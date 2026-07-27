"use client";

import { useMemo, useState } from "react";
import { PostingContent } from "@/app/components/PostingContent";

export function SearchablePosting({ content }: { content: string }) {
  const [query, setQuery] = useState("");
  const count = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return 0;
    return content.toLowerCase().split(term).length - 1;
  }, [content, query]);

  return (
    <>
      <label className="posting-search">
        <span>Search within posting</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search responsibilities, skills, benefits…" />
        {query.trim() && <small>{count} {count === 1 ? "match" : "matches"}</small>}
      </label>
      <PostingContent content={content} />
    </>
  );
}
