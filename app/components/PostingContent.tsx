import Link from "next/link";

function inlineContent(text: string) {
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\))/g);
  return parts.map((part, index) => {
    const match = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    return match
      ? <Link key={`${match[2]}-${index}`} href={match[2]} target="_blank" rel="noreferrer">{match[1]}</Link>
      : part;
  });
}

export function PostingContent({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/).filter(Boolean);
  if (!blocks.length) return <p>No description was provided by the source.</p>;

  return (
    <div className="posting-content">
      {blocks.map((block, index) => {
        const heading = block.match(/^#{2,6}\s+([\s\S]+)$/);
        if (heading) return <h3 key={`${heading[1]}-${index}`}>{inlineContent(heading[1])}</h3>;
        const lines = block.split("\n");
        if (lines.every((line) => line.startsWith("- "))) {
          return <ul key={`list-${index}`}>{lines.map((line) => <li key={line}>{inlineContent(line.slice(2))}</li>)}</ul>;
        }
        return <p key={`paragraph-${index}`}>{lines.map((line, lineIndex) => (
          <span key={`${line}-${lineIndex}`}>{inlineContent(line)}{lineIndex < lines.length - 1 && <br />}</span>
        ))}</p>;
      })}
    </div>
  );
}
