'use strict';

require('dotenv').config();
const { z } = require('zod');

const schema = z.object({
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().startsWith('mysql://'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().min(1).default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default('30d'),
  APP_TIMEZONE: z.string().min(1).default('Asia/Karachi'),
  CORS_ORIGINS: z.string().default(''),
  SUPER_ADMIN_LOGIN_ID: z.string().min(1).optional(),
  SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),
  SUPER_ADMIN_NAME: z.string().min(1).optional(),
  SALARY_JOB_ACTOR_LOGIN_ID: z.string().min(1).optional(),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().min(1).optional(),
  FIREBASE_USERS_COLLECTION: z.string().min(1).default('users'),
  FIREBASE_ATTENDANCE_COLLECTION: z.string().min(1).default('attendance'),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  const fields = result.error.issues.map(issue => issue.path.join('.')).join(', ');
  throw new Error(`Invalid environment configuration: ${fields}`);
}

const values = result.data;
const corsOrigins = values.CORS_ORIGINS.split(',').map(item => item.trim()).filter(Boolean);
if (values.NODE_ENV === 'production' && (corsOrigins.length === 0 || corsOrigins.includes('*'))) {
  throw new Error('Invalid environment configuration: CORS_ORIGINS must contain explicit origins in production.');
}

module.exports = { env: { ...values, corsOrigins } };
