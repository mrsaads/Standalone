// OAuth return destinations are an allowlist, never arbitrary redirect URLs.
export const UPWORK_DESTINATION_COOKIE = "ix_uw_destination";
export function upworkReturnPath(destination: string | null | undefined): "/audits" | "/profile-score" {
  return destination === "audits" ? "/audits" : "/profile-score";
}
export function requestCookie(request: Request, name: string): string | null {
  const part = (request.headers.get("cookie") || "").split(/;\s*/).find(value => value.startsWith(`${name}=`));
  return part ? part.slice(name.length + 1) : null;
}
