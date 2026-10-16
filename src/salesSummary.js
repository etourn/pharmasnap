// salesSummary.js
// Pure functions — no Firestore, no React. Turns the sales log into store-wide
// profit numbers for a period.
//
// Only sales recorded WITH a price and a cost count toward revenue/profit; the
// rest are reported as unpricedUnits instead of being guessed at.

import { soldAtDate } from "./forecast"

export const PERIODS = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "all", label: "All time", days: null }
]

const UNCATEGORIZED = "Uncategorized"

const pad = (n) => String(n).padStart(2, "0")
export function dayKey(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Start of the period in ms: local midnight, `days − 1` days back (so "7 days" = today + the 6 before). */
export function periodStart(period, now = Date.now()) {
  const p = PERIODS.find(x => x.key === period)
  if (!p || p.days === null) return 0
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (p.days - 1))
  return d.getTime()
}

function addTo(map, key, patch) {
  const row = map.get(key) ?? { units: 0, revenue: 0, cost: 0 }
  row.units += patch.units
  row.revenue += patch.revenue
  row.cost += patch.cost
  map.set(key, row)
  return row
}

/**
 * Store-wide sales summary for a period.
 * sales: { medicineId, medicineName, qty, unitPrice, unitCost, soldAt }
 * A sale still waiting on its server timestamp (soldAt null) counts as "now".
 */
export function salesSummary(sales, medicines, period, now = Date.now()) {
  const start = periodStart(period, now)
  const medById = new Map(medicines.map(m => [m.id, m]))
  const byMedicine = new Map()
  const byCategory = new Map()
  const byDay = new Map()
  let units = 0
  let revenue = 0
  let cost = 0
  let unpricedUnits = 0

  for (const sale of sales) {
    const time = sale.soldAt ? soldAtDate(sale).getTime() : now
    if (time < start) continue

    const qty = sale.qty || 1
    if (sale.unitPrice == null || sale.unitCost == null) {
      unpricedUnits += qty
      continue
    }

    const patch = { units: qty, revenue: sale.unitPrice * qty, cost: sale.unitCost * qty }
    units += patch.units
    revenue += patch.revenue
    cost += patch.cost

    const med = medById.get(sale.medicineId)
    addTo(byMedicine, sale.medicineId, patch).name = med?.name ?? sale.medicineName ?? "Deleted medicine"
    addTo(byCategory, med?.category || UNCATEGORIZED, patch)
    addTo(byDay, dayKey(time), patch)
  }

  const withProfit = (row) => ({ ...row, profit: row.revenue - row.cost })
  const byProfitDesc = (a, b) => b.profit - a.profit
  const profit = revenue - cost

  // one bar per calendar day for the 7- and 30-day views, including days with no sales
  const days = PERIODS.find(p => p.key === period)?.days
  const dailyProfit = []
  if (days && days > 1) {
    const d = new Date(start)
    for (let i = 0; i < days; i++) {
      const key = dayKey(d.getTime())
      const row = byDay.get(key)
      dailyProfit.push({ date: key, profit: row ? row.revenue - row.cost : 0 })
      d.setDate(d.getDate() + 1)
    }
  }

  return {
    units,
    revenue,
    cost,
    profit,
    marginPercent: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null,
    unpricedUnits,
    byMedicine: [...byMedicine.entries()].map(([id, row]) => withProfit({ id, ...row })).sort(byProfitDesc),
    byCategory: [...byCategory.entries()].map(([category, row]) => withProfit({ category, ...row })).sort(byProfitDesc),
    dailyProfit
  }
}
