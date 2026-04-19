'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { calcEvent, calcTotals, fmt, pct, bep, exportCSV } from '@/lib/calc'
import type { Event, Exhibitor } from '@/lib/types'

// ─── 端数処理 ──────────────────────────────────────────────
type RoundMode = 'round' | 'floor' | 'ceil'
const roundLabel: Record<RoundMode, string> = { round: '四捨五入', floor: '切り捨て', ceil: '切り上げ' }
function applyRound(n: number, mode: RoundMode) {
  if (mode === 'round') return Math.round(n)
  if (mode === 'floor') return Math.floor(n)
  return Math.ceil(n)
}

// ─── タブ ──────────────────────────────────────────────────
type Tab = 'dashboard' | 'events' | 'exhibitors'

// ─── Toast ────────────────────────────────────────────────
function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t) }, [onClose])
  return (
    <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white whitespace-nowrap ${type === 'error' ? 'bg-red-500' : 'bg-green-600'}`}>
      {msg}
    </div>
  )
}

// ─── Confirm ──────────────────────────────────────────────
function Confirm({ message, onOk, onCancel }: { message: string; onOk: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <p className="text-gray-800 mb-6 text-center whitespace-pre-line">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium">キャンセル</button>
          <button onClick={onOk} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-medium">削除する</button>
        </div>
      </div>
    </div>
  )
}

// ─── 数値入力（IME対策） ───────────────────────────────────
function NumInput({ value, onChange, placeholder = '0', className = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  return (
    <input
      type="text" inputMode="numeric" pattern="[0-9]*"
      autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
      value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
      className={`border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${className}`}
    />
  )
}

// ─── 仕入れ品目 ───────────────────────────────────────────
type DraftItem = { id: string; item_name: string; quantity: string; unit_cost: string; amount: string }
const newDraftItem = (): DraftItem => ({ id: crypto.randomUUID(), item_name: '', quantity: '', unit_cost: '', amount: '' })

// ─── 催し物モーダル ───────────────────────────────────────
function EventModal({ event, onSave, onClose, saving }: {
  event: Partial<Event>; onSave: (ev: Partial<Event>, items: DraftItem[]) => Promise<void>; onClose: () => void; saving: boolean
}) {
  const isNew = !event.id
  const [name, setName] = useState(event.name ?? '')
  const [sellingPrice, setSellingPrice] = useState(event.selling_price != null ? String(event.selling_price) : '')
  const [targetQty, setTargetQty] = useState(event.target_quantity != null ? String(event.target_quantity) : '')
  const [actualQty, setActualQty] = useState(event.actual_quantity != null ? String(event.actual_quantity) : '')
  const [actualSales, setActualSales] = useState(event.actual_sales != null ? String(event.actual_sales) : '')
  const [notes, setNotes] = useState(event.notes ?? '')
  const [roundMode, setRoundMode] = useState<RoundMode>('round')
  const [items, setItems] = useState<DraftItem[]>(
    event.purchase_items && event.purchase_items.length > 0
      ? event.purchase_items.map((it) => ({ id: it.id, item_name: it.item_name, quantity: String(it.quantity), unit_cost: String(it.unit_cost), amount: String(it.quantity * it.unit_cost) }))
      : [newDraftItem()]
  )

  const setItemField = (idx: number, k: keyof DraftItem, v: string) => {
    setItems((prev) => {
      const next = [...prev]
      const item = { ...next[idx], [k]: v }
      const qty = Number(item.quantity) || 0
      const cost = Number(item.unit_cost) || 0
      const amt = Number(item.amount) || 0
      if (k === 'quantity' || k === 'unit_cost') {
        if (qty > 0 && cost > 0) item.amount = String(qty * cost)
      } else if (k === 'amount') {
        if (amt > 0 && qty > 0) item.unit_cost = String(applyRound(amt / qty, roundMode))
      }
      next[idx] = item
      return next
    })
  }

  const handleRoundChange = (mode: RoundMode) => {
    setRoundMode(mode)
    setItems((prev) => prev.map((item) => {
      const qty = Number(item.quantity) || 0
      const amt = Number(item.amount) || 0
      if (qty > 0 && amt > 0) return { ...item, unit_cost: String(applyRound(amt / qty, mode)) }
      return item
    }))
  }

  const preview: Event = {
    id: event.id ?? '', name, selling_price: Number(sellingPrice) || 0,
    target_quantity: Number(targetQty) || 0, notes,
    purchase_items: items.map((it) => ({ id: it.id, event_id: event.id ?? '', item_name: it.item_name, quantity: Number(it.quantity) || 0, unit_cost: Number(it.unit_cost) || 0 })),
  }
  const c = calcEvent(preview)

  const handleSave = async () => {
    if (!name.trim()) { alert('催し物名を入力してください'); return }
    await onSave({
      id: event.id, name: name.trim(),
      selling_price: Number(sellingPrice) || 0,
      target_quantity: Number(targetQty) || 0,
      actual_quantity: actualQty !== '' ? Number(actualQty) : null,
      actual_sales: actualSales !== '' ? Number(actualSales) : null,
      notes: notes.trim(),
    }, items)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex flex-col">
      <div className="bg-white flex-1 overflow-y-auto flex flex-col max-w-2xl w-full mx-auto">
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center gap-3 z-10">
          <button onClick={onClose} className="text-gray-500 text-2xl w-8 h-8 flex items-center justify-center">✕</button>
          <h2 className="text-lg font-bold flex-1">{isNew ? '催し物を追加' : '催し物を編集'}</h2>
        </div>

        <div className="p-4 space-y-6 pb-36">
          {/* 基本情報 */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">基本情報</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">催し物名 <span className="text-red-500">*</span></label>
                <input type="text" autoComplete="off"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例：ヨーヨー釣り" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">販売単価（円）</label>
                  <NumInput value={sellingPrice} onChange={setSellingPrice} className="w-full rounded-xl px-4 py-3 text-base" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">目標個数</label>
                  <NumInput value={targetQty} onChange={setTargetQty} className="w-full rounded-xl px-4 py-3 text-base" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                <textarea className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2} placeholder="メモがあれば" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          </section>

          {/* 実績入力 */}
          <section className="bg-green-50 rounded-2xl p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">実績入力（終了後に記録）</h3>
            <p className="text-xs text-gray-400 mb-3">※ どちらか一方を入力してください。両方入力した場合は実績売上が優先されます。</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">実績販売個数</label>
                <NumInput value={actualQty} onChange={setActualQty} placeholder="未入力" className="w-full rounded-xl px-4 py-3 text-base" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">実績売上（円）</label>
                <NumInput value={actualSales} onChange={setActualSales} placeholder="未入力" className="w-full rounded-xl px-4 py-3 text-base" />
              </div>
            </div>
          </section>

          {/* 端数処理 */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">単価の端数処理</h3>
            <div className="flex gap-2">
              {(['round', 'floor', 'ceil'] as RoundMode[]).map((mode) => (
                <button key={mode} onClick={() => handleRoundChange(mode)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${roundMode === mode ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                  {roundLabel[mode]}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">※ 金額÷数量で単価を自動計算するときの端数処理</p>
          </section>

          {/* 仕入れ品目 */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">仕入れ品目</h3>
            <p className="text-xs text-blue-500 mb-3">💡 数量＋金額を入れると単価が自動計算されます</p>
            <div className="space-y-3">
              {items.map((item, idx) => {
                const qty = Number(item.quantity) || 0
                const cost = Number(item.unit_cost) || 0
                return (
                  <div key={item.id} className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-400">品目 {idx + 1}</span>
                      {items.length > 1 && <button onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} className="text-red-400 text-sm font-medium">削除</button>}
                    </div>
                    <input type="text" autoComplete="off"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="品目名（例：ヨーヨー風船）" value={item.item_name}
                      onChange={(e) => setItemField(idx, 'item_name', e.target.value)} />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">数量</label>
                        <NumInput value={item.quantity} onChange={(v) => setItemField(idx, 'quantity', v)} className="w-full" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">単価（円）</label>
                        <NumInput value={item.unit_cost} onChange={(v) => setItemField(idx, 'unit_cost', v)} className="w-full" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">金額（円）</label>
                        <NumInput value={item.amount} onChange={(v) => setItemField(idx, 'amount', v)} className="w-full" />
                      </div>
                    </div>
                    {qty > 0 && cost > 0 && (
                      <div className="text-xs text-gray-400 text-right">{qty}個 × ¥{cost.toLocaleString()} = ¥{(qty * cost).toLocaleString()}</div>
                    )}
                  </div>
                )
              })}
              <button onClick={() => setItems((p) => [...p, newDraftItem()])}
                className="w-full py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 text-sm font-medium">
                ＋ 品目を追加
              </button>
            </div>
          </section>

          {/* 収支サマリ */}
          <section className="bg-blue-50 rounded-2xl p-4 space-y-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">収支サマリ（自動計算）</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-gray-500">原価合計</span><span className="text-right font-bold">{fmt(c.costTotal)}</span>
              <span className="text-gray-500">目標売上</span><span className="text-right font-bold">{fmt(c.targetSales)}</span>
              <span className="text-gray-500">目標粗利</span>
              <span className={`text-right font-bold text-base ${c.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(c.grossProfit)}</span>
              <span className="text-gray-500">目標粗利率</span><span className="text-right font-bold">{pct(c.grossMargin)}</span>
              <span className="text-gray-500">損益分岐点</span><span className="text-right font-bold">{bep(c.breakeven)}</span>
            </div>
            {(actualQty !== '' || actualSales !== '') && (
              <div className="border-t border-blue-200 pt-2 mt-2">
                <div className="text-xs font-bold text-green-600 mb-2">📊 実績</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-gray-500">実績売上</span>
                  <span className="text-right font-bold">{fmt(c.actualSales)}</span>
                  <span className="text-gray-500">実績粗利</span>
                  <span className={`text-right font-bold text-base ${(c.actualProfit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(c.actualProfit)}</span>
                  <span className="text-gray-500">実績粗利率</span>
                  <span className="text-right font-bold">{pct(c.actualMargin)}</span>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-4 max-w-2xl mx-auto">
          <button onClick={handleSave} disabled={saving}
            className="w-full bg-blue-600 disabled:bg-blue-300 text-white py-4 rounded-xl text-base font-bold shadow">
            {saving ? '保存中...' : '💾 保存する'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 出展者モーダル ───────────────────────────────────────
function ExhibitorModal({ exhibitor, onSave, onClose, saving }: {
  exhibitor: Partial<Exhibitor>; onSave: (ex: Partial<Exhibitor>) => Promise<void>; onClose: () => void; saving: boolean
}) {
  const [name, setName] = useState(exhibitor.name ?? '')
  const [feeTarget, setFeeTarget] = useState(exhibitor.fee_target != null ? String(exhibitor.fee_target) : '')
  const [feeActual, setFeeActual] = useState(exhibitor.fee_actual != null ? String(exhibitor.fee_actual) : '')
  const [notes, setNotes] = useState(exhibitor.notes ?? '')

  const handleSave = async () => {
    if (!name.trim()) { alert('出展者名を入力してください'); return }
    await onSave({
      id: exhibitor.id, name: name.trim(),
      fee_target: Number(feeTarget) || 0,
      fee_actual: feeActual !== '' ? Number(feeActual) : null,
      notes: notes.trim(),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex flex-col">
      <div className="bg-white flex-1 overflow-y-auto flex flex-col max-w-2xl w-full mx-auto">
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center gap-3 z-10">
          <button onClick={onClose} className="text-gray-500 text-2xl w-8 h-8 flex items-center justify-center">✕</button>
          <h2 className="text-lg font-bold flex-1">{exhibitor.id ? '出展者を編集' : '出展者を追加'}</h2>
        </div>
        <div className="p-4 space-y-4 pb-36">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">出展者名 <span className="text-red-500">*</span></label>
            <input type="text" autoComplete="off"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例：キッチンカーA" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">目標出展料（円）</label>
              <NumInput value={feeTarget} onChange={setFeeTarget} className="w-full rounded-xl px-4 py-3 text-base" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">実績出展料（円）</label>
              <NumInput value={feeActual} onChange={setFeeActual} placeholder="未入力" className="w-full rounded-xl px-4 py-3 text-base" />
            </div>
          </div>
          {feeTarget !== '' && feeActual !== '' && (
            <div className={`rounded-xl p-3 text-sm ${Number(feeActual) >= Number(feeTarget) ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              目標比：{Number(feeActual) >= Number(feeTarget) ? '✅ 達成' : '⚠ 未達'} （差額 {fmt(Number(feeActual) - Number(feeTarget))}）
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
            <textarea className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2} placeholder="出展内容など" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-4 max-w-2xl mx-auto">
          <button onClick={handleSave} disabled={saving}
            className="w-full bg-blue-600 disabled:bg-blue-300 text-white py-4 rounded-xl text-base font-bold shadow">
            {saving ? '保存中...' : '💾 保存する'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── メインアプリ ─────────────────────────────────────────
export default function MarcheApp() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [events, setEvents] = useState<Event[]>([])
  const [exhibitors, setExhibitors] = useState<Exhibitor[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [eventModal, setEventModal] = useState<Partial<Event> | null>(null)
  const [exhibitorModal, setExhibitorModal] = useState<Partial<Exhibitor> | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'event' | 'exhibitor'; item: Event | Exhibitor } | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => setToast({ msg, type })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: evData }, { data: exData }] = await Promise.all([
      supabase.from('events').select('*, purchase_items(*)').order('created_at', { ascending: true }),
      supabase.from('exhibitors').select('*').order('created_at', { ascending: true }),
    ])
    setEvents(evData ?? [])
    setExhibitors(exData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // 催し物保存
  const handleSaveEvent = async (ev: Partial<Event>, draftItems: DraftItem[]) => {
    setSaving(true)
    try {
      let eventId = ev.id
      if (ev.id) {
        const { error } = await supabase.from('events').update({
          name: ev.name, selling_price: ev.selling_price, target_quantity: ev.target_quantity,
          actual_quantity: ev.actual_quantity, actual_sales: ev.actual_sales, notes: ev.notes,
        }).eq('id', ev.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('events').insert({
          name: ev.name, selling_price: ev.selling_price, target_quantity: ev.target_quantity,
          actual_quantity: ev.actual_quantity, actual_sales: ev.actual_sales, notes: ev.notes,
        }).select().single()
        if (error) throw error
        eventId = data.id
      }
      await supabase.from('purchase_items').delete().eq('event_id', eventId)
      const valid = draftItems.filter((it) => it.item_name.trim())
      if (valid.length > 0) {
        const { error } = await supabase.from('purchase_items').insert(
          valid.map((it) => ({ event_id: eventId, item_name: it.item_name.trim(), quantity: Number(it.quantity) || 0, unit_cost: Number(it.unit_cost) || 0 }))
        )
        if (error) throw error
      }
      await fetchAll()
      setEventModal(null)
      showToast(ev.id ? '更新しました ✓' : '追加しました ✓')
    } catch { showToast('保存に失敗しました', 'error') }
    finally { setSaving(false) }
  }

  // 出展者保存
  const handleSaveExhibitor = async (ex: Partial<Exhibitor>) => {
    setSaving(true)
    try {
      if (ex.id) {
        const { error } = await supabase.from('exhibitors').update({ name: ex.name, fee_target: ex.fee_target, fee_actual: ex.fee_actual, notes: ex.notes }).eq('id', ex.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('exhibitors').insert({ name: ex.name, fee_target: ex.fee_target, fee_actual: ex.fee_actual, notes: ex.notes })
        if (error) throw error
      }
      await fetchAll()
      setExhibitorModal(null)
      showToast(ex.id ? '更新しました ✓' : '追加しました ✓')
    } catch { showToast('保存に失敗しました', 'error') }
    finally { setSaving(false) }
  }

  // 削除
  const handleDelete = async () => {
    if (!confirmDelete) return
    setSaving(true)
    try {
      if (confirmDelete.type === 'event') {
        const { error } = await supabase.from('events').delete().eq('id', confirmDelete.item.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('exhibitors').delete().eq('id', confirmDelete.item.id)
        if (error) throw error
      }
      await fetchAll()
      setConfirmDelete(null)
      showToast('削除しました')
    } catch { showToast('削除に失敗しました', 'error') }
    finally { setSaving(false) }
  }

  const { ev: evTotals, ex: exTotals } = calcTotals(events, exhibitors)
  const totalTargetIncome = evTotals.targetSales + exTotals.target
  const totalActualIncome = evTotals.actualSalesCount > 0 || exTotals.actualCount > 0
    ? evTotals.actualSales + exTotals.actual : null
  const totalTargetProfit = evTotals.targetProfit + exTotals.target
  const totalActualProfit = totalActualIncome != null ? totalActualIncome - evTotals.cost : null

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* ヘッダー */}
      <header className="bg-blue-600 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">🎪 マルシェ収支管理</h1>
          <button onClick={() => exportCSV(events, exhibitors)}
            className="bg-blue-500 border border-blue-400 text-white text-xs px-3 py-2 rounded-lg font-medium">
            CSV出力
          </button>
        </div>
        {/* タブ */}
        <div className="max-w-4xl mx-auto flex border-t border-blue-500">
          {([['dashboard', '📊 ダッシュボード'], ['events', '🎡 催し物'], ['exhibitors', '🏪 出展者']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === t ? 'bg-white text-blue-600' : 'text-blue-200 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5">
        {loading ? (
          <div className="text-center py-20 text-gray-400"><div className="text-4xl mb-3">⏳</div>読み込み中...</div>
        ) : (
          <>
            {/* ダッシュボード */}
            {tab === 'dashboard' && (
              <div className="space-y-6">
                {/* 全体収支 */}
                <section>
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">全体収支サマリ</h2>
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500 grid grid-cols-3 gap-2">
                      <span>項目</span><span className="text-right">目標</span><span className="text-right">実績</span>
                    </div>
                    {[
                      { label: '催し物収入', target: evTotals.targetSales, actual: evTotals.actualSalesCount > 0 ? evTotals.actualSales : null },
                      { label: '出展者収入', target: exTotals.target, actual: exTotals.actualCount > 0 ? exTotals.actual : null },
                      { label: '原価（支出）', target: -evTotals.cost, actual: -evTotals.cost, neg: true },
                      { label: '粗利合計', target: totalTargetProfit, actual: totalActualProfit, bold: true },
                    ].map(({ label, target, actual, neg, bold }) => (
                      <div key={label} className={`px-4 py-3 grid grid-cols-3 gap-2 border-t border-gray-100 ${bold ? 'bg-blue-50' : ''}`}>
                        <span className={`text-sm ${bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{label}</span>
                        <span className={`text-right text-sm ${bold ? 'font-bold' : 'font-medium'} ${neg ? 'text-red-600' : target != null && target < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                          {fmt(target)}
                        </span>
                        <span className={`text-right text-sm font-bold ${actual == null ? 'text-gray-300' : actual < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {actual == null ? '未入力' : fmt(actual)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* サマリカード */}
                <section>
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">個別サマリ</h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <SCard label="催し物数" value={`${events.length}件`} />
                    <SCard label="出展者数" value={`${exhibitors.length}件`} />
                    <SCard label="原価総額" value={fmt(evTotals.cost)} />
                    <SCard label="目標収入総額" value={fmt(totalTargetIncome)} />
                    <SCard label="目標粗利" value={fmt(totalTargetProfit)} highlight loss={totalTargetProfit < 0} />
                    <SCard label="実績粗利" value={totalActualProfit != null ? fmt(totalActualProfit) : '未入力'} highlight={totalActualProfit != null} loss={(totalActualProfit ?? 0) < 0} />
                  </div>
                </section>

                {/* 催し物別進捗 */}
                <section>
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">催し物別 目標vs実績</h2>
                  <div className="space-y-2">
                    {events.map((ev) => {
                      const c = calcEvent(ev)
                      const hasActual = c.actualSales != null
                      const achieved = hasActual && c.actualSales! >= c.targetSales
                      return (
                        <div key={ev.id} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-gray-900">{ev.name}</span>
                            {hasActual ? (
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${achieved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                {achieved ? '✅ 目標達成' : '⚠ 目標未達'}
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-400">実績未入力</span>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="bg-gray-50 rounded-lg p-2 text-center">
                              <div className="text-gray-400">目標売上</div>
                              <div className="font-bold text-gray-800">{fmt(c.targetSales)}</div>
                            </div>
                            <div className={`rounded-lg p-2 text-center ${hasActual ? (achieved ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'}`}>
                              <div className="text-gray-400">実績売上</div>
                              <div className={`font-bold ${hasActual ? (achieved ? 'text-green-600' : 'text-red-600') : 'text-gray-300'}`}>
                                {hasActual ? fmt(c.actualSales) : '—'}
                              </div>
                            </div>
                            <div className={`rounded-lg p-2 text-center ${hasActual ? (c.actualProfit! >= 0 ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'}`}>
                              <div className="text-gray-400">実績粗利</div>
                              <div className={`font-bold ${hasActual ? (c.actualProfit! >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-300'}`}>
                                {hasActual ? fmt(c.actualProfit) : '—'}
                              </div>
                            </div>
                          </div>
                          {hasActual && (
                            <div className="mt-2">
                              <div className="flex justify-between text-xs text-gray-400 mb-1">
                                <span>達成率</span>
                                <span>{c.targetSales > 0 ? ((c.actualSales! / c.targetSales) * 100).toFixed(0) : 0}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div className={`h-2 rounded-full transition-all ${achieved ? 'bg-green-500' : 'bg-red-400'}`}
                                  style={{ width: `${Math.min(100, c.targetSales > 0 ? (c.actualSales! / c.targetSales) * 100 : 0)}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              </div>
            )}

            {/* 催し物一覧 */}
            {tab === 'events' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">催し物一覧</h2>
                  <button onClick={() => setEventModal({})} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-bold shadow">＋ 追加</button>
                </div>
                {events.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <div className="text-5xl mb-4">🎡</div>
                    <p className="mb-4">まだ催し物がありません</p>
                    <button onClick={() => setEventModal({})} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">＋ 追加する</button>
                  </div>
                ) : (
                  <>
                    {/* スマホ：カード */}
                    <div className="space-y-3 sm:hidden">
                      {events.map((ev) => {
                        const c = calcEvent(ev)
                        const hasActual = c.actualSales != null
                        return (
                          <div key={ev.id} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="font-bold text-gray-900">{ev.name}</h3>
                                {ev.notes && <p className="text-xs text-gray-400">{ev.notes}</p>}
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <button onClick={() => setEventModal(ev)} className="bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-lg">編集</button>
                                <button onClick={() => setConfirmDelete({ type: 'event', item: ev })} className="bg-red-50 text-red-500 text-xs px-3 py-1.5 rounded-lg">削除</button>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <MiniStat label="原価" value={fmt(c.costTotal)} />
                              <MiniStat label="目標売上" value={fmt(c.targetSales)} />
                              <MiniStat label="目標粗利" value={fmt(c.grossProfit)} color={c.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'} bg={c.grossProfit >= 0 ? 'bg-green-50' : 'bg-red-50'} />
                            </div>
                            {hasActual && (
                              <div className="grid grid-cols-2 gap-2 border-t pt-2">
                                <MiniStat label="実績売上" value={fmt(c.actualSales)} bg="bg-blue-50" color="text-blue-700" />
                                <MiniStat label="実績粗利" value={fmt(c.actualProfit)} bg={(c.actualProfit ?? 0) >= 0 ? 'bg-green-50' : 'bg-red-50'} color={(c.actualProfit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'} />
                              </div>
                            )}
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
                              <span>単価 {fmt(ev.selling_price)}</span>
                              <span>目標 {ev.target_quantity ?? 0}個</span>
                              <span>粗利率 {pct(c.grossMargin)}</span>
                              <span>BEP {bep(c.breakeven)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* PC：テーブル */}
                    <div className="hidden sm:block overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 text-xs border-b">
                            {['催し物名','原価','単価','目標個数','目標売上','目標粗利','粗利率','BEP','実績売上','実績粗利',''].map((h) => (
                              <th key={h} className="px-3 py-3 font-semibold text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {events.map((ev) => {
                            const c = calcEvent(ev)
                            return (
                              <tr key={ev.id} className="hover:bg-gray-50">
                                <td className="px-3 py-3 font-medium">{ev.name}{ev.notes && <span className="block text-xs text-gray-400">{ev.notes}</span>}</td>
                                <td className="px-3 py-3">{fmt(c.costTotal)}</td>
                                <td className="px-3 py-3">{fmt(ev.selling_price)}</td>
                                <td className="px-3 py-3">{(ev.target_quantity || 0).toLocaleString()}個</td>
                                <td className="px-3 py-3">{fmt(c.targetSales)}</td>
                                <td className={`px-3 py-3 font-bold ${c.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(c.grossProfit)}</td>
                                <td className={`px-3 py-3 ${c.grossProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{pct(c.grossMargin)}</td>
                                <td className="px-3 py-3 text-gray-500">{bep(c.breakeven)}</td>
                                <td className={`px-3 py-3 font-medium ${c.actualSales == null ? 'text-gray-300' : 'text-blue-600'}`}>{c.actualSales != null ? fmt(c.actualSales) : '未入力'}</td>
                                <td className={`px-3 py-3 font-bold ${c.actualProfit == null ? 'text-gray-300' : (c.actualProfit >= 0 ? 'text-green-600' : 'text-red-600')}`}>{c.actualProfit != null ? fmt(c.actualProfit) : '—'}</td>
                                <td className="px-3 py-3">
                                  <div className="flex gap-2">
                                    <button onClick={() => setEventModal(ev)} className="bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-lg">編集</button>
                                    <button onClick={() => setConfirmDelete({ type: 'event', item: ev })} className="bg-red-50 text-red-500 text-xs px-3 py-1.5 rounded-lg">削除</button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 出展者一覧 */}
            {tab === 'exhibitors' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">出展者一覧</h2>
                  <button onClick={() => setExhibitorModal({})} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-bold shadow">＋ 追加</button>
                </div>

                {/* 出展者合計 */}
                <div className="grid grid-cols-2 gap-3">
                  <SCard label="出展者数" value={`${exhibitors.length}件`} />
                  <SCard label="目標出展料合計" value={fmt(exTotals.target)} />
                  <SCard label="実績出展料合計" value={exTotals.actualCount > 0 ? fmt(exTotals.actual) : '未入力'} highlight={exTotals.actualCount > 0} />
                  <SCard label="差額" value={exTotals.actualCount > 0 ? fmt(exTotals.actual - exTotals.target) : '—'} loss={exTotals.actual < exTotals.target} />
                </div>

                {exhibitors.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <div className="text-5xl mb-4">🏪</div>
                    <p className="mb-4">まだ出展者がいません</p>
                    <button onClick={() => setExhibitorModal({})} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">＋ 追加する</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {exhibitors.map((ex) => {
                      const hasActual = ex.fee_actual != null
                      const achieved = hasActual && ex.fee_actual! >= ex.fee_target
                      return (
                        <div key={ex.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div>
                              <h3 className="font-bold text-gray-900">{ex.name}</h3>
                              {ex.notes && <p className="text-xs text-gray-400">{ex.notes}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              {hasActual && (
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${achieved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                  {achieved ? '✅ 達成' : '⚠ 未達'}
                                </span>
                              )}
                              <button onClick={() => setExhibitorModal(ex)} className="bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-lg">編集</button>
                              <button onClick={() => setConfirmDelete({ type: 'exhibitor', item: ex })} className="bg-red-50 text-red-500 text-xs px-3 py-1.5 rounded-lg">削除</button>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <MiniStat label="目標出展料" value={fmt(ex.fee_target)} />
                            <MiniStat label="実績出展料" value={hasActual ? fmt(ex.fee_actual) : '未入力'} color={hasActual ? (achieved ? 'text-green-600' : 'text-red-600') : 'text-gray-300'} bg={hasActual ? (achieved ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'} />
                            <MiniStat label="差額" value={hasActual ? fmt(ex.fee_actual! - ex.fee_target) : '—'} color={hasActual ? (achieved ? 'text-green-600' : 'text-red-600') : 'text-gray-300'} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* モーダル類 */}
      {eventModal !== null && (
        <EventModal event={eventModal} onSave={handleSaveEvent} onClose={() => setEventModal(null)} saving={saving} />
      )}
      {exhibitorModal !== null && (
        <ExhibitorModal exhibitor={exhibitorModal} onSave={handleSaveExhibitor} onClose={() => setExhibitorModal(null)} saving={saving} />
      )}
      {confirmDelete && (
        <Confirm
          message={`「${confirmDelete.item.name}」を削除しますか？\nこの操作は元に戻せません。`}
          onOk={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}

function SCard({ label, value, highlight, loss }: { label: string; value: string; highlight?: boolean; loss?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 shadow-sm ${highlight ? (loss ? 'bg-red-500 text-white' : 'bg-blue-600 text-white') : 'bg-white border border-gray-200'}`}>
      <div className={`text-xs mb-1 ${highlight ? 'text-white/70' : 'text-gray-500'}`}>{label}</div>
      <div className={`text-xl font-bold ${highlight ? 'text-white' : (loss ? 'text-red-600' : 'text-gray-900')}`}>{value}</div>
    </div>
  )
}

function MiniStat({ label, value, color = 'text-gray-800', bg = 'bg-gray-50' }: { label: string; value: string; color?: string; bg?: string }) {
  return (
    <div className={`${bg} rounded-xl p-2 text-center`}>
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`font-bold text-sm ${color}`}>{value}</div>
    </div>
  )
}

// DraftItemをEventModalの外でも参照できるようにexport
export type { DraftItem }
