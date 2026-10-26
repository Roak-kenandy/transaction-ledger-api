import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/database.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);

const app = await buildApp({
  db,
  logger: {
    level: config.logLevel,
    ...(process.env.NODE_ENV !== 'production' && {
      transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    }),
  },
});

async function shutdown(signal: string) {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  db.close();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`API docs available at http://localhost:${config.port}/docs`);
} catch (error) {
  app.log.error(error);
  db.close();
  process.exit(1);
}
