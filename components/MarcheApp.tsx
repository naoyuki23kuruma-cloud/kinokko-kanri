'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { calcEvent, calcMarcheSummary, fmt, pct, bep, exportSettlementCSV } from '@/lib/calc'
import type { Event, Exhibitor, OtherExpense, Marche } from '@/lib/types'

type RoundMode = 'round' | 'floor' | 'ceil'
const roundLabel: Record<RoundMode, string> = { round: '四捨五入（1円）', floor: '切り捨て（1円）', ceil: '切り上げ（1円）' }
function applyRound(n: number, mode: RoundMode) {
  if (mode === 'round') return Math.round(n)  // 四捨五入（1円単位）
  if (mode === 'floor') return Math.floor(n)   // 切り捨て（1円単位）
  return Math.ceil(n)                          // 切り上げ（1円単位）
}

type Tab = 'dashboard' | 'events' | 'exhibitors' | 'expenses' | 'settlement'
type DraftItem = { id: string; item_name: string; quantity: string; unit_cost: string; amount: string; amountLocked: boolean }
const newDraftItem = (): DraftItem => ({ id: crypto.randomUUID(), item_name: '', quantity: '', unit_cost: '', amount: '', amountLocked: false })

// ─── 共通UI ───────────────────────────────────────────────
function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t) }, [onClose])
  return (
    <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white whitespace-nowrap ${type === 'error' ? 'bg-red-500' : 'bg-green-600'}`}>
      {msg}
    </div>
  )
}

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

function NumInput({ value, onChange, placeholder = '0', className = '', onEnter }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; onEnter?: () => void
}) {
  return (
    <input type="text" inputMode="numeric" pattern="[0-9]*"
      autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
      value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter ? onEnter() : (e.target as HTMLElement).closest('.item-row')?.querySelectorAll('input')[Array.from((e.target as HTMLElement).closest('.item-row')?.querySelectorAll('input') ?? []).indexOf(e.target as HTMLInputElement) + 1]?.focus() } }}
      className={`border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${className}`}
    />
  )
}

function SCard({ label, value, sub, highlight, loss }: { label: string; value: string; sub?: string; highlight?: boolean; loss?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 shadow-sm ${highlight ? (loss ? 'bg-red-500 text-white' : 'bg-blue-600 text-white') : 'bg-white border border-gray-200'}`}>
      <div className={`text-xs mb-1 ${highlight ? 'text-white/70' : 'text-gray-500'}`}>{label}</div>
      <div className={`text-xl font-bold ${highlight ? 'text-white' : (loss ? 'text-red-600' : 'text-gray-900')}`}>{value}</div>
      {sub && <div className={`text-xs mt-1 ${highlight ? 'text-white/60' : 'text-gray-400'}`}>{sub}</div>}
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

