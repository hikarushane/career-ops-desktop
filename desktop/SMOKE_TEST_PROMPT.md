# CareerOps Desktop — Clean Smoke Test

Paste this as the first message of a new Claude Code session.

---

## Prompt

```
我要做 CareerOps Desktop 的全新 smoke test。請按照以下步驟執行：

### 安全規則（絕對優先）

- **絕對不能修改、移動、刪除** `/Users/shane_yeh/Projects/career-ops` 裡的：
  `cv.md`、`config/profile.yml`、`modes/_profile.md`、`documents/`、`.git/`
- 不要碰 `~/.config/careerops/release/`（signing infrastructure）
- 不要印出 secrets
- `rm` 已 alias 成 `/usr/bin/trash`，一律用 `rm <path>`（無 flag）；禁止 `\rm -rf`、`/bin/rm`、`command rm`
- macOS 安裝 .app 必須先 `rm` 舊 bundle 再 `cp -R`（cp -R 會 merge 不會 replace）
- `pkill` 的 process name 是 `desktop`，不是 `CareerOps`

### Step 1：關閉舊 app

```bash
pkill -x desktop 2>/dev/null || true
sleep 1
```

### Step 2：清除 app 的 managed workspace 和 cache

刪除以下目錄的 **內容**（不是 git repo，是 app 自己建的副本）：

```bash
rm ~/Documents/CareerOps
rm ~/Library/Application\ Support/io.career-ops.desktop
rm ~/Library/Caches/io.career-ops.desktop
rm ~/Library/WebKit/io.career-ops.desktop
```

每個 `rm` 分開跑。如果目錄不存在就跳過。

### Step 3：Build

```bash
cd /Users/shane_yeh/Projects/career-ops/desktop
npm run tauri:build
```

Build 結尾的 `TAURI_SIGNING_PRIVATE_KEY` 警告可以忽略（本地 dev build 不需要 signing）。

產出位置：
- `.app`: `src-tauri/target/release/bundle/macos/CareerOps.app`
- `.dmg`: `src-tauri/target/release/bundle/dmg/CareerOps_*_aarch64.dmg`

### Step 4：安裝到 /Applications（替換舊版）

```bash
rm /Applications/CareerOps.app
cp -R /Users/shane_yeh/Projects/career-ops/desktop/src-tauri/target/release/bundle/macos/CareerOps.app /Applications/CareerOps.app
```

先 `rm` 再 `cp -R`，不能只 `cp -R`（會 merge 殘留檔案）。

### Step 5：啟動並等待

```bash
open /Applications/CareerOps.app
```

然後截圖確認 app 啟動成功，顯示 onboarding 畫面。

### 驗證清單

完成以上步驟後，依序驗證：

1. Onboarding 第一步（語言選擇）正常顯示
2. 語言選項順序：繁體 → 簡體 → English
3. 每一步都有 Back 按鈕
4. AI Setup 步驟能偵測已安裝的 CLI
5. Intake preview 能正常跑完（或顯示有意義的錯誤訊息）

每驗完一項就跟我報告結果。
```
