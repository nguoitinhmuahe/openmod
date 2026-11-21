import { expect, test } from "bun:test"
import { createAppFixture } from "./fixture/app"
import { logo } from "../src/logo"

// Assert on the terminal buffer, not the StyledText objects sent to Solid.
test.each([100, 48])("home renders the OpenMod lettering at %i columns", async (width) => {
  await using app = await createAppFixture({ width, height: 40, config: { animations: true } })
  await app.ready
  await app.waitForFrame(frame => frame.includes("[object Object]") || frame.includes(logo.left[0]))
  const screen = app.captureCharFrame()
  expect(screen).not.toContain("[object Object]")
  for (const row of [...logo.left, ...logo.right]) expect(screen).toContain(row.trimEnd())
})
