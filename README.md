# 🎧 YouTube 0.5秒神耳猜歌王 (YT Music Guesser Web MVP)

一個連動 YouTube / YouTube Music 訊源的個人化聽音猜歌網頁遊戲。透過精準控制 YouTube Iframe 音訊串流，讓玩家挑戰只聽「前奏 0.5 秒」或「1 秒」猜出歌名！

---

## ✨ 核心特色

1. **⚡ 精準 0.5 秒前奏裁切引擎**：
   * 透過監聽 YouTube Iframe 的 `PLAYING` 事件，消弭網路緩衝造成的啟動延遲，確保發聲的瞬間才啟動毫秒高精度倒數計時。
2. **🪜 Heardle 風格階梯解鎖機制**：
   * **Level 1**：0.5 秒 (神耳挑戰 +100分)
   * **Level 2**：1.0 秒 (進階挑戰 +75分)
   * **Level 3**：2.0 秒 (熟悉提示 +50分)
   * **Level 4**：4.0 秒 (救贖提示 +25分)
3. **🎮 雙作答模式**：
   * **四選一模式 (預設)**：節奏快、低挫折感，超適合朋友聚會同樂。
   * **搜尋輸入模式 (硬核)**：即時自動補全，挑戰資深樂迷實力。
4. **🎯 多主題題庫 & 自訂 YouTube 歌單**：
   * 內建：**華語經典流行**、**K-POP 狂熱**、**熱血動漫神曲**、**西洋流行告示牌**。
   * **自訂歌單**：直接貼上任何 YouTube / YouTube Music 網址，系統會自動抓取曲名並建立考題！
5. **🏆 結算與社交分享**：
   * 連勝 (Streak) 紀錄、歷史最高連勝、總分統計。
   * 一鍵複製類似 Wordle / Heardle 的 Emoji 戰績，直接貼上 Threads / IG / LINE 炫耀。

---

## 🚀 快速啟動 (本地執行)

本專案採用**零依賴純前端技術**，電腦只要有 Python 即可立即啟動：

```bash
# 進入專案目錄
cd C:\Users\ASUS\.gemini\antigravity\scratch\yt-music-guesser

# 啟動本地測試伺服器 (會自動開啟瀏覽器)
python serve.py
```

開啟瀏覽器前往：`http://localhost:8000`

---

## 🌐 免費線上部署 (試水溫推薦)

因為是純前端靜態架構，你可以**完全免費**部署在以下平台：

### 方案 A：GitHub Pages (0 元，永久免費)
1. 在 GitHub 上建立一個公開倉庫（如 `yt-music-guesser`）。
2. 將此目錄下的所有檔案 Push 到 GitHub：
   ```bash
   git init
   git add .
   git commit -m "feat: initial yt music guesser mvp"
   git remote add origin https://github.com/<你的帳號>/yt-music-guesser.git
   git push -u origin main
   ```
3. 在倉庫的 `Settings -> Pages`，Source 選擇 `Deploy from a branch` (main / root)，幾秒後即可獲得專屬網址！

### 方案 B：Vercel / Netlify
1. 將專案推上 GitHub 後，直接在 [Vercel](https://vercel.com) 匯入。
2. 零設定直接按 Deploy，即可獲得超快速 CDN 網址。

---

## 📂 目錄結構

```
yt-music-guesser/
├── index.html            # 主頁面 (深色質感 UI、唱片旋轉、聲波特效)
├── css/
│   └── style.css         # 自訂動態效果、玻璃擬物與等化器動畫
├── js/
│   ├── app.js            # 遊戲主控制器與狀態機
│   ├── yt-player.js      # YouTube Iframe 音訊精準裁切引擎
│   └── song-data.js      # 預置題庫、自訂歌曲解析器
├── serve.py              # 輕量本地伺服器
└── README.md             # 說明文件
```
