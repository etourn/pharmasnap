import { useState, useEffect, useCallback } from "react"
import { db } from "./firebase"
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  increment,
  serverTimestamp
} from "firebase/firestore"
import { getDemandForecast, getExpiryRisk } from "./forecast"
import { CATEGORIES } from "./categories"
import { formatMoney, parsePrice, isValidPrice, saleLine, stockValue } from "./pricing"
import { unitsPerBoxOf, formatStock, sellLabel } from "./units"
import BarcodeScanner from "./BarcodeScanner"
import MedicineDetail from "./MedicineDetail"
import MedicineForm from "./MedicineForm"
import Analytics from "./Analytics"

const SCAN_WORKER_URL = import.meta.env.VITE_SCAN_WORKER_URL

const EMPTY_FORM = {
  name: "", qty: "", looseQty: "", threshold: "", expiry: "",
  category: "", buyPrice: "", sellPrice: "", unitSellPrice: "",
  barcode: "", noBarcode: false,
  sellLoose: false, unitsPerBox: "", unitName: "strip"
}

const priceText = (v) => (v == null ? "" : String(v))

// qty is "" when receiving a delivery (the form asks how many arrived), otherwise the current stock
const formFromMedicine = (med, { receiving = false } = {}) => {
  const perBox = unitsPerBoxOf(med)
  return {
    name: med.name,
    qty: receiving ? "" : String(Math.floor(med.qty / perBox)),
    looseQty: receiving || perBox === 1 || med.qty % perBox === 0 ? "" : String(med.qty % perBox),
    threshold: String(med.threshold ?? ""),
    expiry: med.expiry || "",
    category: med.category || "",
    buyPrice: priceText(med.buyPrice),
    sellPrice: priceText(med.sellPrice),
    unitSellPrice: priceText(med.unitSellPrice),
    barcode: med.barcode || "",
    noBarcode: !!med.noBarcode,
    sellLoose: perBox > 1,
    unitsPerBox: perBox > 1 ? String(perBox) : "",
    unitName: med.unitName || "strip"
  }
}

const UNCATEGORIZED = "Uncategorized"
const NO_BARCODE_FILTER = "__no_barcode"
const lacksBarcode = (m) => !m.barcode && !m.noBarcode

