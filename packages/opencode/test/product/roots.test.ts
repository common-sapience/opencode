import { describe, expect, test } from "bun:test"
import { Product } from "../../src/config/product"

describe("Product.candidateRoots", () => {
  test("the root the host names comes first", () => {
    expect(
      Product.candidateRoots({
        appRoot: "/Applications/App.app/Contents",
        moduleRoot: "/Applications/App.app/Contents/Resources/app.asar/out",
        execPath: "/Applications/App.app/Contents/Frameworks/App Helper.app/Contents/MacOS/App Helper",
      })[0],
    ).toBe("/Applications/App.app/Contents")
  })

  // A macOS helper process runs from its own bundle, so neither its directory nor the one above it
  // is where the application's extra files were shipped.
  test("a helper executable alone never reaches the application's extra files", () => {
    const roots = Product.candidateRoots({
      moduleRoot: undefined,
      execPath: "/Applications/App.app/Contents/Frameworks/App Helper.app/Contents/MacOS/App Helper",
    })

    expect(roots).not.toContain("/Applications/App.app/Contents")
  })

  test("without a named root the module and executable directories remain", () => {
    expect(Product.candidateRoots({ moduleRoot: "/src/pkg", execPath: "/opt/app/bin/engine" })).toEqual([
      "/src/pkg",
      "/opt/app/bin",
      "/opt/app",
    ])
  })

  test("an empty named root is ignored and duplicates collapse", () => {
    expect(Product.candidateRoots({ appRoot: "", moduleRoot: "/opt/app", execPath: "/opt/app/engine" })).toEqual([
      "/opt/app",
      "/opt",
    ])
  })
})
