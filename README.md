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

如果你已經使用設定完成的 Homebrew tap，cask 是可選的安裝方式，不是 onboarding 或 managed runtime 的必要條件：

```bash
brew install --cask <owner>/<tap>/career-ops
```

`<owner>/<tap>` 必須和 fork operator 設定的 tap repository 一致；例如 repository 名稱是 `homebrew-career-ops` 時，tap token 通常是 `career-ops`。Release workflow 會從實際 DMG 計算 SHA256 並發布 versioned cask，不使用 `sha256 :no_check`。

### Windows

從 [GitHub Releases](https://github.com/hikarushane/career-ops-desktop/releases) 下載 `CareerOps_<version>_Windows.exe` 或 `CareerOps-Windows-<version>.zip`，並執行 NSIS installer。

> **0.5.0 只提供 macOS 版。** Windows 安裝檔會在 0.5.1 提供：Windows 的 sidecar 與 runtime 驗證已在 CI 打包成功，但求職資料夾初始化的測試在 Windows 尚未通過（目錄 rename 時仍有開啟的 handle），修好並在 Windows 機器上驗收後才會發布。

> 在正式簽章的公開 release 尚未提供前，macOS 或 Windows 可能會顯示系統對未簽章 App 的標準安全提示。

每個 release 也會發布 `SHA256SUMS.txt`、`release-provenance.json`、已簽章 updater archives 與 `latest.json`。從 App 外安裝時，請用 checksum manifest 驗證下載內容。

## 第一次啟動

完整操作請見 [CareerOps Desktop 使用指南](./desktop/GUIDE.html)。

已安裝的 App、workspace 與 profile 是刻意分開的概念：

- **App 安裝**：你下載與更新的 CareerOps Desktop 應用程式。
- **Workspace**：你的私人 CareerOps 資料夾；所有求職檔案放在這裡，可獨立備份或開啟。
- **App 技術狀態**：已安裝 package 與其受管理元件是否完整；這不是另一套 profile 資料。
- **背景證據（Background evidence）**：你在匯入時加入的原始資料。
- **Canonical profile**：CareerOps 審閱後實際用來支援求職流程的資料。

第一次啟動時，CareerOps 會在作業系統慣用的 Documents 位置提供預設 workspace：

| 平台 | 預設 workspace |
| --- | --- |
| macOS | `~/Documents/CareerOps` |
| Windows | `Documents\CareerOps` |

你也可以選擇自訂位置，或選取既有的 CareerOps workspace。既有的 `cv.md`、profile、tracker、reports 與 output 都會保留在該 workspace。

1. 建立預設 workspace，或選擇自訂位置。
2. 完成 profile 設定，讓 evaluation 使用你的目標，而不是 shipped examples。
3. 開啟 **Settings → AI Provider**，選擇可用的本機 provider，並透過 provider 自己的 CLI 登入；Desktop App 不儲存 provider password。
4. 使用 **Background Import** 加入背景證據，並審閱任何 profile 更新建議。
5. 回到 Home，貼上職缺 URL 或執行 scanner。

### 管理 workspace

在 **Settings → Workspace** 中會看到：

```text
Workspace
<path>

Open Folder    Change Location
```

**Open Folder** 會在檔案管理器開啟目前的 workspace。**Change Location** 只會切換 App 使用的 workspace，**不會**搬移舊 workspace 或其中任何檔案。

若已儲存的 workspace 路徑失效（例如資料夾被搬移、刪除，或所在磁碟未掛載），App 不會顯示錯誤訊息，而是直接回到 Workspace Setup 畫面，讓你重新選擇 workspace 位置。

### Background Import 與 canonical profile

Background Import 提供以下八個背景證據分類：

- CV / Resume
- Work records
- Publications / Research
- Degrees / Transcripts
- LinkedIn
- References
- Certificates
- Portfolio / Projects

你可以拖放檔案，或用 **Add files** 加入檔案，接著檢查每個檔案的分類。CareerOps 會把選取的檔案複製到目前 workspace 的下列實際位置：

| 證據分類 | 儲存路徑 |
| --- | --- |
| CV / Resume | `documents/cv/` |
| Work records | `documents/work/` |
| Publications / Research | `documents/research/` |
| Degrees / Transcripts | `documents/diplomas/` |
| LinkedIn | `documents/linkedin/` |
| References | `documents/references/` |
| Certificates | `documents/certificates/` |
| Portfolio / Projects | `documents/portfolio/` |

之後 onboarding 會在單一整合 intake 中檢查全部新增或變更過的證據、提出帶有來源的建議並顯示衝突。

這些檔案是**證據**，不是各自獨立的 profile database。Canonical profile 仍是審閱後寫入以下檔案的內容：

- `cv.md`
- `config/profile.yml`
- `modes/_profile.md`

Stage 只會複製證據。審閱式 intake 採兩階段確認：先審閱並核准 AI 提出的新增或變更 proposals，再針對每個受影響的檔案查看完整的 before/after diff，確認無誤後才套用變更。**Apply selected changes** 只會把你明確核准的 proposals 寫入 canonical 檔案，並記錄已完成的 intake。**Skip for now** 會丟棄這次 review session、保留已 stage 的 documents，而且不會提交 intake fingerprints 或 canonical profile 變更。PDF 仍會被 stage，但此版本無法抽取 PDF 文字；若要讓其中內容用於 profile extraction，請同時加入 `.md`、`.txt` 或 `.tex` 版本。

目前 Desktop UI 將 Background Import 放在 onboarding 流程中，並不保證有獨立的 post-onboarding import route。

目前的 macOS release 支援審閱式 AI intake。Windows 與 self-contained Linux package 若無法使用安全的 provider isolation，審閱式 intake 階段會 fail closed：已 stage 的證據維持不變，canonical profile 檔案不會被修改；請更新到支援的 package 後再試。

### App 技術狀態

打包的 App 包含受管理的 JavaScript runtime 與必要的 CareerOps assets。一般 Desktop 使用不需要安裝 Git、Homebrew、Node、npm、Rust 或 Go。若 App 指出受打包 assets 或 managed runtime 缺失，請重新安裝或更新 CareerOps Desktop；不要用 developer commands 嘗試修復安裝。這種技術狀態和你所選 AI provider 是否已就緒或登入是不同的事情。

## Desktop updater

CareerOps Desktop 會在背景檢查 fork 的 signed Tauri update feed。找到更新時，header 的版本 badge 會維持顯示，直到你選擇 **Later** 或 **Update Now**。安裝前會驗證 updater signature，完成後重新啟動 App；暫時性的網路錯誤不會清除 App 已經找到的更新。

正式發布會在 fork repository、updater endpoint、public key 與 signing credentials 設定完成前 fail closed。Apple notarization 與 Windows Authenticode 是獨立於 Tauri updater signing 的 production credentials。

## Desktop 版增加了什麼

| 功能 | CareerOps Desktop |
| --- | --- |
| **Onboarding** | 匯入背景資料、設定 AI、選擇分析語言、填求職偏好，不需要手動改 YAML。AI 依你的文件與偏好產生 `cv.md`、`config/profile.yml`、`modes/_profile.md`、`portals.yml` 四個檔，套用前可預覽、可附回饋重產。`portals.yml` 不會沿用範本的公司清單：AI 依你的目標國家與產業填入當地常用的求職平台（例如台灣的 104、1111、CakeResume、就業通、LinkedIn；德國的 StepStone、Indeed、LinkedIn，工程領域另有 get-in-engineering、ingenieur.de）與 15 到 40 家相符的公司。 |
| **AI Provider** | 透過 provider abstraction 偵測並使用本機 AI CLI，不把 App 綁死在單一 agent。0.5.0 驗證過的 provider 是 **Claude Code**、**Codex** 與 **Antigravity（agy）**；三者都要先在系統上安裝並登入。 |
| **單一職缺分析** | 貼上職缺 URL，App 會先自己抓取職缺內容（LinkedIn 走公開 guest 端點；StepStone 等用 JavaScript 顯示內容的頁面讀取頁面內嵌的 JSON-LD 職缺資料；其他網站走一般 HTTP），抓不到或被擋（例如 Indeed）時才請你貼上職缺說明；也可以直接貼整段 JD。抓取成功後才啟動 AI 評估，完成後直接打開剛產生的報告卡。 |
| **找職缺** | 在 UI 內執行 scanner；Home 的 **Process pending jobs** 卡片顯示待處理與需注意的筆數，按下即批次處理 `data/pipeline.md` 的職缺，一輪接一輪直到收件匣清空。 |
| **任務中心** | 分析、掃描、批次與面試任務在切換畫面時不會中斷；Header 的任務 chip（進行中有琥珀色呼吸光暈）顯示進行中／完成／失敗，點一下就回到該任務的活動記錄。掃描或批次進行中按 Home 會直接顯示進度，進度頁左上角的上一頁不會取消任務。活動記錄顯示 AI 實際在讀寫哪些檔案，成功與否以是否真的產出報告判定，而不是只看 exit code。 |
| **Applications** | 用原生介面瀏覽既有 CareerOps pipeline、報告、狀態、PDF 與進度。看板卡片可拖到目標狀態欄改狀態；報告面板頂端也有狀態選單，面板左緣可拖拉調整寬度，表格檢視在沒選列時占滿全寬。報告卡上的 **Generate CV** 直接依報告產出客製 CV PDF；**Generate cover letter** 先請你回答四個問題（為什麼這家公司、要解決什麼問題、你的切入做法、語氣）再產出求職信 PDF。檔案產生後按鈕變成 **View CV**／**View cover letter**，在 Finder 或檔案總管中定位檔案；**View job description** 在面板內展開 `jds/` 的原始職缺擷取檔。 |
| **Interview** | Prep plan、Practice 與 Debrief 都是和 AI 的對話：先填一份簡短表單（例如面試日期與時間），AI 做完第一輪工作後可以繼續追問或補充，對話會保留。AI 寫進 `interview-prep/` 的計畫、練習紀錄與複盤會列在對話回覆下方和 Interview 頁的公司卡片下，點一下就在右側面板閱讀。 |
| **語言系統** | 自己選分析閱讀語言；CV、cover letter、面試材料則跟著每個 JD 的語言。介面語言另外可在 Settings 的地球圖示分頁切換 English 或繁體中文。 |
| **Help / Settings** | 在 App 內管理個人資料、來源、AI Provider、語言與說明文件。Settings → Job Search 是和第一次啟動相同的求職偏好表單，改完可請 AI 只重寫 `config/profile.yml`、`modes/_profile.md` 與 `portals.yml`（`cv.md` 不動），套用前先預覽。Settings → AI 的 Model 是下拉選單：agy 讀取 `agy models`，claude／codex 以一次極小的即時呼叫探測每個候選 model 是否可用（結果快取 24 小時，Refresh 可重探）；Fast mode 只在 Claude Opus 系列可開，Effort 對 agy 不適用。Help 的完整指南可切換中文或 English。 |
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
- Desktop 啟動 AI CLI 執行任務時（評估、掃描、批次、profile 生成）會跳過該 CLI 的逐步權限確認（例如 claude 的 `--dangerously-skip-permissions`），並且只載入專案層級設定、不載入你在使用者層級設定的 MCP servers。AI 因此能在你的求職資料夾內讀寫報告與 tracker；它仍然不會送出任何申請。
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
