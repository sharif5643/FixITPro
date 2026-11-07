import { SetMetadata } from '@nestjs/common';

export const MODULE_KEY = 'module_key';
/**
 * The shop must have this module (any one of them, when several are given) — for everyone in the
 * shop, the owner too (see ModuleGuard).
 */
export const RequireModule = (...moduleKeys: string[]) => SetMetadata(MODULE_KEY, moduleKeys);
