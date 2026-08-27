<p align="center">
  <img src="./docs/wordmark-light.svg" alt="CareerOps Desktop" width="250" />
</p>
<p align="center">
  <strong>用 AI 找工作，不必整天在海量分頁與AI之間複製貼上。</strong>
</p>
<p align="center">
  <a href="./README.en.md">English</a>
</p>

# CareerOps Desktop

這是一個建立在 [santifer/career-ops](https://github.com/santifer/career-ops) 上的桌面 App。它保留上游既有的求職引擎、申請追蹤、報告、職缺掃描、批次處理、面試工具與文件產生流程，再加上一層原生 Tauri 介面，讓不熟 coding agent 或終端機的使用者也能直接操作。

## 專案定位與上游

本專案是 [santifer/career-ops](https://github.com/santifer/career-ops) 的非官方下游 fork。CareerOps 的 domain logic 與核心工作流程仍以上游為準；這個 fork 主要維護桌面產品層、相容性整合與一般使用者介面。

本專案與上游維護者沒有官方合作、贊助或背書關係。上游原有的設計、程式碼與成果歸功於原作者及其貢獻者。

Desktop 架構刻意避免重寫 CareerOps 的 business logic。App 負責 UX 與 orchestration；tracker、report、status、scanner、batch、文件產生等 canonical 行為仍交由上游核心與 Go sidecar 處理。

## 安裝

一般使用者應優先下載預先打包好的 Desktop release，不需要自己 clone repo 或安裝開發工具鏈。

### macOS

從 [GitHub Releases](https://github.com/hikarushane/career-ops-desktop/releases) 下載最新版 DMG 或 `CareerOps-macOS-<version>.zip`。開啟 DMG，把 CareerOps 拖入 Applications，再從 Applications 啟動。

Homebrew tap 設定完成後，可以安裝同一份已簽章 release：

```bash
brew install --cask <owner>/<tap>/career-ops
```

`<owner>/<tap>` 必須和 fork operator 設定的 tap repository 一致；例如 repository 名稱是 `homebrew-career-ops` 時，tap token 通常是 `career-ops`。Release workflow 會從實際 DMG 計算 SHA256 並發布 versioned cask，不使用 `sha256 :no_check`。

### Windows

從 [GitHub Releases](https://github.com/hikarushane/career-ops-desktop/releases) 下載 `CareerOps_<version>_Windows.exe` 或 `CareerOps-Windows-<version>.zip`，並執行 NSIS installer。

> 在正式簽章的公開 release 尚未提供前，macOS 或 Windows 可能會顯示系統對未簽章 App 的標準安全提示。

每個 release 也會發布 `SHA256SUMS.txt`、`release-provenance.json`、已簽章 updater archives 與 `latest.json`。從 App 外安裝時，請用 checksum manifest 驗證下載內容。

## 第一次啟動

1. 選擇或建立 CareerOps data folder；既有 `cv.md`、profile、tracker、reports 與 output 都保留在這個 folder。
2. 完成 profile 設定，讓 evaluation 使用你的目標，而不是 shipped examples。
3. 開啟 **Settings → AI Provider**，選擇可用的本機 provider，並透過 provider 自己的 CLI 登入；Desktop App 不儲存 provider password。
4. 使用 **Background Import** 把既有 CareerOps workspace 帶入 Desktop flow。Import 會保留 user layer，並在執行 AI 工作前列出它找到的資料。
5. 回到 Home，貼上職缺 URL 或執行 scanner。

## Desktop updater

CareerOps Desktop 會在背景檢查 fork 的 signed Tauri update feed。找到更新時，header 的版本 badge 會維持顯示，直到你選擇 **Later** 或 **Update Now**。安裝前會驗證 updater signature，完成後重新啟動 App；暫時性的網路錯誤不會清除 App 已經找到的更新。

正式發布會在 fork repository、updater endpoint、public key 與 signing credentials 設定完成前 fail closed。Apple notarization 與 Windows Authenticode 是獨立於 Tauri updater signing 的 production credentials。

## Desktop 版增加了什麼

| 功能 | CareerOps Desktop |
| --- | --- |
| **Onboarding** | 匯入背景資料、設定 AI、選擇分析語言，不需要手動改 YAML。 |
| **AI Provider** | 透過 provider abstraction 偵測並使用 Codex 等本機 AI CLI，不把 App 綁死在單一 agent。 |
| **單一職缺分析** | 貼上職缺 URL，直接從 App 執行 CareerOps evaluation flow。 |
| **找職缺** | 在 UI 內執行 scanner 與 batch，看得到進度、去重複、失敗原因與排序結果。 |
| **Applications** | 用原生介面瀏覽既有 CareerOps pipeline、報告、狀態、PDF 與進度。 |
| **Interview** | 在 Desktop 裡使用 Prep Planner、Practice 與 Debrief。 |
| **語言系統** | 自己選分析閱讀語言；CV、cover letter、面試材料則跟著每個 JD 的語言。 |
| **Help / Settings** | 在 App 內管理個人資料、來源、AI Provider、語言與說明文件。 |
| **Human in the loop** | CareerOps 可以分析、起草與建議，但最後決定與實際送出仍由使用者控制。Desktop 不會自動送出求職申請或寄出 outreach。 <!-- hitl: absolute guarantee. Do not add "automatically", "by itself", "without your permission" or any other hedge when translating this row. --> |

## 語言怎麼運作

CareerOps Desktop 把「你想用什麼語言讀分析」和「這份職缺要用什麼語言產文件」拆開。

- **Analysis Language**：控制 Dashboard 與 report 的敘述語言。
- **Job Language**：每個職缺各自從 JD 判斷，控制 CV、cover letter 與面試材料。
- **Market mode**：獨立存在，用來處理不同市場的詞彙與規則。

例如：你可以用繁體中文閱讀分析，但德文 JD 仍會產出德文 CV、德文 cover letter 與德文面試材料。

這個 Desktop fork 的 README 只維護英文與繁體中文兩個版本，不再維護其他上游語言翻譯。

## 怎麼使用

主要流程是：

```text
Onboarding
  ↓
Home
  ├─ Analyze one job
  └─ Find jobs
       ↓
Evaluate / Scanner / Batch
       ↓
Applications
       ↓
Interview / Progress
```

Desktop App 的目的，是把 CareerOps 原本要透過 coding-agent session、Markdown、YAML 與各種 mode 操作的流程包成一般 App 介面。

需要 AI reasoning 的任務仍由你設定的本機 AI Provider 執行。CareerOps Desktop 不會因此變成雲端服務，也不需要另外架一個 CareerOps backend。

## 架構

```text
desktop/ (React + Tauri UI)
        │
        │ typed Tauri invoke
        ▼
desktop/src-tauri/ (Rust)
        │
        │ controlled process execution
        ▼
career-data sidecar (Go)
        │
        ▼
dashboard/internal/data + upstream CareerOps files
```

Go sidecar 重用 CareerOps 既有 data layer，輸出 structured JSON。Rust 負責 Desktop bridge 與受控的 process execution；TypeScript 負責產品介面，不應再做一套 CareerOps domain rules。

AI task 的邊界則是：

```text
Desktop UI
   ↓
AgentRunner
   ↓
AgentProvider
   ↓
Codex / 其他支援的本機 AI CLI
   ↓
CareerOps modes 與 canonical files
```

## 資料與安全

CareerOps Desktop 保留上游 human-in-the-loop 的原則。

- 原始履歷與職涯資料仍由使用者掌握。
- Tracker 與 report 格式維持上游相容。
- Status 修改走受保護的 write path，不任意重寫 Markdown。
- Desktop 不會自動送出求職申請或寄出 outreach。
- 支援的情況下，AI Provider 憑證交由各 CLI 自己的本機登入機制管理。
- CareerOps 核心檔案仍是 canonical source，不另外建立一套 Desktop database 複製資料。

## 開發

原本的 `desktop/README.md` 已整合進這份文件。之後 `desktop/` 底下不再維護第二份 README。

### Codex 使用者

CareerOps 支援 Codex 作為 AI provider。設定方式見 [CODEX.md](./CODEX.md)。Headless 模式下，在 repo 根目錄執行 `codex exec "prompt"`。Codex 不保證支援 slash commands，請改用自然語言 prompt。

### Advanced / CLI 使用方式

完整上游 CLI 仍提供給 maintainer 與偏好 agent-driven workflow 的使用者。在 repository root 執行：

```bash
node doctor.mjs --json
node scan.mjs
node tracker.mjs
codex exec "Run career-ops pipeline mode for data/pipeline.md"
```

完整 mode 與 CLI reference 請看保留的 [upstream README](./docs/upstream/README.md)。CLI-only installation 仍可使用 `node update-system.mjs check`；一般 Desktop 使用者應使用 App 內 updater，避免同時收到兩套 update notifications。

### 環境需求

實際版本以 repo 現有 manifest 與 CI 為準。Desktop stack 包含：

- Node.js
- Go
- Rust
- Tauri 所需系統套件
- macOS 的 Xcode Command Line Tools
- 打包 Windows 版本時需要的 Windows build environment

### 啟動 Desktop App

```bash
cd desktop
npm install
npm run tauri:dev
```

`tauri:dev` 會先 build Go 的 `career-data` sidecar，再啟動 App。

做 UI 開發時，請使用 repo 既有的 synthetic fixture 機制，不要直接修改真實 CareerOps user data。

### Build

```bash
cd desktop
npm run tauri:build
```

正式 release 應由 repository release workflow 在原生 macOS 與 Windows runner 上打包。

## 驗證

測試指令以 repo 當下的 scripts 為準，不把 README 範例當成唯一 source of truth。常見驗證包含：

```bash
node test-all.mjs

cd dashboard
go test ./...

cd ../desktop
npm test
npm run build
npm run build:sidecar

cd src-tauri
cargo check
cargo test
```

另外執行：

```bash
git diff --check
```

實際 command 可能隨 upstream CareerOps 演進。

## 同步上游

上游來源是 [santifer/career-ops](https://github.com/santifer/career-ops)。更新時應走 compatibility / stabilization flow，不直接把 downstream-owned Desktop 檔案整批覆蓋。

原則：

- upstream domain logic 通常優先；
- Desktop UX 與 orchestration 保留 downstream ownership；
- root README 維護 CareerOps Desktop 的產品說明；
- 必要時另外保存 upstream README；
- 每次 sync 後都要重新驗證 language、updater、packaging 與 Desktop contracts。

## 授權與致謝

本 fork 建立在 [santifer/career-ops](https://github.com/santifer/career-ops) 上，沿用 repository 現有的授權與 attribution 要求。CareerOps 原始設計與上游貢獻歸原作者及其貢獻者所有。

本 fork 的 Desktop-specific 功能、整合與文件由下游另外維護。完整條款請見 [LICENSE](./LICENSE)，以及 repo 內保留的 upstream trademark / attribution 文件。
