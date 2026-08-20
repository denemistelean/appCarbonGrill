import { createHash } from 'crypto';
import { SunatEmitirDto, SunatTipoComprobante } from './sunat.interface';
import { esc } from './xml-text.util';

export type EmisorUbl = {
  ruc: string;
  razon_social: string;
  nombre_comercial?: string | null;
  direccion?: string | null;
  ubigeo?: string | null;
  distrito?: string | null;
  provincia?: string | null;
  departamento?: string | null;
  codigo_establecimiento?: string | null;
};

export type BuiltUbl = {
  xml: string;
  fileNameBase: string;
  tipoCodigo: string;
  serie: string;
  correlativo: number;
  digestPreview: string;
  totales: { gravado: number; igv: number; total: number };
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function tipoCodigo(tipo: SunatTipoComprobante): string {
  if (tipo === 'FACTURA') return '01';
  if (tipo === 'BOLETA') return '03';
  if (tipo === 'NOTA_CREDITO') return '07';
  if (tipo === 'NOTA_DEBITO') return '08';
  return '03';
}

function tipoDocCliente(doc: string): string {
  const d = String(doc || '').replace(/\D/g, '');
  if (d.length === 11) return '6';
  if (d.length === 8) return '1';
  return '0';
}

/**
 * Construye UBL 2.1 Invoice (boleta/factura) con líneas desde precios INC IGV.
 */
export function buildInvoiceUbl(datos: SunatEmitirDto, emisor: EmisorUbl): BuiltUbl {
  const tipo = datos.tipo || 'BOLETA';
  const codigo = tipoCodigo(tipo);
  const serie = String(datos.serie || (tipo === 'FACTURA' ? 'F001' : 'B001')).toUpperCase();
  const correlativo = Number(datos.correlativo || 1);
  const issueDate = new Date().toISOString().slice(0, 10);
  const issueTime = new Date().toISOString().slice(11, 19);
  const moneda = datos.moneda || 'PEN';
  const docCli = String(datos.documento_cliente || '00000000').replace(/\D/g, '') || '00000000';
  const tipDocCli = tipoDocCliente(docCli);

  const lines = (datos.items || []).map((item, idx) => {
    const qty = Number(item.cantidad) || 0;
    const precioInc = Number(item.valor_unitario) || 0;
    const valorUnit = round2(precioInc / 1.18);
    const valorVenta = round2(valorUnit * qty);
    const igv = round2(valorVenta * 0.18);
    const precioVenta = round2(precioInc);
    return {
      n: idx + 1,
      codigo: item.codigo || `ITEM${idx + 1}`,
      descripcion: item.descripcion || 'ITEM',
      qty,
      valorUnit,
      valorVenta,
      igv,
      precioVenta,
    };
  });

  const gravado = round2(lines.reduce((s, l) => s + l.valorVenta, 0));
  const igv = round2(lines.reduce((s, l) => s + l.igv, 0));
  const total =
    datos.totales?.total != null && Number(datos.totales.total) > 0
      ? round2(Number(datos.totales.total))
      : round2(gravado + igv);

  // Mismo correlativo en nombre ZIP/XML y cbc:ID (sin pad 8). Ej. válido: 20481099936-01-FF01-6945 / FF01-6945
  const fileNameBase = `${emisor.ruc}-${codigo}-${serie}-${correlativo}`;

  const lineXml = lines
    .map(
      (l) => `
    <cac:InvoiceLine>
      <cbc:ID>${l.n}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="NIU">${l.qty.toFixed(3)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${moneda}">${l.valorVenta.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:PricingReference>
        <cac:AlternativeConditionPrice>
          <cbc:PriceAmount currencyID="${moneda}">${l.precioVenta.toFixed(2)}</cbc:PriceAmount>
          <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
        </cac:AlternativeConditionPrice>
      </cac:PricingReference>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${moneda}">${l.igv.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${moneda}">${l.valorVenta.toFixed(2)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${moneda}">${l.igv.toFixed(2)}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:Percent>18.00</cbc:Percent>
            <cbc:TaxExemptionReasonCode>10</cbc:TaxExemptionReasonCode>
            <cac:TaxScheme>
              <cbc:ID>1000</cbc:ID>
              <cbc:Name>IGV</cbc:Name>
              <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Description>${esc(l.descripcion)}</cbc:Description>
        <cac:SellersItemIdentification>
          <cbc:ID>${esc(l.codigo)}</cbc:ID>
        </cac:SellersItemIdentification>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${moneda}">${l.valorUnit.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="ISO-8859-1" standalone="no"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ProfileID schemeName="Tipo de Operacion" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo51">0101</cbc:ProfileID>
  <cbc:ID>${esc(serie)}-${correlativo}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01" listID="0101" name="Tipo de Operacion" listSchemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo51">${codigo}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${moneda}</cbc:DocumentCurrencyCode>
  <cac:Signature>
    <cbc:ID>${esc(emisor.ruc)}</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID>${esc(emisor.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${esc(emisor.razon_social)}</cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#SignatureSP</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${esc(emisor.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${esc(emisor.nombre_comercial || emisor.razon_social)}</cbc:Name>
      </cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${esc(emisor.razon_social)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="6">${esc(emisor.ruc)}</cbc:CompanyID>
        <cac:RegistrationAddress>
          <cbc:AddressTypeCode>${esc(emisor.codigo_establecimiento || process.env.SUNAT_CODIGO_LOCAL || '0000')}</cbc:AddressTypeCode>
        </cac:RegistrationAddress>
        <cac:TaxScheme>
          <cbc:ID>${esc(emisor.ruc)}</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(emisor.razon_social)}</cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:ID>${esc(emisor.ubigeo || '130101')}</cbc:ID>
          <cbc:AddressTypeCode listAgencyName="PE:SUNAT" listName="Establecimientos anexos">${esc(emisor.codigo_establecimiento || process.env.SUNAT_CODIGO_LOCAL || '0000')}</cbc:AddressTypeCode>
          <cbc:CityName>${esc(emisor.departamento || 'LA LIBERTAD')}</cbc:CityName>
          <cbc:CountrySubentity>${esc(emisor.provincia || 'TRUJILLO')}</cbc:CountrySubentity>
          <cbc:District>${esc(emisor.distrito || 'TRUJILLO')}</cbc:District>
          <cac:AddressLine>
            <cbc:Line>${esc(emisor.direccion || '-')}</cbc:Line>
          </cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode>PE</cbc:IdentificationCode>
          </cac:Country>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${tipDocCli}">${esc(docCli)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(datos.razon_social_cliente || 'CLIENTE')}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>
  </cac:PaymentTerms>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${moneda}">${igv.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${moneda}">${gravado.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${moneda}">${igv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:ID>1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${moneda}">${gravado.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${moneda}">${total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${moneda}">${total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lineXml}
</Invoice>`;

  return {
    xml,
    fileNameBase,
    tipoCodigo: codigo,
    serie,
    correlativo,
    digestPreview: createHash('sha256').update(xml).digest('hex').slice(0, 40),
    totales: { gravado, igv, total },
  };
}
