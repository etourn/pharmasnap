import { describe, it, expect } from "vitest"
import {
  formatMoney, parsePrice, isValidPrice, unitMargin, marginPercent,
  looseUnitPrice, costPerUnit, saleLine, stockValue, profitFromSales
} from "./pricing"

const DAY = 86400000

describe("formatMoney", () => {
  it("formats dollars with cents and thousands separators", () => {
    expect(formatMoney(1500)).toBe("$1,500.00")
    expect(formatMoney(2.5)).toBe("$2.50")
    expect(formatMoney(0.8)).toBe("$0.80")
    expect(formatMoney(0)).toBe("$0.00")
  })
  it("puts the minus sign before the dollar sign, and never shows -$0.00", () => {
    expect(formatMoney(-3)).toBe("-$3.00")
    expect(formatMoney(-1234.5)).toBe("-$1,234.50")
    expect(formatMoney(-0.004)).toBe("$0.00")
  })
  it("rounds to the cent and shows a dash for unknown", () => {
    expect(formatMoney(1.005 + 0.0004)).toBe("$1.01")
    expect(formatMoney(null)).toBe("—")
    expect(formatMoney(undefined)).toBe("—")
    expect(formatMoney(NaN)).toBe("—")
  })
})

describe("price parsing", () => {
  it("treats empty as not given, and parses decimals", () => {
    expect(parsePrice("")).toBe(null)
    expect(parsePrice("800")).toBe(800)
    expect(parsePrice("2.50")).toBe(2.5)
  })

  it("accepts whole cents and rejects negatives, fractions of a cent and junk", () => {
    for (const ok of [null, 0, 800, 1.5, 2.5, 0.05, 19.99, 0.1 + 0.2 /* float noise */]) {
      expect(isValidPrice(ok)).toBe(true)
    }
    for (const bad of [-1, -0.01, 1.234, 0.001, NaN, Infinity]) {
      expect(isValidPrice(bad)).toBe(false)
    }
  })
})

describe("margin", () => {
  it("computes per-box margin and percent of sell price", () => {
    expect(unitMargin({ buyPrice: 500, sellPrice: 800 })).toBe(300)
    expect(unitMargin({ buyPrice: 800, sellPrice: 500 })).toBe(-300)
    expect(marginPercent({ buyPrice: 500, sellPrice: 800 })).toBe(37.5)
  })
  it("returns null when a price is missing, and treats 0 as a real price", () => {
    expect(unitMargin({ buyPrice: 500 })).toBe(null)
    expect(unitMargin({})).toBe(null)
    expect(unitMargin({ buyPrice: 0, sellPrice: 500 })).toBe(500)
    expect(marginPercent({ buyPrice: 500, sellPrice: 0 })).toBe(null)
  })
})

describe("loose units", () => {
  const strips = { unitsPerBox: 10, unitName: "strip", buyPrice: 5000, sellPrice: 8000 }

  it("defaults the loose price to sellPrice ÷ unitsPerBox, and honours an override", () => {
    expect(looseUnitPrice(strips)).toBe(800)
    expect(looseUnitPrice({ ...strips, unitSellPrice: 1000 })).toBe(1000)
    expect(looseUnitPrice({ unitsPerBox: 10 })).toBe(null)
    expect(looseUnitPrice({ sellPrice: 800 })).toBe(800) // whole-box medicine: the box price
  })

  it("splits cost per unit", () => {
    expect(costPerUnit(strips)).toBe(500)
    expect(costPerUnit({ buyPrice: 500 })).toBe(500)
    expect(costPerUnit({})).toBe(null)
  })

  it("records a loose sale in base units", () => {
    expect(saleLine(strips, 2, "unit")).toEqual({ qty: 2, unitPrice: 800, unitCost: 500 })
  })

  it("records a whole-box sale so revenue equals the box price", () => {
    const line = saleLine({ ...strips, unitSellPrice: 1000 }, 1, "box")
    expect(line.qty).toBe(10)
    expect(line.qty * line.unitPrice).toBe(8000) // box price, not 10 × the dearer loose price
    expect(line.qty * line.unitCost).toBe(5000)
  })

  it("treats a whole-box medicine's sale the same in either mode", () => {
    const med = { buyPrice: 500, sellPrice: 800 }
    expect(saleLine(med, 3, "box")).toEqual({ qty: 3, unitPrice: 800, unitCost: 500 })
    expect(saleLine(med, 3, "unit")).toEqual({ qty: 3, unitPrice: 800, unitCost: 500 })
  })

  it("passes unknown prices through as null", () => {
    expect(saleLine({ unitsPerBox: 10 }, 1, "box")).toEqual({ qty: 10, unitPrice: null, unitCost: null })
  })
})

