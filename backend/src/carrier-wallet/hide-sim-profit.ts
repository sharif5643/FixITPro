/** Who sees SIM / package profit: owners and people who see reports (managers by default). */
export function canSeeSimProfit(user: { role?: string; permissions?: string[] } | undefined): boolean {
  return !!user && (user.role === 'OWNER' || user.role === 'SUPER_ADMIN' || (user.permissions ?? []).includes('reports.view'));
}

/** Removes `profit` / `totalProfit` everywhere in a SIM / package response for people who may not see it. */
export function hideSimProfit<T>(value: T, user: { role?: string; permissions?: string[] } | undefined): T {
  if (canSeeSimProfit(user)) return value;
  const strip = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(strip); return; }
    if (!v || typeof v !== 'object' || v instanceof Date) return;
    const o = v as Record<string, unknown>;
    delete o.profit;
    delete o.totalProfit;
    Object.values(o).forEach(strip);
  };
  strip(value);
  return value;
}
