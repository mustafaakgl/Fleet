import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

const envPath = path.resolve(__dirname, '..', '.env.e2e');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

function statusFor(...keys: string[]): 'configured' | 'missing' {
  return keys.every((key) => (process.env[key] || '').trim()) ? 'configured' : 'missing';
}

console.log(`BASE_URL: ${statusFor('BASE_URL')}`);
console.log(`ADMIN: ${statusFor('ADMIN_EMAIL', 'ADMIN_PASSWORD')}`);
console.log(`BOSS: ${statusFor('BOSS_EMAIL', 'BOSS_PASSWORD')}`);
console.log(`ACCOUNTING: ${statusFor('ACCOUNTING_EMAIL', 'ACCOUNTING_PASSWORD')}`);
console.log(`OFFICE: ${statusFor('OFFICE_EMAIL', 'OFFICE_PASSWORD')}`);
console.log(`DRIVER: ${statusFor('DRIVER_EMAIL', 'DRIVER_PASSWORD')}`);