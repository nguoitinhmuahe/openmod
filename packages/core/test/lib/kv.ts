import { Effect, Layer, Ref } from "effect"
import { KV } from "@opencode/core/kv"

/** An in-memory KV, so services that persist through kv run without a database. */
export const memoryKV: Layer.Layer<KV.Service> = Layer.effect(
  KV.Service,
  Effect.gen(function* () {
    const cells = yield* Ref.make(new Map<string, unknown>())
    return KV.Service.of({
      get: (key) => Ref.get(cells).pipe(Effect.map((map) => map.get(key))),
      set: (key, value) => Ref.update(cells, (map) => new Map(map).set(key, value)),
      remove: (key) =>
        Ref.update(cells, (map) => {
          const next = new Map(map)
          next.delete(key)
          return next
        }),
      scan: (options) =>
        Ref.get(cells).pipe(
          Effect.map((map) => ({
            entries: [...map.entries()]
              .filter(([key]) => key.startsWith(options.prefix))
              .map(([key, value]) => ({ key, value })),
          })),
        ),
    })
  }),
)
