// Local acceptance check against the independently runnable MOD-combo-pulse preview.
import assert from "node:assert/strict"
import { blank, comboPulse, W, H, FPS } from "../../opencode-effect-preview/preview.ts"
import { comboRows, fps } from "../packages/tui/src/component/logo-halo.ts"
assert.equal(fps, FPS)
let count = 0
let t = 0
for (let i = 0; i < 360; i++, t += 1 / FPS) {
  const reference = blank()
  comboPulse.render(reference, t)
  const rows = comboRows(t)
  assert.equal(rows.length, H)
  for (let y = 0; y < H; y++) {
    assert.equal(rows[y].chunks.length, W)
    rows[y].chunks.forEach((c, x) => {
      const label = `frame ${i}, cell ${x},${y}`
      assert.equal(c.text, reference.chars[y][x], label)
      assert.deepEqual([c.fg!.r, c.fg!.g, c.fg!.b].map(v => Math.round(v * 255)), reference.colors[y][x], label)
      assert.ok(!c.bg && !c.attributes, label)
      count++
    })
  }
}
console.log(`PASS: 360 frames, ${count} cells (${W}x${H}), exact glyphs and RGB, no background or bold`)
