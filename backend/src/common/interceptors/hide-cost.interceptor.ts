import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export const VIEW_COST = 'products.view_cost';

/** Owners always see cost prices; anyone else needs products.view_cost. */
export function canViewCost(user: { role?: string; permissions?: string[] } | undefined): boolean {
  if (!user) return false;
  if (user.role === 'OWNER' || user.role === 'SUPER_ADMIN') return true;
  return (user.permissions ?? []).includes(VIEW_COST);
}

const COST_KEYS = new Set(['costPrice']);

function isPlain(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Removes cost fields (product, sale item and repair part cost prices) from a response. */
export function stripCost<T>(value: T, depth = 0): T {
  if (depth > 12) return value;
  if (Array.isArray(value)) {
    for (const item of value) stripCost(item, depth + 1);
  } else if (isPlain(value)) {
    for (const key of Object.keys(value)) {
      if (COST_KEYS.has(key)) delete value[key];
      else stripCost(value[key], depth + 1);
    }
  }
  return value;
}

/**
 * Cost prices are only for people allowed to see them (products.view_cost). The screens
 * already hid them; this keeps them out of the API response as well.
 */
@Injectable()
export class HideCostInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context.switchToHttp().getRequest()?.user;
    if (canViewCost(user)) return next.handle();
    return next.handle().pipe(map((body) => stripCost(body)));
  }
}
