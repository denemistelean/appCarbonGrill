import { chromium } from 'playwright';
import { parseSunatHtml } from './parser.js';

const DEFAULT_URL =
  'https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp';

let browserPromise = null;

async function getBrowser(headless) {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless,
      args: ['--disable-dev-shm-usage', '--no-sandbox'],
    });
  }
  return browserPromise;
}

/**
 * @param {{ tipo: 'DNI'|'RUC', numero: string, timeoutMs: number, headless: boolean, sunatUrl: string }} opts
 */
export async function consultarSunat(opts) {
  const { tipo, numero, timeoutMs, headless, sunatUrl } = opts;
  const browser = await getBrowser(headless);
  const context = await browser.newContext({
    locale: 'es-PE',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);

  try {
    await page.goto(sunatUrl || DEFAULT_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    // Captcha en pantalla de criterios
    const captchaVisible = await page
      .locator('text=/c[oó]digo mostrado/i')
      .first()
      .isVisible()
      .catch(() => false);
    if (captchaVisible) {
      const err = new Error('SUNAT requiere captcha en la pantalla de búsqueda');
      err.code = 'IDENTITY_CAPTCHA';
      throw err;
    }

    if (tipo === 'RUC') {
      const btnRuc = page.locator('#btnPorRuc');
      if (await btnRuc.count()) {
        const active = await btnRuc.evaluate((el) => el.classList.contains('active')).catch(() => false);
        if (!active) await btnRuc.click();
      }
      await page.locator('#txtRuc').waitFor({ state: 'visible' });
      await page.locator('#txtRuc').fill(numero);
    } else {
      await page.locator('#btnPorDocumento').click();
      await page.locator('#txtNumeroDocumento').waitFor({ state: 'visible' });

      // Tipo documento: DNI por defecto; solo forzar si hay select/opciones distintas
      const tipoDocSelect = page.locator('select').filter({ hasText: /Documento Nacional|Identidad/i }).first();
      if (await tipoDocSelect.count()) {
        const val = await tipoDocSelect.inputValue().catch(() => '');
        const label = await tipoDocSelect.locator('option:checked').textContent().catch(() => '');
        if (!/documento nacional|dni/i.test(String(label || val))) {
          await tipoDocSelect.selectOption({ label: /Documento Nacional de Identidad/i }).catch(async () => {
            await tipoDocSelect.selectOption({ index: 0 }).catch(() => undefined);
          });
        }
      } else {
        const dniOption = page.getByText('Documento Nacional de Identidad', { exact: false }).first();
        if (await dniOption.count()) {
          // noop si ya es default visual; click solo si no parece activo
        }
      }

      await page.locator('#txtNumeroDocumento').fill(numero);
    }

    await page.locator('#btnAceptar').click();

    // Esperar resultado: list-group o mensaje negativo / error
    await Promise.race([
      page.waitForSelector('.list-group-item', { timeout: timeoutMs }),
      page.waitForSelector('text=/NO REGISTRA un n[uú]mero de RUC/i', { timeout: timeoutMs }),
      page.waitForSelector('.alert, .panel-danger, .list-group', { timeout: timeoutMs }),
    ]).catch(() => undefined);

    await page.waitForTimeout(800);

    const html = await page.content();

    if (/c[oó]digo mostrado|captcha/i.test(html) && /ingrese el c[oó]digo/i.test(html)) {
      const err = new Error('SUNAT mostró captcha tras buscar');
      err.code = 'IDENTITY_CAPTCHA';
      throw err;
    }

    return parseSunatHtml(html, tipo, numero);
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    browserPromise = null;
    await b.close().catch(() => undefined);
  }
}
