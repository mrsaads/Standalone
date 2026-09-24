// Superseded: the signed-in home ("/") is now the welcome dashboard that offers both products, so
// there is no per-user "preferred destination" to resolve any more. Kept as a tiny helper (and safe
// to delete) because it could not be removed from the synced folder automatically.
export function destinationPath(): string {
  return "/";
}
