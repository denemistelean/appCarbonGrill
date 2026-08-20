export type IdentityProviderName = 'mock' | 'http';

export type IdentityConfig = {
  provider: IdentityProviderName;
  timeoutMs: number;
  retries: number;
  cacheTtlSeconds: number;
  httpUrl: string;
};

export function loadIdentityConfig(): IdentityConfig {
  const raw = String(process.env.IDENTITY_PROVIDER || 'mock').trim().toLowerCase();
  const provider: IdentityProviderName = raw === 'http' ? 'http' : 'mock';
  return {
    provider,
    timeoutMs: positiveInt(process.env.IDENTITY_TIMEOUT_MS, provider === 'http' ? 50000 : 8000),
    retries: Math.max(0, positiveInt(process.env.IDENTITY_RETRIES, 2)),
    cacheTtlSeconds: positiveInt(process.env.IDENTITY_CACHE_TTL_SECONDS, 3600),
    httpUrl: String(process.env.IDENTITY_HTTP_URL || 'http://127.0.0.1:3791').trim(),
  };
}

function positiveInt(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
