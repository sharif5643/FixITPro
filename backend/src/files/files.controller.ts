import {
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
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
  @Get('*')
  serveFile(@Param('0') filePath: string, @Res() res: Response) {
    // Strip any leading slashes to prevent path.join treating it as absolute
    const relative = (filePath ?? '').replace(/^[/\\]+/, '');

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
