// @ts-check
/**
 * Auditoría automática de accesibilidad con axe-core (WCAG2 A/AA), con foco
 * en contraste de color — pedido explícito del usuario tras el rebranding a
 * rojo ("sin auditoría de contraste automática... se verificó a mano, no
 * cada combinación").
 *
 * No es parte de la suite de `npm test` (necesita Chromium + el sitio
 * corriendo en localhost:8000, `npm run serve`) — se corre a mano:
 *
 *   npm run serve   (en otra terminal, déjalo corriendo)
 *   npm run audit:a11y
 */
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = 'http://127.0.0.1:8000';
const PAGINAS = [
  '/', '/catalogo.html', '/servicios.html', '/cobertura.html',
  '/nosotros.html', '/contacto.html', '/aviso-legal.html',
  '/cookies.html', '/privacidad.html', '/offline.html',
];
const VIEWPORTS = [
  { nombre: 'móvil', width: 375, height: 812 },
  { nombre: 'escritorio', width: 1440, height: 900 },
];

/** @param {import('playwright').Page} page */
async function abrirMenuMovil(page) {
  // El menú hamburguesa cambia el fondo/los colores del nav — vale la pena
  // auditarlo abierto, no solo cerrado.
  const toggle = page.locator('[data-nav-toggle]');
  if (await toggle.count()) {
    await toggle.first().click().catch(() => {});
    await page.waitForTimeout(150);
  }
}

async function main() {
  const browser = await chromium.launch();
  /** @type {Array<{pagina: string, viewport: string, id: string, impact: string, help: string, nodos: string[]}>} */
  const hallazgos = [];
  let totalChecks = 0;

  for (const viewport of VIEWPORTS) {
    // Sin esto, el service worker que registra la primera página intercepta
    // la navegación siguiente y su instalación (cachea ~8 archivos del shell,
    // uno por uno) se cuelga contra el servidor PHP embebido de este entorno
    // (php -S, un solo hilo) — colgaba justo catalogo.html en cada corrida,
    // siempre la segunda página visitada. Artefacto del dev server local, no
    // pasaría contra Apache/cPanel en producción, pero bloquear el SW acá
    // evita el timeout y dedica el tiempo a medir contraste, no a esperarlo.
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();

    for (const ruta of PAGINAS) {
      try {
        // Ni 'networkidle' ni 'load' resuelven de forma confiable en catalogo.html
        // (reintentos de fetch de productos sin BD local mantienen actividad de
        // red). 'domcontentloaded' + una espera fija después es suficiente para
        // que el contenido editable (fetch a la API) se asiente antes de medir.
        await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(900);
        if (viewport.nombre === 'móvil') await abrirMenuMovil(page);

        const resultados = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze();

        totalChecks++;
        for (const v of resultados.violations) {
          hallazgos.push({
            pagina: ruta,
            viewport: viewport.nombre,
            id: v.id,
            impact: v.impact ?? 'desconocido',
            help: v.help,
            nodos: v.nodes.map((n) => n.target.join(' ')),
          });
        }
      } catch (e) {
        // Una página que no carga no debe tirar abajo la auditoría entera de
        // las demás — se reporta al final como error, no como hallazgo WCAG.
        console.error(`⚠ ${ruta} [${viewport.nombre}]: ${e instanceof Error ? e.message : e}`);
      }
    }
    await context.close();
  }

  await browser.close();

  console.log(`\nAuditoría completa: ${totalChecks} cargas de página (${PAGINAS.length} páginas × ${VIEWPORTS.length} viewports).\n`);

  if (hallazgos.length === 0) {
    console.log('Sin violaciones WCAG2 A/AA en ninguna página/viewport.');
    return;
  }

  const porRegla = new Map();
  for (const h of hallazgos) {
    if (!porRegla.has(h.id)) porRegla.set(h.id, []);
    porRegla.get(h.id).push(h);
  }

  console.log(`${hallazgos.length} violaciones encontradas, agrupadas por regla:\n`);
  for (const [id, items] of porRegla) {
    console.log(`\n▶ ${id} (${items[0].impact}) — ${items[0].help}`);
    for (const it of items) {
      console.log(`  ${it.pagina} [${it.viewport}]: ${it.nodos.join(' | ')}`);
    }
  }

  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
