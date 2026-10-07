import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';
/** The route needs this permission; with several, any one of them is enough. */
export const RequirePermission = (...permissions: [string, ...string[]]) =>
  SetMetadata(PERMISSION_KEY, permissions.length === 1 ? permissions[0] : permissions);
