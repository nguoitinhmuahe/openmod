# OpenMod fork notes

Đây là bản fork của `anomalyco/opencode`, không phải upstream. Ghi lại những gì đã sửa để merge upstream không mất.

Repo: https://github.com/nguoitinhmuahe/openmod (nhánh `dev`)

## Sửa trong lõi (dễ xung đột khi pull)

**`packages/plugin/src/effect/tool.ts`** dòng ~45 và **`packages/plugin/src/promise/tool.ts`** dòng ~68:

```diff
- result: Tool.Result
+ result: Types.Mutable<Tool.Result>
```

Lý do: `packages/core/src/tool.ts` đọc lại `afterEvent.result.content` sau khi mọi hook chạy, rồi mới trả cho model. Runtime đã hỗ trợ việc hook sửa kết quả; chỉ có type chặn. Bỏ `readonly` là hook đưa được output về model trong cùng lượt.

Nếu upstream đổi cách dispatch hook, xem lại `packages/core/src/tool.ts` quanh `executeTool` trước khi vá lại, vì có thể cách mới không còn đọc lại `result` nữa.

## Thêm mới (không xung đột)

- `packages/plugins/opencode-mod/` — plugin gồm ba phần:
  - `src/worktree.ts` — `worktree_diff` và `worktree_apply`, merge bằng `git apply --3way`
  - `src/hooks.ts` — chạy lệnh sau khi sửa file, nối output vào tool result
  - `src/accept-edits.ts` — mode `off` / `edits` / `all`
- `opencode.json` ở gốc repo — bật plugin này
- `packages/tui/src/component/logo.tsx` — logo OPENMOD, ba lớp hiệu ứng
- `packages/tui/src/component/logo-halo.ts` — ba lớp: `motesAt` (hạt bay lên), `flashesAt` (tia lóe), `breatheAt` (thở sáng). Đều là hàm thuần theo `(elapsed, geometry)` nên test được không cần terminal. `flashAt` lan 2 ô theo hàng, `lit` clamp độ sáng để tia + thở không cháy trắng.
- `packages/tui/src/logo.ts` — ASCII art OPENMOD
- Tên `OpenMod` ở: `app.tsx`, `attention.ts`, `mini/runtime.lifecycle.ts`

## Build

```sh
cd packages/cli
bun run script/build.ts --single --skip-web-ui --skip-install
```

Binary ở `packages/cli/dist/cli-windows-x64/bin/opencode.exe`.

`--skip-install` là cần thiết: Bun chặn 6 postinstall (`sharp`, `workerd`, `@ast-grep`, `@parcel/watcher`, `@ibm/plex`) và chúng không dùng cho TUI.

## Trạng thái đã kiểm chứng

- `packages/core` typecheck: 0 lỗi
- `packages/plugins/opencode-mod` typecheck: 0 lỗi
- `packages/tui` typecheck: 28 lỗi, tất cả là cross-package import chưa build (có từ trước khi sửa)
- Plugin load runtime được: `id: opencode.mod`
- Logic glob / placeholder / hook format / permission mode: test tay ALL PASS
- Ba lớp hiệu ứng logo (`motesAt`/`flashesAt`/`breatheAt`/`flashAt`/`lit`): 17 assert, ALL PASS — biên, tính thuần, tắt dần theo khoảng cách, clamp độ sáng

## Đã cài vào máy

Binary build từ nhánh `dev` này đã thay bản npm 1.19.5:

- `node_modules/opencode-ai/bin/opencode.exe` — bản mod (build stamp `202611180859`)
- `node_modules/opencode-ai/bin/opencode-v1.exe` — bản npm cũ, giữ để quay lui
- Shim `.bak` của npm: `opencode-v1-npm.bak`, `opencode-v1-npm.cmd.bak`
- DB đã migrate 35/35 session (4,863 `session_message`); backup ở `Desktop/opencode-v1-backup/`

Quay lui: đổi tên `opencode.exe` rồi đổi `opencode-v1.exe` thành `opencode.exe`.

Chọn hiệu ứng: `combo-pulse` — hạt bay lên + tia lóe + logo thở sáng. Bản preview để so các biến thể khác nằm ở `Desktop/opencode-effect-preview/`.

## Chưa kiểm chứng

Hook chạy lệnh thật trong một lượt agent thật: cần mở TUI và bảo agent sửa file để xác nhận output hook nằm trong tool result.

Hiệu ứng logo trong TUI thật: logic đã test, nhưng chưa nhìn bằng mắt trong terminal thật. Nếu hạt/tia không hiện, kiểm tra `config.animations` (mặc định bật) và chiều cao terminal phải ≥ 15 hàng.