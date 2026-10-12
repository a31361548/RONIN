// Decimal strings cross the file boundary; arithmetic uses integer cents.
export function moneyToCents(value: string): number {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) throw new Error('金額需為最多兩位小數的數字')
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) throw new Error('金額超過可處理範圍')
  return negative ? -cents : cents
}

export function centsToMoney(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('金額超過可處理範圍')
  const absolute = Math.abs(cents)
  return `${cents < 0 ? '-' : ''}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}

export function normalizeMoney(value: string): string {
  return centsToMoney(moneyToCents(value))
}

export function taipeiDate(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function formatMoney(value: string): string {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 2 }).format(moneyToCents(value) / 100)
}
