/**
 * Type for thermal receipts (58 / 80 mm), the same on every device: the phone's or computer's
 * own sans-serif for Latin and digits, a Thai sans-serif for Thai, digits of equal width so
 * prices line up. A monospace face (Courier) has no Thai on Android or Windows, so Thai fell back
 * to another font and the receipt read like a typewriter; this is the look of a native POS slip.
 */
export const THERMAL_FONT_FAMILY =
  `Roboto, 'Helvetica Neue', Arial, 'Noto Sans Thai', 'Leelawadee UI', Tahoma, sans-serif`
