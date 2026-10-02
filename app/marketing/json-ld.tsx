// Renders schema.org structured data. `<` is escaped so a string value can never close the script
// tag — the data here is ours, but the habit is what keeps this safe if that ever changes.
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
