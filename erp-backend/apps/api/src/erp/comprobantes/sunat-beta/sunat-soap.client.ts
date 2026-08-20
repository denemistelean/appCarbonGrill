import { SunatRuntimeConfig } from './sunat.config';

export type SendBillResult = {
  applicationResponseBase64?: string;
  rawXml: string;
  fault?: string;
};

function escXml(v: string): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Cliente mínimo SOAP BillService (WS-Security UsernameToken).
 * Endpoint beta: .../billService (sin ?wsdl).
 */
export async function sendBill(
  cfg: SunatRuntimeConfig,
  fileName: string,
  zipBase64: string
): Promise<SendBillResult> {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ser="http://service.sunat.gob.pe"
  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${escXml(cfg.usuarioSol)}</wsse:Username>
        <wsse:Password>${escXml(cfg.claveSol)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <ser:sendBill>
      <fileName>${escXml(fileName)}</fileName>
      <contentFile>${zipBase64}</contentFile>
    </ser:sendBill>
  </soapenv:Body>
</soapenv:Envelope>`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '',
      },
      body,
      signal: controller.signal,
    });
    const rawXml = await res.text();
    const faultMatch =
      rawXml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i) ||
      rawXml.match(/<(?:[\w-]+:)?faultstring[^>]*>([\s\S]*?)<\//i);
    const faultText = faultMatch
      ? faultMatch[1]
          .replace(/<!\[CDATA\[|\]\]>/g, '')
          .replace(/&#243;/g, 'ó')
          .replace(/&#225;/g, 'á')
          .replace(/&#233;/g, 'é')
          .replace(/&#237;/g, 'í')
          .replace(/&#250;/g, 'ú')
          .replace(/&amp;/g, '&')
          .trim()
      : null;
    const faultCode = rawXml.match(/<faultcode[^>]*>([\s\S]*?)<\/faultcode>/i)?.[1]?.trim();

    if (!res.ok || faultText) {
      const code = faultCode ? ` [${faultCode}]` : '';
      return {
        rawXml,
        fault: faultText
          ? `${faultText}${code}`
          : `HTTP ${res.status}: ${rawXml.slice(0, 400)}`,
      };
    }

    const appMatch =
      rawXml.match(/<(?:[\w-]+:)?applicationResponse[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?applicationResponse>/i) ||
      rawXml.match(/<(?:[\w-]+:)?applicationResponse[^>]*\/?>/i);
    const applicationResponseBase64 = appMatch?.[1]?.replace(/\s+/g, '') || undefined;

    return { rawXml, applicationResponseBase64 };
  } finally {
    clearTimeout(timer);
  }
}
