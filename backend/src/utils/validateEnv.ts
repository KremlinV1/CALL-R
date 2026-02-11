/**
 * Validate required environment variables on startup.
 * In production, missing critical vars cause a hard failure.
 * In development, warnings are logged instead.
 */
export function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';

  const critical = [
    { key: 'DATABASE_URL', hint: 'PostgreSQL connection string' },
    { key: 'JWT_SECRET', hint: 'Secret for signing JWTs (min 32 chars)', validate: (v: string) => v.length >= 32 && v !== 'your-super-secret-jwt-key-change-in-production' },
    { key: 'ENCRYPTION_KEY', hint: 'AES-256 encryption key (32 hex chars)', validate: (v: string) => v.length === 32 },
  ];

  const recommended = [
    { key: 'FRONTEND_URL', hint: 'Frontend origin for CORS (e.g. https://app.example.com)' },
  ];

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const { key, hint, validate } of critical as Array<{ key: string; hint: string; validate?: (v: string) => boolean }>) {
    const val = process.env[key];
    if (!val) {
      errors.push(`  ✗ ${key} — ${hint}`);
    } else if (validate && !validate(val)) {
      errors.push(`  ✗ ${key} — invalid value (${hint})`);
    }
  }

  for (const { key, hint } of recommended) {
    if (!process.env[key]) {
      warnings.push(`  ⚠ ${key} — ${hint}`);
    }
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  Missing recommended environment variables:');
    warnings.forEach(w => console.warn(w));
  }

  if (errors.length > 0) {
    if (isProd) {
      console.error('\n❌ Missing or invalid required environment variables:');
      errors.forEach(e => console.error(e));
      console.error('\nServer cannot start in production without these. Exiting.\n');
      process.exit(1);
    } else {
      console.warn('\n⚠️  Missing or invalid environment variables (would fail in production):');
      errors.forEach(e => console.warn(e));
      console.warn('');
    }
  }
}
