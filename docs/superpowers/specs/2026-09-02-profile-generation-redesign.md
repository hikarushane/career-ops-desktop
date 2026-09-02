# CareerOps Desktop：Profile Generation 翻修提案

日期：2026-09-02。Build 來源：`release/desktop-v0.5.0` working tree（含 Bug 1 到 Bug 4 的修正）。

## 1. Smoke test 結果

| 項目 | 結果 | 備註 |
|---|---|---|
| Rust tests | 92/92 通過 | `cargo test --lib` |
| 前端 tests | 193/194 通過 | 唯一失敗是已知的 `release-pipeline.test.ts:281` sandbox-exec guard |
| TypeScript | 乾淨 | `tsc --noEmit` |
| Build + 安裝 + 啟動 | 通過 | `CareerOps.app` 0.4.0 |
| Onboarding 語言選項順序 | 通過 | 繁體 → 簡體 → English |
| Back 按鈕 | 有，但兩處行為有問題 | 見第 7 節 |
| AI Setup 偵測 CLI | 通過 | Claude Code 2.1.252、codex-cli 0.150.0、Antigravity 1.1.23 |
| Profile Generation（Claude Code） | 失敗兩次，原因不同 | 見第 2 節 |
| Profile Generation（Codex） | 無法測 | 帳號用量上限，3:12 AM 後可重試 |
| Profile Generation（agy） | 失敗 | headless 權限被自動拒絕，stdout 空白 |
| Home / Evaluate 卡片 | 顯示正常 | 未實際送出評估 |
| Progress 空資料 | 不再白頁 | Score distribution 在 count 0 仍畫 bar |
| Settings：Search Sources | 通過 | 顯示 `CareerOps/portals.yml` |
| Settings：AI tab | 通過 | Provider 清單、Model、Effort、Fast mode 都有 |

## 2. Profile Generation 失敗紀錄

**第一次（Claude Code，約 90 秒）**
AI 回傳的 item 帶 `"conflict": null`。`parseIntakeProposal` 只接受 undefined 或 object，null 被拒。
已在 working tree 修好：`desktop/src/lib/runner.ts` 把 null 正規化為省略，`runner.test.ts` 加一個測試。未 rebuild 驗證。

**第二次（Claude Code，35 秒，由 Ready 頁按 Back 意外觸發）**
再次回報 invalid proposal。UI 只顯示輸出最後 800 字，看不到 JSON，無法判定是哪條驗證。輸出仍是韓文。

**Codex**
`codex exec` 立刻回 usage limit。環境問題。

**agy**
`agy -p` 需要 shell 權限跑 `intake.mjs`，headless 模式自動拒絕，exit 0 但 stdout 空白。App 目前只傳 `-p`，沒有傳 `--dangerously-skip-permissions`，所以任何 agy 任務在 app 裡都會靜默失敗。

## 3. 為什麼會一直冒新 bug

六個失敗全部屬於同一類：**嚴格協定與 LLM 實際行為之間的落差**。

| # | 落差 |
|---|---|
| 1 | Provider 建了 `.recall/`、`.claude/` metadata 目錄 |
| 2 | Rust hash 原始 bytes，`intake.mjs` hash 抽取後的文字 |
| 3 | 從 template 起始的檔案讓 `before_text.contains` 誤判 |
| 4 | Provider 多回一個 `note` 欄位 |
| 5 | Provider 回 `"conflict": null` 而非省略 |
| 6 | Prompt 說 HTML 可處理，`intake.mjs` 把 `.html` 歸類為 unsupported |

每修一個，只封掉一種變體。變體空間沒有上限，因為 provider、模型版本、使用者環境都會變。

除此之外還有兩個結構性原因：

**A. Provider 繼承了使用者的整個個人環境。**
sandbox 裡放了 46 KB 的 `AGENTS.md`。`claude -p` 又會載入 `~/.claude` 的 102 行 `CLAUDE.md`、5 種 hook、14 個 plugin、output style，以及 `defaultMode: bypassPermissions`。韓文輸出、速度慢，都來自這層。更嚴重的是：**寫檔能成功完全依賴你自己設的 bypassPermissions**。一般使用者的 `claude -p` 預設會拒絕 Write，intake-apply 一定撞到「target file was not modified」。

