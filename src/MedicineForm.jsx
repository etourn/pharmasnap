import { CATEGORIES } from "./categories"
import { UNIT_NAMES } from "./units"
import { formatMoney, parsePrice, unitMargin, marginPercent } from "./pricing"

const inputClass = (bad) =>
  `w-full mt-2 text-sm text-gray-800 outline-none border-b pb-1 ${bad ? "border-red-400" : "border-gray-200 focus:border-green-500"}`

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold text-green-800 uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  )
}

function Field({ name, label, error, hint, children }) {
  return (
    <div id={`field-${name}`} className={`bg-white rounded-xl p-4 shadow-sm border ${error ? "border-red-300" : "border-gray-100"}`}>
      <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</label>
      {children}
      {error ? (
        <p className="text-xs text-red-600 mt-2">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-400 mt-2">{hint}</p>
      ) : null}
    </div>
  )
}

function Stepper({ value, onChange, placeholder, bad }) {
  const bump = (delta) => onChange(String(Math.max(0, (Number(value) || 0) + delta)))
  return (
    <div className="flex items-center gap-3 mt-2">
      <button type="button" onClick={() => bump(-1)} aria-label="One less"
        className="w-10 h-10 rounded-full border border-gray-200 text-lg text-gray-600 active:bg-gray-100">−</button>
      <input
        type="number"
        inputMode="numeric"
        min="0"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-24 text-center text-lg text-gray-800 outline-none border-b pb-1 ${bad ? "border-red-400" : "border-gray-200 focus:border-green-500"}`}
      />
      <button type="button" onClick={() => bump(1)} aria-label="One more"
        className="w-10 h-10 rounded-full border border-gray-200 text-lg text-gray-600 active:bg-gray-100">+</button>
    </div>
  )
}

function MedicineForm({
  mode, // "add" | "edit" | "receive"
  form, setForm, error, fieldErrors, scanNotice, scanning, saving, currentStock,
  onBack, onScanBarcode, onPhoto, onSave
}) {
  const isAdd = mode === "add"
  const isEdit = mode === "edit"
  const isReceive = mode === "receive"
  const set = (patch) => setForm({ ...form, ...patch })

  const perBox = form.sellLoose ? Number(form.unitsPerBox) : 1
  const unit = form.unitName || "unit"
  const previewPrices = { buyPrice: parsePrice(form.buyPrice), sellPrice: parsePrice(form.sellPrice) }
  const previewMargin = unitMargin(previewPrices)
  const previewPercent = marginPercent(previewPrices)
  const looseDefault =
    form.sellLoose && perBox >= 2 && previewPrices.sellPrice != null
      ? Math.round((previewPrices.sellPrice / perBox) * 100) / 100
      : null

  const title = isEdit ? "Edit Medicine" : isReceive ? "Add Stock" : "Add Medicine"
  const saveLabel = saving ? "Saving…" : isEdit ? "Save changes" : isReceive ? "Add stock" : "Confirm and add medicine"

  return (
    <div className="min-h-screen bg-[#F5F5F0] max-w-sm mx-auto flex flex-col">
      <div className="bg-green-700 px-4 pt-10 pb-4 flex items-center gap-3">
        <button onClick={onBack} className="text-white text-xl">←</button>
        <div>
          <h1 className="text-white text-xl font-semibold">{title}</h1>
          <p className="text-green-200 text-sm">
            {isReceive ? `Currently ${currentStock} in stock` : isEdit ? "Correct the details below" : "Scan it, or fill in the details"}
          </p>
        </div>
      </div>

      <div className="flex-1 px-4 mt-5 pb-6 flex flex-col gap-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {isAdd && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onScanBarcode}
              className="bg-white border-2 border-dashed border-green-300 rounded-xl p-4 flex flex-col items-center gap-1 active:bg-green-50"
            >
              <span className="text-2xl">📷</span>
              <span className="text-green-700 font-medium text-sm">Scan barcode</span>
              <span className="text-[11px] text-gray-400">quickest</span>
            </button>
            <label className="bg-white border-2 border-dashed border-green-300 rounded-xl p-4 flex flex-col items-center gap-1 active:bg-green-50 cursor-pointer">
              <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" disabled={scanning} />
              <span className="text-2xl">🖼️</span>
              <span className="text-green-700 font-medium text-sm">{scanning ? "Reading…" : "Photo of box"}</span>
              <span className="text-[11px] text-gray-400">AI fills name &amp; expiry</span>
            </label>
          </div>
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
            {scanNotice.notes && <p className="text-green-700 text-xs mt-1">{scanNotice.notes}</p>}
          </div>
        )}

        <Section title="Identify">
          {!isReceive && (
            <Field name="barcode" label="Barcode" error={fieldErrors.barcode}>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={form.noBarcode ? "No barcode" : "Scan it, or type the number"}
                  value={form.barcode}
                  disabled={form.noBarcode}
                  onChange={e => set({ barcode: e.target.value })}
                  className={`flex-1 min-w-0 ${inputClass(fieldErrors.barcode)} disabled:text-gray-300`}
                />
                {isEdit && (
                  <button type="button" onClick={onScanBarcode} disabled={form.noBarcode}
                    className="mt-2 text-sm text-green-700 font-medium disabled:text-gray-300">
                    📷 Scan
                  </button>
                )}
              </div>
              <label className="flex items-center gap-2 mt-3 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={form.noBarcode}
                  onChange={e => set({ noBarcode: e.target.checked, barcode: e.target.checked ? "" : form.barcode })}
                />
                This item has no barcode
              </label>
            </Field>
          )}

          <Field name="name" label="Medicine name" error={fieldErrors.name}>
            <input
              type="text"
              placeholder="e.g. Paracetamol 500mg"
              value={form.name}
              onChange={e => set({ name: e.target.value })}
              className={inputClass(fieldErrors.name)}
            />
          </Field>
        </Section>

        <Section title="Stock">
          {!isReceive && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <label className="flex items-center justify-between text-sm text-gray-700">
                <span>
                  Sold in loose units too?
                  <span className="block text-xs text-gray-400">e.g. single strips from a box</span>
                </span>
                <input
                  type="checkbox"
                  checked={form.sellLoose}
                  onChange={e => set(e.target.checked
                    ? { sellLoose: true }
                    : { sellLoose: false, unitsPerBox: "", looseQty: "", unitSellPrice: "" })}
                />
              </label>
              {form.sellLoose && (
                <div className="mt-3 pt-3 border-t border-gray-100" id="field-unitsPerBox">
                  <div className="flex flex-wrap gap-2">
                    {UNIT_NAMES.map(name => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => set({ unitName: name })}
                        className={`text-xs px-3 py-1 rounded-full border ${
                          form.unitName === name ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-600 border-gray-200"
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <label className="block mt-3 text-xs text-gray-500 font-medium uppercase tracking-wide">
                    {unit}s in one box
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="2"
                    placeholder="e.g. 10"
                    value={form.unitsPerBox}
                    onChange={e => set({ unitsPerBox: e.target.value })}
                    className={inputClass(fieldErrors.unitsPerBox)}
                  />
                  {fieldErrors.unitsPerBox && <p className="text-xs text-red-600 mt-2">{fieldErrors.unitsPerBox}</p>}
                </div>
              )}
            </div>
          )}

          <Field
            name="qty"
            label={isReceive ? (form.sellLoose ? "Boxes received" : "Quantity received") : form.sellLoose ? "Full boxes" : "Starting quantity"}
            error={fieldErrors.qty}
          >
            <Stepper value={form.qty} onChange={qty => set({ qty })} placeholder="0" bad={fieldErrors.qty} />
          </Field>

          {form.sellLoose && !isReceive && (
            <Field name="looseQty" label={`Loose ${unit}s (from an opened box)`} error={fieldErrors.looseQty}>
              <Stepper value={form.looseQty} onChange={looseQty => set({ looseQty })} placeholder="0" bad={fieldErrors.looseQty} />
            </Field>
          )}

          <Field
            name="threshold"
            label={`Low stock alert at${form.sellLoose ? ` (${unit}s)` : ""}`}
            hint="You'll get an alert when stock drops to this number"
          >
            <input
              type="number"
              inputMode="numeric"
              placeholder={form.sellLoose && perBox >= 2 ? `e.g. ${perBox} (one box)` : "e.g. 10 (default)"}
              value={form.threshold}
              onChange={e => set({ threshold: e.target.value })}
              className={inputClass(false)}
            />
          </Field>
        </Section>

        <Section title="Prices (optional)">
          <Field name="buyPrice" label="Buy price per box ($)" error={fieldErrors.buyPrice}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="e.g. 2.50"
              value={form.buyPrice}
              onChange={e => set({ buyPrice: e.target.value })}
              className={inputClass(fieldErrors.buyPrice)}
            />
          </Field>
          <Field name="sellPrice" label="Sell price per box ($)" error={fieldErrors.sellPrice}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="e.g. 4.00"
              value={form.sellPrice}
              onChange={e => set({ sellPrice: e.target.value })}
              className={inputClass(fieldErrors.sellPrice)}
            />
            {previewMargin !== null && (
              <p className={`text-xs mt-3 ${previewMargin < 0 ? "text-red-600 font-medium" : "text-gray-500"}`}>
                {previewMargin < 0
                  ? `⚠️ Selling below cost — you lose ${formatMoney(-previewMargin)} on each box`
                  : `Profit ${formatMoney(previewMargin)} per box${previewPercent === null ? "" : ` (${previewPercent}%)`}`}
              </p>
            )}
          </Field>
          {form.sellLoose && !isReceive && (
            <Field
              name="unitSellPrice"
              label={`Sell price per ${unit} ($)`}
              error={fieldErrors.unitSellPrice}
              hint={looseDefault === null ? "Leave blank to use the box price ÷ box size" : `Leave blank to use ${formatMoney(looseDefault)} (box price ÷ ${perBox})`}
            >
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder={looseDefault === null ? "" : looseDefault.toFixed(2)}
                value={form.unitSellPrice}
                onChange={e => set({ unitSellPrice: e.target.value })}
                className={inputClass(fieldErrors.unitSellPrice)}
              />
            </Field>
          )}
        </Section>

        <Section title="Details (optional)">
          <Field name="category" label="Category">
            <div className="flex flex-wrap gap-2 mt-3">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set({ category: form.category === c ? "" : c })}
                  className={`text-xs px-3 py-1.5 rounded-full border ${
                    form.category === c ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>
          <Field name="expiry" label="Expiry date" hint="AI will warn you before medicines expire unsold">
            <input
              type="date"
              value={form.expiry}
              onChange={e => set({ expiry: e.target.value })}
              className={inputClass(false)}
            />
          </Field>
        </Section>
      </div>

      <div className="sticky bottom-0 bg-[#F5F5F0] border-t border-gray-200 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
        <button
          onClick={onSave}
          disabled={saving}
          className="w-full bg-green-700 text-white font-semibold py-4 rounded-xl active:bg-green-800 disabled:opacity-60"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

export default MedicineForm