// ─── マルシェ選択・作成モーダル ───────────────────────────
function MarcheSelectModal({ marches, onSelect, onCreate, onToggleStatus, onDelete, onClose }: {
  marches: Marche[]
  onSelect: (m: Marche) => void
  onCreate: (name: string, date: string, notes: string, docUrl: string) => Promise<void>
  onToggleStatus: (m: Marche) => Promise<void>
  onDelete: (m: Marche) => void
  onClose: () => void
}) {
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newDocUrl, setNewDocUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!newName.trim()) { alert('マルシェ名を入力してください'); return }
    setSaving(true)
    await onCreate(newName.trim(), newDate, newNotes.trim(), newDocUrl.trim())
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
        <div className="bg-blue-600 text-white px-5 py-4">
          <h2 className="text-lg font-bold">🎪 マルシェを選択</h2>
          <p className="text-blue-200 text-xs mt-1">管理したいマルシェを選んでください</p>
        </div>
        <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
          {marches.length === 0 && !showNew && (
            <p className="text-gray-400 text-sm text-center py-4">まだマルシェがありません</p>
          )}
          {marches.map((m) => (
            <div key={m.id} className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => onSelect(m)} className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors">
                <div className="font-bold text-gray-900">{m.name}</div>
                <div className="flex gap-3 text-xs text-gray-400 mt-1">
                  <span>{m.date ?? '日付未設定'}</span>
                  <span className={`px-2 py-0.5 rounded-full ${m.status === 'closed' ? 'bg-gray-200 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                    {m.status === 'closed' ? '終了' : '開催予定'}
                  </span>
                </div>
                {m.notes && <p className="text-xs text-gray-500 mt-1 text-left">{m.notes}</p>}
                {(m as any).doc_url && <a href={(m as any).doc_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-blue-500 underline mt-0.5 block text-left">📎 資料を開く</a>}
              </button>
              <div className="flex border-t border-gray-200">
                <button onClick={(e) => { e.stopPropagation(); onToggleStatus(m) }}
                  className={`flex-1 py-2 text-xs font-medium ${m.status === 'closed' ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-500 bg-gray-100 hover:bg-gray-200'}`}>
                  {m.status === 'closed' ? '🔄 開催予定に戻す' : '✅ 終了にする'}
                </button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(m) }}
                  className="flex-1 py-2 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 border-l border-gray-200">
                  🗑 削除する
                </button>
              </div>
            </div>
          ))}
        </div>

        {!showNew ? (
          <div className="px-4 pb-4">
            <button onClick={() => setShowNew(true)}
              className="w-full py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 text-sm font-medium">
              ＋ 新しいマルシェを作成
            </button>
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-3 border-t pt-4">
            <h3 className="text-sm font-bold text-gray-700">新規マルシェを作成</h3>
            <div>
              <label className="block text-xs text-gray-500 mb-1">マルシェ名 *</label>
              <input type="text" autoComplete="off"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例：2025年夏祭りマルシェ" value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('marche-date')?.focus() } }} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">開催日</label>
              <input type="date"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                id="marche-date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">企画メモ（任意）</label>
              <textarea
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2} placeholder="企画内容・備考など"
                value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">資料URL（Google Drive等）</label>
              <input type="url" autoComplete="off"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://drive.google.com/..." value={newDocUrl} onChange={(e) => setNewDocUrl(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowNew(false)} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm">戻る</button>
              <button onClick={handleCreate} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:bg-blue-300">
                {saving ? '作成中...' : '作成する'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

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
      ? event.purchase_items.map((it) => ({ id: it.id, item_name: it.item_name, quantity: String(it.quantity), unit_cost: String(it.unit_cost), amount: it.amount_override != null ? String(it.amount_override) : String(it.quantity * it.unit_cost), amountLocked: it.amount_override != null }))
      : [newDraftItem()]
  )

  const setItemField = (idx: number, k: keyof DraftItem, v: string) => {
    setItems((prev) => {
      const next = [...prev]
      const item = { ...next[idx], [k]: v }
      const qty = Number(item.quantity) || 0
      const cost = Number(item.unit_cost) || 0
      const amt = Number(item.amount) || 0

      if (k === 'amount') {
        // 金額を手入力 → ロック設定＋数量があれば単価を自動計算
        item.amountLocked = amt > 0
        if (amt > 0 && qty > 0) {
          item.unit_cost = String(applyRound(amt / qty, roundMode))
        }
      } else if (k === 'quantity') {
        // 数量が変わった時
        if (qty > 0) {
          if (item.amountLocked && amt > 0) {
            // 金額がロック済み → 単価を再計算
            item.unit_cost = String(applyRound(amt / qty, roundMode))
          } else if (cost > 0) {
            // 単価が入力済み → 金額を計算（ロックしない）
            item.amount = String(qty * cost)
            item.amountLocked = false
          }
        }
      } else if (k === 'unit_cost') {
        // 単価を手入力 → 金額がロックされていない場合のみ金額を計算
        if (!item.amountLocked && qty > 0 && cost > 0) {
          item.amount = String(qty * cost)
        }
      }

      next[idx] = item
      return next
    })
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
      id: event.id, name: name.trim(), selling_price: Number(sellingPrice) || 0,
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
        <div className="p-4 space-y-5 pb-36">
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">基本情報</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">催し物名 *</label>
                <input
                  type="text" autoComplete="off" id="ev-name"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例：ヨーヨー釣り" value={name} onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('ev-price')?.focus() } }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">販売単価（円）</label>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*" id="ev-price"
                    autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                    value={sellingPrice} placeholder="0"
                    onChange={(e) => setSellingPrice(e.target.value.replace(/[^0-9]/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('ev-qty')?.focus() } }}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">目標個数</label>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*" id="ev-qty"
                    autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                    value={targetQty} placeholder="0"
                    onChange={(e) => setTargetQty(e.target.value.replace(/[^0-9]/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('ev-notes')?.focus() } }}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                <textarea className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          </section>

          <section className="bg-green-50 rounded-2xl p-4">
            <h3 className="text-xs font-bold text-gray-600 mb-1">📊 実績入力（終了後に記録）</h3>
            <p className="text-xs text-gray-400 mb-3">どちらか一方を入力。両方入力した場合は実績売上が優先。</p>
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

          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">単価の端数処理</h3>
            <div className="flex gap-2">
              {(['round', 'floor', 'ceil'] as RoundMode[]).map((mode) => (
                <button key={mode} onClick={() => setRoundMode(mode)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border ${roundMode === mode ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                  {roundLabel[mode]}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">仕入れ品目</h3>
            <p className="text-xs text-blue-500 mb-3">💡 数量＋金額を入れると単価が自動計算</p>
            <div className="space-y-3">
              {items.map((item, idx) => {
                const qty = Number(item.quantity) || 0
                const cost = Number(item.unit_cost) || 0
                return (
                  <div key={item.id} className="item-row bg-gray-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">品目 {idx + 1}</span>
                      {items.length > 1 && <button onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} className="text-red-400 text-sm">削除</button>}
                    </div>
                    <input type="text" autoComplete="off"
                      id={`ev-item-name-${idx}`}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="品目名" value={item.item_name}
                      onChange={(e) => setItemField(idx, 'item_name', e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById(`ev-item-qty-${idx}`)?.focus() } }}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">数量</label>
                        <input type="text" inputMode="numeric" pattern="[0-9]*"
                          id={`ev-item-qty-${idx}`}
                          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                          value={item.quantity} placeholder="0"
                          onChange={(e) => setItemField(idx, 'quantity', e.target.value.replace(/[^0-9]/g, ''))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById(`ev-item-cost-${idx}`)?.focus() } }}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">単価（円）</label>
                        <input type="text" inputMode="numeric" pattern="[0-9]*"
                          id={`ev-item-cost-${idx}`}
                          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                          value={item.unit_cost} placeholder="0"
                          onChange={(e) => setItemField(idx, 'unit_cost', e.target.value.replace(/[^0-9]/g, ''))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById(`ev-item-amt-${idx}`)?.focus() } }}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">金額（円）</label>
                        <input type="text" inputMode="numeric" pattern="[0-9]*"
                          id={`ev-item-amt-${idx}`}
                          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                          value={item.amount} placeholder="0"
                          onChange={(e) => setItemField(idx, 'amount', e.target.value.replace(/[^0-9]/g, ''))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              // 次の品目の品目名へ、なければ新品目追加
                              const nextName = document.getElementById(`ev-item-name-${idx + 1}`)
                              if (nextName) { nextName.focus() }
                              else { setItems((p) => [...p, newDraftItem()]); setTimeout(() => document.getElementById(`ev-item-name-${idx + 1}`)?.focus(), 50) }
                            }
                          }}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                    </div>
                    {qty > 0 && cost > 0 && (
                      <div className="text-xs text-right">
                        {item.amountLocked && item.amount !== ''
                          ? <span className="text-blue-500">💰 金額 ¥{Number(item.amount).toLocaleString()} を使用（単価¥{cost}×{qty}個=¥{(qty*cost).toLocaleString()}）</span>
                          : <span className="text-gray-400">{qty}個 × ¥{cost.toLocaleString()} = ¥{(qty * cost).toLocaleString()}</span>
                        }
                      </div>
                    )}
                  </div>
                )
              })}
              <button onClick={() => setItems((p) => [...p, newDraftItem()])} className="w-full py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 text-sm font-medium">＋ 品目を追加</button>
            </div>
          </section>

          <section className="bg-blue-50 rounded-2xl p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">収支サマリ</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <span className="text-gray-500">原価合計</span><span className="text-right font-bold">{fmt(c.costTotal)}</span>
              <span className="text-gray-500">目標売上</span><span className="text-right font-bold">{fmt(c.targetSales)}</span>
              <span className="text-gray-500">目標粗利</span><span className={`text-right font-bold text-base ${c.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(c.grossProfit)}</span>
              <span className="text-gray-500">損益分岐点</span><span className="text-right font-bold">{bep(c.breakeven)}</span>
            </div>
          </section>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-4 max-w-2xl mx-auto">
          <button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 disabled:bg-blue-300 text-white py-4 rounded-xl text-base font-bold shadow">
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

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex flex-col">
      <div className="bg-white flex-1 overflow-y-auto flex flex-col max-w-2xl w-full mx-auto">
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center gap-3 z-10">
          <button onClick={onClose} className="text-gray-500 text-2xl w-8 h-8 flex items-center justify-center">✕</button>
          <h2 className="text-lg font-bold flex-1">{exhibitor.id ? '出展者を編集' : '出展者を追加'}</h2>
        </div>
        <div className="p-4 space-y-4 pb-36">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">出展者名 *</label>
            <input type="text" autoComplete="off"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例：キッチンカーA" value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('ex-fee-target')?.focus() } }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">目標出展料（円）</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" id="ex-fee-target"
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                value={feeTarget} placeholder="0"
                onChange={(e) => setFeeTarget(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('ex-fee-actual')?.focus() } }}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">実績出展料（円）</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" id="ex-fee-actual"
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                value={feeActual} placeholder="未入力"
                onChange={(e) => setFeeActual(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('ex-notes')?.focus() } }}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          {feeTarget !== '' && feeActual !== '' && (
            <div className={`rounded-xl p-3 text-sm ${Number(feeActual) >= Number(feeTarget) ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {Number(feeActual) >= Number(feeTarget) ? '✅ 目標達成' : '⚠ 目標未達'} （差額 {fmt(Number(feeActual) - Number(feeTarget))}）
            </div>
          )}
          <div><label className="block text-sm font-medium text-gray-700 mb-1">備考</label><textarea className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-4 max-w-2xl mx-auto">
          <button onClick={async () => { if (!name.trim()) { alert('出展者名を入力してください'); return } await onSave({ id: exhibitor.id, name: name.trim(), fee_target: Number(feeTarget) || 0, fee_actual: feeActual !== '' ? Number(feeActual) : null, notes: notes.trim() }) }} disabled={saving} className="w-full bg-blue-600 disabled:bg-blue-300 text-white py-4 rounded-xl text-base font-bold shadow">
            {saving ? '保存中...' : '💾 保存する'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── メインアプリ ─────────────────────────────────────────
export default function MarcheApp() {
  const [marches, setMarches] = useState<Marche[]>([])
  const [currentMarche, setCurrentMarche] = useState<Marche | null>(null)
  const [showMarcheSelect, setShowMarcheSelect] = useState(false)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [events, setEvents] = useState<Event[]>([])
  const [exhibitors, setExhibitors] = useState<Exhibitor[]>([])
  const [otherExpenses, setOtherExpenses] = useState<OtherExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [eventModal, setEventModal] = useState<Partial<Event> | null>(null)
  const [exhibitorModal, setExhibitorModal] = useState<Partial<Exhibitor> | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ type: string; id: string; name: string } | null>(null)
  const [confirmDeleteMarche, setConfirmDeleteMarche] = useState<Marche | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  // その他経費の入力状態
  const [newExpenseDesc, setNewExpenseDesc] = useState('')
  const [newExpenseAmt, setNewExpenseAmt] = useState('')

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => setToast({ msg, type })

  const fetchMarches = useCallback(async () => {
    const { data } = await supabase.from('marches').select('*').order('created_at', { ascending: false })
    setMarches(data ?? [])
    return data ?? []
  }, [])

  const fetchMarcheData = useCallback(async (marcheId: string) => {
    setLoading(true)
    const [{ data: evData }, { data: exData }, { data: expData }] = await Promise.all([
      supabase.from('events').select('*, purchase_items(*)').eq('marche_id', marcheId).order('created_at', { ascending: true }),
      supabase.from('exhibitors').select('*').eq('marche_id', marcheId).order('created_at', { ascending: true }),
      supabase.from('other_expenses').select('*').eq('marche_id', marcheId).order('created_at', { ascending: true }),
    ])
    setEvents(evData ?? [])
    setExhibitors(exData ?? [])
    setOtherExpenses(expData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchMarches().then((data) => {
      if (data.length > 0) {
        setCurrentMarche(data[0])
        fetchMarcheData(data[0].id)
      } else {
        setShowMarcheSelect(true)
        setLoading(false)
      }
    })
  }, [fetchMarches, fetchMarcheData])

  const handleSelectMarche = (m: Marche) => {
    setCurrentMarche(m)
    setShowMarcheSelect(false)
    setTab('dashboard')
    fetchMarcheData(m.id)
  }

  const handleCreateMarche = async (name: string, date: string, notes: string, docUrl: string) => {
    const { data, error } = await supabase.from('marches').insert({ name, date: date || null, status: 'planning', notes, doc_url: docUrl || null }).select().single()
    if (error) { showToast('作成に失敗しました', 'error'); return }
    await fetchMarches()
    handleSelectMarche(data)
  }

  const handleToggleMarcheStatus = async (m: Marche) => {
    const newStatus = m.status === 'closed' ? 'planning' : 'closed'
    const label = newStatus === 'closed' ? '終了済みに変更しました' : '開催予定に戻しました'
    await supabase.from('marches').update({ status: newStatus }).eq('id', m.id)
    const updated = { ...m, status: newStatus as 'planning' | 'closed' }
    if (currentMarche?.id === m.id) setCurrentMarche(updated)
    setMarches((prev) => prev.map((x) => x.id === m.id ? updated : x))
    showToast(label)
  }

  const handleDeleteMarche = async (m: Marche) => {
    setConfirmDeleteMarche(m)
  }

  const handleConfirmDeleteMarche = async () => {
    if (!confirmDeleteMarche) return
    const { error } = await supabase.from('marches').delete().eq('id', confirmDeleteMarche.id)
    if (error) { showToast('削除に失敗しました', 'error'); return }
    const updated = marches.filter((x) => x.id !== confirmDeleteMarche.id)
    setMarches(updated)
    if (currentMarche?.id === confirmDeleteMarche.id) {
      setCurrentMarche(updated.length > 0 ? updated[0] : null)
      if (updated.length > 0) fetchMarcheData(updated[0].id)
      else { setEvents([]); setExhibitors([]); setOtherExpenses([]) }
    }
    setConfirmDeleteMarche(null)
    setShowMarcheSelect(updated.length === 0)
    showToast('削除しました')
  }

  // 催し物保存
  const handleSaveEvent = async (ev: Partial<Event>, draftItems: DraftItem[]) => {
    if (!currentMarche) { showToast('マルシェが選択されていません', 'error'); return }
    setSaving(true)
    try {
      let eventId = ev.id

      if (ev.id) {
        // 既存イベント更新
        const { error } = await supabase.from('events').update({
          name: ev.name,
          selling_price: ev.selling_price ?? 0,
          target_quantity: ev.target_quantity ?? 0,
          actual_quantity: ev.actual_quantity ?? null,
          actual_sales: ev.actual_sales ?? null,
          notes: ev.notes ?? '',
        }).eq('id', ev.id)
        if (error) throw new Error('催し物更新エラー: ' + error.message)
      } else {
        // 新規イベント追加
        const insertData: any = {
          name: ev.name,
          selling_price: ev.selling_price ?? 0,
          target_quantity: ev.target_quantity ?? 0,
          notes: ev.notes ?? '',
        }
        // marche_idが設定可能な場合のみ追加
        if (currentMarche.id) insertData.marche_id = currentMarche.id
        if (ev.actual_quantity != null) insertData.actual_quantity = ev.actual_quantity
        if (ev.actual_sales != null) insertData.actual_sales = ev.actual_sales

        const { data, error } = await supabase.from('events').insert(insertData).select().single()
        if (error) throw new Error('催し物追加エラー: ' + error.message)
        if (!data) throw new Error('保存後のデータが取得できませんでした')
        eventId = data.id
      }

      if (!eventId) throw new Error('イベントIDが取得できませんでした')

      // 仕入れ品目を削除して再挿入
      const { error: delError } = await supabase.from('purchase_items').delete().eq('event_id', eventId)
      if (delError) throw new Error('品目削除エラー: ' + delError.message)

      const valid = draftItems.filter((it) => it.item_name.trim())
      if (valid.length > 0) {
        const { error: insError } = await supabase.from('purchase_items').insert(
          valid.map((it) => ({
            event_id: eventId,
            item_name: it.item_name.trim(),
            quantity: Number(it.quantity) || 0,
            unit_cost: Math.round(Number(it.unit_cost) || 0),
            amount_override: it.amountLocked && it.amount !== '' ? Number(it.amount) : null,
          }))
        )
        if (insError) throw new Error('品目保存エラー: ' + insError.message)
      }

      await fetchMarcheData(currentMarche.id)
      setEventModal(null)
      showToast(ev.id ? '更新しました ✓' : '追加しました ✓')
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      showToast(msg.slice(0, 60), 'error')
      console.error('handleSaveEvent error:', e)
    } finally {
      setSaving(false)
    }
  }

  // 出展者保存
  const handleSaveExhibitor = async (ex: Partial<Exhibitor>) => {
    if (!currentMarche) return
    setSaving(true)
    try {
      if (ex.id) {
        await supabase.from('exhibitors').update({ name: ex.name, fee_target: ex.fee_target, fee_actual: ex.fee_actual, notes: ex.notes }).eq('id', ex.id)
      } else {
        await supabase.from('exhibitors').insert({ marche_id: currentMarche.id, name: ex.name, fee_target: ex.fee_target, fee_actual: ex.fee_actual, notes: ex.notes })
      }
      await fetchMarcheData(currentMarche.id)
      setExhibitorModal(null)
      showToast(ex.id ? '更新しました ✓' : '追加しました ✓')
    } catch (e: any) { showToast('エラー: ' + String(e?.message ?? e).slice(0,40), 'error'); console.error(e) }
    finally { setSaving(false) }
  }

  // その他経費追加
  const handleAddExpense = async () => {
    if (!currentMarche || !newExpenseDesc.trim()) { alert('内容を入力してください'); return }
    setSaving(true)
    try {
      await supabase.from('other_expenses').insert({ marche_id: currentMarche.id, description: newExpenseDesc.trim(), amount: Number(newExpenseAmt) || 0 })
      setNewExpenseDesc(''); setNewExpenseAmt('')
      await fetchMarcheData(currentMarche.id)
      showToast('追加しました ✓')
    } catch (e: any) { showToast('エラー: ' + String(e?.message ?? e).slice(0,40), 'error'); console.error(e) }
    finally { setSaving(false) }
  }

  // 削除
  const handleDelete = async () => {
    if (!confirmDelete) return
    setSaving(true)
    try {
      const table = confirmDelete.type === 'event' ? 'events' : confirmDelete.type === 'exhibitor' ? 'exhibitors' : 'other_expenses'
      await supabase.from(table).delete().eq('id', confirmDelete.id)
      if (currentMarche) await fetchMarcheData(currentMarche.id)
      setConfirmDelete(null)
      showToast('削除しました')
    } catch (e: any) { showToast('エラー: ' + String(e?.message ?? e).slice(0,40), 'error'); console.error(e) }
    finally { setSaving(false) }
  }

  const summary = calcMarcheSummary(events, exhibitors, otherExpenses)

  const tabs: [Tab, string][] = [
    ['dashboard', '📊'],
    ['events', '🎡'],
    ['exhibitors', '🏪'],
    ['expenses', '💴'],
    ['settlement', '📋'],
  ]

  const tabLabels: Record<Tab, string> = {
    dashboard: 'ダッシュボード',
    events: '催し物',
    exhibitors: '出展者',
    expenses: 'その他経費',
    settlement: '決算',
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ヘッダー */}
      <header className="bg-blue-600 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => setShowMarcheSelect(true)} className="text-left">
            <div className="text-base font-bold leading-tight truncate max-w-[200px]">
              🎪 {currentMarche?.name ?? 'マルシェ未選択'}
            </div>
            <div className="text-blue-200 text-xs flex items-center gap-1">
              <span>{currentMarche?.date ?? '—'}</span>
              {currentMarche && (
                <span className={`px-1.5 py-0.5 rounded text-xs ${currentMarche.status === 'closed' ? 'bg-gray-500' : 'bg-green-500'}`}>
                  {currentMarche.status === 'closed' ? '終了' : '開催予定'}
                </span>
              )}
              <span className="text-blue-300">▼ 切替</span>
            </div>
          </button>
          <div className="flex gap-2 shrink-0">
            {currentMarche && (
              <button onClick={() => handleToggleMarcheStatus(currentMarche)}
                className={`text-xs px-2 py-1.5 rounded-lg border ${currentMarche.status === 'closed' ? 'bg-green-500 border-green-400 text-white' : 'bg-blue-500 border-blue-400 text-white'}`}>
                {currentMarche.status === 'closed' ? '🔄 再開' : '終了する'}
              </button>
            )}
            {tab === 'settlement' && currentMarche && (
              <button onClick={() => exportSettlementCSV(currentMarche, events, exhibitors, otherExpenses)} className="bg-white text-blue-600 text-xs px-3 py-1.5 rounded-lg font-bold">CSV</button>
            )}
          </div>
        </div>
        {/* タブ */}
        <div className="max-w-4xl mx-auto flex border-t border-blue-500">
          {tabs.map(([t, icon]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium transition-colors flex flex-col items-center gap-0.5 ${tab === t ? 'bg-white text-blue-600' : 'text-blue-200'}`}>
              <span className="text-base">{icon}</span>
              <span>{tabLabels[t]}</span>
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5">
        {loading ? (
          <div className="text-center py-20 text-gray-400"><div className="text-4xl mb-3">⏳</div>読み込み中...</div>
        ) : !currentMarche ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">🎪</div>
            <p className="mb-4">マルシェを選択してください</p>
            <button onClick={() => setShowMarcheSelect(true)} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">マルシェを選択・作成</button>
          </div>
        ) : (
          <>
            {/* ─── ダッシュボード ─── */}
            {tab === 'dashboard' && (
              <div className="space-y-6">
                <section>
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">全体収支</h2>
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500 grid grid-cols-3">
                      <span>項目</span><span className="text-right">目標</span><span className="text-right">実績</span>
                    </div>
                    {[
                      { label: '催し物収入', target: summary.targetEventSales, actual: summary.actualEventSales },
                      { label: '出展者収入', target: summary.targetExhibitorFee, actual: summary.actualExhibitorFee },
                      { label: '収入合計', target: summary.targetIncome, actual: summary.actualIncome, bold: true },
                      { label: '催し物原価', target: -summary.eventCostTotal, actual: -summary.eventCostTotal },
                      { label: 'その他経費', target: -summary.otherExpenseTotal, actual: -summary.otherExpenseTotal },
                      { label: '支出合計', target: -summary.totalCost, actual: -summary.totalCost, bold: true },
                    ].map(({ label, target, actual, bold }) => (
                      <div key={label} className={`px-4 py-2.5 grid grid-cols-3 border-t border-gray-100 ${bold ? 'bg-gray-50' : ''}`}>
                        <span className={`text-sm ${bold ? 'font-bold' : 'text-gray-600'}`}>{label}</span>
                        <span className={`text-right text-sm font-medium ${(target ?? 0) < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmt(target)}</span>
                        <span className={`text-right text-sm font-medium ${actual == null ? 'text-gray-300' : actual < 0 ? 'text-red-600' : 'text-gray-800'}`}>{actual == null ? '—' : fmt(actual)}</span>
                      </div>
                    ))}
                    {/* 粗利行 */}
                    <div className="px-4 py-3 grid grid-cols-3 border-t-2 border-gray-300 bg-blue-50">
                      <span className="font-bold text-gray-900">粗利</span>
                      <span className={`text-right font-bold text-base ${summary.targetProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(summary.targetProfit)}</span>
                      <span className={`text-right font-bold text-base ${summary.actualProfit == null ? 'text-gray-300' : summary.actualProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{summary.actualProfit == null ? '未入力' : fmt(summary.actualProfit)}</span>
                    </div>
                    <div className="px-4 py-2.5 grid grid-cols-3 border-t border-blue-100 bg-blue-50">
                      <span className="text-sm text-gray-600">粗利率</span>
                      <span className="text-right text-sm font-medium">{pct(summary.targetMargin)}</span>
                      <span className={`text-right text-sm font-medium ${summary.actualMargin == null ? 'text-gray-300' : ''}`}>{summary.actualMargin == null ? '—' : pct(summary.actualMargin)}</span>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">催し物別進捗</h2>
                  <div className="space-y-2">
                    {events.map((ev) => {
                      const c = calcEvent(ev)
                      const hasActual = c.actualSales != null
                      const achieved = hasActual && c.actualSales! >= c.targetSales
                      const rate = c.targetSales > 0 && hasActual ? Math.min(100, (c.actualSales! / c.targetSales) * 100) : 0
                      return (
                        <div key={ev.id} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-gray-900">{ev.name}</span>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${!hasActual ? 'bg-gray-100 text-gray-400' : achieved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                              {!hasActual ? '実績未入力' : achieved ? '✅ 達成' : '⚠ 未達'}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                            <MiniStat label="目標売上" value={fmt(c.targetSales)} />
                            <MiniStat label="実績売上" value={hasActual ? fmt(c.actualSales) : '—'} color={hasActual ? (achieved ? 'text-green-600' : 'text-red-600') : 'text-gray-300'} bg={hasActual ? (achieved ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'} />
                            <MiniStat label="実績粗利" value={hasActual ? fmt(c.actualProfit) : '—'} color={hasActual ? ((c.actualProfit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-300'} bg="bg-gray-50" />
                          </div>
                          {hasActual && (
                            <div>
                              <div className="flex justify-between text-xs text-gray-400 mb-1"><span>達成率</span><span>{rate.toFixed(0)}%</span></div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div className={`h-2 rounded-full ${achieved ? 'bg-green-500' : 'bg-orange-400'}`} style={{ width: `${rate}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {events.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">催し物がありません</div>}
                  </div>
                </section>
              </div>
            )}

            {/* ─── 催し物 ─── */}
            {tab === 'events' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">催し物一覧</h2>
                  <button onClick={() => setEventModal({})} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-bold shadow">＋ 追加</button>
                </div>
                {events.length === 0 ? (
                  <div className="text-center py-16 text-gray-400"><div className="text-5xl mb-4">🎡</div><p className="mb-4">まだ催し物がありません</p><button onClick={() => setEventModal({})} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">＋ 追加する</button></div>
                ) : (
                  <div className="space-y-3">
                    {events.map((ev) => {
                      const c = calcEvent(ev)
                      const hasActual = c.actualSales != null
                      return (
                        <div key={ev.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div><h3 className="font-bold text-gray-900">{ev.name}</h3>{ev.notes && <p className="text-xs text-gray-400">{ev.notes}</p>}</div>
                            <div className="flex gap-2 shrink-0">
                              <button onClick={() => setEventModal(ev)} className="bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-lg">編集</button>
                              <button onClick={() => setConfirmDelete({ type: 'event', id: ev.id, name: ev.name })} className="bg-red-50 text-red-500 text-xs px-3 py-1.5 rounded-lg">削除</button>
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
                            <span>単価 {fmt(ev.selling_price)}</span><span>目標 {ev.target_quantity ?? 0}個</span><span>粗利率 {pct(c.grossMargin)}</span><span>BEP {bep(c.breakeven)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ─── 出展者 ─── */}
            {tab === 'exhibitors' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">出展者一覧</h2>
                  <button onClick={() => setExhibitorModal({})} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-bold shadow">＋ 追加</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <SCard label="出展者数" value={`${exhibitors.length}件`} />
                  <SCard label="目標出展料合計" value={fmt(summary.targetExhibitorFee)} />
                  <SCard label="実績出展料合計" value={summary.actualExhibitorFee != null ? fmt(summary.actualExhibitorFee) : '未入力'} highlight={summary.actualExhibitorFee != null} />
                </div>
                {exhibitors.length === 0 ? (
                  <div className="text-center py-12 text-gray-400"><div className="text-5xl mb-4">🏪</div><p className="mb-4">まだ出展者がいません</p><button onClick={() => setExhibitorModal({})} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">＋ 追加する</button></div>
                ) : (
                  <div className="space-y-3">
                    {exhibitors.map((ex) => {
                      const hasActual = ex.fee_actual != null
                      const achieved = hasActual && ex.fee_actual! >= ex.fee_target
                      return (
                        <div key={ex.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div><h3 className="font-bold text-gray-900">{ex.name}</h3>{ex.notes && <p className="text-xs text-gray-400">{ex.notes}</p>}</div>
                            <div className="flex items-center gap-2">
                              {hasActual && <span className={`text-xs px-2 py-1 rounded-full ${achieved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{achieved ? '✅' : '⚠'}</span>}
                              <button onClick={() => setExhibitorModal(ex)} className="bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-lg">編集</button>
                              <button onClick={() => setConfirmDelete({ type: 'exhibitor', id: ex.id, name: ex.name })} className="bg-red-50 text-red-500 text-xs px-3 py-1.5 rounded-lg">削除</button>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <MiniStat label="目標" value={fmt(ex.fee_target)} />
                            <MiniStat label="実績" value={hasActual ? fmt(ex.fee_actual) : '未入力'} color={hasActual ? (achieved ? 'text-green-600' : 'text-red-600') : 'text-gray-300'} bg={hasActual ? (achieved ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'} />
                            <MiniStat label="差額" value={hasActual ? fmt(ex.fee_actual! - ex.fee_target) : '—'} color={hasActual ? (achieved ? 'text-green-600' : 'text-red-600') : 'text-gray-300'} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ─── その他経費 ─── */}
            {tab === 'expenses' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">その他経費</h2>
                  <div className="text-sm font-bold text-gray-700">合計 {fmt(summary.otherExpenseTotal)}</div>
                </div>

                {/* 入力フォーム */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-gray-700">＋ 経費を追加</h3>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">内容</label>
                    <input type="text" autoComplete="off"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="例：会場使用料" value={newExpenseDesc} onChange={(e) => setNewExpenseDesc(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">金額（円）</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" id="expense-amount"
                    autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                    value={newExpenseAmt} placeholder="0"
                    onChange={(e) => setNewExpenseAmt(e.target.value.replace(/[^0-9]/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddExpense() } }}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  </div>
                  <button onClick={handleAddExpense} disabled={saving}
                    className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:bg-blue-300">
                    追加する
                  </button>
                </div>

                {/* 経費一覧 */}
                {otherExpenses.length === 0 ? (
                  <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-3">💴</div><p>その他経費がまだありません</p></div>
                ) : (
                  <div className="space-y-2">
                    {otherExpenses.map((exp) => (
                      <div key={exp.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{exp.description}</div>
                          <div className="text-sm font-bold text-red-600 mt-0.5">{fmt(exp.amount)}</div>
                        </div>
                        <button onClick={() => setConfirmDelete({ type: 'expense', id: exp.id, name: exp.description })} className="bg-red-50 text-red-500 text-xs px-3 py-1.5 rounded-lg">削除</button>
                      </div>
                    ))}
                    <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                      <span className="font-bold text-gray-700">合計</span>
                      <span className="font-bold text-red-600 text-base">{fmt(summary.otherExpenseTotal)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── 決算 ─── */}
            {tab === 'settlement' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">イベント決算</h2>
                  <button onClick={() => exportSettlementCSV(currentMarche, events, exhibitors, otherExpenses)}
                    className="bg-green-600 text-white text-sm px-4 py-2 rounded-xl font-bold shadow">
                    📥 CSV出力
                  </button>
                </div>

                {/* 決算サマリ */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="bg-blue-600 text-white px-5 py-4">
                    <h3 className="text-base font-bold">{currentMarche.name}</h3>
                    <p className="text-blue-200 text-xs mt-1">開催日：{currentMarche.date ?? '—'}</p>
                  </div>
                  <div className="p-4 space-y-4">
                    {/* 収支サマリ */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">■ 収支サマリ</h4>
                      <div className="space-y-1">
                        {[
                          { label: '催し物収入', target: summary.targetEventSales, actual: summary.actualEventSales },
                          { label: '出展者収入', target: summary.targetExhibitorFee, actual: summary.actualExhibitorFee },
                          { label: '収入合計', target: summary.targetIncome, actual: summary.actualIncome, bold: true },
                          { label: '原価・経費合計', target: summary.totalCost, actual: summary.totalCost, neg: true },
                        ].map(({ label, target, actual, bold, neg }) => (
                          <div key={label} className={`flex justify-between text-sm py-1.5 ${bold ? 'border-t border-gray-200 font-bold' : 'text-gray-700'}`}>
                            <span>{label}</span>
                            <div className="flex gap-4 text-right">
                              <span className="w-24 text-gray-500">{fmt(neg ? -target : target)}</span>
                              <span className={`w-24 ${actual == null ? 'text-gray-300' : neg ? 'text-red-600' : 'text-gray-800'}`}>{actual == null ? '未入力' : fmt(neg ? -(actual as number) : actual)}</span>
                            </div>
                          </div>
                        ))}
                        {/* 粗利 */}
                        <div className="flex justify-between text-sm py-2 border-t-2 border-gray-300 font-bold">
                          <span className="text-gray-900">粗利</span>
                          <div className="flex gap-4 text-right">
                            <span className={`w-24 ${summary.targetProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(summary.targetProfit)}</span>
                            <span className={`w-24 ${summary.actualProfit == null ? 'text-gray-300' : summary.actualProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{summary.actualProfit == null ? '未入力' : fmt(summary.actualProfit)}</span>
                          </div>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 pb-1">
                          <span></span>
                          <div className="flex gap-4 text-right">
                            <span className="w-24">目標</span>
                            <span className="w-24">実績</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 催し物別 */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">■ 催し物別実績</h4>
                      <div className="space-y-2">
                        {events.map((ev) => {
                          const c = calcEvent(ev)
                          const hasActual = c.actualSales != null
                          const rate = c.targetSales > 0 && hasActual ? (c.actualSales! / c.targetSales * 100).toFixed(0) : '—'
                          return (
                            <div key={ev.id} className={`rounded-xl p-3 ${hasActual ? ((c.actualSales ?? 0) >= c.targetSales ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'}`}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-bold text-sm text-gray-900">{ev.name}</span>
                                <span className="text-xs text-gray-500">達成率 {rate}{rate !== '—' ? '%' : ''}</span>
                              </div>
                              <div className="grid grid-cols-4 gap-1 text-xs">
                                <div><div className="text-gray-400">原価</div><div className="font-bold">{fmt(c.costTotal)}</div></div>
                                <div><div className="text-gray-400">目標売上</div><div className="font-bold">{fmt(c.targetSales)}</div></div>
                                <div><div className="text-gray-400">実績売上</div><div className={`font-bold ${hasActual ? 'text-blue-700' : 'text-gray-300'}`}>{hasActual ? fmt(c.actualSales) : '—'}</div></div>
                                <div><div className="text-gray-400">実績粗利</div><div className={`font-bold ${c.actualProfit == null ? 'text-gray-300' : (c.actualProfit >= 0 ? 'text-green-600' : 'text-red-600')}`}>{c.actualProfit != null ? fmt(c.actualProfit) : '—'}</div></div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* 出展者別 */}
                    {exhibitors.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">■ 出展者別実績</h4>
                        <div className="space-y-1">
                          {exhibitors.map((ex) => (
                            <div key={ex.id} className="flex justify-between text-sm py-1.5 border-b border-gray-100">
                              <span className="text-gray-700">{ex.name}</span>
                              <div className="flex gap-4 text-right">
                                <span className="text-gray-500 w-20">{fmt(ex.fee_target)}</span>
                                <span className={`w-20 font-medium ${ex.fee_actual == null ? 'text-gray-300' : (ex.fee_actual >= ex.fee_target ? 'text-green-600' : 'text-red-600')}`}>{ex.fee_actual != null ? fmt(ex.fee_actual) : '未入力'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* その他経費 */}
                    {otherExpenses.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">■ その他経費</h4>
                        <div className="space-y-1">
                          {otherExpenses.map((exp) => (
                            <div key={exp.id} className="flex justify-between text-sm py-1.5 border-b border-gray-100">
                              <span className="text-gray-700">{exp.description}</span>
                              <span className="font-medium text-red-600">{fmt(exp.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm py-1.5 font-bold">
                            <span>合計</span><span className="text-red-600">{fmt(summary.otherExpenseTotal)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 実績入力状況 */}
                    <div className="bg-yellow-50 rounded-xl p-3 text-xs text-yellow-700">
                      実績入力状況：催し物 {summary.eventsWithActualCount}/{summary.totalEvents}件 入力済み
                      {summary.eventsWithActualCount < summary.totalEvents && ' ／ 未入力の催し物は「催し物」タブから入力できます'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* マルシェ選択モーダル */}
      {showMarcheSelect && (
        <MarcheSelectModal
          marches={marches}
          onSelect={handleSelectMarche}
          onCreate={handleCreateMarche}
          onToggleStatus={handleToggleMarcheStatus}
          onDelete={handleDeleteMarche}
          onClose={() => setShowMarcheSelect(false)}
        />
      )}

      {/* 催し物モーダル */}
      {eventModal !== null && (
        <EventModal event={eventModal} onSave={handleSaveEvent} onClose={() => setEventModal(null)} saving={saving} />
      )}

      {/* 出展者モーダル */}
      {exhibitorModal !== null && (
        <ExhibitorModal exhibitor={exhibitorModal} onSave={handleSaveExhibitor} onClose={() => setExhibitorModal(null)} saving={saving} />
      )}

      {/* 削除確認 */}
      {confirmDelete && (
        <Confirm message={`「${confirmDelete.name}」を削除しますか？\nこの操作は元に戻せません。`} onOk={handleDelete} onCancel={() => setConfirmDelete(null)} />
      )}

      {confirmDeleteMarche && (
        <Confirm
          message={`「${confirmDeleteMarche.name}」を完全に削除しますか？\n催し物・出展者データも全て削除されます。\nこの操作は元に戻せません。`}
          onOk={handleConfirmDeleteMarche}
          onCancel={() => setConfirmDeleteMarche(null)}
        />
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
