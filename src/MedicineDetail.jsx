import { useState } from "react"
import { soldAtDate } from "./forecast"
import { formatMoney, unitMargin, marginPercent, profitFromSales, looseUnitPrice } from "./pricing"
import { unitsPerBoxOf, formatStock, sellLabel } from "./units"

const DAY_MS = 24 * 60 * 60 * 1000

function Card({ title, children }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{title}</p>
      <div className="mt-2 flex flex-col gap-1">{children}</div>
    </div>
  )
}

function Line({ label, value, valueClass = "text-gray-800" }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${valueClass}`}>{value}</span>
    </div>
  )
}

function MedicineDetail({ med, sales, forecast, risk, onBack, onSell, onAddStock, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isLow = med.qty <= med.threshold
  const perBox = unitsPerBoxOf(med)
  const unit = med.unitName || "unit"
  const daysToExpiry = med.expiry ? Math.ceil((new Date(med.expiry) - new Date()) / DAY_MS) : null
  const margin = unitMargin(med)
  const percent = marginPercent(med)
  const profit = profitFromSales(sales, med.id, 4)
  const recentSales = sales
    .filter(s => s.medicineId === med.id)
    // a sale still waiting on its server timestamp is the newest one, so it sorts first
    .map(s => ({ ...s, time: s.soldAt ? soldAtDate(s).getTime() : Infinity }))
    .sort((a, b) => (a.time === b.time ? 0 : b.time > a.time ? 1 : -1))
    .slice(0, 10)

  const expiryText =
    daysToExpiry === null ? "—"
    : daysToExpiry <= 0 ? `${med.expiry} (expired)`
    : `${med.expiry} (${daysToExpiry} days left)`

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete()
    } catch {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] max-w-sm mx-auto">
      <div className="bg-green-700 px-4 pt-10 pb-4 flex items-center gap-3">
        <button onClick={onBack} className="text-white text-xl">←</button>
        <div>
          <h1 className="text-white text-xl font-semibold">{med.name}</h1>
          <p className="text-green-200 text-sm">{med.category || "No category"}</p>
        </div>
      </div>

      <div className="px-4 mt-6 pb-8 flex flex-col gap-4">
        <Card title="Stock">
          <Line label="In stock" value={formatStock(med.qty, med)} valueClass={isLow ? "text-red-600" : "text-gray-800"} />
          {perBox > 1 && <Line label="Box size" value={`${perBox} ${unit}s`} />}
          <Line label="Low stock alert at" value={perBox > 1 ? `${med.threshold} ${unit}s` : med.threshold} />
          <Line
            label="Expiry"
            value={expiryText}
            valueClass={daysToExpiry !== null && daysToExpiry <= 30 ? "text-amber-700" : "text-gray-800"}
          />
          <Line label="Barcode" value={med.barcode || (med.noBarcode ? "none on the box" : "—")} />
        </Card>

        <Card title="Price">
          <Line label={perBox > 1 ? "Buy price per box" : "Buy price"} value={formatMoney(med.buyPrice)} />
          <Line label={perBox > 1 ? "Sell price per box" : "Sell price"} value={formatMoney(med.sellPrice)} />
          {perBox > 1 && <Line label={`Sell price per ${unit}`} value={formatMoney(looseUnitPrice(med))} />}
          <Line
            label={perBox > 1 ? "Profit per box" : "Profit per unit"}
            value={margin === null ? "—" : `${formatMoney(margin)}${percent === null ? "" : ` (${percent}%)`}`}
            valueClass={margin !== null && margin < 0 ? "text-red-600" : "text-gray-800"}
          />
          {margin !== null && margin < 0 && (
            <p className="text-xs text-red-600 mt-1">⚠️ Selling below cost</p>
          )}
        </Card>

        <Card title="Profit — last 4 weeks">
          {profit.units === 0 ? (
            <p className="text-sm text-gray-400">No sales with prices recorded yet</p>
          ) : (
            <>
              <Line label="Units sold" value={profit.units} />
              <Line label="Revenue" value={formatMoney(profit.revenue)} />
              <Line label="Cost" value={formatMoney(profit.cost)} />
              <Line
                label="Profit"
                value={formatMoney(profit.profit)}
                valueClass={profit.profit < 0 ? "text-red-600" : "text-green-700"}
              />
            </>
          )}
          {profit.unpricedUnits > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {profit.unpricedUnits} sold without a price recorded — not counted
            </p>
          )}
        </Card>

        {forecast && (
          <Card title="Outlook">
            <Line
              label="Selling per week"
              value={forecast.hasHistory ? `${forecast.weeklyVelocity}${perBox > 1 ? ` ${unit}s` : ""}` : "no sales yet"}
            />
            {forecast.suggestedReorder > 0 && (
              <Line
                label="Suggested reorder"
                value={`~${forecast.suggestedReorder}${perBox > 1 ? (forecast.suggestedReorder === 1 ? " box" : " boxes") : ""}`}
                valueClass="text-blue-700"
              />
            )}
            {risk?.atRisk && (
              <p className="text-xs text-orange-700 mt-1">
                ⏳ {risk.projectedLeftover} may be left unsold in {risk.daysToExpiry} days at the current pace
              </p>
            )}
          </Card>
        )}

        <Card title="Recent sales">
          {recentSales.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing sold yet</p>
          ) : (
            recentSales.map((s, i) => (
              <Line
                key={s.id ?? i}
                label={Number.isFinite(s.time) ? new Date(s.time).toLocaleDateString() : "just now"}
                value={`${s.qty || 1} × ${formatMoney(s.unitPrice)}`}
              />
            ))
          )}
        </Card>

        <div className="flex gap-2">
          <button
            onClick={onSell}
            disabled={med.qty === 0}
            className="flex-1 bg-green-600 text-white text-sm py-3 rounded-xl disabled:bg-gray-300 active:bg-green-800"
          >
            {med.qty === 0 ? "Out of stock" : sellLabel(med)}
          </button>
          <button onClick={onAddStock} className="flex-1 bg-green-700 text-white text-sm py-3 rounded-xl active:bg-green-800">
            Add stock
          </button>
        </div>
        <button onClick={onEdit} className="w-full bg-white border border-gray-200 text-gray-700 text-sm py-3 rounded-xl active:bg-gray-50">
          Edit details
        </button>

        {confirming ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 text-sm font-medium">Delete {med.name}?</p>
            <p className="text-red-600 text-xs mt-1">This can't be undone. Past sales are kept.</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="flex-1 bg-white border border-gray-200 text-gray-700 text-sm py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white text-sm py-2 rounded-lg disabled:opacity-60 active:bg-red-800"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="w-full text-red-600 text-sm py-3">
            Delete medicine
          </button>
        )}
      </div>
    </div>
  )
}

export default MedicineDetail
