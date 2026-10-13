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
