import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const url = process.env.DATABASE_URL || '';
if (!url.trim()) {
  console.error('PRISMA_CONNECTION: failed (DATABASE_URL empty)');
  process.exit(1);
}

const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
console.log(hasScheme ? 'URL_SHAPE: has_scheme' : 'URL_SHAPE: missing_scheme');

const prisma = new PrismaClient();
try {
  await prisma.$queryRaw`SELECT 1 AS ok`;
  console.log('PRISMA_CONNECTION: ok');
} catch (error) {
  console.error('PRISMA_CONNECTION: failed');
  console.error(error.name);
  const safe = String(error.message)
    .replace(/[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s'"]+/g, '[redacted]')
    .slice(0, 400);
  console.error(safe);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
