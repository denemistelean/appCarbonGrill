import { createHash } from 'crypto';
import { SunatEmitirDto } from './sunat.interface';
import { BuiltUbl, EmisorUbl } from './ubl-builder';
import { esc } from './xml-text.util';

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function tipoDocCliente(doc: string): string {
  const d = String(doc || '').replace(/\D/g, '');
  if (d.length === 11) return '6';
  if (d.length === 8) return '1';
  return '0';
}

/**
 * UBL 2.1 CreditNote (tipo 07).
 * Requiere datos.documento_modifica con tipo/serie/correlativo/codigo_motivo/motivo.
 */
export function buildCreditNoteUbl(datos: SunatEmitirDto, emisor: EmisorUbl): BuiltUbl {
  const codigo = '07';
  const serie = String(datos.serie || 'FC01').toUpperCase();
  const correlativo = Number(datos.correlativo || 1);
  const issueDate = new Date().toISOString().slice(0, 10);
  const issueTime = new Date().toISOString().slice(11, 19);
  const moneda = datos.moneda || 'PEN';
  const docCli = String(datos.documento_cliente || '00000000').replace(/\D/g, '') || '00000000';
  const tipDocCli = tipoDocCliente(docCli);

  const ref = datos.documento_modifica;
  if (!ref?.serie || ref.correlativo == null || !ref.codigo_motivo) {
    throw new Error('Nota de crédito requiere documento_modifica (serie, correlativo, codigo_motivo)');
  }
  const tipoDocMod =
    ref.tipo_doc_codigo ||
    (ref.tipo === 'FACTURA' ? '01' : ref.tipo === 'BOLETA' ? '03' : '01');
  const motivoCodigo = String(ref.codigo_motivo).padStart(2, '0');
  const motivoDesc = String(ref.motivo || 'Nota de crédito').slice(0, 250);

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

  const fileNameBase = `${emisor.ruc}-${codigo}-${serie}-${correlativo}`;
  const localAnexo = emisor.codigo_establecimiento || process.env.SUNAT_CODIGO_LOCAL || '0000';

  const lineXml = lines
    .map(
      (l) => `
    <cac:CreditNoteLine>
      <cbc:ID>${l.n}</cbc:ID>
      <cbc:CreditedQuantity unitCode="NIU">${l.qty.toFixed(3)}</cbc:CreditedQuantity>
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
    </cac:CreditNoteLine>`
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="ISO-8859-1" standalone="no"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
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
  <cbc:ID>${esc(serie)}-${correlativo}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:DocumentCurrencyCode>${moneda}</cbc:DocumentCurrencyCode>
  <cac:DiscrepancyResponse>
    <cbc:ReferenceID>${esc(ref.serie)}-${ref.correlativo}</cbc:ReferenceID>
    <cbc:ResponseCode>${esc(motivoCodigo)}</cbc:ResponseCode>
    <cbc:Description>${esc(motivoDesc)}</cbc:Description>
  </cac:DiscrepancyResponse>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${esc(ref.serie)}-${ref.correlativo}</cbc:ID>
      <cbc:DocumentTypeCode>${esc(tipoDocMod)}</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
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
          <cbc:AddressTypeCode>${esc(localAnexo)}</cbc:AddressTypeCode>
        </cac:RegistrationAddress>
        <cac:TaxScheme>
          <cbc:ID>${esc(emisor.ruc)}</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(emisor.razon_social)}</cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:ID>${esc(emisor.ubigeo || '130101')}</cbc:ID>
          <cbc:AddressTypeCode listAgencyName="PE:SUNAT" listName="Establecimientos anexos">${esc(localAnexo)}</cbc:AddressTypeCode>
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
</CreditNote>`;

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
