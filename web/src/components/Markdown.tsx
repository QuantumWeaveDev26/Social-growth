import React from "react";

function inline(s: string) {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") ? <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong> : <React.Fragment key={i}>{p}</React.Fragment>));
}

/** Minimal markdown for model-written brand profiles: headings, bullets, paragraphs, bold. */
export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="my-3 list-disc space-y-1.5 pl-5 marker:text-mint">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*[-*] /.test(line)) { list.push(line.replace(/^\s*[-*] /, "")); continue; }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,4}) (.*)/);
    if (h) blocks.push(<h3 key={blocks.length} className="mb-1 mt-6 text-[1.02rem] font-bold text-ink first:mt-0">{h[2]}</h3>);
    else blocks.push(<p key={blocks.length} className="my-2">{inline(line)}</p>);
  }
  flush();
  return <div className="leading-relaxed text-ink-2">{blocks}</div>;
}
