import { describe, it, expect } from "vitest"
import { unitsPerBoxOf, formatStock, sellLabel } from "./units"

describe("unitsPerBoxOf", () => {
  it("treats missing, null, 0, 1 and junk as whole-box", () => {
    for (const unitsPerBox of [undefined, null, 0, 1, -5, 2.5, "abc"]) {
      expect(unitsPerBoxOf({ unitsPerBox })).toBe(1)
    }
    expect(unitsPerBoxOf(undefined)).toBe(1)
  })

  it("returns the box size when it is a whole number above 1", () => {
    expect(unitsPerBoxOf({ unitsPerBox: 10 })).toBe(10)
    expect(unitsPerBoxOf({ unitsPerBox: "10" })).toBe(10)
  })
})

describe("formatStock", () => {
  const strips = { unitsPerBox: 10, unitName: "strip" }

  it("returns just the number for whole-box medicines", () => {
    expect(formatStock(12, {})).toBe("12")
    expect(formatStock(0, { unitsPerBox: 1 })).toBe("0")
  })

  it("splits boxes and loose units", () => {
    expect(formatStock(34, strips)).toBe("3 boxes + 4 strips")
    expect(formatStock(31, strips)).toBe("3 boxes + 1 strip")
    expect(formatStock(11, strips)).toBe("1 box + 1 strip")
  })

  it("drops the zero part", () => {
    expect(formatStock(30, strips)).toBe("3 boxes")
    expect(formatStock(10, strips)).toBe("1 box")
    expect(formatStock(4, strips)).toBe("4 strips")
    expect(formatStock(1, strips)).toBe("1 strip")
    expect(formatStock(0, strips)).toBe("0 boxes")
  })

  it("falls back to 'unit' when no unit name is set", () => {
    expect(formatStock(4, { unitsPerBox: 10 })).toBe("4 units")
  })
})

describe("sellLabel", () => {
  it("keeps 'Sold one' for whole-box medicines", () => {
    expect(sellLabel({})).toBe("Sold one")
  })
  it("names the unit for loose medicines", () => {
    expect(sellLabel({ unitsPerBox: 10, unitName: "strip" })).toBe("Sold 1 strip")
  })
})
