import { metadataDocument, upworkMcpConfig } from "@/lib/upwork-mcp-auth";

export async function GET() {
  const cfg = upworkMcpConfig();
  if (!cfg) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(metadataDocument(cfg), { headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
