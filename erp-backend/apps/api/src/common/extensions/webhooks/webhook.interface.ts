import type { DomainEventName } from '../../events/domain-events';

/**
 * Dispatcher de webhooks salientes (extensión futura).
 * Punto de extensión documentado en docs/EVENTS.md.
 */
export interface IWebhookDispatcher {
  dispatch(event: DomainEventName | string, payload: unknown): Promise<void>;
}

export const WEBHOOK_DISPATCHER = Symbol('WEBHOOK_DISPATCHER');
