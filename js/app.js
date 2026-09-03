import {
  SONG_CATEGORIES,
  extractVideoId,
  extractPlaylistId,
  fetchVideoInfo,
  fetchPlaylistSongs,
  parseOffsets,
  encodeOffsets,
  applyOffsetsToSongs
} from './song-data.js';
import { YouTubeAudioEngine } from './yt-player.js';

// Configuration: Snippet duration tiers in milliseconds
export const DIFFICULTY_TIERS = {
  normal: [
    { duration: 500, label: '0.5 秒', points: 100, badge: '' },
    { duration: 1000, label: '1.0 秒', points: 75, badge: '' },
    { duration: 2000, label: '2.0 秒', points: 50, badge: '' },
    { duration: 4000, label: '4.0 秒', points: 25, badge: '' },
  ],
  hell: [
    { duration: 150, label: '0.15 秒', points: 150, badge: '' },
    { duration: 300, label: '0.3 秒', points: 100, badge: '' },
    { duration: 800, label: '0.8 秒', points: 60, badge: '' },
    { duration: 2000, label: '2.0 秒', points: 30, badge: '' },
  ]
};

class GuessGameApp {
  constructor() {
    this.audioEngine = new YouTubeAudioEngine('yt-player-target', 'vg2pgKLBYo4');
    this.currentCategoryKey = 'tanya';
    this.gameMode = 'choice'; // 'choice' or 'search'
    this.difficulty = localStorage.getItem('yt_guesser_difficulty') || 'normal';
    this.urlOffsets = {};

    this.songs = [];
    this.currentSong = null;
    this.tierIndex = 0; // 0 to 3
    this.isPlaying = false;
    this.isRoundOver = false;

    // Statistics
    this.score = 0;
    this.streak = 0;
    this.bestStreak = parseInt(localStorage.getItem('yt_guesser_best_streak') || '0', 10);
    this.history = [];

    // Custom Songs and Active Playlist metadata
    this.customSongs = JSON.parse(localStorage.getItem('yt_guesser_custom_songs') || '[]');
    this.customPlaylistId = localStorage.getItem('yt_guesser_custom_playlist_id') || '';
    this.customPlaylistTitle = localStorage.getItem('yt_guesser_custom_playlist_title') || '自訂題庫';

    // Set of successfully guessed song IDs for the active playlist
    this.completedSongIds = new Set();

    this.initElements();
    this.initEventListeners();
  }

  get tiers() {
    return DIFFICULTY_TIERS[this.difficulty] || DIFFICULTY_TIERS.normal;
  }

  initElements() {
    // Difficulty Buttons
    this.diffToggleBtns = document.querySelectorAll('.diff-toggle-btn');

    // Buttons & Controls
    this.btnPlay = document.getElementById('btn-play-snippet');
    this.btnReplay = document.getElementById('btn-replay-snippet');
    this.btnNextTier = document.getElementById('btn-next-tier');
    this.btnGiveUp = document.getElementById('btn-give-up');
    this.btnNextSong = document.getElementById('btn-next-song');
    this.btnShare = document.getElementById('btn-share');

    // Visual elements
    this.vinyl = document.getElementById('vinyl-record');
    this.waveVisualizer = document.getElementById('wave-visualizer');
    this.tierBars = document.querySelectorAll('.tier-bar');
    this.tierLabel = document.getElementById('current-tier-label');
    this.loadingOverlay = document.getElementById('player-loading');
    this.ytPlayerWrapper = document.getElementById('yt-player-wrapper');

    // Audio Status Pill
    this.audioStatusPill = document.getElementById('audio-status-pill');
    this.audioStatusDot = document.getElementById('audio-status-dot');
    this.audioStatusText = document.getElementById('audio-status-text');

    // Playlist Progress Tracker
    this.progressBarFill = document.getElementById('progress-bar-fill');
    this.progressCountText = document.getElementById('progress-count-text');
    this.btnResetPlaylistProgress = document.getElementById('btn-reset-playlist-progress');
    this.playlistCompletedCard = document.getElementById('playlist-completed-card');
    this.completedCardDesc = document.getElementById('completed-card-desc');
    this.btnReplayPlaylist = document.getElementById('btn-replay-playlist');
    this.gameCentralStage = document.getElementById('btn-play-snippet')?.closest('.glass-panel');

    // Choice & Search containers
    this.choicesGrid = document.getElementById('choices-grid');
    this.searchContainer = document.getElementById('search-container');
    this.searchInput = document.getElementById('search-input');
    this.searchResults = document.getElementById('search-results');

    // Reveal Card & Offset Fine-Tuning
    this.revealCard = document.getElementById('reveal-card');
    this.revealTitle = document.getElementById('reveal-title');
    this.revealArtist = document.getElementById('reveal-artist');
    this.revealStatus = document.getElementById('reveal-status');
    this.revealPoints = document.getElementById('reveal-points');
    this.revealOffsetInput = document.getElementById('reveal-offset-input');
    this.btnSaveOffset = document.getElementById('btn-save-offset');
    this.btnShareWithOffsets = document.getElementById('btn-share-with-offsets');

    // Stats elements
    this.streakEl = document.getElementById('streak-count');
    this.bestStreakEl = document.getElementById('best-streak-count');
    this.scoreEl = document.getElementById('score-count');
    this.streakElMobile = document.getElementById('streak-count-mobile');
    this.bestStreakElMobile = document.getElementById('best-streak-count-mobile');
    this.scoreElMobile = document.getElementById('score-count-mobile');

    // Category Buttons & Top Challenge Copy Button
    this.categoryBtns = document.querySelectorAll('.cat-btn');
    this.btnCopyChallengeUrl = document.getElementById('btn-copy-challenge-url');

    // Modal elements
    this.customModal = document.getElementById('custom-modal');
    this.btnOpenCustom = document.getElementById('btn-open-custom');
    this.btnCloseCustom = document.getElementById('btn-close-custom');
    this.playlistUrlInput = document.getElementById('playlist-url-input');
    this.btnImportPlaylist = document.getElementById('btn-import-playlist');
    this.customUrlInput = document.getElementById('custom-url-input');
    this.customStartOffset = document.getElementById('custom-start-offset');
    this.btnAddCustom = document.getElementById('btn-add-custom');
    this.customListEl = document.getElementById('custom-songs-list');
    this.customListHeader = document.getElementById('custom-list-header');
    this.btnShareCustomChallenge = document.getElementById('btn-share-custom-challenge');
    this.btnClearCustom = document.getElementById('btn-clear-custom');
  }

