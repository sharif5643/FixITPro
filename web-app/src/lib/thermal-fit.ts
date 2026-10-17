/** Dots across the paper the app's printer path draws (58mm @ 203 dpi); the plugin's bitmap is this wide. */
export const APP_PRINTER_DOTS = 384

/**
 * The app plugin draws every receipt in a 384-px wide WebView. A receipt built for 80mm paper (576 px,
 * the shop's paper setting) would lose its right-hand third — the amounts. Shrink such a page to fit;
 * pages already 384 px or without a fixed width (web receipts captured from the page) are left as they are.
 */
export function fitHtmlToAppPrinter(html: string, dots = APP_PRINTER_DOTS): string {
  // Only the receipts built in lib/printer.ts: their body is a fixed width, sized to the content
  const m = /body\s*\{[^}]*?\bwidth:\s*(\d+)px;\s*height:\s*fit-content/.exec(html)
  const width = m ? Number(m[1]) : 0
  if (!width || width <= dots) return html
  const style = `<style>html{zoom:${(dots / width).toFixed(4)}}</style>`
  return html.includes('</head>') ? html.replace('</head>', `${style}</head>`) : style + html
}