**B. 兩階段加五道 gate 的成本。**
`runner.rs` 6448 行，其中約 3000 行是 transaction、journal、recovery、capability writer，服務的對象只有三個檔案。每一道 gate 都是一個新的拒絕點，錯誤訊息對使用者也不可讀。

**對照 neurolist。**
`apps/desktop/sidecar/` 共 253 行：用 Agent SDK 的 `query()`，`settingSources: ["project"]` 不吃使用者全域設定，事件串流到 UI，權限請求轉給前端。沒有協定解析、沒有 gate。

**對照你手動的做法。**
在任何 coding agent 貼一段話、附上三個 template，四個檔案就出來了。Desktop 要做的事和這個一樣。

## 4. 提案：一段式「生成到暫存區，預覽後套用」

### Onboarding 步驟

1. Import your background：拖入整個資料夾，列出所有檔案，逐一選類別，新增 `others`。
2. Analysis Language（不變）。
3. Set up AI（不變，加上 provider 旗標修正）。
4. **求職偏好表單（新）**：地區、職缺關鍵字、期望薪資、是否願意搬家、偏好城市。
5. Generate。

### Generate 的流程

1. App 建 staging dir：只放 `documents/`、三個 template、`config/profile.example.yml`、`templates/portals.example.yml`、`modes/_profile.template.md`，以及一份精簡的任務說明。**不放 46 KB 的 AGENTS.md**。
2. App 跑**一次** provider，prompt 就是你手動用的那段話：根據 documents 與偏好，產出 `cv.md`（master CV，越詳盡越好，有不同重點就分版本）、`portals.yml`、`config/profile.yml`、`modes/_profile.md`，直接寫檔。沒有 JSON 協定、沒有 delimiter、沒有 proposal id。
3. Provider 結束後，App 做**不需要模型的確定性檢查**：四個檔案存在、非空、兩個 YAML 能 parse、`cv.md` 有標題。只按檔名取這四個檔案，其他任何檔案一律忽略，所以不會再有 allowlist 拒絕。
4. **預覽畫面**：顯示四個檔案內容（有舊版就顯示 diff），按鈕：套用、重新生成、稍後再說。
5. 套用：把四個檔案原子性寫進 workspace，舊檔備份。可以沿用現有 `promote_target_changes` 的精簡版。
6. 來源紀錄：App 自己寫 `data/intake-state.json`（用到的 document 檔名與 bytes hash）。不再需要 `intake.mjs --commit`。

### Provider 呼叫的硬化（neurolist 做對的那部分）

| Provider | 旗標 |
|---|---|
| claude | `-p --output-format stream-json --verbose --setting-sources project --strict-mcp-config --dangerously-skip-permissions`，任務說明用 `--append-system-prompt-file` |
| agy | `-p --output-format stream-json --dangerously-skip-permissions` |
| codex | `exec --skip-git-repo-check --json --sandbox workspace-write`，並確認自動核准的旗標 |

staging dir 是可拋棄的，所以 skip-permissions 只影響 staging dir。`stream-json` 讓 UI 顯示真實進度（正在寫哪個檔案），取代現在的假計時器。

### 刪除與保留

刪除：proposal 協定（TS parse 與 Rust bind）、IntakeSession 兩階段、GATE 3 到 5、journal、transaction、recovery、capability writer。
保留：staging dir、精簡版原子套用、cancel、process group 終止。
預估 `runner.rs` 減少約 3000 行；需重寫 `runner.test.ts` 的 intake 區段與 Rust intake 測試。

## 5. 風險與取捨

- **安全模型改變。** 舊設計證明每個 proposal 的值真的落在檔案裡，目的是防止不受信任的文件注入。新設計的防線變成：staging dir 隔離（provider 碰不到真正的 workspace）、確定性檔案檢查、使用者套用前預覽。文件裡的注入仍可能讓模型寫出不當內容，但使用者在套用前會看到，和你手動用 coding agent 的風險相同。
- **Provider 認證不變。** 仍用使用者自己的 CLI 登入狀態。
- **多 provider 仍可行。** 新流程只要求「寫四個檔案」，這是所有 CLI 的最低公分母。
- **release-pipeline sandbox-exec guard test** 仍需決定：恢復 OS sandbox 或退役測試。與本翻修無關。

