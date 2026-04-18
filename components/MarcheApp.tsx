'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { calcEvent, fmt, pct, bep, exportCSV } from '@/lib/calc'
import type { Event, PurchaseItem } from '@/lib/types'

// ─── Toast ────────────────────────────────────────────────
function Toast({
  msg,
  type,
  onClose,
}: {
  msg: string
  type: 'success' | 'error'
  onClose: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <div
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
        type === 'error' ? 'bg-red-500' : 'bg-green-600'
      }`}
    >
      {msg}
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────
function ConfirmDialog({
  message,
  onOk,
  onCancel,
}: {
  message: string
  onOk: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <p className="text-gray-800 mb-6 text-center whitespace-pre-line">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium"
          >
            キャンセル
          </button>
          <button
            onClick={onOk}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white font-medium"
          >
            削除する
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 新規仕入れ品目 ────────────────────────────────────────
type DraftItem = {
  id: string
  item_name: string
  quantity: string
  unit_cost: string
}

const newDraftItem = (): DraftItem => ({
  id: crypto.randomUUID(),
  item_name: '',
  quantity: '',
  unit_cost: '',
})

// ─── 催し物編集モーダル ───────────────────────────────────
function EventModal({
  event,
  onSave,
  onClose,
  loading,
}: {
  event: Partial<Event> | null
  onSave: (ev: Partial<Event>, items: DraftItem[]) => Promise<void>
  onClose: () => void
  loading: boolean
}) {
  const isNew = !event?.id
  const [name, setName] = useState(event?.name ?? '')
  const [sellingPrice, setSellingPrice] = useState(
    event?.selling_price != null ? String(event.selling_price) : ''
  )
  const [targetQty, setTargetQty] = useState(
    event?.target_quantity != null ? String(event.target_quantity) : ''
  )
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [items, setItems] = useState<DraftItem[]>(
    event?.purchase_items && event.purchase_items.length > 0
      ? event.purchase_items.map((it) => ({
          id: it.id,
          item_name: it.item_name,
          quantity: String(it.quantity),
          unit_cost: String(it.unit_cost),
        }))
      : [newDraftItem()]
  )

  const setItem = (idx: number, k: keyof DraftItem, v: string) =>
    setItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [k]: v }
      return next
    })
  const addItem = () => setItems((prev) => [...prev, newDraftItem()])
  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx))

  // 収支計算（プレビュー用）
  const previewEvent: Event = {
    id: event?.id ?? '',
    name,
    selling_price: Number(sellingPrice) || 0,
    target_quantity: Number(targetQty) || 0,
    notes,
    purchase_items: items.map((it) => ({
      id: it.id,
      event_id: event?.id ?? '',
      item_name: it.item_name,
      quantity: Number(it.quantity) || 0,
      unit_cost: Number(it.unit_cost) || 0,
    })),
  }
  const c = calcEvent(previewEvent)

  const handleSave = async () => {
    if (!name.trim()) {
      alert('催し物名を入力してください')
      return
    }
    await onSave(
      {
        id: event?.id,
        name: name.trim(),
        selling_price: Number(sellingPrice) || 0,
        target_quantity: Number(targetQty) || 0,
        notes: notes.trim(),
      },
      items
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex flex-col">
      <div className="bg-white flex-1 overflow-y-auto flex flex-col max-w-2xl w-full mx-auto">
        {/* ヘッダー */}
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center gap-3 z-10">
          <button
            onClick={onClose}
            className="text-gray-500 text-2xl w-8 h-8 flex items-center justify-center"
          >
            ✕
          </button>
          <h2 className="text-lg font-bold flex-1">
            {isNew ? '催し物を追加' : '催し物を編集'}
          </h2>
        </div>

        <div className="p-4 space-y-6 pb-36">
          {/* 基本情報 */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              基本情報
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  催し物名 <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例：ヨーヨー釣り"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    販売単価（円）
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    目標個数
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                    value={targetQty}
                    onChange={(e) => setTargetQty(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  備考
                </label>
                <textarea
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="メモがあれば"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* 仕入れ品目 */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              仕入れ品目
            </h3>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item.id} className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-400">
                      品目 {idx + 1}
                    </span>
                    {items.length > 1 && (
                      <button
                        onClick={() => removeItem(idx)}
                        className="text-red-400 text-sm font-medium"
                      >
                        削除
                      </button>
                    )}
                  </div>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="品目名（例：ヨーヨー風船）"
                    value={item.item_name}
                    onChange={(e) => setItem(idx, 'item_name', e.target.value)}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">数量</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="0"
                        value={item.quantity}
                        onChange={(e) => setItem(idx, 'quantity', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">単価（円）</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="0"
                        value={item.unit_cost}
                        onChange={(e) => setItem(idx, 'unit_cost', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">金額</label>
                      <div className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-100 text-gray-700">
                        {(Number(item.quantity) || 0) * (Number(item.unit_cost) || 0) > 0
                          ? '¥' +
                            (
                              (Number(item.quantity) || 0) *
                              (Number(item.unit_cost) || 0)
                            ).toLocaleString()
                          : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={addItem}
                className="w-full py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 text-sm font-medium active:bg-blue-50"
              >
                ＋ 品目を追加
              </button>
            </div>
          </section>

          {/* 収支サマリ */}
          <section className="bg-blue-50 rounded-2xl p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
              収支サマリ（自動計算）
            </h3>
            <div className="space-y-2 text-sm">
              <Row label="原価合計" value={fmt(c.costTotal)} />
              <Row label="目標売上" value={fmt(c.targetSales)} />
              <div className="border-t border-blue-200 pt-2 mt-2">
                <Row
                  label="粗利"
                  value={fmt(c.grossProfit)}
                  highlight
                  loss={c.grossProfit < 0}
                />
                <Row
                  label="粗利率"
                  value={pct(c.grossMargin)}
                  loss={c.grossMargin != null && c.grossMargin < 0}
                />
                <Row label="損益分岐点" value={bep(c.breakeven)} />
              </div>
            </div>
          </section>
        </div>

        {/* 保存ボタン（固定） */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-4 max-w-2xl mx-auto">
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full bg-blue-600 disabled:bg-blue-300 text-white py-4 rounded-xl text-base font-bold shadow active:bg-blue-700"
          >
            {loading ? '保存中...' : '💾 保存する'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  highlight,
  loss,
}: {
  label: string
  value: string
  highlight?: boolean
  loss?: boolean
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-600">{label}</span>
      <span
        className={`font-bold ${
          highlight
            ? loss
              ? 'text-red-600 text-lg'
              : 'text-green-600 text-lg'
            : loss
            ? 'text-red-500'
            : 'text-gray-800'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

// ─── メインアプリ ─────────────────────────────────────────
export default function MarcheApp() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalEvent, setModalEvent] = useState<Partial<Event> | null | 'new'>(null)
  const [confirmEvent, setConfirmEvent] = useState<Event | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') =>
    setToast({ msg, type })

  // ─── データ取得 ───────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('events')
      .select('*, purchase_items(*)')
      .order('created_at', { ascending: true })

    if (error) {
      showToast('データの取得に失敗しました', 'error')
    } else {
      setEvents(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // ─── 保存（追加 or 更新） ─────────────────────────────
  const handleSave = async (
    ev: Partial<Event>,
    draftItems: DraftItem[]
  ) => {
    setSaving(true)
    try {
      let eventId = ev.id

      if (ev.id) {
        // 更新
        const { error } = await supabase
          .from('events')
          .update({
            name: ev.name,
            selling_price: ev.selling_price,
            target_quantity: ev.target_quantity,
            notes: ev.notes,
          })
          .eq('id', ev.id)
        if (error) throw error
      } else {
        // 新規
        const { data, error } = await supabase
          .from('events')
          .insert({
            name: ev.name,
            selling_price: ev.selling_price,
            target_quantity: ev.target_quantity,
            notes: ev.notes,
          })
          .select()
          .single()
        if (error) throw error
        eventId = data.id
      }

      // 仕入れ品目：既存を全削除して再挿入（シンプル戦略）
      await supabase.from('purchase_items').delete().eq('event_id', eventId)

      const validItems = draftItems.filter((it) => it.item_name.trim())
      if (validItems.length > 0) {
        const { error } = await supabase.from('purchase_items').insert(
          validItems.map((it) => ({
            event_id: eventId,
            item_name: it.item_name.trim(),
            quantity: Number(it.quantity) || 0,
            unit_cost: Number(it.unit_cost) || 0,
          }))
        )
        if (error) throw error
      }

      await fetchEvents()
      setModalEvent(null)
      showToast(ev.id ? '更新しました ✓' : '追加しました ✓')
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ─── 削除 ─────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirmEvent) return
    setSaving(true)
    try {
      // purchase_items は ON DELETE CASCADE で自動削除
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', confirmEvent.id)
      if (error) throw error
      await fetchEvents()
      setConfirmEvent(null)
      showToast('削除しました')
    } catch {
      showToast('削除に失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ─── 集計 ─────────────────────────────────────────────
  const totals = events.reduce(
    (acc, ev) => {
      const c = calcEvent(ev)
      acc.cost += c.costTotal
      acc.sales += c.targetSales
      acc.profit += c.grossProfit
      acc.qty += Number(ev.target_quantity) || 0
      return acc
    },
    { cost: 0, sales: 0, profit: 0, qty: 0 }
  )
  const totalMargin = totals.sales > 0 ? totals.profit / totals.sales : null

  // ─── モーダルに渡すイベント ───────────────────────────
  const currentModal =
    modalEvent === 'new' ? {} : modalEvent

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-blue-600 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold leading-tight">🎪 マルシェ収支管理</h1>
            <p className="text-blue-200 text-xs">{events.length} 件の催し物</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportCSV(events)}
              className="bg-blue-500 border border-blue-400 text-white text-xs px-3 py-2 rounded-lg font-medium active:bg-blue-700"
            >
              CSV出力
            </button>
            <button
              onClick={() => setModalEvent('new')}
              className="bg-white text-blue-600 text-sm px-4 py-2 rounded-lg font-bold shadow active:bg-blue-50"
            >
              ＋ 追加
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-6">
        {/* ダッシュボード */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            全体サマリ
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="催し物数" value={`${events.length} 件`} />
            <StatCard label="原価総額" value={fmt(totals.cost)} />
            <StatCard label="目標売上総額" value={fmt(totals.sales)} />
            <StatCard
              label="粗利総額"
              value={fmt(totals.profit)}
              highlight
              loss={totals.profit < 0}
            />
            <StatCard label="全体粗利率" value={pct(totalMargin)} />
            <StatCard
              label="目標個数合計"
              value={totals.qty.toLocaleString() + ' 個'}
            />
          </div>
        </section>

        {/* 催し物一覧 */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            催し物一覧
          </h2>

          {loading ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-3xl mb-3 animate-bounce">⏳</div>
              読み込み中...
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-4">🎪</div>
              <p className="mb-4">まだ催し物がありません</p>
              <button
                onClick={() => setModalEvent('new')}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold"
              >
                ＋ 最初の催し物を追加
              </button>
            </div>
          ) : (
            <>
              {/* スマホ：カード表示 */}
              <div className="space-y-3 sm:hidden">
                {events.map((ev) => (
                  <EventCard
                    key={ev.id}
                    ev={ev}
                    onEdit={() => setModalEvent(ev)}
                    onDelete={() => setConfirmEvent(ev)}
                  />
                ))}
              </div>

              {/* PC：テーブル表示 */}
              <div className="hidden sm:block overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs border-b border-gray-200">
                      {[
                        '催し物名',
                        '原価合計',
                        '単価',
                        '目標個数',
                        '目標売上',
                        '粗利',
                        '粗利率',
                        'BEP',
                        '',
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 font-semibold text-left last:text-right"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {events.map((ev) => {
                      const c = calcEvent(ev)
                      const isLoss = c.grossProfit < 0
                      return (
                        <tr key={ev.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {ev.name}
                            {ev.notes && (
                              <span className="block text-xs text-gray-400 font-normal">
                                {ev.notes}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-700">{fmt(c.costTotal)}</td>
                          <td className="px-4 py-3 text-gray-700">{fmt(ev.selling_price)}</td>
                          <td className="px-4 py-3 text-gray-700">
                            {(ev.target_quantity || 0).toLocaleString()}個
                          </td>
                          <td className="px-4 py-3 text-gray-700">{fmt(c.targetSales)}</td>
                          <td
                            className={`px-4 py-3 font-bold ${
                              isLoss ? 'text-red-600' : 'text-green-600'
                            }`}
                          >
                            {fmt(c.grossProfit)}
                          </td>
                          <td
                            className={`px-4 py-3 font-medium ${
                              isLoss ? 'text-red-500' : 'text-green-600'
                            }`}
                          >
                            {pct(c.grossMargin)}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{bep(c.breakeven)}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => setModalEvent(ev)}
                                className="bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-lg hover:bg-gray-200"
                              >
                                編集
                              </button>
                              <button
                                onClick={() => setConfirmEvent(ev)}
                                className="bg-red-50 text-red-500 text-xs px-3 py-1.5 rounded-lg hover:bg-red-100"
                              >
                                削除
                              </button>
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
        </section>

        <div className="h-8" />
      </main>

      {/* モーダル */}
      {currentModal !== null && (
        <EventModal
          event={currentModal}
          onSave={handleSave}
          onClose={() => setModalEvent(null)}
          loading={saving}
        />
      )}

      {/* 削除確認 */}
      {confirmEvent && (
        <ConfirmDialog
          message={`「${confirmEvent.name}」を削除しますか？\nこの操作は元に戻せません。`}
          onOk={handleDelete}
          onCancel={() => setConfirmEvent(null)}
        />
      )}

      {/* トースト */}
      {toast && (
        <Toast
          msg={toast.msg}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}

// ─── StatCard ─────────────────────────────────────────────
function StatCard({
  label,
  value,
  highlight,
  loss,
}: {
  label: string
  value: string
  highlight?: boolean
  loss?: boolean
}) {
  return (
    <div
      className={`rounded-2xl p-4 shadow-sm ${
        highlight
          ? loss
            ? 'bg-red-500 text-white'
            : 'bg-blue-600 text-white'
          : 'bg-white border border-gray-200'
      }`}
    >
      <div
        className={`text-xs mb-1 ${
          highlight ? 'text-white/70' : 'text-gray-500'
        }`}
      >
        {label}
      </div>
      <div
        className={`text-xl font-bold ${
          highlight ? 'text-white' : 'text-gray-900'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

// ─── EventCard（スマホ用） ─────────────────────────────────
function EventCard({
  ev,
  onEdit,
  onDelete,
}: {
  ev: Event
  onEdit: () => void
  onDelete: () => void
}) {
  const c = calcEvent(ev)
  const isLoss = c.grossProfit < 0
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-gray-900">{ev.name}</h3>
          {ev.notes && (
            <p className="text-xs text-gray-400 mt-0.5">{ev.notes}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-lg font-medium active:bg-gray-200"
          >
            編集
          </button>
          <button
            onClick={onDelete}
            className="bg-red-50 text-red-500 text-xs px-3 py-1.5 rounded-lg font-medium active:bg-red-100"
          >
            削除
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="原価合計" value={fmt(c.costTotal)} />
        <MiniStat label="目標売上" value={fmt(c.targetSales)} />
        <MiniStat
          label="粗利"
          value={fmt(c.grossProfit)}
          color={isLoss ? 'text-red-600' : 'text-green-600'}
          bg={isLoss ? 'bg-red-50' : 'bg-green-50'}
        />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>単価 {fmt(ev.selling_price)}</span>
        <span>目標 {(ev.target_quantity || 0).toLocaleString()}個</span>
        <span>粗利率 {pct(c.grossMargin)}</span>
        <span>BEP {bep(c.breakeven)}</span>
      </div>
    </div>
  )
}

function MiniStat({
  label,
  value,
  color = 'text-gray-800',
  bg = 'bg-gray-50',
}: {
  label: string
  value: string
  color?: string
  bg?: string
}) {
  return (
    <div className={`${bg} rounded-xl p-2 text-center`}>
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`font-bold text-sm ${color}`}>{value}</div>
    </div>
  )
}

// DraftItem を型として再エクスポート（EventModalで使用）

