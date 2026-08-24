'use strict';

const http = require('node:http');

const { app } = require('./app');
const { prisma } = require('./config/database');
const { env } = require('./config/env');

const server = http.createServer(app);
let shuttingDown = false;

server.listen(env.PORT, () => {
  console.log(`SmartHazri API listening on port ${env.PORT}.`);
});

const shutdown = signal => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received. Shutting down gracefully.`);
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  server.close(async error => {
    try {
      await prisma.$disconnect();
    } finally {
      if (error) console.error('HTTP shutdown failed:', error.message);
      process.exit(error ? 1 : 0);
    }
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
  shutdown('unhandledRejection');
});

module.exports = { server, shutdown };
