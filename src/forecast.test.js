import { describe, it, expect } from "vitest"
import { getDemandForecast, getExpiryRisk } from "./forecast"

const DAY = 86400000
const sale = (medicineId, qty, daysAgo, extra = {}) => ({
  medicineId, qty, soldAt: new Date(Date.now() - daysAgo * DAY), ...extra
})

describe("getDemandForecast", () => {
  it("keeps whole-box behaviour: 8 sold in 4 weeks = 2/week, reorder covers 2 weeks", () => {
    const [f] = getDemandForecast([{ id: "a", name: "A", qty: 1 }], [sale("a", 8, 3)])
    expect(f.weeklyVelocity).toBe(2)
    expect(f.suggestedReorder).toBe(3) // need 4, have 1
    expect(f.hasHistory).toBe(true)
  })

  it("returns null reorder when there is no history", () => {
    const [f] = getDemandForecast([{ id: "a", name: "A", qty: 1 }], [])
    expect(f.suggestedReorder).toBe(null)
    expect(f.hasHistory).toBe(false)
  })

  it("measures loose medicines in units but suggests whole boxes", () => {
    const med = { id: "a", name: "A", qty: 5, unitsPerBox: 10, unitName: "strip" }
    // 40 strips in 4 weeks = 10/week; 2 weeks = 20 strips, have 5 -> need 15 -> 2 boxes
    const [f] = getDemandForecast([med], [sale("a", 40, 3, { unitsPerBox: 10 })])
    expect(f.weeklyVelocity).toBe(10)
    expect(f.suggestedReorder).toBe(2)
    expect(f.unitsPerBox).toBe(10)
  })

  it("converts old whole-box sales after the medicine gains a box size", () => {
    // 2 boxes were sold before it was set up as 10 strips per box (sale has no snapshot)
    const med = { id: "a", name: "A", qty: 0, unitsPerBox: 10, unitName: "strip" }
    const [f] = getDemandForecast([med], [sale("a", 2, 3)])
    expect(f.weeklyVelocity).toBe(5) // 20 strips / 4 weeks
  })

  it("ignores sales older than the window and other medicines", () => {
    const [f] = getDemandForecast(
      [{ id: "a", name: "A", qty: 0 }],
      [sale("a", 100, 60), sale("b", 100, 1)]
    )
    expect(f.weeklyVelocity).toBe(0)
  })
})

describe("getExpiryRisk", () => {
  const inDays = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10)

  it("flags stock that will not sell out before expiry", () => {
    const med = { id: "a", name: "A", qty: 100, expiry: inDays(30) }
    const [r] = getExpiryRisk([med], [sale("a", 4, 3)])
    expect(r.atRisk).toBe(true)
    expect(r.projectedLeftover).toBeGreaterThan(90)
  })

  it("skips expired stock and stock with no expiry", () => {
    const meds = [{ id: "a", qty: 5, expiry: inDays(-3) }, { id: "b", qty: 5 }]
    expect(getExpiryRisk(meds, [])).toEqual([])
  })
})
