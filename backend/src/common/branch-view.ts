/**
 * Which branch a money screen shows. The owner (and the system admin) picks any branch, or the
 * whole shop. Anyone else who belongs to a branch sees that branch only, whatever the request
 * asks for. A manager with no branch looks after the whole shop.
 */
export function viewBranch(role: string | undefined | null, userBranchId: string | null | undefined, requested?: string): string | undefined {
  if (role === 'OWNER' || role === 'SUPER_ADMIN') return requested || undefined;
  return userBranchId ?? undefined;
}
