import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import MedicineForm from "./MedicineForm"
import MedicineDetail from "./MedicineDetail"
import Analytics from "./Analytics"

const noop = () => {}
const emptyForm = {
  name: "", qty: "", looseQty: "", threshold: "", expiry: "",
  category: "", buyPrice: "", sellPrice: "", unitSellPrice: "",
  barcode: "", noBarcode: false,
  sellLoose: false, unitsPerBox: "", unitName: "strip"
}

const renderForm = (props) =>
  renderToStaticMarkup(
    <MedicineForm
      mode="add" form={emptyForm} setForm={noop} error="" fieldErrors={{}} scanNotice={null}
      scanning={false} saving={false} currentStock="" onBack={noop} onScanBarcode={noop}
      onPhoto={noop} onSave={noop} {...props}
    />
  )

describe("MedicineForm", () => {
  it("shows both scan buttons at once, the barcode field, and the no-barcode tick box", () => {
    const html = renderForm()
    expect(html).toContain("Scan barcode")
    expect(html).toContain("Photo of box")
    expect(html).toContain("This item has no barcode")
    expect(html).toContain("Confirm and add medicine")
  })

  it("hides the loose-unit inputs until 'sold in loose units' is on", () => {
    expect(renderForm()).not.toContain("in one box")
    const html = renderForm({ form: { ...emptyForm, sellLoose: true, unitsPerBox: "10", unitName: "strip" } })
    expect(html).toContain("strips in one box")
    expect(html).toContain("Full boxes")
    expect(html).toContain("Loose strips")
    expect(html).toContain("Sell price per strip")
  })

  it("shows the live margin and the below-cost warning", () => {
    expect(renderForm({ form: { ...emptyForm, buyPrice: "5", sellPrice: "8" } })).toContain("Profit $3.00 per box (37.5%)")
    const loss = renderForm({ form: { ...emptyForm, buyPrice: "8", sellPrice: "5" } })
    expect(loss).toContain("Selling below cost")
    expect(loss).toContain("you lose $3.00 on each box")
  })

  it("shows field errors next to the field", () => {
    const html = renderForm({ fieldErrors: { barcode: "Scan or type the barcode", name: "Enter the medicine name" } })
    expect(html).toContain("Scan or type the barcode")
    expect(html).toContain("Enter the medicine name")
  })

  it("receive mode shows current stock, asks for boxes, and has no barcode or scan buttons", () => {
    const html = renderForm({
      mode: "receive", currentStock: "3 boxes + 4 strips",
      form: { ...emptyForm, name: "Amoxicillin", sellLoose: true, unitsPerBox: "10" }
    })
    expect(html).toContain("Currently 3 boxes + 4 strips in stock")
    expect(html).toContain("Boxes received")
    expect(html).not.toContain("Photo of box")
    expect(html).not.toContain("This item has no barcode")
    expect(html).toContain("Add stock")
  })

  it("edit mode has a barcode Scan button and a Save changes button", () => {
    const html = renderForm({ mode: "edit", form: { ...emptyForm, name: "X", barcode: "123" } })
    expect(html).toContain("📷 Scan")
    expect(html).toContain("Save changes")
    expect(html).not.toContain("Photo of box")
  })
})

describe("MedicineDetail", () => {
  const med = {
    id: "a", name: "Amoxicillin", qty: 34, threshold: 10, unitsPerBox: 10, unitName: "strip",
    buyPrice: 5, sellPrice: 8, barcode: "8850001", category: "Antibiotic"
  }
  const render = (m) =>
    renderToStaticMarkup(
      <MedicineDetail med={m} sales={[]} forecast={undefined} risk={undefined}
        onBack={noop} onSell={noop} onAddStock={noop} onEdit={noop} onDelete={noop} />
    )

  it("shows loose stock, box size, both prices and a unit-named sell button", () => {
    const html = render(med)
    expect(html).toContain("3 boxes + 4 strips")
    expect(html).toContain("10 strips")
    expect(html).toContain("Sell price per strip")
    expect(html).toContain("$0.80")   // 8.00 ÷ 10 strips
    expect(html).toContain("$8.00")
    expect(html).toContain("Sold 1 strip")
  })

  it("renders an old-style medicine (no unit or price fields) without NaN", () => {
    const html = render({ id: "b", name: "Old one", qty: 5, threshold: 10 })
    expect(html).toContain("Sold one")
    expect(html).not.toContain("NaN")
    expect(html).not.toContain("undefined")
  })
})

describe("Analytics", () => {
  const meds = [
    { id: "a", name: "Amoxicillin", qty: 20, unitsPerBox: 10, unitName: "strip", buyPrice: 5, sellPrice: 8, category: "Antibiotic" },
    { id: "b", name: "Paracetamol", qty: 10, buyPrice: 1, sellPrice: 2, category: "Pain relief" },
    { id: "c", name: "No prices yet", qty: 3 }
  ]
  const now = Date.now()
  const sales = [
    { id: "s1", medicineId: "a", medicineName: "Amoxicillin", qty: 2, unitPrice: 0.8, unitCost: 0.5, soldAt: new Date(now - 3600e3) },
    { id: "s2", medicineId: "b", medicineName: "Paracetamol", qty: 1, unitPrice: 2, unitCost: 1, soldAt: new Date(now - 3600e3) },
    { id: "s3", medicineId: "b", medicineName: "Paracetamol", qty: 4, soldAt: new Date(now - 3600e3) } // no price recorded
  ]
  const render = (m, s) => renderToStaticMarkup(<Analytics medicines={m} sales={s} onBack={noop} />)

  it("shows total stock value and profit, with the totals worked out by hand", () => {
    const html = render(meds, sales)
    // stock: 2 boxes of A (cost 10, retail 16) + 10 of B (cost 10, retail 20) => cost 20, retail 36, potential 16
    expect(html).toContain("$20.00")
    expect(html).toContain("$36.00")
    expect(html).toContain("$16.00")
    // sales (30 days): revenue 1.60 + 2.00 = 3.60, cost 1.00 + 1.00 = 2.00, profit 1.60
    expect(html).toContain("$3.60")
    expect(html).toContain("$1.60")
    expect(html).toContain("4 sold without a price recorded")
    expect(html).toContain("1 medicine has no buy or sell price")
  })

  it("lists profit by medicine and by category", () => {
    const html = render(meds, sales)
    expect(html).toContain("Profit by medicine")
    expect(html).toContain("Amoxicillin")
    expect(html).toContain("Profit by category")
    expect(html).toContain("Antibiotic")
    expect(html).toContain("Pain relief")
  })

  it("renders an empty store without NaN", () => {
    const html = render([], [])
    expect(html).toContain("$0.00")
    expect(html).toContain("No sales with prices recorded")
    expect(html).not.toContain("NaN")
    expect(html).not.toContain("undefined")
  })
})