  initEventListeners() {
    // Play & Controls
    this.btnPlay.addEventListener('click', () => this.playCurrentSnippet());
    this.btnReplay.addEventListener('click', () => this.playCurrentSnippet());
    this.btnNextTier.addEventListener('click', () => this.advanceTier());
    this.btnGiveUp.addEventListener('click', () => this.giveUp());
    this.btnNextSong.addEventListener('click', () => this.startNewRound());
    this.btnShare.addEventListener('click', () => this.shareResult());

    // Copy challenge URL (top nav & reveal card)
    if (this.btnCopyChallengeUrl) {
      this.btnCopyChallengeUrl.addEventListener('click', () => this.shareCurrentChallengeUrl());
    }
    if (this.btnShareWithOffsets) {
      this.btnShareWithOffsets.addEventListener('click', () => this.shareCurrentChallengeUrl());
    }
    if (this.btnSaveOffset) {
      this.btnSaveOffset.addEventListener('click', () => this.saveCurrentSongOffset());
    }

    // Progress reset & replay
    if (this.btnResetPlaylistProgress) {
      this.btnResetPlaylistProgress.addEventListener('click', () => this.resetCurrentPlaylistProgress());
    }
    if (this.btnReplayPlaylist) {
      this.btnReplayPlaylist.addEventListener('click', () => this.resetCurrentPlaylistProgress());
    }

    // Mode Toggle
    document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.dataset.mode;
        this.setMode(mode);
      });
    });

    // Difficulty Toggle (Normal vs Hell Mode)
    this.diffToggleBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const diff = e.currentTarget.dataset.diff;
        this.setDifficulty(diff);
      });
    });

    // Category Selector
    this.categoryBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cat = e.currentTarget.dataset.category;
        this.selectCategory(cat);
      });
    });

    // Search Input Autocomplete
    this.searchInput.addEventListener('input', (e) => this.handleSearchInput(e.target.value));
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = this.searchResults.querySelector('button');
        if (first) first.click();
      }
    });

    // Custom Modal & Actions
    this.btnOpenCustom.addEventListener('click', () => this.openCustomModal());
    this.btnCloseCustom.addEventListener('click', () => this.closeCustomModal());
    this.btnImportPlaylist.addEventListener('click', () => this.handleImportPlaylist());
    this.btnAddCustom.addEventListener('click', () => this.handleAddCustomSong());
    this.btnShareCustomChallenge.addEventListener('click', () => this.shareCustomChallenge());
    this.btnClearCustom.addEventListener('click', () => this.clearCustomSongs());
  }

  async start() {
    this.updateStatsUI();

    // Seed player with verified first song
    const defaultSongs = SONG_CATEGORIES['tanya']?.songs || [];
    const seedId = defaultSongs[0]?.id || 'vg2pgKLBYo4';

    // Player state updates (loading/buffering/ready)
    this.audioEngine.onStateUpdateCallback = (stateName) => {
      if (this.isRoundOver) return;
      if (stateName === 'loading' || stateName === 'buffering') {
        this.setAudioStatus('buffering', '音訊緩衝中，請稍候...');
      } else if (stateName === 'cued' || stateName === 'ready' || stateName === 'paused') {
        if (!this.isPlaying) {
          this.setAudioStatus('ready', '音訊就緒');
        }
      }
    };

    // Player error fallback
    this.audioEngine.onErrorCallback = (code, msg) => {
      console.warn('Game Player Error Callback:', code, msg);
      if (!this.isRoundOver) {
        this.setAudioStatus('timeout', '歌曲載入受限，自動換題...');
        setTimeout(() => this.startNewRound(), 800);
      }
    };

    try {
      await this.audioEngine.init(seedId);
    } catch (e) {
      console.error('Audio engine init error:', e);
    } finally {
      this.hideLoading();
    }

    // Check if URL has ?list= or ?playlist= or ?cat= or ?offsets= or ?diff=
    const urlParams = new URLSearchParams(window.location.search);
    const incomingList = urlParams.get('list') || urlParams.get('playlist');
    const incomingCat = urlParams.get('cat');
    const incomingOffsets = urlParams.get('offsets');
    const incomingDiff = urlParams.get('diff') || urlParams.get('difficulty');

    if (incomingDiff === 'hell') {
      this.setDifficulty('hell');
    } else {
      this.setDifficulty(this.difficulty);
    }

    if (incomingOffsets) {
      this.urlOffsets = parseOffsets(incomingOffsets);
    }

    if (incomingList) {
      // Check if matching preset playlists
      if (incomingList === SONG_CATEGORIES.tanya.playlistId) {
        this.selectCategory('tanya');
      } else if (incomingList === SONG_CATEGORIES.acoustic.playlistId) {
        this.selectCategory('acoustic');
      } else {
        await this.importPlaylistById(incomingList, true);
      }
    } else if (incomingCat && SONG_CATEGORIES[incomingCat]) {
      this.selectCategory(incomingCat);
    } else {
      this.selectCategory('tanya');
    }
  }

  getOffsetsStorageKey() {
    if (this.currentCategoryKey === 'custom') {
      return 'yt_guesser_offsets_custom_' + (this.customPlaylistId || 'default');
    }
    return 'yt_guesser_offsets_' + this.currentCategoryKey;
  }

  loadOffsetsForCurrentCategory() {
    let savedOffsets = {};
    try {
      savedOffsets = JSON.parse(localStorage.getItem(this.getOffsetsStorageKey()) || '{}');
    } catch (e) { }

    // Merge URL offsets over saved offsets if available
    const merged = { ...savedOffsets, ...this.urlOffsets };
    this.songs = applyOffsetsToSongs(this.songs, merged);
  }

  saveCurrentSongOffset() {
    if (!this.currentSong || !this.revealOffsetInput) return;
    const sec = parseFloat(this.revealOffsetInput.value);
    if (isNaN(sec) || sec < 0) {
      alert('請輸入有效的秒數（0 或大於 0）');
      return;
    }
    this.currentSong.start = sec;

    // Save to local storage map
    let savedOffsets = {};
    try {
      savedOffsets = JSON.parse(localStorage.getItem(this.getOffsetsStorageKey()) || '{}');
    } catch (e) { }
    savedOffsets[this.currentSong.id] = sec;
    localStorage.setItem(this.getOffsetsStorageKey(), JSON.stringify(savedOffsets));

    alert(`✅ 已將「${this.currentSong.title}」設定為從第 ${sec} 秒開始發聲！\n點擊「複製挑戰連結」即可把你的秒數設定分享給好友！`);
  }

  shareCurrentChallengeUrl() {
    const baseUrl = window.location.origin + window.location.pathname;
    const encodedOffsets = encodeOffsets(this.songs);

    let targetUrl = baseUrl;
    if (this.currentCategoryKey === 'custom') {
      if (this.customPlaylistId) {
        targetUrl += `?list=${encodeURIComponent(this.customPlaylistId)}`;
      } else {
        targetUrl += `?cat=custom`;
      }
    } else {
      const playlistId = SONG_CATEGORIES[this.currentCategoryKey]?.playlistId;
      if (playlistId) {
        targetUrl += `?list=${encodeURIComponent(playlistId)}`;
      } else {
        targetUrl += `?cat=${this.currentCategoryKey}`;
      }
    }

    if (encodedOffsets) {
      targetUrl += `&offsets=${encodeURIComponent(encodedOffsets)}`;
    }

    if (this.difficulty === 'hell') {
      targetUrl += `&diff=hell`;
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(targetUrl).then(() => {
        alert(`🔗 專屬挑戰連結已複製至剪貼簿！\n\n網址已包含歌單與自訂起始秒數參數：\n${targetUrl}`);
      });
    } else {
      prompt('請複製挑戰連結：', targetUrl);
    }
  }

  getCompletedStorageKey() {
    if (this.currentCategoryKey === 'custom') {
      return 'yt_guesser_completed_custom_' + (this.customPlaylistId || 'default');
    }
    return 'yt_guesser_completed_' + this.currentCategoryKey;
  }

  loadCompletedSongs() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.getCompletedStorageKey()) || '[]');
      this.completedSongIds = new Set(saved);
    } catch (e) {
      this.completedSongIds = new Set();
    }
    this.updateProgressUI();
  }

  saveCompletedSongs() {
    localStorage.setItem(this.getCompletedStorageKey(), JSON.stringify([...this.completedSongIds]));
    this.updateProgressUI();
  }

  updateProgressUI() {
    if (!this.progressCountText || !this.progressBarFill) return;
    const total = this.songs.length;
    // Count only songs that actually exist in the current playlist
    const completed = this.songs.filter(s => this.completedSongIds.has(s.id)).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    this.progressCountText.textContent = `${completed} / ${total}`;
    this.progressBarFill.style.width = `${pct}%`;
  }

  resetCurrentPlaylistProgress() {
    if (this.completedSongIds.size === 0) {
      alert('目前歌單尚未有過關歌曲紀錄喔！');
      return;
    }
    if (!confirm('確定要重設目前歌單的猜歌通關紀錄，重新開始挑戰嗎？')) return;
    this.completedSongIds.clear();
    this.saveCompletedSongs();
    if (this.playlistCompletedCard) this.playlistCompletedCard.classList.add('hidden');
    if (this.gameCentralStage) this.gameCentralStage.classList.remove('hidden');
    this.startNewRound();
  }

  showPlaylistCompleted() {
    this.isRoundOver = true;
    this.isPlaying = false;
    this.audioEngine.pause();
    this.updateProgressUI();

    if (this.playlistCompletedCard) {
      this.playlistCompletedCard.classList.remove('hidden');
      if (this.completedCardDesc) {
        const catName = this.currentCategoryKey === 'custom'
          ? this.customPlaylistTitle
          : SONG_CATEGORIES[this.currentCategoryKey]?.name;
        this.completedCardDesc.textContent = `恭喜！你已經成功猜中「${catName}」中全部 ${this.songs.length} 首歌曲！`;
      }
    }

    if (this.gameCentralStage) this.gameCentralStage.classList.add('hidden');
    this.choicesGrid.classList.add('hidden');
    this.searchContainer.classList.add('hidden');
    this.revealCard.classList.add('hidden');

    this.triggerConfetti();
    if (window.lucide) window.lucide.createIcons();
  }

  selectCategory(categoryKey) {
    this.currentCategoryKey = categoryKey;
    this.categoryBtns.forEach(btn => {
      if (btn.dataset.category === categoryKey) {
        btn.className = 'cat-btn px-3.5 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-[#EB4203] to-[#FF9C5F] text-[#FCEFC3] shadow-md shadow-[#EB4203]/25 whitespace-nowrap transition-all font-bold';
      } else {
        btn.className = 'cat-btn px-3.5 sm:px-4 py-2 rounded-xl bg-slate-800/90 text-slate-300 hover:bg-slate-700 whitespace-nowrap transition-all font-bold';
      }
    });

    if (categoryKey === 'custom') {
      if (this.customSongs.length < 4) {
        alert('自訂題庫至少需要 4 首歌曲才能開始猜題喔！請先在彈窗貼上 YouTube Music 歌單或曲目。');
        this.openCustomModal();
        return;
      }
      this.songs = [...this.customSongs];
    } else {
      this.songs = [...SONG_CATEGORIES[categoryKey].songs];
    }

    this.loadOffsetsForCurrentCategory();
    this.loadCompletedSongs();
    if (this.playlistCompletedCard) this.playlistCompletedCard.classList.add('hidden');
    if (this.gameCentralStage) this.gameCentralStage.classList.remove('hidden');

    this.startNewRound();
  }

  setMode(mode) {
    this.gameMode = mode;
    document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
      if (btn.dataset.mode === mode) {
        btn.classList.add('bg-slate-700', 'text-white');
        btn.classList.remove('text-slate-400');
      } else {
        btn.classList.remove('bg-slate-700', 'text-white');
        btn.classList.add('text-slate-400');
      }
    });

    if (mode === 'choice') {
      this.choicesGrid.classList.remove('hidden');
      this.searchContainer.classList.add('hidden');
    } else {
      this.choicesGrid.classList.add('hidden');
      this.searchContainer.classList.remove('hidden');
      this.searchInput.focus();
    }
  }

  setDifficulty(diff) {
    this.difficulty = (diff === 'hell') ? 'hell' : 'normal';
    localStorage.setItem('yt_guesser_difficulty', this.difficulty);

    if (this.diffToggleBtns) {
      this.diffToggleBtns.forEach(btn => {
        if (btn.dataset.diff === this.difficulty) {
          if (this.difficulty === 'hell') {
            btn.className = 'diff-toggle-btn flex-1 md:flex-initial px-2.5 py-1 rounded-md md:rounded-lg bg-gradient-to-r from-[#EB4203] to-[#FF9C5F] text-[#FCEFC3] font-black shadow-md shadow-[#EB4203]/30 transition-all flex items-center justify-center';
          } else {
            btn.className = 'diff-toggle-btn flex-1 md:flex-initial px-2.5 py-1 rounded-md md:rounded-lg bg-slate-700 text-white font-semibold transition-all flex items-center justify-center';
          }
        } else {
          btn.className = 'diff-toggle-btn flex-1 md:flex-initial px-2.5 py-1 rounded-md md:rounded-lg text-slate-400 font-bold hover:text-white transition-all flex items-center justify-center';
        }
      });
    }

    this.updateTierUI();

    if (!this.isRoundOver && !this.isPlaying && this.btnPlay) {
      this.tierIndex = 0;
      this.updateTierUI();
      this.btnPlay.innerHTML = `
        <i data-lucide="play" class="w-5 h-5 mr-2 fill-current"></i>
        播放 ${this.difficulty === 'hell' ? '0.15 秒' : '0.5 秒'}
      `;
      if (window.lucide) window.lucide.createIcons();
    }
  }

  setAudioStatus(status, text) {
    if (!this.audioStatusText || !this.audioStatusDot) return;
    this.audioStatusText.textContent = text;

    // Reset dot classes
    this.audioStatusDot.className = 'w-2.5 h-2.5 rounded-full';
    if (status === 'ready') {
      this.audioStatusDot.classList.add('bg-[#00CEC8]');
    } else if (status === 'buffering') {
      this.audioStatusDot.classList.add('bg-[#FF9C5F]', 'animate-ping');
    } else if (status === 'playing') {
      this.audioStatusDot.classList.add('bg-[#EB4203]', 'animate-pulse');
    } else if (status === 'paused') {
      this.audioStatusDot.classList.add('bg-slate-400');
    } else if (status === 'timeout') {
      this.audioStatusDot.classList.add('bg-[#EB4203]');
    }
  }

  startNewRound() {
    this.isRoundOver = false;
    this.tierIndex = 0;
    this.isPlaying = false;
    this.audioEngine.clearPlaybackTimer();
    this.audioEngine.pause();

    // Check uncompleted songs in current playlist
    const uncompleted = this.songs.filter(s => !this.completedSongIds.has(s.id));
    if (uncompleted.length === 0 && this.songs.length > 0) {
      this.showPlaylistCompleted();
      return;
    }

    // Ensure central stage is visible
    if (this.playlistCompletedCard) this.playlistCompletedCard.classList.add('hidden');
    if (this.gameCentralStage) this.gameCentralStage.classList.remove('hidden');
    if (this.gameMode === 'choice') {
      this.choicesGrid.classList.remove('hidden');
    } else {
      this.searchContainer.classList.remove('hidden');
    }

    this.setAudioStatus('buffering', '正在準備歌曲音訊...');

    // Pick random target song ONLY from uncompleted songs!
    const randomIndex = Math.floor(Math.random() * uncompleted.length);
    this.currentSong = uncompleted[randomIndex];

    // Cue song in player
    this.audioEngine.loadTrack(this.currentSong.id, this.currentSong.start || 0);

    // Reset Mini Player blind mask
    if (this.ytPlayerWrapper) {
      this.ytPlayerWrapper.classList.add('blind-mode');
      this.ytPlayerWrapper.classList.remove('revealed-mode');
    }

    // Reset UI
    this.revealCard.classList.add('hidden');
    this.choicesGrid.classList.remove('pointer-events-none', 'opacity-50');
    this.btnPlay.classList.remove('hidden');
    this.btnPlay.disabled = false;
    this.btnPlay.innerHTML = `
      <i data-lucide="play" class="w-5 h-5 mr-2 fill-current"></i>
      播放 ${this.difficulty === 'hell' ? '0.15 秒' : '0.5 秒'}
    `;
    this.btnReplay.classList.add('hidden');
    this.btnNextTier.classList.add('hidden');
    this.btnGiveUp.classList.remove('hidden');
    this.searchInput.value = '';
    this.searchResults.innerHTML = '';
    this.searchResults.classList.add('hidden');

    this.updateTierUI();
    this.renderChoices();
    if (window.lucide) window.lucide.createIcons();
  }

  renderChoices() {
    this.choicesGrid.innerHTML = '';

    // Pick 3 random distractors
    const distractors = this.songs
      .filter(s => s.id !== this.currentSong.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);

    // Pool of 4 choices, shuffled
    const options = [this.currentSong, ...distractors].sort(() => 0.5 - Math.random());

    options.forEach((song, idx) => {
      const btn = document.createElement('button');
      btn.className = 'w-full p-3 sm:p-4 rounded-2xl glass-card text-left transition-all duration-200 hover:border-[#00CEC8]/60 hover:bg-[#161d2e] active:scale-[0.98] flex items-center justify-between group min-h-[56px] shadow-sm';
      btn.innerHTML = `
        <div class="flex items-center space-x-2.5 sm:space-x-3 overflow-hidden">
          <span class="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-slate-800/80 text-[#00CEC8] border border-slate-700/60 flex items-center justify-center font-black text-xs group-hover:bg-[#00CEC8]/20 group-hover:border-[#00CEC8]/40 transition-colors flex-shrink-0">
            ${['A', 'B', 'C', 'D'][idx]}
          </span>
          <div class="truncate">
            <p class="font-bold text-[#FCEFC3] text-sm sm:text-base truncate group-hover:text-white">${song.title}</p>
            <p class="text-[11px] sm:text-xs text-slate-400 truncate group-hover:text-slate-300">${song.artist}</p>
          </div>
        </div>
        <span class="text-slate-500 group-hover:text-[#FF9C5F] text-[11px] sm:text-xs font-mono ml-2 flex-shrink-0">猜這首</span>
      `;
      btn.addEventListener('click', () => this.handleGuess(song, btn));
      this.choicesGrid.appendChild(btn);
    });
  }

  handleSearchInput(query) {
    if (!query.trim()) {
      this.searchResults.innerHTML = '';
      this.searchResults.classList.add('hidden');
      return;
    }

    const q = query.toLowerCase().trim();
    const matches = this.songs.filter(s =>
      s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
    ).slice(0, 6);

    if (matches.length === 0) {
      this.searchResults.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center">找不到歌曲，可試著輸入歌手名稱</div>`;
      this.searchResults.classList.remove('hidden');
      return;
    }

    this.searchResults.innerHTML = '';
    matches.forEach(song => {
      const item = document.createElement('button');
      item.className = 'w-full text-left p-3 hover:bg-[#161d2e] flex items-center justify-between border-b border-slate-700/50 last:border-0 transition-colors';
      item.innerHTML = `
        <div class="truncate mr-2">
          <p class="font-medium text-[#FCEFC3] text-sm truncate">${song.title}</p>
          <p class="text-xs text-slate-400 truncate">${song.artist}</p>
        </div>
        <span class="text-xs text-[#00CEC8] font-semibold flex-shrink-0">送出</span>
      `;
      item.addEventListener('click', () => {
        this.searchResults.classList.add('hidden');
        this.handleGuess(song, null);
      });
      this.searchResults.appendChild(item);
    });
    this.searchResults.classList.remove('hidden');
  }

  playCurrentSnippet() {
    if (this.isPlaying) return;
    const tier = this.tiers[this.tierIndex];
    this.isPlaying = true;

    const durationText = tier.duration >= 1000
      ? `${(tier.duration / 1000).toFixed(1)}s`
      : `${tier.duration}ms`;

    // UI state: buffering before audio starts
    this.setAudioStatus('buffering', `音訊準備中 (${durationText})`);
    this.btnPlay.classList.add('pulse-active');
    this.btnPlay.disabled = true;
    this.btnPlay.innerHTML = `
      <svg class="w-5 h-5 animate-spin mr-2 inline" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
      </svg>
      音訊緩衝中...
    `;

    this.audioEngine.playSnippet(
      tier.duration,
      this.currentSong.start || 0,
      () => {
        // Audio started playing
        this.setAudioStatus('playing', `🔊 正在播放前奏 ${durationText}！`);
        this.vinyl.classList.add('playing');
        this.waveVisualizer.classList.remove('opacity-0');
        this.btnPlay.innerHTML = `
          <i data-lucide="volume-2" class="w-5 h-5 mr-2 animate-bounce inline"></i>
          正在聆聽 (${durationText})...
        `;
        if (window.lucide) window.lucide.createIcons();
      },
      (res) => {
        // Snippet ended or timed out
        this.isPlaying = false;
        this.btnPlay.disabled = false;
        this.btnPlay.classList.remove('pulse-active');
        this.vinyl.classList.remove('playing');
        this.waveVisualizer.classList.add('opacity-0');

        if (res && res.timeout) {
          this.setAudioStatus('timeout', '網路緩衝較慢，請點擊重試');
          this.btnPlay.classList.remove('hidden');
          this.btnPlay.innerHTML = `
            <i data-lucide="rotate-ccw" class="w-5 h-5 mr-2"></i>
            緩衝逾時，點擊重試
          `;
        } else {
          this.setAudioStatus('paused', '音訊結束，請作答！');
          this.btnPlay.classList.add('hidden');
          this.btnReplay.classList.remove('hidden');
          if (this.tierIndex < this.tiers.length - 1) {
            this.btnNextTier.classList.remove('hidden');
          }
        }
        if (window.lucide) window.lucide.createIcons();
      }
    );
  }

  advanceTier() {
    this.isPlaying = false;
    this.audioEngine.clearPlaybackTimer();
    if (this.tierIndex < this.tiers.length - 1) {
      this.tierIndex++;
      this.updateTierUI();
      this.btnNextTier.classList.add('hidden');
      this.btnReplay.classList.add('hidden');
      this.btnPlay.classList.remove('hidden');
      this.playCurrentSnippet();
    }
  }

  updateTierUI() {
    const tier = this.tiers[this.tierIndex];
    const isHell = this.difficulty === 'hell';
    this.tierLabel.innerHTML = `
      <span class="${isHell ? 'text-[#FF9C5F] font-black' : 'text-[#00CEC8] font-bold'}">${tier.label}</span>
      <span class="text-xs ${isHell ? 'text-[#FCEFC3] font-bold' : 'text-slate-400'} ml-2">(+${tier.points} 分)</span>
    `;

    this.tierBars.forEach((bar, idx) => {
      if (idx <= this.tierIndex) {
        if (isHell) {
          bar.className = 'tier-bar rounded-full transition-all duration-300 bg-gradient-to-r from-[#EB4203] to-[#FF9C5F] shadow-[0_0_12px_rgba(235,66,3,0.8)]';
        } else {
          bar.className = 'tier-bar rounded-full transition-all duration-300 bg-gradient-to-r from-[#00CEC8] to-[#FF9C5F] shadow-[0_0_10px_rgba(0,206,200,0.5)]';
        }
      } else {
        bar.className = 'tier-bar rounded-full transition-all duration-300 bg-slate-800';
      }
    });

    if (this.tierIndex < this.tiers.length - 1) {
      const nextTier = this.tiers[this.tierIndex + 1];
      const nextDuration = nextTier.duration >= 1000
        ? `${(nextTier.duration / 1000).toFixed(1)}s`
        : `${nextTier.duration}ms`;
      this.btnNextTier.innerHTML = `
        <i data-lucide="fast-forward" class="w-4 h-4 mr-1"></i>
        解鎖下一段 (${nextDuration})
      `;
      if (window.lucide) window.lucide.createIcons();
    }
  }

  handleGuess(guessedSong, targetButton) {
    if (this.isRoundOver) return;

    if (guessedSong.id === this.currentSong.id) {
      // CORRECT!
      if (targetButton) {
        targetButton.classList.add('border-[#00CEC8]', 'bg-[#00CEC8]/20', 'text-[#00CEC8]');
      }
      this.onRoundSuccess();
    } else {
      // WRONG!
      if (targetButton) {
        targetButton.classList.add('border-[#EB4203]', 'bg-[#EB4203]/20', 'text-[#FF9C5F]');
        targetButton.disabled = true;
      }
      this.onRoundWrong();
    }
  }

  onRoundSuccess() {
    this.isRoundOver = true;
    this.isPlaying = false;
    this.audioEngine.clearPlaybackTimer();
    const tier = this.tiers[this.tierIndex];
    const earnedPoints = tier.points;

    // Record this song as completed for current playlist (no duplicates!)
    this.completedSongIds.add(this.currentSong.id);
    this.saveCompletedSongs();

    this.score += earnedPoints;
    this.streak += 1;
    if (this.streak > this.bestStreak) {
      this.bestStreak = this.streak;
      localStorage.setItem('yt_guesser_best_streak', this.bestStreak.toString());
    }

    this.updateStatsUI();
    this.triggerConfetti();

    this.showReveal(true, earnedPoints, tier.badge);
    this.audioEngine.playFull(this.currentSong.start || 0);
  }

  onRoundWrong() {
    if (this.tierIndex < this.tiers.length - 1) {
      // Advance to longer clue
      this.advanceTier();
    } else {
      // Out of clues, game over for this round
      this.giveUp();
    }
  }

  giveUp() {
    if (this.isRoundOver) return;
    this.isRoundOver = true;
    this.isPlaying = false;
    this.audioEngine.clearPlaybackTimer();
    this.streak = 0;
    this.updateStatsUI();

    this.showReveal(false, 0, '💔 沒猜中');
    this.audioEngine.playFull(this.currentSong.start || 0);
  }

  showReveal(isSuccess, points, badge) {
    this.revealCard.classList.remove('hidden');
    this.choicesGrid.classList.add('pointer-events-none', 'opacity-50');

    // Lift blind mask on mini player
    if (this.ytPlayerWrapper) {
      this.ytPlayerWrapper.classList.remove('blind-mode');
      this.ytPlayerWrapper.classList.add('revealed-mode');
    }

    this.revealTitle.textContent = this.currentSong.title;
    this.revealArtist.textContent = this.currentSong.artist;

    if (isSuccess) {
      this.revealStatus.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#00CEC8]/20 text-[#00CEC8] border border-[#00CEC8]/30';
      this.revealStatus.textContent = `太神了！${badge}`;
      this.revealPoints.textContent = `+${points} 分`;
      this.revealPoints.className = 'text-[#00CEC8] font-extrabold text-sm';
    } else {
      this.revealStatus.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#EB4203]/20 text-[#FF9C5F] border border-[#EB4203]/30';
      this.revealStatus.textContent = '殘念！再接再厲';
      this.revealPoints.textContent = `+0 分`;
      this.revealPoints.className = 'text-slate-500 font-bold text-sm';
    }

    // Populate offset input with current song's start offset
    if (this.revealOffsetInput) {
      this.revealOffsetInput.value = this.currentSong.start || 0;
    }

    // Scroll smoothly to reveal card on small screens
    this.revealCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (window.lucide) window.lucide.createIcons();
  }

  updateStatsUI() {
    if (this.streakEl) this.streakEl.textContent = this.streak;
    if (this.bestStreakEl) this.bestStreakEl.textContent = this.bestStreak;
    if (this.scoreEl) this.scoreEl.textContent = this.score;

    if (this.streakElMobile) this.streakElMobile.textContent = this.streak;
    if (this.bestStreakElMobile) this.bestStreakElMobile.textContent = this.bestStreak;
    if (this.scoreElMobile) this.scoreElMobile.textContent = this.score;
  }

  triggerConfetti() {
    if (window.confetti) {
      window.confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }

  shareResult() {
    const tierBlocks = ['⬛', '⬛', '⬛', '⬛'];
    if (this.isRoundOver && this.revealStatus.textContent.includes('太神了')) {
      tierBlocks[this.tierIndex] = '🟩';
    } else {
      tierBlocks.fill('🟥');
    }

    const currentTier = this.tiers[this.tierIndex];
    const durationLabel = currentTier.duration >= 1000
      ? `${(currentTier.duration / 1000).toFixed(1)}s`
      : `${currentTier.duration}ms`;

    const titlePrefix = this.difficulty === 'hell'
      ? `🔥【進階】0.15 秒猜歌挑戰！\n`
      : `0.5 秒猜歌挑戰！\n`;

    const shareText = `${titlePrefix}` +
      `關卡：${this.currentCategoryKey === 'custom' ? this.customPlaylistTitle : SONG_CATEGORIES[this.currentCategoryKey]?.name}\n` +
      `歌曲：${this.currentSong.title}\n` +
      `成績：${tierBlocks.join('')} (${durationLabel} 解鎖)\n` +
      `目前連勝：${this.streak} | 總分：${this.score}\n` +
      `快來挑戰你的音樂直覺！`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText).then(() => {
        alert('✨ 戰績已複製!');
      });
    } else {
      alert(shareText);
    }
  }

  // Custom Songs & Playlist Modal Logic
  openCustomModal() {
    this.renderCustomSongsList();
    this.customModal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  closeCustomModal() {
    this.customModal.classList.add('hidden');
  }

  async handleImportPlaylist() {
    const inputVal = this.playlistUrlInput.value.trim();
    if (!inputVal) return;

    const playlistId = extractPlaylistId(inputVal);
    if (!playlistId) {
      alert('請輸入有效的 YouTube Music 或 YouTube 播放清單網址！\n例如：https://music.youtube.com/playlist?list=PL...');
      return;
    }

    await this.importPlaylistById(playlistId);
  }

  async importPlaylistById(playlistId, autoStart = false) {
    this.btnImportPlaylist.disabled = true;
    this.btnImportPlaylist.innerHTML = `
      <svg class="w-3.5 h-3.5 animate-spin mr-1 inline" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
      </svg>
      解析中...
    `;

    try {
      const data = await fetchPlaylistSongs(playlistId);
      if (!data.songs || data.songs.length === 0) {
        throw new Error('歌單中沒有可解析的公開歌曲');
      }

      this.customSongs = data.songs;
      this.customPlaylistId = playlistId;
      this.customPlaylistTitle = data.title || '匯入歌單';

      localStorage.setItem('yt_guesser_custom_songs', JSON.stringify(this.customSongs));
      localStorage.setItem('yt_guesser_custom_playlist_id', this.customPlaylistId);
      localStorage.setItem('yt_guesser_custom_playlist_title', this.customPlaylistTitle);
      this.loadCompletedSongs();

      this.playlistUrlInput.value = '';
      this.renderCustomSongsList();

      // Update custom nav button text
      const customCatBtn = document.querySelector('[data-category="custom"]');
      if (customCatBtn) {
        customCatBtn.textContent = `🎯 ${this.customPlaylistTitle.slice(0, 8)}...`;
      }

      if (autoStart) {
        this.selectCategory('custom');
      } else {
        alert(`🎉 成功匯入「${this.customPlaylistTitle}」共 ${data.songs.length} 首歌曲！立即開始猜題！`);
        this.closeCustomModal();
        this.selectCategory('custom');
      }

    } catch (err) {
      alert(`⚠️ 匯入歌單失敗：${err.message}\n請確認播放清單是否為「公開」或「不公開」，或使用本機伺服器連線。`);
    } finally {
      this.btnImportPlaylist.disabled = false;
      this.btnImportPlaylist.innerHTML = `<i data-lucide="download-cloud" class="w-3.5 h-3.5 mr-1"></i> 匯入歌單`;
      if (window.lucide) window.lucide.createIcons();
    }
  }

  async handleAddCustomSong() {
    const url = this.customUrlInput.value.trim();
    const startSec = parseInt(this.customStartOffset?.value || '0', 10);
    if (!url) return;

    const videoId = extractVideoId(url);
    if (!videoId) {
      alert('請輸入正確的 YouTube Music 或 YouTube 影片網址！\n例如：https://music.youtube.com/watch?v=xxx');
      return;
    }

    if (this.customSongs.some(s => s.id === videoId)) {
      alert('這首歌曲已經在自訂題庫中囉！');
      return;
    }

    this.btnAddCustom.disabled = true;
    this.btnAddCustom.textContent = '抓取中...';

    const songInfo = await fetchVideoInfo(videoId, startSec);
    this.customSongs.push(songInfo);
    localStorage.setItem('yt_guesser_custom_songs', JSON.stringify(this.customSongs));

    this.customUrlInput.value = '';
    if (this.customStartOffset) this.customStartOffset.value = '0';
    this.btnAddCustom.disabled = false;
    this.btnAddCustom.textContent = '+ 單曲';
    this.renderCustomSongsList();
  }

  shareCustomChallenge() {
    let challengeUrl = window.location.origin + window.location.pathname;
    if (this.customPlaylistId) {
      challengeUrl += `?list=${encodeURIComponent(this.customPlaylistId)}`;
    }

    const shareText = `快來挑戰我的秒速猜歌！\n` +
      `專屬歌單：${this.customPlaylistTitle}\n` +
      `鐵粉是你嗎？快來聽前奏 0.5 秒猜歌！\n` +
      `${challengeUrl}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText).then(() => {
        alert('✨ 專屬歌單考題連結已複製至剪貼簿！');
      });
    } else {
      alert(shareText);
    }
  }

  clearCustomSongs() {
    if (!confirm('確定要清空目前自訂題庫中的所有歌曲嗎？')) return;
    this.customSongs = [];
    this.customPlaylistId = '';
    this.customPlaylistTitle = '自訂題庫';
    this.completedSongIds.clear();
    this.saveCompletedSongs();
    localStorage.removeItem('yt_guesser_custom_songs');
    localStorage.removeItem('yt_guesser_custom_playlist_id');
    localStorage.removeItem('yt_guesser_custom_playlist_title');
    this.renderCustomSongsList();
    const customCatBtn = document.querySelector('[data-category="custom"]');
    if (customCatBtn) customCatBtn.textContent = '🎯 自訂題庫';
  }

  renderCustomSongsList() {
    this.customListEl.innerHTML = '';
    const count = this.customSongs.length;
    this.customListHeader.textContent = `目前題庫曲目 (${count} 首)`;

    if (count > 0 && this.btnShareCustomChallenge) {
      this.btnShareCustomChallenge.classList.remove('hidden');
    } else if (this.btnShareCustomChallenge) {
      this.btnShareCustomChallenge.classList.add('hidden');
    }

    if (count === 0) {
      this.customListEl.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">目前自訂題庫為空，在上方貼上 YouTube Music 歌單或單曲網址即可匯入！</p>`;
      return;
    }

    this.customSongs.forEach((s, idx) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs';
      row.innerHTML = `
        <div class="truncate mr-2">
          <p class="font-bold text-[#FCEFC3] truncate">${s.title}</p>
          <p class="text-[11px] text-slate-400 truncate">
            ${s.artist} ${s.start > 0 ? `<span class="text-[#FF9C5F] font-mono">(${s.start}s起)</span>` : ''}
          </p>
        </div>
        <button data-index="${idx}" class="btn-delete-custom text-[#FF9C5F] hover:text-[#EB4203] p-1 flex-shrink-0 text-[11px] font-bold">
          刪除
        </button>
      `;
      this.customListEl.appendChild(row);
    });

    this.customListEl.querySelectorAll('.btn-delete-custom').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index, 10);
        this.customSongs.splice(index, 1);
        localStorage.setItem('yt_guesser_custom_songs', JSON.stringify(this.customSongs));
        this.renderCustomSongsList();
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }

  hideLoading() {
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.add('opacity-0', 'pointer-events-none');
      setTimeout(() => this.loadingOverlay.remove(), 400);
    }
  }
}

// Start Game on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();
  const app = new GuessGameApp();
  app.start();
  window.gameApp = app;
});