function App() {
  const [medicines, setMedicines] = useState([])
  const [sales, setSales] = useState([])
  const [screen, setScreen] = useState("inventory") // "inventory" | "add" | "detail" | "analytics"
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanNotice, setScanNotice] = useState(null) // { name: "low"|"high", expiry: "low"|"high", notes }
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanPurpose, setScanPurpose] = useState("form") // "form" | "attach" | "search"
  const [matchedId, setMatchedId] = useState(null) // receiving stock for an existing medicine
  const [editingId, setEditingId] = useState(null) // correcting an existing medicine's details
  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [searchNotice, setSearchNotice] = useState(null) // { code } when a scanned barcode matched nothing

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "medicines"), (snapshot) => {
      const meds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setMedicines(meds)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "sales"), (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    })
    return () => unsub()
  }, [])

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM)
    setMatchedId(null)
    setEditingId(null)
    setScanNotice(null)
    setError("")
    setFieldErrors({})
  }, [])

  // Screens are history entries, so the phone's back gesture steps back a screen
  // instead of leaving the app. Every in-app "back" is history.back() too.
  useEffect(() => {
    window.history.replaceState(null, "")
    const onPop = (e) => {
      setScreen(e.state?.screen ?? "inventory")
      setSelectedId(e.state?.id ?? null)
      resetForm()
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [resetForm])

  const navigate = (next, id = null) => {
    window.history.pushState({ screen: next, id }, "")
    setScreen(next)
    setSelectedId(id)
  }
  const goBack = () => window.history.back()

  const demandForecast = getDemandForecast(medicines, sales)
  const expiryRisk = getExpiryRisk(medicines, sales)
  const reorderNow = demandForecast.filter(f => f.suggestedReorder > 0)
  const expiryAtRisk = expiryRisk.filter(r => r.atRisk)

  const sellOne = async (id) => {
    const med = medicines.find(m => m.id === id)
    if (!med || med.qty <= 0) return
    const line = saleLine(med, 1, "unit")
    await updateDoc(doc(db, "medicines", id), { qty: increment(-line.qty) })
    await addDoc(collection(db, "sales"), {
      medicineId: id,
      medicineName: med.name,
      qty: line.qty,
      unitPrice: line.unitPrice,
      unitCost: line.unitCost,
      unitsPerBox: unitsPerBoxOf(med),
      source: "sale",
      soldAt: serverTimestamp()
    })
  }

  const deleteMedicine = async (id) => {
    await deleteDoc(doc(db, "medicines", id))
    goBack()
  }

  const saveMedicine = async () => {
    const mode = editingId ? "edit" : matchedId ? "receive" : "add"
    const existing = medicines.find(m => m.id === (editingId || matchedId))
    const barcode = form.barcode.trim()
    const perBox = mode === "receive" ? unitsPerBoxOf(existing) : form.sellLoose ? Number(form.unitsPerBox) : 1
    const unit = form.unitName || "unit"
    const boxes = form.qty === "" ? null : Number(form.qty)
    const loose = form.looseQty === "" ? 0 : Number(form.looseQty)
    const buyPrice = parsePrice(form.buyPrice)
    const sellPrice = parsePrice(form.sellPrice)
    const unitSellPrice = parsePrice(form.unitSellPrice)

    const errs = {}
    if (mode !== "receive") {
      if (!barcode && !form.noBarcode) {
        errs.barcode = "Scan or type the barcode — or tick “This item has no barcode”"
      } else if (barcode) {
        const dupe = medicines.find(m => m.barcode === barcode && m.id !== editingId)
        if (dupe) errs.barcode = `That barcode is already used by ${dupe.name}`
      }
    }
    if (!form.name.trim()) errs.name = "Enter the medicine name"
    if (mode !== "receive" && form.sellLoose && !(Number.isInteger(perBox) && perBox >= 2)) {
      errs.unitsPerBox = `Enter how many ${unit}s are in one box (2 or more)`
    }
    if (boxes === null && form.looseQty === "") {
      errs.qty = "Enter the quantity"
    } else if (boxes !== null && (!Number.isInteger(boxes) || boxes < 0)) {
      errs.qty = "Enter a whole number, 0 or more"
    }
    if (!Number.isInteger(loose) || loose < 0 || (perBox >= 2 && loose >= perBox)) {
      errs.looseQty = `Loose ${unit}s must be a whole number below ${perBox}`
    }
    if (!isValidPrice(buyPrice)) errs.buyPrice = "Enter a price like 2.50 (up to 2 decimals)"
    if (!isValidPrice(sellPrice)) errs.sellPrice = "Enter a price like 2.50 (up to 2 decimals)"
    if (!isValidPrice(unitSellPrice)) errs.unitSellPrice = "Enter a price like 2.50 (up to 2 decimals)"

    setError("")
    setFieldErrors(errs)
    const firstBad = Object.keys(errs)[0]
    if (firstBad) {
      requestAnimationFrame(() =>
        document.getElementById(`field-${firstBad}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
      )
      return
    }

    const base = (boxes ?? 0) * perBox + loose
    const oldPerBox = unitsPerBoxOf(existing)
    let threshold = Number(form.threshold) || (oldPerBox > 1 ? oldPerBox : 10)
    if (mode === "edit" && oldPerBox !== perBox) {
      // the box size was corrected, so the alert level (typed in the old unit) is rescaled with the stock
      threshold = Math.round((threshold * perBox) / oldPerBox)
      const ok = window.confirm(
        `Box size changes from ${oldPerBox} to ${perBox}.\nStock becomes ${base} and the low-stock alert becomes ${threshold}. Continue?`
      )
      if (!ok) return
    } else if (mode !== "edit" && form.threshold === "" && perBox > 1) {
      threshold = perBox
    }

    const common = {
      name: form.name.trim(),
      threshold,
      expiry: form.expiry || null,
      category: form.category || null,
      buyPrice,
      sellPrice
    }
    const unitFields = {
      unitsPerBox: perBox > 1 ? perBox : null,
      unitName: perBox > 1 ? form.unitName : null,
      unitSellPrice: perBox > 1 ? unitSellPrice : null
    }
    const barcodeFields = { barcode: barcode || null, noBarcode: !barcode && form.noBarcode }

    setSaving(true)
    try {
      if (mode === "edit") {
        await updateDoc(doc(db, "medicines", editingId), { ...common, ...unitFields, ...barcodeFields, qty: base })
      } else if (mode === "receive") {
        await updateDoc(doc(db, "medicines", matchedId), { ...common, qty: (existing?.qty ?? 0) + (boxes ?? 0) * perBox })
      } else {
        await addDoc(collection(db, "medicines"), {
          ...common, ...unitFields, ...barcodeFields, qty: base, createdAt: serverTimestamp()
        })
      }
      goBack()
    } catch {
      setError("Couldn't save — check your connection and try again")
    } finally {
      setSaving(false)
    }
  }

  const startAdd = (name = "", barcode = "") => {
    setForm({ ...EMPTY_FORM, name, barcode })
    setMatchedId(null)
    setEditingId(null)
    setScanNotice(null)
    setError("")
    setFieldErrors({})
    setSearchNotice(null)
    navigate("add")
  }

  const startEdit = (med) => {
    setForm(formFromMedicine(med))
    setEditingId(med.id)
    setMatchedId(null)
    setScanNotice(null)
    setError("")
    setFieldErrors({})
    navigate("add", med.id)
  }

  // Sets up the form to add a delivery to an existing medicine. The caller navigates
  // if it isn't already on the Add screen.
  const startReceive = (med) => {
    setForm(formFromMedicine(med, { receiving: true }))
    setMatchedId(med.id)
    setEditingId(null)
    setFieldErrors({})
    setScanNotice({
      name: "high",
      expiry: "high",
      notes: `Matched an existing medicine (${formatStock(med.qty, med)} in stock) — enter how many you received`
    })
  }

  const openScanner = (purpose) => {
    setScanPurpose(purpose)
    setScannerOpen(true)
  }

  const handleBarcodeDetected = (code) => {
    setScannerOpen(false)
    const match = medicines.find(m => m.barcode === code)

    if (scanPurpose === "search") {
      if (match) {
        setSearchNotice(null)
        setQuery("")
        setCategoryFilter("")
        navigate("detail", match.id)
      } else {
        setSearchNotice({ code })
      }
    } else if (scanPurpose === "attach") {
      if (match && match.id !== editingId) {
        setError(`That barcode already belongs to ${match.name}`)
        return
      }
      setError("")
      setFieldErrors(errs => ({ ...errs, barcode: undefined }))
      setForm(f => ({ ...f, barcode: code, noBarcode: false }))
    } else if (match) {
      startReceive(match)
    } else if (matchedId) {
      // was receiving stock for another medicine; this code is a different, unknown one
      setForm({ ...EMPTY_FORM, barcode: code })
      setMatchedId(null)
      setScanNotice(null)
    } else {
      setFieldErrors(errs => ({ ...errs, barcode: undefined }))
      setForm(f => ({ ...f, barcode: code, noBarcode: false }))
    }
  }

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(",")[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const handleScan = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file next time
    if (!file) return

    if (!SCAN_WORKER_URL) {
      setError("Scan isn't set up yet — add VITE_SCAN_WORKER_URL to your .env")
      return
    }

    setScanning(true)
    setError("")
    setScanNotice(null)

    try {
      const image = await fileToBase64(file)
      const res = await fetch(SCAN_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, media_type: file.type || "image/jpeg" })
      })

      if (!res.ok) {
        if (res.status === 429) {
          setError("Scan limit reached for now (free tier) — try again in a minute, or type the details in")
        } else {
          setError("Couldn't read that photo — please try again or type the details in")
        }
        return
      }
      const result = await res.json()

      setForm(f => ({
        ...f,
        name: result.name || f.name,
        expiry: result.expiry || f.expiry
      }))
      setScanNotice({
        name: result.confidence?.name || "low",
        expiry: result.confidence?.expiry || "low",
        notes: result.notes || null
      })
    } catch {
      setError("Couldn't read that photo — please try again or type the details in")
    } finally {
      setScanning(false)
    }
  }

  const lowStock = medicines.filter(m => m.qty <= m.threshold)
  const selectedMed = medicines.find(m => m.id === selectedId)

  // ── ADD / EDIT / RECEIVE-STOCK SCREEN ─────────────────────────────────────
  if (screen === "add") {
    const receiving = medicines.find(m => m.id === matchedId)
    return (
      <>
        <MedicineForm
          mode={editingId ? "edit" : matchedId ? "receive" : "add"}
          form={form}
          setForm={setForm}
          error={error}
          fieldErrors={fieldErrors}
          scanNotice={scanNotice}
          scanning={scanning}
          saving={saving}
          currentStock={receiving ? formatStock(receiving.qty, receiving) : ""}
          onBack={goBack}
          onScanBarcode={() => openScanner(editingId ? "attach" : "form")}
          onPhoto={handleScan}
          onSave={saveMedicine}
        />
        {scannerOpen && (
          <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setScannerOpen(false)} />
        )}
      </>
    )
  }

  // ── ANALYTICS SCREEN ──────────────────────────────────────────────────────
  if (screen === "analytics") {
    return <Analytics medicines={medicines} sales={sales} onBack={goBack} />
  }

  // ── DETAIL SCREEN ─────────────────────────────────────────────────────────
  if (screen === "detail" && selectedMed) {
    return (
      <MedicineDetail
        med={selectedMed}
        sales={sales}
        forecast={demandForecast.find(f => f.id === selectedMed.id)}
        risk={expiryRisk.find(r => r.id === selectedMed.id)}
        onBack={goBack}
        onSell={() => sellOne(selectedMed.id)}
        onAddStock={() => { startReceive(selectedMed); navigate("add", selectedMed.id) }}
        onEdit={() => startEdit(selectedMed)}
        onDelete={() => deleteMedicine(selectedMed.id)}
      />
    )
  }

  // ── INVENTORY SCREEN ──────────────────────────────────────────────────────
  const q = query.trim().toLowerCase()
  const missingBarcodeCount = medicines.filter(lacksBarcode).length
  const value = stockValue(medicines)
  const visibleMedicines = medicines
    .filter(m => {
      if (categoryFilter === NO_BARCODE_FILTER) { if (!lacksBarcode(m)) return false }
      else if (categoryFilter && (m.category || UNCATEGORIZED) !== categoryFilter) return false
      return !q || [m.name, m.category, m.barcode].some(v => v?.toLowerCase().includes(q))
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  const filterOptions = [
    ...CATEGORIES.filter(c => medicines.some(m => m.category === c)),
    ...(medicines.some(m => !m.category) ? [UNCATEGORIZED] : []),
    ...(missingBarcodeCount > 0 ? [NO_BARCODE_FILTER] : [])
  ]
  const filterLabel = (c) => (c === NO_BARCODE_FILTER ? `No barcode (${missingBarcodeCount})` : c)
  const isFiltering = q !== "" || categoryFilter !== ""

  return (
    <div className="min-h-screen bg-[#F5F5F0] max-w-sm mx-auto">
      <div className="bg-green-700 px-4 pt-10 pb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-white text-xl font-semibold">PharmaSnap</h1>
          <p className="text-green-200 text-sm">Nalin's Pharmacy</p>
        </div>
        <button
          onClick={() => navigate("analytics")}
          className="bg-green-800 text-white text-sm px-3 py-1.5 rounded-full active:bg-green-900"
        >
          📊 Analytics
        </button>
      </div>

      {medicines.length > 0 && (
        <div className="mx-4 mt-4 bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total stock value</p>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <p className="text-xs text-gray-400">At cost</p>
              <p className="text-base font-semibold text-gray-800">{formatMoney(value.cost)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">At selling price</p>
              <p className="text-base font-semibold text-gray-800">{formatMoney(value.retail)}</p>
            </div>
          </div>
          <p className="text-xs text-green-700 mt-2">Potential profit {formatMoney(value.potentialProfit)}</p>
          {value.expiredCost > 0 && (
            <p className="text-xs text-red-600 mt-1">Expired stock: {formatMoney(value.expiredCost)} at cost</p>
          )}
          {value.unpricedCount > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {value.unpricedCount} {value.unpricedCount === 1 ? "medicine has" : "medicines have"} no buy or sell price, so the totals are incomplete
            </p>
          )}
        </div>
      )}

      {missingBarcodeCount > 0 && (
        <div className="mx-4 mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
          <p className="text-gray-700 text-sm">
            {missingBarcodeCount} {missingBarcodeCount === 1 ? "medicine has" : "medicines have"} no barcode
          </p>
          <button onClick={() => setCategoryFilter(NO_BARCODE_FILTER)} className="text-sm text-green-700 font-medium whitespace-nowrap">
            Show
          </button>
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-300 border-l-4 border-l-amber-500 rounded-lg p-3">
          <p className="text-amber-800 font-semibold text-sm">⚠️ Low stock — reorder now</p>
          {lowStock.map(m => (
            <p key={m.id} className="text-amber-700 text-sm mt-1">
              {m.name} — only {formatStock(m.qty, m)} left
            </p>
          ))}
        </div>
      )}

      {reorderNow.length > 0 && (
        <div className="mx-4 mt-4 bg-blue-50 border border-blue-300 border-l-4 border-l-blue-500 rounded-lg p-3">
          <p className="text-blue-800 font-semibold text-sm">📦 Suggested reorder (based on last 4 weeks)</p>
          {reorderNow.map(f => (
            <p key={f.id} className="text-blue-700 text-sm mt-1">
              {f.name} — order ~{f.suggestedReorder}{f.unitsPerBox > 1 ? (f.suggestedReorder === 1 ? " box" : " boxes") : ""} (selling {f.weeklyVelocity}{f.unitsPerBox > 1 ? ` ${f.unitName || "unit"}s` : ""}/week)
            </p>
          ))}
        </div>
      )}

      {expiryAtRisk.length > 0 && (
        <div className="mx-4 mt-4 bg-orange-50 border border-orange-300 border-l-4 border-l-orange-500 rounded-lg p-3">
          <p className="text-orange-800 font-semibold text-sm">⏳ May expire unsold</p>
          {expiryAtRisk.map(r => (
            <p key={r.id} className="text-orange-700 text-sm mt-1">
              {r.name} — {r.projectedLeftover} left unsold in {r.daysToExpiry} days at current pace
            </p>
          ))}
        </div>
      )}

      <div className="px-4 mt-4">
        <div className="flex gap-2 mb-3">
          <input
            type="search"
            placeholder="Search name, category or barcode"
            value={query}
            onChange={e => { setQuery(e.target.value); setSearchNotice(null) }}
            className="flex-1 min-w-0 bg-white rounded-full px-4 py-2 text-sm text-gray-800 outline-none border border-gray-200 focus:border-green-500"
          />
          <button
            onClick={() => openScanner("search")}
            aria-label="Scan a barcode to find a medicine"
            className="bg-white border border-gray-200 rounded-full px-3 text-lg active:bg-green-50"
          >
            📷
          </button>
        </div>

        {searchNotice && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
            <p className="text-amber-800 text-sm">No medicine has the barcode {searchNotice.code}</p>
            <div className="flex gap-4 mt-2">
              <button onClick={() => startAdd("", searchNotice.code)} className="text-sm text-green-700 font-medium">
                Add it
              </button>
              <button onClick={() => setSearchNotice(null)} className="text-sm text-gray-500">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {filterOptions.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-1">
            {["", ...filterOptions].map(c => (
              <button
                key={c || "all"}
                onClick={() => setCategoryFilter(c)}
                className={`whitespace-nowrap text-xs px-3 py-1 rounded-full border ${
                  categoryFilter === c
                    ? "bg-green-700 text-white border-green-700"
                    : "bg-white text-gray-600 border-gray-200"
                }`}
              >
                {c ? filterLabel(c) : "All"}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center mb-3">
          <h2 className="text-gray-700 font-semibold">
            Inventory ({isFiltering ? `${visibleMedicines.length} of ${medicines.length}` : medicines.length})
          </h2>
          <button
            onClick={() => startAdd()}
            className="text-sm bg-green-700 text-white px-3 py-1 rounded-full"
          >
            + Add medicine
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading inventory...</div>
        ) : medicines.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No medicines yet. Tap + Add medicine to get started.</div>
        ) : visibleMedicines.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            <p>Nothing matches{q ? ` "${query.trim()}"` : ""}.</p>
            {q && (
              <button onClick={() => startAdd(query.trim())} className="mt-3 text-green-700 font-medium">
                Add "{query.trim()}" as a new medicine
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 pb-8">
            {visibleMedicines.map(med => {
              const isLow = med.qty <= med.threshold
              const isExpiringSoon = med.expiry && (() => {
                const days = Math.ceil((new Date(med.expiry) - new Date()) / (1000 * 60 * 60 * 24))
                return days <= 30 && days > 0
              })()
              return (
                <div
                  key={med.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate("detail", med.id)}
                  onKeyDown={e => { if (e.key === "Enter") navigate("detail", med.id) }}
                  className={`bg-white rounded-xl p-4 flex justify-between items-center gap-3 shadow-sm border cursor-pointer ${
                    isLow ? "border-red-200 bg-red-50" : "border-gray-100"
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`font-medium text-sm ${isLow ? "text-red-700" : "text-gray-800"}`}>
                      {med.name}
                    </p>
                    {med.category && (
                      <p className="text-xs text-gray-400 mt-0.5">{med.category}</p>
                    )}
                    <p className={`text-xs mt-1 ${isLow ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                      {formatStock(med.qty, med)} in stock
                    </p>
                    {isLow && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full mt-1 inline-block">
                        Low stock
                      </span>
                    )}
                    {isExpiringSoon && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full mt-1 ml-1 inline-block">
                        Expires soon
                      </span>
                    )}
                    {lacksBarcode(med) && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full mt-1 ml-1 inline-block">
                        No barcode
                      </span>
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); sellOne(med.id) }}
                    disabled={med.qty === 0}
                    className="bg-green-600 text-white text-xs px-4 py-2 rounded-full whitespace-nowrap disabled:bg-gray-300 disabled:cursor-not-allowed active:bg-green-800"
                  >
                    {med.qty === 0 ? "Out of stock" : sellLabel(med)}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {scannerOpen && (
        <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setScannerOpen(false)} />
      )}
    </div>
  )
}

export default App
