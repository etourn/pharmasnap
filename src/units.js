// units.js
// Pure functions — no Firestore, no React.
//
// A medicine's `qty` and `threshold` are counted in its smallest sellable unit.
// With no `unitsPerBox` (or 1) that unit is the box, exactly as before, so old
// documents need no migration. With `unitsPerBox: 10, unitName: "strip"`, a qty
// of 34 means 3 boxes + 4 strips.

export const UNIT_NAMES = ["strip", "tablet", "capsule", "sachet", "piece"]

/** Units in one box; 1 when the medicine is only sold by the whole box. */
export function unitsPerBoxOf(med) {
  const n = Number(med?.unitsPerBox)
  return Number.isInteger(n) && n > 1 ? n : 1
}

const boxWord = (n) => (n === 1 ? "box" : "boxes")
const unitWord = (n, name) => (n === 1 ? name : `${name}s`)

/** Human-readable stock, e.g. "3 boxes + 4 strips". Whole-box medicines return just the number. */
export function formatStock(qty, med) {
  const perBox = unitsPerBoxOf(med)
  if (perBox === 1) return String(qty)

  const unit = med.unitName || "unit"
  const boxes = Math.floor(qty / perBox)
  const loose = qty % perBox
  if (loose === 0) return `${boxes} ${boxWord(boxes)}`
  if (boxes === 0) return `${loose} ${unitWord(loose, unit)}`
  return `${boxes} ${boxWord(boxes)} + ${loose} ${unitWord(loose, unit)}`
}

/** Label for the one-tap sell button. */
export function sellLabel(med) {
  return unitsPerBoxOf(med) === 1 ? "Sold one" : `Sold 1 ${med.unitName || "unit"}`
}
