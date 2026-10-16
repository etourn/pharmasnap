// forecast.js
// Pure functions — no Firestore, no React. Given medicines + sales data,
// return demand forecasts and expiry sell-through risk.
// Kept separate from App.jsx so the logic is testable and easy to explain on its own.
//
// Velocity and stock are compared in the medicine's base unit (see units.js).
// Each sale carries the unitsPerBox it was made under, so history stays
// comparable if a medicine's box size is later corrected.

import { unitsPerBoxOf } from "./units"

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** soldAt is a Firestore Timestamp or Date; still null while a new sale is pending its server timestamp */
export function soldAtDate(sale) {
  return sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt)
}

/** One medicine's sales from the last N weeks. */
export function salesInWindow(sales, medicineId, weeks = 4) {
  const cutoff = Date.now() - weeks * WEEK_MS
  return sales.filter(s => s.medicineId === medicineId && soldAtDate(s).getTime() >= cutoff)
}

/**
 * Weekly sales velocity for one medicine in its current base unit, based on the last N weeks.
 * sales: array of { medicineId, qty, unitsPerBox?, soldAt }
 */
function weeklyVelocity(sales, med, weeks = 4) {
  const perBox = unitsPerBoxOf(med)
  const recent = salesInWindow(sales, med.id, weeks)
  const totalSold = recent.reduce(
    (sum, s) => sum + (s.qty || 1) * (perBox / (s.unitsPerBox || 1)),
    0
  )
  return totalSold / weeks
}

/**
 * Demand forecast for every medicine: how fast it's selling, and how many
 * BOXES to reorder to cover the next 2 weeks without running out.
 * Returns null reorder if there isn't enough sales history yet (avoids
 * confidently recommending a number based on noise).
 */
export function getDemandForecast(medicines, sales, weeks = 4, coverWeeks = 2) {
  return medicines.map(med => {
    const perBox = unitsPerBoxOf(med)
    const velocity = weeklyVelocity(sales, med, weeks)
    const hasHistory = sales.some(s => s.medicineId === med.id)
    const suggestedReorder = hasHistory
      ? Math.max(0, Math.ceil((velocity * coverWeeks - med.qty) / perBox))
      : null

    return {
      id: med.id,
      name: med.name,
      weeklyVelocity: Math.round(velocity * 10) / 10,
      suggestedReorder,
      hasHistory,
      unitsPerBox: perBox,
      unitName: med.unitName || null
    }
  })
}

/**
 * Expiry sell-through risk: will current stock sell out before it expires?
 * Compares projected units sold (velocity * weeks until expiry) against qty on hand.
 */
export function getExpiryRisk(medicines, sales, weeks = 4) {
  const now = Date.now()

  return medicines
    .filter(med => med.expiry)
    .map(med => {
      const expiryDate = new Date(med.expiry)
      const daysToExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))
      const velocity = weeklyVelocity(sales, med, weeks)
      const weeksToExpiry = daysToExpiry / 7
      const projectedSold = velocity * weeksToExpiry
      const projectedLeftover = Math.max(0, Math.round(med.qty - projectedSold))

      const atRisk = daysToExpiry > 0 && daysToExpiry <= 60 && projectedLeftover > 0

      return {
        id: med.id,
        name: med.name,
        daysToExpiry,
        projectedLeftover,
        atRisk
      }
    })
    .filter(r => r.daysToExpiry > 0) // ignore already-expired items here; that's a separate alert
}
