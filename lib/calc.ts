import type { Event, EventCalc, Exhibitor } from './types'

export function calcEvent(ev: Event): EventCalc {
  const items = ev.purchase_items ?? []
  const costTotal = items.reduce(
    (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0), 0
  )
  const targetSales = (Number(ev.selling_price) || 0) * (Number(ev.target_quantity) || 0)
  const grossProfit = targetSales - costTotal
  const grossMargin = targetSales > 0 ? grossProfit / targetSales : null
  const breakeven = Number(ev.selling_price) > 0 ? costTotal / Number(ev.selling_price) : null
  const actualSales = ev.actual_sales != null
    ? Number(ev.actual_sales)
    : ev.actual_quantity != null
      ? Number(ev.actual_quantity) * Number(ev.selling_price)
      : null
  const actualProfit = actualSales != null ? actualSales - costTotal : null
  const actualMargin = actualSales != null && actualSales > 0 ? (actualSales - costTotal) / actualSales : null
  return { costTotal, targetSales, grossProfit, grossMargin, breakeven, actualSales, actualProfit, actualMargin }
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

export function calcTotals(events: Event[], exhibitors: Exhibitor[]) {
  const ev = events.reduce((acc, e) => {
    const c = calcEvent(e)
    acc.cost += c.costTotal
    acc.targetSales += c.targetSales
    acc.targetProfit += c.grossProfit
    acc.targetQty += Number(e.target_quantity) || 0
    if (c.actualSales != null) { acc.actualSales += c.actualSales; acc.actualSalesCount++ }
    if (c.actualProfit != null) acc.actualProfit += c.actualProfit
    return acc
  }, { cost: 0, targetSales: 0, targetProfit: 0, targetQty: 0, actualSales: 0, actualProfit: 0, actualSalesCount: 0 })

  const ex = exhibitors.reduce((acc, e) => {
    acc.target += Number(e.fee_target) || 0
    if (e.fee_actual != null) { acc.actual += Number(e.fee_actual); acc.actualCount++ }
    return acc
  }, { target: 0, actual: 0, actualCount: 0 })

  return { ev, ex }
}

export function exportCSV(events: Event[], exhibitors: Exhibitor[]) {
  const rows = [
    ['【催し物別収支】'],
    ['催し物名','販売単価','目標個数','原価合計','目標売上','目標粗利','目標粗利率','損益分岐点','実績個数','実績売上','実績粗利','実績粗利率','備考'],
    ...events.map((e) => {
      const c = calcEvent(e)
      return [e.name, e.selling_price??0, e.target_quantity??0, Math.round(c.costTotal), Math.round(c.targetSales), Math.round(c.grossProfit),
        c.grossMargin!=null?(c.grossMargin*100).toFixed(1)+'%':'—', c.breakeven!=null?Math.ceil(c.breakeven):'—',
        e.actual_quantity??'未入力', c.actualSales!=null?Math.round(c.actualSales):'未入力',
        c.actualProfit!=null?Math.round(c.actualProfit):'未入力', c.actualMargin!=null?(c.actualMargin*100).toFixed(1)+'%':'—', e.notes??'']
    }),
    [],[['【出展者収入】']],
    ['出展者名','目標出展料','実績出展料','備考'],
    ...exhibitors.map((e) => [e.name, e.fee_target??0, e.fee_actual??'未入力', e.notes??'']),
  ]
  const csv = rows.map((r) => (Array.isArray(r[0]) ? r[0] : r).map((v) => `"${v}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'marche_収支_' + new Date().toLocaleDateString('ja-JP').replace(/\//g, '') + '.csv'
  a.click()
  URL.revokeObjectURL(url)
}
