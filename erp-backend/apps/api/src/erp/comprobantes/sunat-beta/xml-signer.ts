import { readFileSync } from 'fs';
import { SignedXml } from 'xml-crypto';
import * as forge from 'node-forge';

type KeyMaterial = { privateKeyPem: string; certPem: string };

/**
 * Firma UBL para SUNAT (beta/prod).
 * Requisitos típicos SUNAT:
 * - ds:Signature Id="SignatureSP" dentro de ExtensionContent
 * - Reference URI="" (vacío)
 * - enveloped-signature + C14N
 * - KeyInfo con ds:X509Data/ds:X509Certificate
 */
export function signUblXml(xml: string, certPath: string, certPassword: string): string {
  if (!certPath) {
    throw new Error(
      'SUNAT_CERT_PATH no configurado: use certs/greenter-certificate.pem (demo Greenter) o un PFX'
    );
  }

  const { privateKeyPem, certPem } = loadKeyMaterial(certPath, certPassword);

  const certB64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');

  const withExtension = xml
    .replace(/<ext:ExtensionContent\s*\/>/g, '<ext:ExtensionContent></ext:ExtensionContent>')
    // Evitar Id="_0" que xml-crypto pone al referenciar el root
    .replace(/\sId="_0"/g, '');

  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    getKeyInfoContent: (args) => {
      const p = args?.prefix ? `${args.prefix}:` : 'ds:';
      return `<${p}X509Data><${p}X509Certificate>${certB64}</${p}X509Certificate></${p}X509Data>`;
    },
  });

  sig.addReference({
    xpath: "/*[local-name(.)='Invoice' or local-name(.)='CreditNote' or local-name(.)='DebitNote']",
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    uri: '',
    isEmptyUri: true,
  });

  sig.computeSignature(withExtension, {
    prefix: 'ds',
    attrs: { Id: 'SignatureSP' },
    location: {
      reference: "//*[local-name(.)='ExtensionContent']",
      action: 'append',
    },
    existingPrefixes: { ds: 'http://www.w3.org/2000/09/xmldsig#' },
  });

  return sig.getSignedXml();
}

function loadKeyMaterial(certPath: string, certPassword: string): KeyMaterial {
  const raw = readFileSync(certPath);
  const asText = raw.toString('utf8');
  const lower = certPath.toLowerCase();

  if (lower.endsWith('.pem') || asText.includes('BEGIN')) {
    return loadFromPem(asText, certPassword);
  }
  return loadFromPfx(raw, certPassword);
}

function loadFromPem(pem: string, password: string): KeyMaterial {
  const certPemMatch = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
  if (!certPemMatch) throw new Error('PEM inválido: no se encontró CERTIFICATE');

  let privateKeyPem = '';
  const encKey = pem.match(
    /-----BEGIN ENCRYPTED PRIVATE KEY-----[\s\S]+?-----END ENCRYPTED PRIVATE KEY-----/
  );
  const pkcs8 = pem.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/);
  const rsa = pem.match(/-----BEGIN RSA PRIVATE KEY-----[\s\S]+?-----END RSA PRIVATE KEY-----/);

  if (encKey) {
    const key = forge.pki.decryptRsaPrivateKey(encKey[0], password || '');
    if (!key) throw new Error('No se pudo descifrar la llave PEM (revise SUNAT_CERT_PASSWORD)');
    privateKeyPem = forge.pki.privateKeyToPem(key);
  } else if (pkcs8) {
    privateKeyPem = pkcs8[0];
  } else if (rsa) {
    privateKeyPem = rsa[0];
  } else {
    throw new Error('PEM inválido: no se encontró PRIVATE KEY');
  }

  return { privateKeyPem, certPem: certPemMatch[0] };
}

function loadFromPfx(pfx: Buffer, certPassword: string): KeyMaterial {
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, certPassword || '');

  let privateKeyPem = '';
  let certPem = '';

  for (const safeContent of p12.safeContents) {
    for (const safeBag of safeContent.safeBags) {
      if (
        (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag ||
          safeBag.type === forge.pki.oids.keyBag) &&
        safeBag.key
      ) {
        privateKeyPem = forge.pki.privateKeyToPem(safeBag.key);
      }
      if (safeBag.type === forge.pki.oids.certBag && safeBag.cert) {
        certPem = forge.pki.certificateToPem(safeBag.cert);
      }
    }
  }

  if (!privateKeyPem || !certPem) {
    throw new Error('No se pudo extraer llave/certificado del PFX');
  }
  return { privateKeyPem, certPem };
}
