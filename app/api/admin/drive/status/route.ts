import { getCurrentUser } from "@/lib/auth";
import { getDriveConnectionStatus } from "@/lib/drive";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });
  try {
    const status = await getDriveConnectionStatus();
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ connected: false, error: error instanceof Error ? error.message : "Drive status unavailable." }, { headers: { "Cache-Control": "no-store" } });
  }
}
