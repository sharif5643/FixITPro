import { join } from 'path';

export const uploadsBaseDir  = process.env.UPLOADS_BASE_DIR  ?? '/app/uploads';
export const repairsUploadDir = process.env.REPAIR_UPLOADS_DIR ?? join(uploadsBaseDir, 'repairs');
export const backupDir        = process.env.BACKUP_DIR         ?? '/app/backups';
