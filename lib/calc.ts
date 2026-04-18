import type { Event, EventCalc } from './types'

export function calcEvent(ev: Event): EventCalc {
  const items = ev.purchase_items ?? []
  const costTotal = items.reduce(
    (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0),
    0
  )
  const targetSales =
    (Number(ev.selling_price) || 0) * (Number(ev.target_quantity) || 0)
  const grossProfit = targetSales - costTotal
  const grossMargin = targetSales > 0 ? grossProfit / targetSales : null
  const breakeven =
    Number(ev.selling_price) > 0
      ? costTotal / Number(ev.selling_price)
      : null
  return { costTotal, targetSales, grossProfit, grossMargin, breakeven }
}

export const fmt = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return '—'
  return '¥' + Math.round(n).toLocaleString('ja-JP')
}

export const pct = (n: number | null | undefined): string => {
  if (n == null || isNaN(n) || !isFinite(n)) return '—'
  return (n * 100).toFixed(1) + '%'
}

export const bep = (n: number | null | undefined): string => {
  if (n == null || isNaN(n) || !isFinite(n) || n <= 0) return '—'
  return Math.ceil(n) + '個'
}

export function exportCSV(events: Event[]) {
  const rows = [
    ['催し物名', '販売単価', '目標個数', '原価合計', '目標売上', '粗利', '粗利率', '損益分岐点', '備考'],
    ...events.map((ev) => {
      const c = calcEvent(ev)
      return [
        ev.name,
        ev.selling_price ?? 0,
        ev.target_quantity ?? 0,
        Math.round(c.costTotal),
        Math.round(c.targetSales),
        Math.round(c.grossProfit),
        c.grossMargin != null ? (c.grossMargin * 100).toFixed(1) + '%' : '—',
        c.breakeven != null ? Math.ceil(c.breakeven) : '—',
        ev.notes ?? '',
      ]
    }),
  ]
  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download =
    'marche_収支_' +
    new Date().toLocaleDateString('ja-JP').replace(/\//g, '') +
    '.csv'
  a.click()
  URL.revokeObjectURL(url)
}
