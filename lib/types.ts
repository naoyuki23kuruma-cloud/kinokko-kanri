export type PurchaseItem = {
  id: string
  event_id: string
  item_name: string
  quantity: number
  unit_cost: number
  created_at?: string
}

export type Event = {
  id: string
  name: string
  selling_price: number
  target_quantity: number
  notes: string
  created_at?: string
  purchase_items?: PurchaseItem[]
}

export type EventCalc = {
  costTotal: number
  targetSales: number
  grossProfit: number
  grossMargin: number | null
  breakeven: number | null
}
