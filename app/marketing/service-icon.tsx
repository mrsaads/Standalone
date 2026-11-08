import { ClipboardList, FileSearch, IdCard, Mail, RefreshCw, ShieldCheck, Target, Users } from "lucide-react";
import type { ServiceIcon as IconKey } from "@/lib/marketing/services";

// lucide-react 1.x ships no brand logos, so LinkedIn uses a profile card (IdCard) and email a plain
// envelope.
const ICONS = {
  audit: FileSearch, positioning: Target, bidding: ClipboardList, management: RefreshCw, reporting: Users, evidence: ShieldCheck,
  linkedin: IdCard, email: Mail,
} as const;

export function ServiceIcon({ name, size = 18 }: { name: IconKey; size?: number }) {
  const Icon = ICONS[name];
  return <Icon size={size} aria-hidden="true" />;
}