describe("stockValue", () => {
  const now = Date.UTC(2026, 8, 20)

  it("totals cost, retail and potential profit in boxes", () => {
    const meds = [
      { qty: 10, buyPrice: 500, sellPrice: 800 },
      { qty: 25, unitsPerBox: 10, buyPrice: 5000, sellPrice: 8000 } // 2.5 boxes
    ]
    expect(stockValue(meds, now)).toEqual({
      cost: 10 * 500 + 2.5 * 5000,
      retail: 10 * 800 + 2.5 * 8000,
      potentialProfit: 10 * 300 + 2.5 * 3000,
      expiredCost: 0,
      unpricedCount: 0
    })
  })

  it("counts medicines missing a price instead of guessing", () => {
    const v = stockValue([
      { qty: 4, buyPrice: 500 },              // no sell price
      { qty: 4, sellPrice: 800 },             // no buy price
      { qty: 4 }                              // neither
    ], now)
    expect(v.unpricedCount).toBe(3)
    expect(v.cost).toBe(2000)
    expect(v.retail).toBe(3200)
    expect(v.potentialProfit).toBe(0)
  })

  it("reports the cost of expired stock", () => {
    const v = stockValue([
      { qty: 4, buyPrice: 500, sellPrice: 800, expiry: "2026-09-01" },
      { qty: 4, buyPrice: 500, sellPrice: 800, expiry: "2027-01-01" }
    ], now)
    expect(v.expiredCost).toBe(2000)
  })

  it("returns zeros for an empty inventory", () => {
    expect(stockValue([], now)).toEqual({ cost: 0, retail: 0, potentialProfit: 0, expiredCost: 0, unpricedCount: 0 })
  })
})

describe("profitFromSales", () => {
  const now = Date.now()
  const sales = [
    { medicineId: "a", qty: 1, unitPrice: 800, unitCost: 500, soldAt: new Date(now - DAY) },
    { medicineId: "a", qty: 2, unitPrice: 900, unitCost: 500, soldAt: new Date(now - 2 * DAY) },
    { medicineId: "a", qty: 1, soldAt: new Date(now - DAY) },                                    // old sale, no prices
    { medicineId: "a", qty: 1, unitPrice: 800, unitCost: 500, soldAt: new Date(now - 40 * DAY) }, // outside 4 weeks
    { medicineId: "b", qty: 1, unitPrice: 100, unitCost: 50, soldAt: new Date(now - DAY) },       // other medicine
    { medicineId: "a", qty: 1, unitPrice: 800, unitCost: 500, soldAt: null }                      // pending server timestamp
  ]

  it("sums priced sales in the window and reports the unpriced ones", () => {
    expect(profitFromSales(sales, "a", 4)).toEqual({
      units: 3, revenue: 2600, cost: 1500, profit: 1100, unpricedUnits: 1
    })
  })

  it("returns zeros with no sales", () => {
    expect(profitFromSales([], "a")).toEqual({ units: 0, revenue: 0, cost: 0, profit: 0, unpricedUnits: 0 })
  })
})
