// pricing.js
// Pure functions — no Firestore, no React. Prices are US dollars, stored as plain numbers (2.5 = $2.50).
// Missing prices are null, never 0, so "no price yet" is never mistaken for "free".
// buyPrice and sellPrice are per BOX; loose units are priced via unitSellPrice
// (or sellPrice ÷ unitsPerBox when that isn't set). See units.js.

import { salesInWindow } from "./forecast"
import { unitsPerBoxOf } from "./units"

const DAY_MS = 24 * 60 * 60 * 1000

export function formatMoney(amount) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—"
  const rounded = Math.round(amount * 100) / 100
  const digits = Math.abs(rounded).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${rounded < 0 ? "-" : ""}$${digits}`
}

/** Form text to a number: "" means not given (null); anything else is Number(). */
export function parsePrice(text) {
  return text === "" ? null : Number(text)
}

/** Valid = not given, or a number ≥ 0 with at most 2 decimals (whole cents). */
export function isValidPrice(n) {
  return n === null || (Number.isFinite(n) && n >= 0 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6)
}

/** Profit per box (sell − buy), or null if either price is missing. */
export function unitMargin(med) {
  if (med.buyPrice == null || med.sellPrice == null) return null
  return med.sellPrice - med.buyPrice
}

/** Margin as a percent of the sell price (one decimal), or null if unknown. */
export function marginPercent(med) {
  const margin = unitMargin(med)
  if (margin === null || !med.sellPrice) return null
  return Math.round((margin / med.sellPrice) * 1000) / 10
}

/** Price of one loose unit (or of one box when the medicine isn't sold loose). */
export function looseUnitPrice(med) {
  const perBox = unitsPerBoxOf(med)
  if (perBox === 1) return med.sellPrice ?? null
  if (med.unitSellPrice != null) return med.unitSellPrice
  return med.sellPrice == null ? null : med.sellPrice / perBox
}

/** Cost of one base unit, or null if the buy price is unknown. */
export function costPerUnit(med) {
  return med.buyPrice == null ? null : med.buyPrice / unitsPerBoxOf(med)
}

/**
 * What a sale of `count` boxes or units records. qty is in base units, and the
 * prices are per base unit, so a whole-box sale earns exactly the box price.
 */
export function saleLine(med, count, mode = "unit") {
  const perBox = unitsPerBoxOf(med)
  if (mode === "box" && perBox > 1) {
    return {
      qty: count * perBox,
      unitPrice: med.sellPrice == null ? null : med.sellPrice / perBox,
      unitCost: costPerUnit(med)
    }
  }
  return { qty: count, unitPrice: looseUnitPrice(med), unitCost: costPerUnit(med) }
}

/**
 * Value of everything on the shelf. Medicines missing a price are left out of
 * the totals that need it, and counted in unpricedCount so the gap is visible.
 */
export function stockValue(medicines, now = Date.now()) {
  let cost = 0
  let retail = 0
  let potentialProfit = 0
  let expiredCost = 0
  let unpricedCount = 0

  for (const med of medicines) {
    const boxes = med.qty / unitsPerBoxOf(med)
    const hasBuy = med.buyPrice != null
    const hasSell = med.sellPrice != null
    if (!hasBuy || !hasSell) unpricedCount++
    if (hasBuy) cost += boxes * med.buyPrice
    if (hasSell) retail += boxes * med.sellPrice
    if (hasBuy && hasSell) potentialProfit += boxes * (med.sellPrice - med.buyPrice)

    const expired = med.expiry && Math.ceil((new Date(med.expiry) - now) / DAY_MS) <= 0
    if (expired && hasBuy) expiredCost += boxes * med.buyPrice
  }

  return { cost, retail, potentialProfit, expiredCost, unpricedCount }
}

/**
 * Real profit from recorded sales in the last N weeks. Each sale carries the
 * price and cost it had at the moment of sale, so later price edits don't
 * rewrite history. Sales without both are counted in unpricedUnits, not guessed.
 */
export function profitFromSales(sales, medicineId, weeks = 4) {
  let units = 0
  let revenue = 0
  let cost = 0
  let unpricedUnits = 0

  for (const sale of salesInWindow(sales, medicineId, weeks)) {
    const qty = sale.qty || 1
    if (sale.unitPrice == null || sale.unitCost == null) {
      unpricedUnits += qty
      continue
    }
    units += qty
    revenue += sale.unitPrice * qty
    cost += sale.unitCost * qty
  }

  return { units, revenue, cost, profit: revenue - cost, unpricedUnits }
}
