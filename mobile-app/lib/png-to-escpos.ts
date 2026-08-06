import { decode } from 'fast-png'

const PRINT_W = 384     // 58 mm at 203 dpi
const BPL     = PRINT_W >> 3  // bytes per raster line = 48

/**
 * Convert a base64 PNG screenshot to a complete ESC/POS bitmap print job.
 * Uses GS v 0 raster mode — compatible with any ESC/POS thermal printer.
 * Trailing all-white rows are trimmed automatically to avoid wasting paper.
 *
 * @param base64  Raw base64 (no "data:..." prefix) from react-native-view-shot
 * @param copies  Number of copies to print back-to-back (default 1)
 */
export function pngBase64ToEscPosJob(base64: string, copies = 1): Buffer {
  const buf = Buffer.from(base64, 'base64')
  const png = decode(buf as unknown as Uint8Array)

  const { width, height } = png
  const channels = (png as any).channels ?? 4
  const src = png.data as Uint8Array

  let lastInkRow = 20       // keep at least 20 rows even if all white
  const rows: Buffer[] = []

  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(BPL, 0)
    let hasInk = false

    for (let x = 0; x < Math.min(width, PRINT_W); x++) {
      const base = (y * width + x) * channels
      const lum =
        channels === 1
          ? src[base]                                                           // grayscale
          : 0.299 * src[base] + 0.587 * src[base + 1] + 0.114 * src[base + 2] // RGB/RGBA

      if (lum < 200) {          // dark pixel → set print dot
        row[x >> 3] |= 0x80 >> (x & 7)
        hasInk = true
      }
    }

    rows.push(row)
    if (hasInk) lastInkRow = y
  }

  // Trim: content rows + 48px bottom margin, capped to actual image height
  const ph     = Math.min(lastInkRow + 48, height)
  const bitmap = Buffer.concat(rows.slice(0, ph))

  const xL = BPL & 0xFF, xH = 0
  const yL = ph  & 0xFF, yH = (ph >> 8) & 0xFF

  // One copy block: set minimal spacing → GS v 0 bitmap → restore spacing → feed+cut
  const copyBlock = Buffer.concat([
    Buffer.from([0x1B, 0x33, 0x00]),                            // ESC 3 0  minimal line spacing
    Buffer.from([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH]),     // GS v 0  raster bitmap
    bitmap,
    Buffer.from([0x1B, 0x32]),                                  // ESC 2  default spacing
    Buffer.from([0x0A, 0x0A, 0x0A]),                            // 3 line feeds
    Buffer.from([0x1D, 0x56, 0x41, 0x03]),                      // GS V A 3  full cut
  ])

  const parts: Buffer[] = [Buffer.from([0x1B, 0x40])]           // ESC @  init printer (once)
  for (let i = 0; i < copies; i++) parts.push(copyBlock)
  return Buffer.concat(parts)
}
