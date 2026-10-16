import { describe, it, expect } from "vitest"
import { periodStart, dayKey, salesSummary } from "./salesSummary"

// local-time dates, so the tests hold in any time zone
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime()
const NOW = at(2026, 9, 20, 15) // Sunday 20 Sep 2026, 3pm

const sale = (medicineId, qty, unitPrice, unitCost, when, extra = {}) =>
  ({ medicineId, medicineName: medicineId.toUpperCase(), qty, unitPrice, unitCost, soldAt: new Date(when), ...extra })

describe("periodStart", () => {
  it("starts today at midnight, 6 days back for '7d', 29 for '30d', and at 0 for all time", () => {
    expect(periodStart("today", NOW)).toBe(at(2026, 9, 20, 0))
    expect(periodStart("7d", NOW)).toBe(at(2026, 9, 14, 0))
    expect(periodStart("30d", NOW)).toBe(at(2026, 8, 22, 0))
    expect(periodStart("all", NOW)).toBe(0)
  })
})

describe("salesSummary", () => {
  const meds = [
    { id: "a", name: "Amoxicillin", category: "Antibiotic" },
    { id: "b", name: "Paracetamol", category: "Pain relief" },
    { id: "c", name: "Loose one" } // no category
  ]

  it("totals revenue, cost, profit, units and margin for priced sales", () => {
    const s = salesSummary([
      sale("a", 2, 0.75, 0.5, at(2026, 9, 20, 9)),   // rev 1.5, cost 1.0
      sale("b", 1, 2, 1, at(2026, 9, 20, 10))        // rev 2.0, cost 1.0
    ], meds, "today", NOW)
    expect(s.units).toBe(3)
    expect(s.revenue).toBe(3.5)
    expect(s.cost).toBe(2)
    expect(s.profit).toBe(1.5)
    expect(s.marginPercent).toBe(42.9)
  })

  it("only counts sales inside the period", () => {
    const sales = [
      sale("a", 1, 2, 1, at(2026, 9, 20, 9)),   // today
      sale("a", 1, 2, 1, at(2026, 9, 15, 9)),   // 5 days ago
      sale("a", 1, 2, 1, at(2026, 8, 25, 9)),   // 26 days ago
      sale("a", 1, 2, 1, at(2026, 6, 1, 9))     // long ago
    ]
    expect(salesSummary(sales, meds, "today", NOW).units).toBe(1)
    expect(salesSummary(sales, meds, "7d", NOW).units).toBe(2)
    expect(salesSummary(sales, meds, "30d", NOW).units).toBe(3)
    expect(salesSummary(sales, meds, "all", NOW).units).toBe(4)
  })

  it("keeps unpriced sales out of the money and reports them separately", () => {
    const s = salesSummary([
      sale("a", 1, 2, 1, at(2026, 9, 20, 9)),
      sale("a", 4, undefined, undefined, at(2026, 9, 20, 9)),
      sale("a", 1, 2, null, at(2026, 9, 20, 9))          // price but no cost: not guessed
    ], meds, "today", NOW)
    expect(s.units).toBe(1)
    expect(s.profit).toBe(1)
    expect(s.unpricedUnits).toBe(5)
  })

  it("counts a sale still waiting on its server timestamp as now", () => {
    const s = salesSummary([{ medicineId: "a", qty: 1, unitPrice: 2, unitCost: 1, soldAt: null }], meds, "today", NOW)
    expect(s.units).toBe(1)
  })

  it("ranks medicines by profit, and keeps deleted ones under their sale-time name", () => {
    const s = salesSummary([
      sale("a", 1, 2, 1.5, at(2026, 9, 20, 9)),   // profit 0.5
      sale("b", 3, 2, 1, at(2026, 9, 20, 9)),     // profit 3
      sale("gone", 1, 5, 1, at(2026, 9, 20, 9), { medicineName: "Deleted item" }) // profit 4
    ], meds, "today", NOW)
    expect(s.byMedicine.map(m => m.name)).toEqual(["Deleted item", "Paracetamol", "Amoxicillin"])
    expect(s.byMedicine[1]).toMatchObject({ units: 3, revenue: 6, cost: 3, profit: 3 })
  })

  it("groups profit by category, with a bucket for uncategorised and deleted medicines", () => {
    const s = salesSummary([
      sale("a", 1, 3, 1, at(2026, 9, 20, 9)),
      sale("b", 1, 2, 1, at(2026, 9, 20, 9)),
      sale("c", 1, 2, 1.5, at(2026, 9, 20, 9)),
      sale("gone", 1, 2, 1.5, at(2026, 9, 20, 9))
    ], meds, "today", NOW)
    const cats = Object.fromEntries(s.byCategory.map(c => [c.category, c.profit]))
    expect(cats).toEqual({ Antibiotic: 2, "Pain relief": 1, Uncategorized: 1 })
    expect(s.byCategory[0].category).toBe("Antibiotic")
  })

  it("gives one bar per calendar day for 7d and 30d, with zeros for quiet days", () => {
    const sales = [
      sale("a", 1, 3, 1, at(2026, 9, 20, 9)),
      sale("a", 1, 2, 1, at(2026, 9, 20, 18)),
      sale("a", 1, 2, 3, at(2026, 9, 16, 9))   // a loss
    ]
    const week = salesSummary(sales, meds, "7d", NOW).dailyProfit
    expect(week).toHaveLength(7)
    expect(week[0]).toEqual({ date: "2026-09-14", profit: 0 })
    expect(week[2]).toEqual({ date: "2026-09-16", profit: -1 })
    expect(week[6]).toEqual({ date: "2026-09-20", profit: 3 })
    expect(salesSummary(sales, meds, "30d", NOW).dailyProfit).toHaveLength(30)
  })

  it("has no daily series for today or all time", () => {
    expect(salesSummary([], meds, "today", NOW).dailyProfit).toEqual([])
    expect(salesSummary([], meds, "all", NOW).dailyProfit).toEqual([])
  })

  it("handles no sales at all", () => {
    expect(salesSummary([], [], "30d", NOW)).toMatchObject({
      units: 0, revenue: 0, cost: 0, profit: 0, marginPercent: null, unpricedUnits: 0, byMedicine: [], byCategory: []
    })
  })
})

describe("dayKey", () => {
  it("formats local dates as YYYY-MM-DD", () => {
    expect(dayKey(at(2026, 1, 5, 23))).toBe("2026-01-05")
  })
})
