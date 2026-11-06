/**
 * Brands and popular models offered as one-tap chips when a repair is taken in (staff app, SUNMI).
 * They only help typing: the model field always accepts any text, so a phone missing from the
 * list is never a blocker.
 */
export const DEVICE_BRANDS = [
  'Apple', 'Samsung', 'OPPO', 'Xiaomi', 'Vivo', 'Realme', 'Huawei', 'Honor', 'Infinix', 'Tecno', 'Nokia',
]

export const QUICK_MODELS: Record<string, string[]> = {
  Apple: [
    'iPhone 17 Pro Max', 'iPhone 17 Pro', 'iPhone 17', 'iPhone Air', 'iPhone 16e',
    'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16', 'iPhone 15 Pro Max', 'iPhone 15', 'iPhone 14',
    'iPhone 13', 'iPhone 12', 'iPhone 11', 'iPhone XR', 'iPhone SE', 'iPad', 'iPad Air',
  ],
  Samsung: [
    'Galaxy S25 Ultra', 'Galaxy S25', 'Galaxy S24 Ultra', 'Galaxy S24', 'Galaxy A56', 'Galaxy A36',
    'Galaxy A26', 'Galaxy A16', 'Galaxy A06', 'Galaxy A55', 'Galaxy A15', 'Galaxy Z Fold7', 'Galaxy Z Flip7',
  ],
  OPPO:    ['OPPO A5', 'OPPO A3', 'OPPO A60', 'Reno14', 'Reno13', 'Reno12', 'Find X8'],
  Xiaomi:  ['Redmi 15C', 'Redmi 14C', 'Redmi Note 14', 'Redmi Note 13', 'POCO X7', 'Xiaomi 15'],
  Vivo:    ['Vivo Y19s', 'Vivo Y29', 'Vivo Y28', 'Vivo V50', 'Vivo V40'],
  Realme:  ['Realme C75', 'Realme C61', 'Realme 14', 'Realme 13', 'Realme GT7'],
  Huawei:  ['Nova 13', 'Nova 12', 'Pura 70', 'Mate 60'],
  Honor:   ['Honor X9c', 'Honor X8c', 'Honor 400', 'Honor Magic7'],
  Infinix: ['Infinix Hot 50', 'Infinix Note 50', 'Infinix Smart 9'],
  Tecno:   ['Tecno Spark 30', 'Tecno Pova 7', 'Tecno Camon 40'],
  Nokia:   ['Nokia G42', 'Nokia C32', 'Nokia 105'],
}

/** Notebooks / desktops and printers have their own makers */
const COMPUTER_BRANDS = ['Asus', 'Acer', 'Lenovo', 'HP', 'Dell', 'MSI', 'Apple', 'Huawei', 'Samsung']
const PRINTER_BRANDS = ['Canon', 'Epson', 'HP', 'Brother', 'Fuji Xerox', 'Samsung']

export const QUICK_MODELS_EXTRA: Record<string, string[]> = {
  Canon: ['PIXMA G2010', 'PIXMA G3010', 'PIXMA G3020', 'PIXMA G4010', 'PIXMA E410'],
  Epson: ['L3210', 'L3250', 'L5290', 'L4260', 'L1210'],
  Brother: ['DCP-T420W', 'DCP-T520W', 'DCP-T720DW', 'HL-L2370DN'],
  Asus: ['Vivobook 15', 'Vivobook Go 14', 'TUF Gaming A15', 'ROG Strix G16', 'Zenbook 14'],
  Acer: ['Aspire 3', 'Aspire 5', 'Aspire Lite', 'Nitro V 15', 'Swift Go 14'],
  Lenovo: ['IdeaPad Slim 3', 'IdeaPad Slim 5', 'LOQ 15', 'Legion 5', 'ThinkPad E14'],
  Dell: ['Inspiron 15', 'Vostro 14', 'Latitude 5440'],
  MSI: ['Modern 14', 'Thin GF63', 'Katana 15'],
}

/** The brand chips for a kind of device (มือถือ by default) */
export function brandsFor(deviceType?: string | null): string[] {
  if (deviceType === 'แล็ปท็อป' || deviceType === 'คอมพิวเตอร์ตั้งโต๊ะ') return COMPUTER_BRANDS
  if (deviceType === 'ปริ้นเตอร์') return PRINTER_BRANDS
  return DEVICE_BRANDS
}

/** Popular models of a brand for a kind of device: an Apple notebook is not an iPhone */
export function modelsFor(brand: string, deviceType?: string | null): string[] {
  const computer = deviceType === 'แล็ปท็อป' || deviceType === 'คอมพิวเตอร์ตั้งโต๊ะ'
  const printer = deviceType === 'ปริ้นเตอร์'
  if (computer && brand === 'Apple') return ['MacBook Air M3', 'MacBook Air M2', 'MacBook Pro 14', 'iMac 24']
  if (computer || printer) {
    if (printer && brand === 'HP') return ['Smart Tank 515', 'Smart Tank 580', 'DeskJet 2336', 'LaserJet M211']
    if (computer && brand === 'HP') return ['HP 15s', 'Victus 15', 'Pavilion 14', 'EliteBook 840']
    return QUICK_MODELS_EXTRA[brand] ?? []
  }
  return QUICK_MODELS[brand] ?? []
}
