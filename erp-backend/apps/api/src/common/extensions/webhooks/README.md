# Webhooks salientes (stub)

Mapeo 1:1 con `DomainEvents` (`docs/EVENTS.md`).

- Implementación Noop en `noop-webhook.dispatcher.ts` (solo log).
- **No** registrada en `ApiModule` por defecto.
- Env previsto: `WEBHOOKS_ENABLED=false`.

Cuando se active: un listener genérico `@OnEvent(**)` o por evento llamará
`IWebhookDispatcher.dispatch(event, payload)` sin acoplar POS a HTTP.
