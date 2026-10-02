import { ClipboardList, FileSearch, RefreshCw, ShieldCheck, Target, Users } from "lucide-react";
import type { ServiceIcon as IconKey } from "@/lib/marketing/services";

const ICONS = { audit: FileSearch, positioning: Target, bidding: ClipboardList, management: RefreshCw, reporting: Users, evidence: ShieldCheck } as const;

export function ServiceIcon({ name, size = 18 }: { name: IconKey; size?: number }) {
  const Icon = ICONS[name];
  return <Icon size={size} aria-hidden="true" />;
}
