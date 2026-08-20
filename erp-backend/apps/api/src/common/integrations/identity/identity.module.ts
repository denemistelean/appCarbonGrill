import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { loadIdentityConfig } from './identity.config';
import { IdentityService } from './identity.service';
import { IDENTITY_PROVIDER, IDENTITY_SERVICE } from './identity.tokens';
import { MockIdentityProvider } from './providers/mock-identity.provider';
import { HttpIdentityProvider } from './providers/http-identity.provider';
import type { IIdentityProvider } from './providers/identity-provider.interface';

@Module({
  imports: [
    CacheModule.registerAsync({
      useFactory: () => {
        const cfg = loadIdentityConfig();
        return { ttl: cfg.cacheTtlSeconds * 1000, max: 2000 };
      },
    }),
  ],
  providers: [
    MockIdentityProvider,
    HttpIdentityProvider,
    {
      provide: IDENTITY_PROVIDER,
      useFactory: (mock: MockIdentityProvider, http: HttpIdentityProvider): IIdentityProvider => {
        return loadIdentityConfig().provider === 'http' ? http : mock;
      },
      inject: [MockIdentityProvider, HttpIdentityProvider],
    },
    IdentityService,
    { provide: IDENTITY_SERVICE, useExisting: IdentityService },
  ],
  exports: [IDENTITY_SERVICE],
})
export class IdentityModule {}
