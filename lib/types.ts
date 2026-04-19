import type { Event, EventCalc, Exhibitor, OtherExpense } from './types'

export function calcEvent(ev: Event): EventCalc {
  const items = ev.purchase_items ?? []
  const costTotal = items.reduce((s, it) => s + (it.amount_override != null ? Number(it.amount_override) : (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0)), 0)
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

export function calcMarcheSummary(
  events: Event[],
  exhibitors: Exhibitor[],
  otherExpenses: OtherExpense[]
) {
  const eventCostTotal = events.reduce((s, ev) => s + calcEvent(ev).costTotal, 0)
  const otherExpenseTotal = otherExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const totalCost = eventCostTotal + otherExpenseTotal

  const targetEventSales = events.reduce((s, ev) => s + calcEvent(ev).targetSales, 0)
  const targetExhibitorFee = exhibitors.reduce((s, ex) => s + (Number(ex.fee_target) || 0), 0)
  const targetIncome = targetEventSales + targetExhibitorFee
  const targetProfit = targetIncome - totalCost
  const targetMargin = targetIncome > 0 ? targetProfit / targetIncome : null

  // 実績（全催し物に実績があれば集計）
  const eventsWithActual = events.filter((ev) => calcEvent(ev).actualSales != null)
  const actualEventSales = eventsWithActual.reduce((s, ev) => s + (calcEvent(ev).actualSales ?? 0), 0)
  const exhibitorsWithActual = exhibitors.filter((ex) => ex.fee_actual != null)
  const actualExhibitorFee = exhibitorsWithActual.reduce((s, ex) => s + (Number(ex.fee_actual) || 0), 0)
  const hasAnyActual = eventsWithActual.length > 0 || exhibitorsWithActual.length > 0
  const actualIncome = hasAnyActual ? actualEventSales + actualExhibitorFee : null
  const actualProfit = actualIncome != null ? actualIncome - totalCost : null
  const actualMargin = actualIncome != null && actualIncome > 0 ? actualProfit! / actualIncome : null

  return {
    eventCostTotal,
    otherExpenseTotal,
    totalCost,
    targetEventSales,
    targetExhibitorFee,
    targetIncome,
    targetProfit,
    targetMargin,
    actualEventSales: hasAnyActual ? actualEventSales : null,
    actualExhibitorFee: hasAnyActual ? actualExhibitorFee : null,
    actualIncome,
    actualProfit,
    actualMargin,
    eventsWithActualCount: eventsWithActual.length,
    totalEvents: events.length,
  }
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

export function exportSettlementCSV(
  marche: { name: string; date?: string | null },
  events: Event[],
  exhibitors: Exhibitor[],
  otherExpenses: OtherExpense[]
) {
  const summary = calcMarcheSummary(events, exhibitors, otherExpenses)
  const rows: (string | number)[][] = [
    [`【${marche.name} 決算報告書】`],
    [`開催日: ${marche.date ?? '—'}`],
    [],
    ['■ 収入'],
    ['項目', '目標', '実績', '差額'],
    ['催し物収入', summary.targetEventSales, summary.actualEventSales ?? '未入力', summary.actualEventSales != null ? summary.actualEventSales - summary.targetEventSales : '—'],
    ['出展者収入', summary.targetExhibitorFee, summary.actualExhibitorFee ?? '未入力', summary.actualExhibitorFee != null ? summary.actualExhibitorFee - summary.targetExhibitorFee : '—'],
    ['収入合計', summary.targetIncome, summary.actualIncome ?? '未入力', summary.actualIncome != null ? summary.actualIncome - summary.targetIncome : '—'],
    [],
    ['■ 支出'],
    ['項目', '金額'],
    ['催し物原価合計', summary.eventCostTotal],
    ...otherExpenses.map((e) => [e.description, e.amount]),
    ['支出合計', summary.totalCost],
    [],
    ['■ 損益'],
    ['項目', '目標', '実績'],
    ['粗利', summary.targetProfit, summary.actualProfit ?? '未入力'],
    ['粗利率', summary.targetMargin != null ? (summary.targetMargin * 100).toFixed(1) + '%' : '—', summary.actualMargin != null ? (summary.actualMargin * 100).toFixed(1) + '%' : '—'],
    [],
    ['■ 催し物別実績'],
    ['催し物名', '原価', '目標売上', '実績売上', '目標粗利', '実績粗利', '達成率'],
    ...events.map((ev) => {
      const c = calcEvent(ev)
      const achieveRate = c.targetSales > 0 && c.actualSales != null ? ((c.actualSales / c.targetSales) * 100).toFixed(0) + '%' : '—'
      return [ev.name, Math.round(c.costTotal), Math.round(c.targetSales), c.actualSales != null ? Math.round(c.actualSales) : '未入力', Math.round(c.grossProfit), c.actualProfit != null ? Math.round(c.actualProfit) : '未入力', achieveRate]
    }),
    [],
    ['■ 出展者別実績'],
    ['出展者名', '目標出展料', '実績出展料', '差額'],
    ...exhibitors.map((ex) => [ex.name, ex.fee_target, ex.fee_actual ?? '未入力', ex.fee_actual != null ? ex.fee_actual - ex.fee_target : '—']),
  ]

  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${marche.name}_決算報告_${new Date().toLocaleDateString('ja-JP').replace(/\//g, '')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
