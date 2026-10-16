import { useState } from "react"
import { PERIODS, salesSummary } from "./salesSummary"
import { formatMoney, stockValue } from "./pricing"

const TOP_COUNT = 10

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

const profitClass = (n) => (n < 0 ? "text-red-600" : "text-green-700")

function DailyBars({ days }) {
  const max = Math.max(...days.map(d => Math.abs(d.profit)), 0)
  if (max === 0) return <p className="text-sm text-gray-400">No profit recorded in these days</p>
  return (
    <>
      <div className="flex items-end gap-px h-24">
        {days.map(d => (
          <div key={d.date} className="flex-1 h-full flex items-end" title={`${d.date}: ${formatMoney(d.profit)}`}>
            <div
              className={`w-full rounded-sm ${d.profit < 0 ? "bg-red-400" : "bg-green-600"}`}
              style={{ height: d.profit === 0 ? "0" : `${Math.max(4, (Math.abs(d.profit) / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-gray-400 mt-1">
        <span>{days[0].date}</span>
        <span>{days[days.length - 1].date}</span>
      </div>
    </>
  )
}

function Analytics({ medicines, sales, onBack }) {
  const [period, setPeriod] = useState("30d")
  const [showAll, setShowAll] = useState(false)

  const shelf = stockValue(medicines)
  const summary = salesSummary(sales, medicines, period)
  const periodLabel = PERIODS.find(p => p.key === period).label.toLowerCase()
  const listed = showAll ? summary.byMedicine : summary.byMedicine.slice(0, TOP_COUNT)

  return (
    <div className="min-h-screen bg-[#F5F5F0] max-w-sm mx-auto">
      <div className="bg-green-700 px-4 pt-10 pb-4 flex items-center gap-3">
        <button onClick={onBack} className="text-white text-xl">←</button>
        <div>
          <h1 className="text-white text-xl font-semibold">Store analytics</h1>
          <p className="text-green-200 text-sm">Stock value and profit</p>
        </div>
      </div>

      <div className="px-4 mt-6 pb-8 flex flex-col gap-4">
        <Card title="Stock on the shelf">
          <Line label="Medicines" value={medicines.length} />
          <Line label="Total value at cost" value={formatMoney(shelf.cost)} />
          <Line label="Total value at selling price" value={formatMoney(shelf.retail)} />
          <Line label="Potential profit" value={formatMoney(shelf.potentialProfit)} valueClass={profitClass(shelf.potentialProfit)} />
          {shelf.expiredCost > 0 && (
            <p className="text-xs text-red-600 mt-1">Expired stock: {formatMoney(shelf.expiredCost)} at cost</p>
          )}
          {shelf.unpricedCount > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {shelf.unpricedCount} {shelf.unpricedCount === 1 ? "medicine has" : "medicines have"} no buy or sell price, so these totals are incomplete
            </p>
          )}
        </Card>

        <div className="flex gap-2 overflow-x-auto">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`whitespace-nowrap text-sm px-4 py-1.5 rounded-full border ${
                period === p.key ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-600 border-gray-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Card title={`Profit from sales — ${periodLabel}`}>
          {summary.units === 0 ? (
            <p className="text-sm text-gray-400">No sales with prices recorded {period === "today" ? "today" : "in this period"}</p>
          ) : (
            <>
              <Line label="Units sold" value={summary.units} />
              <Line label="Revenue" value={formatMoney(summary.revenue)} />
              <Line label="Cost of what was sold" value={formatMoney(summary.cost)} />
              <Line label="Profit" value={formatMoney(summary.profit)} valueClass={profitClass(summary.profit)} />
              {summary.marginPercent !== null && <Line label="Profit margin" value={`${summary.marginPercent}%`} />}
            </>
          )}
          {summary.unpricedUnits > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {summary.unpricedUnits} sold without a price recorded — not counted
            </p>
          )}
        </Card>

        {summary.dailyProfit.length > 0 && (
          <Card title="Profit per day">
            <DailyBars days={summary.dailyProfit} />
          </Card>
        )}

        {summary.byMedicine.length > 0 && (
          <Card title="Profit by medicine">
            {listed.map(m => (
              <div key={m.id} className="flex justify-between items-baseline gap-3 text-sm">
                <span className="text-gray-800 min-w-0 truncate">
                  {m.name} <span className="text-xs text-gray-400">×{m.units}</span>
                </span>
                <span className={`font-medium whitespace-nowrap ${profitClass(m.profit)}`}>{formatMoney(m.profit)}</span>
              </div>
            ))}
            {summary.byMedicine.length > TOP_COUNT && (
              <button onClick={() => setShowAll(!showAll)} className="text-sm text-green-700 font-medium text-left mt-1">
                {showAll ? "Show top 10 only" : `Show all ${summary.byMedicine.length}`}
              </button>
            )}
          </Card>
        )}

        {summary.byCategory.length > 0 && (
          <Card title="Profit by category">
            {summary.byCategory.map(c => (
              <Line key={c.category} label={c.category} value={formatMoney(c.profit)} valueClass={profitClass(c.profit)} />
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}

export default Analytics
