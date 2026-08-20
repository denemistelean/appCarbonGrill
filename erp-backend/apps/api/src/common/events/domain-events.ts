/**
 * Nombres de eventos de dominio (EventEmitter2).
 * Emitir desde services de erp/*; escuchar con @OnEvent(...) en otros módulos.
 *
 * Referencia humana: docs/EVENTS.md
 * Extensión futura (stubs): common/extensions/webhooks (IWebhookDispatcher)
 * y common/extensions/public-api — NO implementados aún.
 */
export const DomainEvents = {
  /** Evento canónico post-commit de venta POS (listener SUNAT, reportes, webhooks). */
  VENTA_CREADA: 'venta.creada',
  /** @deprecated Alias del mismo string que VENTA_CREADA — no duplicar listeners. */
  VENTA_REALIZADA: 'venta.creada',
  VENTA_ANULADA: 'venta.anulada',
  STOCK_ACTUALIZADO: 'stock.actualizado',
  STOCK_BAJO: 'stock.bajo',
  COMPRA_REGISTRADA: 'compra.registrada',
  CAJA_ABIERTA: 'caja.abierta',
  CAJA_CERRADA: 'caja.cerrada',
  INVENTARIO_AJUSTADO: 'inventario.ajustado',
  CREDITO_CREADO: 'credito.creado',
  CREDITO_CUOTA_PAGADA: 'credito.cuota_pagada',
  CREDITO_REPROGRAMADO: 'credito.reprogramado',
  CREDITO_REFINANCIADO: 'credito.refinanciado',
  ANTICIPO_REGISTRADO: 'anticipo.registrado',
  ANTICIPO_APLICADO: 'anticipo.aplicado',
  ANTICIPO_DEVUELTO: 'anticipo.devuelto',
} as const;

export type DomainEventName = (typeof DomainEvents)[keyof typeof DomainEvents];
