import * as winston from 'winston';
import { utilities as nestWinstonUtils, WinstonModule } from 'nest-winston';
import * as path from 'path';

const logsDir = process.env.LOGS_DIR ?? path.join(process.cwd(), 'logs');

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  nestWinstonUtils.format.nestLike('FixITPro', {
    colors: true,
    prettyPrint: true,
  }),
);

export function createWinstonLogger() {
  return WinstonModule.createLogger({
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'warn' : 'debug'),
    transports: [
      new winston.transports.Console({ format: consoleFormat }),
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: fileFormat,
        maxsize: 10 * 1024 * 1024, // 10 MB
        maxFiles: 5,
        tailable: true,
      }),
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: fileFormat,
        maxsize: 20 * 1024 * 1024, // 20 MB
        maxFiles: 7,
        tailable: true,
      }),
    ],
  });
}
