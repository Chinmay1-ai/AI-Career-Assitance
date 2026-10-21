import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env' });

const hasUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());

if (!hasUrl) {
  console.log('Prisma connection: FAILED');
  console.log('Reason: DATABASE_URL is not set');
  process.exit(1);
}

function safeMessage(err) {
  const raw = String(err && err.message ? err.message : err);
  return raw
    .replace(/postgresql:\/\/[^\s]+/gi, '[redacted]')
    .replace(/postgres:\/\/[^\s]+/gi, '[redacted]')
    .slice(0, 240);
}

const prisma = new PrismaClient();

try {
  await prisma.$queryRaw`SELECT 1 AS ok`;
  console.log('Prisma connection: OK');
} catch (err) {
  console.log('Prisma connection: FAILED');
  console.log('Error name:', err && err.name ? err.name : 'Error');
  console.log('Safe message:', safeMessage(err));
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
