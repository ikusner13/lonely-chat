import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';

// Determine if we're in production
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || 'info';

// Only create logs directory if not in production
let logsDir: string | undefined;
if (!isProduction) {
  logsDir = join(process.cwd(), 'logs', 'app');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
}

// Get date string for log files
const getDateString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// Configure transports
const targets: pino.TransportTargetOptions[] = [
  // Console transport
  {
    target: isProduction ? 'pino/file' : 'pino-pretty',
    options: isProduction
      ? { destination: 1 } // stdout
      : {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
          messageFormat: '{msg}',
          errorLikeObjectKeys: ['err', 'error'],
          errorProps: '*',
        },
    level: logLevel,
  },
];

// Only add file transports if not in production
if (!isProduction && logsDir) {
  targets.push(
    // File transport for all logs
    {
      target: 'pino/file',
      options: {
        destination: join(logsDir, `app-${getDateString()}.log`),
        mkdir: true,
      },
      level: logLevel,
    },
    // Separate file for errors
    {
      target: 'pino/file',
      options: {
        destination: join(logsDir, `error-${getDateString()}.log`),
        mkdir: true,
      },
      level: 'error',
    }
  );
}

const transports = { targets } as const;

// Create base logger
export const logger = pino({
  level: logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: transports as pino.TransportMultiOptions,
});

// Export child logger factory
export const createLogger = (
  service: string,
  context?: Record<string, unknown>
) => {
  return logger.child({ service, ...context });
};

// Export log levels for convenience
export const logLevels = {
  fatal: 'fatal',
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
  trace: 'trace',
} as const;
