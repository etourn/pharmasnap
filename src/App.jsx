import { useState, useEffect } from "react"
import { db } from "./firebase"
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp
} from "firebase/firestore"
import { getDemandForecast, getExpiryRisk } from "./forecast"

const SCAN_WORKER_URL = import.meta.env.VITE_SCAN_WORKER_URL

function App() {
  const [medicines, setMedicines] = useState([])
  const [sales, setSales] = useState([])
  const [screen, setScreen] = useState("inventory")
  const [form, setForm] = useState({ name: "", qty: "", threshold: "", expiry: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanNotice, setScanNotice] = useState(null) // { name: "low"|"high", expiry: "low"|"high", notes }
  const [scanMethod, setScanMethod] = useState("barcode") // "barcode" | "photo"

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
      setSales(snapshot.docs.map(doc => doc.data()))
    })
    return () => unsub()
  }, [])

  const demandForecast = getDemandForecast(medicines, sales)
  const expiryRisk = getExpiryRisk(medicines, sales)
  const reorderNow = demandForecast.filter(f => f.suggestedReorder > 0)
  const expiryAtRisk = expiryRisk.filter(r => r.atRisk)

  const sellOne = async (id) => {
    const med = medicines.find(m => m.id === id)
    if (!med || med.qty <= 0) return
    const medRef = doc(db, "medicines", id)
    await updateDoc(medRef, { qty: med.qty - 1 })
    await addDoc(collection(db, "sales"), {
      medicineId: id,
      medicineName: med.name,
      qty: 1,
      soldAt: serverTimestamp()
    })
  }

  const addMedicine = async () => {
    if (!form.name.trim()) { setError("Please enter a medicine name"); return }
    if (!form.qty || isNaN(form.qty) || Number(form.qty) < 0) { setError("Please enter a valid quantity"); return }
    await addDoc(collection(db, "medicines"), {
      name: form.name.trim(),
      qty: Number(form.qty),
      threshold: Number(form.threshold) || 10,
      expiry: form.expiry || null,
      createdAt: serverTimestamp()
    })
    setForm({ name: "", qty: "", threshold: "", expiry: "" })
    setError("")
    setScreen("inventory")
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

  // ── ADD SCREEN ────────────────────────────────────────────────────────────
  if (screen === "add") {
    return (
      <div className="min-h-screen bg-[#F5F5F0] max-w-sm mx-auto">
        <div className="bg-green-700 px-4 pt-10 pb-4 flex items-center gap-3">
          <button onClick={() => { setScreen("inventory"); setError("") }} className="text-white text-xl">←</button>
          <div>
            <h1 className="text-white text-xl font-semibold">Add Medicine</h1>
            <p className="text-green-200 text-sm">Fill in the details below</p>
          </div>
        </div>

        <div className="px-4 mt-6 flex flex-col gap-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <div className="flex bg-gray-100 rounded-full p-1">
          <button
            onClick={() => setScanMethod("barcode")}
            className={`flex-1 text-sm py-1.5 rounded-full transition ${
              scanMethod === "barcode" ? "bg-white shadow-sm font-medium text-green-700" : "text-gray-500"
            }`}
          >
            Barcode
          </button>
          <button
            onClick={() => setScanMethod("photo")}
            className={`flex-1 text-sm py-1.5 rounded-full transition ${
              scanMethod === "photo" ? "bg-white shadow-sm font-medium text-green-700" : "text-gray-500"
            }`}
          >
            Photo
          </button>
        </div>

        {scanMethod === "barcode" ? (
          <button
            onClick={() => setScannerMode("add")}
            className="w-full bg-white border-2 border-dashed border-green-300 rounded-xl p-4 flex items-center justify-center gap-2 active:bg-green-50"
          >
            <span className="text-green-700 font-medium text-sm">📷 Scan barcode</span>
          </button>
        ) : (
          <label className="w-full bg-white border-2 border-dashed border-green-300 rounded-xl p-4 flex items-center justify-center gap-2 active:bg-green-50 cursor-pointer">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleScan}
              className="hidden"
              disabled={scanning}
            />
            <span className="text-green-700 font-medium text-sm">
              {scanning ? "Reading the box…" : "🖼️ Scan medicine box"}
            </span>
          </label>
        )}

        {form.barcode && (
          <p className="text-xs text-gray-400 -mt-2">Barcode: {form.barcode}</p>
        )}

          {scanNotice && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-green-800 text-sm font-medium">Scanned — please check before confirming</p>
              {scanNotice.name === "low" && (
                <p className="text-green-700 text-xs mt-1">⚠️ Name wasn't clear — double check it</p>
              )}
              {scanNotice.expiry === "low" && (
                <p className="text-green-700 text-xs mt-1">⚠️ Expiry date wasn't clear — double check or leave blank</p>
              )}
              {scanNotice.notes && (
                <p className="text-green-700 text-xs mt-1">{scanNotice.notes}</p>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Medicine name</label>
            <input
              type="text"
              placeholder="e.g. Paracetamol 500mg"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full mt-2 text-sm text-gray-800 outline-none border-b border-gray-200 pb-1 focus:border-green-500"
            />
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Starting quantity</label>
            <input
              type="number"
              placeholder="e.g. 100"
              value={form.qty}
              onChange={e => setForm({ ...form, qty: e.target.value })}
              className="w-full mt-2 text-sm text-gray-800 outline-none border-b border-gray-200 pb-1 focus:border-green-500"
            />
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Low stock alert at</label>
            <input
              type="number"
              placeholder="e.g. 10 (default)"
              value={form.threshold}
              onChange={e => setForm({ ...form, threshold: e.target.value })}
              className="w-full mt-2 text-sm text-gray-800 outline-none border-b border-gray-200 pb-1 focus:border-green-500"
            />
            <p className="text-xs text-gray-400 mt-2">You will get an alert when stock drops below this number</p>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Expiry date</label>
            <input
              type="date"
              value={form.expiry}
              onChange={e => setForm({ ...form, expiry: e.target.value })}
              className="w-full mt-2 text-sm text-gray-800 outline-none border-b border-gray-200 pb-1 focus:border-green-500"
            />
            <p className="text-xs text-gray-400 mt-2">AI will warn you before medicines expire unsold</p>
          </div>

          <button
            onClick={addMedicine}
            className="w-full bg-green-700 text-white font-semibold py-4 rounded-xl active:bg-green-800"
          >
            Confirm and add medicine
          </button>
        </div>
      </div>
    )
  }

  // ── INVENTORY SCREEN ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F5F5F0] max-w-sm mx-auto">
      <div className="bg-green-700 px-4 pt-10 pb-4">
        <h1 className="text-white text-xl font-semibold">PharmaSnap</h1>
        <p className="text-green-200 text-sm">Sokhim's Pharmacy</p>
      </div>

      {lowStock.length > 0 && (
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-300 border-l-4 border-l-amber-500 rounded-lg p-3">
          <p className="text-amber-800 font-semibold text-sm">⚠️ Low stock — reorder now</p>
          {lowStock.map(m => (
            <p key={m.id} className="text-amber-700 text-sm mt-1">
              {m.name} — only {m.qty} left
            </p>
          ))}
        </div>
      )}

      {reorderNow.length > 0 && (
        <div className="mx-4 mt-4 bg-blue-50 border border-blue-300 border-l-4 border-l-blue-500 rounded-lg p-3">
          <p className="text-blue-800 font-semibold text-sm">📦 Suggested reorder (based on last 4 weeks)</p>
          {reorderNow.map(f => (
            <p key={f.id} className="text-blue-700 text-sm mt-1">
              {f.name} — order ~{f.suggestedReorder} (selling {f.weeklyVelocity}/week)
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
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-gray-700 font-semibold">
            Inventory ({medicines.length})
          </h2>
          <button
            onClick={() => setScreen("add")}
            className="text-sm bg-green-700 text-white px-3 py-1 rounded-full"
          >
            + Add medicine
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading inventory...</div>
        ) : medicines.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No medicines yet. Tap + Add medicine to get started.</div>
        ) : (
          <div className="flex flex-col gap-2 pb-8">
            {medicines.map(med => {
              const isLow = med.qty <= med.threshold
              const isExpiringSoon = med.expiry && (() => {
                const days = Math.ceil((new Date(med.expiry) - new Date()) / (1000 * 60 * 60 * 24))
                return days <= 30 && days > 0
              })()
              return (
                <div
                  key={med.id}
                  className={`bg-white rounded-xl p-4 flex justify-between items-center shadow-sm border ${
                    isLow ? "border-red-200 bg-red-50" : "border-gray-100"
                  }`}
                >
                  <div>
                    <p className={`font-medium text-sm ${isLow ? "text-red-700" : "text-gray-800"}`}>
                      {med.name}
                    </p>
                    <p className={`text-xs mt-1 ${isLow ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                      {med.qty} in stock
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
                  </div>
                  <button
                    onClick={() => sellOne(med.id)}
                    disabled={med.qty === 0}
                    className="bg-green-600 text-white text-xs px-4 py-2 rounded-full disabled:bg-gray-300 disabled:cursor-not-allowed active:bg-green-800"
                  >
                    {med.qty === 0 ? "Out of stock" : "Sold one"}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default App