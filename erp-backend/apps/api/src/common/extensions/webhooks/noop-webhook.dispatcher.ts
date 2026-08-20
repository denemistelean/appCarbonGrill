import { Injectable, Logger } from '@nestjs/common';
import type { IWebhookDispatcher } from './webhook.interface';

/**
 * Noop: solo log. NO registrar en ApiModule hasta WEBHOOKS_ENABLED=true
 * con implementación HTTP real.
 */
@Injectable()
export class NoopWebhookDispatcher implements IWebhookDispatcher {
  private readonly logger = new Logger(NoopWebhookDispatcher.name);

  async dispatch(event: string, payload: unknown): Promise<void> {
    if (String(process.env.WEBHOOKS_ENABLED || 'false').toLowerCase() === 'true') {
      this.logger.debug(`Webhook noop (sin HTTP): ${event} ${JSON.stringify(payload)?.slice(0, 200)}`);
    }
  }
}
