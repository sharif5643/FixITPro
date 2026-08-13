import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { createReadStream, existsSync } from 'fs';
import { join, resolve, extname, sep } from 'path';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { uploadsBaseDir } from '../common/storage-paths';

const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const MIME: Record<string, string> = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
};

// Phase 9: UUIDs (cuid/uuid) used as tenant directory names — 20+ char alphanumeric/dash
const TENANT_PATH_RE = /^[a-z0-9_-]{20,}\//i;

@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  private readonly uploadsBase: string;

  constructor() {
    this.uploadsBase = resolve(uploadsBaseDir);
  }

  // Serves authenticated file access at GET /api/v1/files/<relative-path>
  // Path traversal prevention: resolve() is applied and the result must stay
  // inside uploadsBase. Extension whitelist ensures only images are served.
  // Phase 9: tenant-scoped paths enforce isolation — a user can only access
  // files under their own tenantId directory (or legacy shared paths).
  @Get('*')
  serveFile(@Param('0') filePath: string, @Req() req: Request, @Res() res: Response) {
    // Strip any leading slashes to prevent path.join treating it as absolute
    const relative = (filePath ?? '').replace(/^[/\\]+/, '');

    // Phase 12: tenant path isolation — deny cross-tenant file access
    const user = (req as any).user;
    if (TENANT_PATH_RE.test(relative)) {
      const pathTenantId = relative.split('/')[0];
      const callerTenantId = user?.tenantId ?? null;
      const callerRole = user?.role ?? '';
      // SUPER_ADMIN can access all tenants; others must match their own tenantId
      if (callerRole !== 'SUPER_ADMIN' && pathTenantId !== callerTenantId) {
        throw new ForbiddenException();
      }
    }

    const fullPath = resolve(join(this.uploadsBase, relative));

    // Chroot check: resolved path must be a child of uploadsBase
    if (!fullPath.startsWith(this.uploadsBase + sep)) {
      throw new NotFoundException();
    }

    // Extension whitelist: only serve image types that the upload filter allows
    const ext = extname(fullPath).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      throw new NotFoundException();
    }

    if (!existsSync(fullPath)) {
      throw new NotFoundException();
    }

    res.setHeader('Content-Type', MIME[ext] ?? 'image/jpeg');
    // private: browsers may cache but CDNs/proxies must not
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const stream = createReadStream(fullPath);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  }
}
