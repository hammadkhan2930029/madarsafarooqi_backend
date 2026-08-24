'use strict';

require('dotenv').config();
const { PrismaClient, RecordStatus, UserRole } = require('@prisma/client');
const { hashPassword } = require('../src/utils/password');

const prisma = new PrismaClient();

const main = async () => {
  const loginId = process.env.SUPER_ADMIN_LOGIN_ID?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME?.trim();
  if (!loginId || !password || !name) {
    throw new Error('SUPER_ADMIN_LOGIN_ID, SUPER_ADMIN_PASSWORD and SUPER_ADMIN_NAME are required.');
  }
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { loginId },
    update: { name, passwordHash, role: UserRole.SUPER_ADMIN, status: RecordStatus.ACTIVE },
    create: { loginId, name, passwordHash, role: UserRole.SUPER_ADMIN, status: RecordStatus.ACTIVE },
  });
  console.log('Super Admin seed completed.');
};

main().catch(error => {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