## 6. 建議順序

1. **Phase 1：核心流程。** 新的 generate、預覽、套用，加上 per-provider 旗標。用 Claude 與 agy 實測到通過。
2. **Phase 2：Onboarding UI。** 偏好表單、資料夾拖入、`others` 類別、Back 按鈕保留狀態。
3. **Phase 3：清理。** 刪除 Rust 死碼與測試、決定 sandbox-exec guard。

## 7. 這次順手發現的小問題

- Ready 頁按 Back 會回到 generating 並**無聲重跑一次 AI**。應回到 AI Setup，或顯示確認。
- 回到 Import 頁時 staged 清單消失；此時按 Skip 會把已 staged 的狀態清掉。
- 語言下拉選單多了一個 `pdf`：`modes/pdf/` 目錄被當成市場語言。
- AiSetup 與 Settings 的 provider 卡片無法用鍵盤聚焦。
- Progress 的 Score distribution 在 count 0 時仍畫一根 bar 與 tooltip。
- Settings AI tab 的 Fast mode 開關在預設視窗高度下被切到下緣，需再確認。
- `intake.mjs` 把 `.html` 歸類為 unsupported，與 `INTAKE_PREVIEW_PROMPT` 的說法矛盾。
- `$TMPDIR` 累積了 7 個 `careerops-intake-recovery-*` 目錄，沒有被清理。

## 8. 設計決策（2026-09-02 使用者裁決後鎖定）

使用者選擇：翻修 Phase 1 + 2；Rust 的 transaction／journal／recovery 機制直接刪除。

| 決策 | 內容 |
|---|---|
| 任務名稱 | 新 task type `profile-generate`，取代 `intake-preview` 與 `intake-apply` |
| 產出檔案 | `cv.md`、`config/profile.yml`、`modes/_profile.md`、`portals.yml` 四個 |
| Staging 內容 | `documents/`（解 symlink 後的一般檔案）、三個 template、四個目標檔的現有版本。不放 `AGENTS.md`、`CLAUDE.md`，不 `git init` |
| 生成後檢查 | 四個檔案存在且非空；兩個 YAML 用 `serde_yaml` 能 parse；`cv.md` 至少一個 `#` 標題。檢查結果隨檔案內容回傳，不擋 apply，由使用者在預覽決定 |
| 進度顯示 | Rust 在等待 provider 期間每秒輪詢 staging，目標檔第一次出現時 emit `generation-progress`。不解析 provider 的 stream 格式 |
| 套用 | `apply_generation`：先把 workspace 現有的四個檔案備份到 `.careerops-backup/{unix-ts}/`，再逐檔寫到同目錄的暫存檔後 rename。不再寫 `data/intake-state.json` |
| Provider 旗標 | 只對 `profile-generate` 使用：claude `-p --setting-sources project --strict-mcp-config --dangerously-skip-permissions`；agy `-p --dangerously-skip-permissions`；codex `exec --skip-git-repo-check --full-auto`（實作時以 `codex exec --help` 確認旗標名）；其他 provider 沿用 `headless_args` |
| 不再依賴 | `intake.mjs`、packaged JS runtime、`CAREEROPS_JS_RUNTIME`（provider 直接讀檔） |
| 語言 | prompt 帶入 `language.analysis`：`modes/_profile.md` 與 narrative 欄位用該語言；`cv.md` 跟隨來源文件的主要語言 |
| Onboarding 步驟 | welcome → import → language → ai → preferences → generating → ready。ready 的 Back 回 preferences；generating 卸載時取消任務 |
| Import | 拖入資料夾時由 Rust `list_intake_candidates` 遞迴列出一般檔案（略過 dotfile）；新增 `others` 類別對應 `documents/others`；Onboarding 保存 import 狀態，Back 回來仍看得到 |
| 刪除 | `IntakeReview.tsx`（無人引用）、proposal 協定、IntakeSession、gate、fingerprint、transaction、journal、recovery、capability writer 及其測試 |
| 範圍外 | `evaluate`／`scan` 等一般任務的 provider 旗標硬化（另案）；stream-json 即時進度；`release-pipeline.test.ts:281` 的 sandbox-exec 決策；Settings 的 Model／Effort／Fast mode 後端串接 |
