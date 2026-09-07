import {
  DEFAULT_PLAYLIST_ID,
  DEFAULT_PLAYLIST_TITLE,
  SONG_CATEGORIES,
  extractVideoId,
  extractPlaylistId,
  cleanPlaylistUrl,
  cleanVideoUrl,
  encodeSongsPayload,
  decodeSongsPayload,
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
    { duration: 500, label: '0.5 秒', points: 100, badge: '⚡ Godly' },
    { duration: 1000, label: '1.0 秒', points: 70, badge: '🎵 Pro' },
    { duration: 2000, label: '2.0 秒', points: 40, badge: '👂 Good' },
    { duration: 4000, label: '4.0 秒', points: 20, badge: '👌 Phew' },
  ],
  hell: [
    { duration: 150, label: '0.15 秒', points: 200, badge: '🔥 Legendary' },
    { duration: 300, label: '0.3 秒', points: 140, badge: '⚡ God-Tier' },
    { duration: 800, label: '0.8 秒', points: 80, badge: '🎵 Pro' },
    { duration: 2000, label: '2.0 秒', points: 40, badge: '👌 Phew' },
  ]
};

// GA4 Custom Event Tracking Helper (Safely logs gameplay and UGC intelligence)
export function trackEvent(eventName, params = {}) {
  try {
    console.log(`📡 [GA4 Track] ${eventName}:`, params);
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, params);
    } else {
      console.warn('⚠️ [GA4 Track] window.gtag is not defined yet');
    }
  } catch (err) {
    console.warn('GA4 tracking error:', err);
  }
}

class GuessGameApp {
  constructor() {
    this.audioEngine = new YouTubeAudioEngine('yt-player-target', '_GiJ2bLLGLk');
    this.currentCategoryKey = 'default';
    this.defaultSongs = [];
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

    // Lives and Run History
    this.maxLives = 3;
    this.lives = 3;
    this.runHistory = [];

    // Custom Songs and Active Playlist metadata
    this.customSongs = JSON.parse(localStorage.getItem('yt_guesser_custom_songs') || '[]');
    this.customPlaylistId = localStorage.getItem('yt_guesser_custom_playlist_id') || '';
    this.customPlaylistTitle = localStorage.getItem('yt_guesser_custom_playlist_title') || 'Custom Playlist';

    // Set of successfully guessed song IDs for the active playlist
    this.completedSongIds = new Set();

    this.initElements();
    this.initEventListeners();
  }

  get tiers() {
    return DIFFICULTY_TIERS[this.difficulty] || DIFFICULTY_TIERS.normal;
  }

  getTierPoints(tierIndex = this.tierIndex) {
    const tier = this.tiers[tierIndex];
    if (!tier) return 0;
    const multiplier = this.gameMode === 'search' ? 1.5 : 1.0;
    return Math.round(tier.points * multiplier);
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

    // Lives display elements
    this.livesDisplay = document.getElementById('lives-display');
    this.livesDisplayMobile = document.getElementById('lives-display-mobile');
    this.livesDisplayStage = document.getElementById('lives-display-stage');

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

    // Match Scorecard Elements
    this.playlistCompletedCard = document.getElementById('playlist-completed-card');
    this.scorecardGlowBg = document.getElementById('scorecard-glow-bg');
    this.scorecardStatusBadge = document.getElementById('scorecard-status-badge');
    this.scorecardStatusIcon = document.getElementById('scorecard-status-icon');
    this.scorecardStatusText = document.getElementById('scorecard-status-text');
    this.scorecardPlaylistTitle = document.getElementById('scorecard-playlist-title');
    this.completedCardDesc = document.getElementById('completed-card-desc');
    this.scorecardRankBadge = document.getElementById('scorecard-rank-badge');
    this.scorecardRankLetter = document.getElementById('scorecard-rank-letter');
    this.scorecardRankTitle = document.getElementById('scorecard-rank-title');
    this.scorecardTotalScore = document.getElementById('scorecard-total-score');
    this.scorecardHeartsDisplay = document.getElementById('scorecard-hearts-display');
    this.scorecardAccuracyRate = document.getElementById('scorecard-accuracy-rate');
    this.scorecardGodlyCount = document.getElementById('scorecard-godly-count');
    this.scorecardTrackCount = document.getElementById('scorecard-track-count');
    this.scorecardTrackList = document.getElementById('scorecard-track-list');
    this.btnSaveScorecardImg = document.getElementById('btn-save-scorecard-img');
    this.btnCopyScorecard = document.getElementById('btn-copy-scorecard');
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
    this.btnNextSong.addEventListener('click', () => {
      this.btnNextSong.blur();
      this.startNewRound();
    });
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
    if (this.btnSaveScorecardImg) {
      this.btnSaveScorecardImg.addEventListener('click', () => this.generateAndShareScorecardImage());
    }
    if (this.btnCopyScorecard) {
      this.btnCopyScorecard.addEventListener('click', () => this.copyScorecardSummary());
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

    // Auto-clean mobile tracking parameters (&si=..., &feature=..., etc.)
    if (this.playlistUrlInput) {
      this.playlistUrlInput.addEventListener('paste', () => {
        setTimeout(() => {
          this.playlistUrlInput.value = cleanPlaylistUrl(this.playlistUrlInput.value);
        }, 10);
      });
      this.playlistUrlInput.addEventListener('change', () => {
        this.playlistUrlInput.value = cleanPlaylistUrl(this.playlistUrlInput.value);
      });
    }

    if (this.customUrlInput) {
      this.customUrlInput.addEventListener('paste', () => {
        setTimeout(() => {
          this.customUrlInput.value = cleanVideoUrl(this.customUrlInput.value);
        }, 10);
      });
      this.customUrlInput.addEventListener('change', () => {
        this.customUrlInput.value = cleanVideoUrl(this.customUrlInput.value);
      });
    }
  }

  async start() {
    this.updateStatsUI();
    this.updateLivesUI();

    // Seed player with verified first song from default playlist
    const seedId = '_GiJ2bLLGLk';

    // Player state updates (loading/buffering/ready)
    this.audioEngine.onStateUpdateCallback = (stateName) => {
      if (this.isRoundOver) return;
      if (stateName === 'loading' || stateName === 'buffering') {
        this.setAudioStatus('buffering', '載入中...');
      } else if (stateName === 'cued' || stateName === 'ready' || stateName === 'paused') {
        if (!this.isPlaying) {
          this.setAudioStatus('ready', '準備就緒');
        }
      }
    };

    // Player error fallback (Graceful handling: never auto-skip in a loop!)
    this.audioEngine.onErrorCallback = (code, msg) => {
      console.warn('Game Player Error Callback:', code, msg);
      if (!this.isRoundOver) {
        const isEmbedBlocked = (code === 101 || code === 150);
        const reasonText = isEmbedBlocked ? '此曲限制外部播放' : '音訊載入失敗';
        this.setAudioStatus('timeout', `${reasonText}，請換下一題`);
        
        // Remove currently blocked song so it won't be picked again
        if (this.currentSong && this.songs) {
          this.completedSongIds.add(this.currentSong.id);
        }

        if (this.btnPlay) {
          this.btnPlay.classList.remove('hidden');
          this.btnPlay.disabled = false;
          this.btnPlay.innerHTML = `
            <i data-lucide="skip-forward" class="w-5 h-5 mr-2"></i>
            ${isEmbedBlocked ? '版權限制，跳至下一題' : '點擊換下一題'}
          `;
          // Attach one-time click handler to cleanly advance
          const onSkipClick = () => {
            this.btnPlay.removeEventListener('click', onSkipClick);
            this.startNewRound();
          };
          this.btnPlay.addEventListener('click', onSkipClick, { once: true });
          if (window.lucide) window.lucide.createIcons();
        }
      }
    };

    try {
      await this.audioEngine.init(seedId);
    } catch (e) {
      console.error('Audio engine init error:', e);
    } finally {
      this.hideLoading();
    }

    // Check if URL has ?list= or ?playlist= or ?cat= or ?offsets= or ?diff= or ?songs=
    const urlParams = new URLSearchParams(window.location.search);
    const incomingList = urlParams.get('list') || urlParams.get('playlist');
    const incomingCat = urlParams.get('cat');
    const incomingOffsets = urlParams.get('offsets');
    const incomingDiff = urlParams.get('diff') || urlParams.get('difficulty');
    const incomingSongs = urlParams.get('songs');

    if (incomingDiff === 'hell') {
      this.setDifficulty('hell');
    } else {
      this.setDifficulty(this.difficulty);
    }

    if (incomingOffsets) {
      this.urlOffsets = parseOffsets(incomingOffsets);
    }

    // Direct Chinese songs payload unpack (instant load without serverless API)
    if (incomingSongs) {
      const decoded = decodeSongsPayload(incomingSongs);
      if (decoded && decoded.songs && decoded.songs.length >= 4) {
        this.customSongs = decoded.songs;
        this.customPlaylistTitle = decoded.title || '你的歌單';
        this.customPlaylistId = incomingList ? (extractPlaylistId(incomingList) || incomingList) : 'shared';
        localStorage.setItem('yt_guesser_custom_songs', JSON.stringify(this.customSongs));
        localStorage.setItem('yt_guesser_custom_playlist_id', this.customPlaylistId);
        localStorage.setItem('yt_guesser_custom_playlist_title', this.customPlaylistTitle);
        this.updateCustomNavVisibility();
        this.selectCategory('custom');
        return;
      }
    }

    this.updateCustomNavVisibility();

    if (incomingList) {
      const cleanListId = extractPlaylistId(incomingList) || incomingList;
      if (cleanListId === DEFAULT_PLAYLIST_ID) {
        await this.selectCategory('default');
      } else {
        await this.importPlaylistById(cleanListId, true);
      }
    } else if (incomingCat && incomingCat === 'custom' && this.customSongs.length >= 4) {
      await this.selectCategory('custom');
    } else {
      await this.selectCategory('default');
    }
  }

  updateCustomNavVisibility() {
    const customCatBtn = document.querySelector('[data-category="custom"]');
    if (!customCatBtn) return;
    if (this.customSongs && this.customSongs.length > 0) {
      customCatBtn.classList.remove('hidden');
      const title = this.customPlaylistTitle && this.customPlaylistTitle !== '你的歌單'
        ? `${this.customPlaylistTitle.slice(0, 8)}...`
        : '你的歌單';
      customCatBtn.innerHTML = `<i data-lucide="target" class="w-3.5 h-3.5 mr-1 text-[#00CEC8]"></i> ${title}`;
      if (window.lucide) window.lucide.createIcons();
    } else {
      customCatBtn.classList.add('hidden');
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

    // GA4 Track Event: Community Offset Intelligence
    trackEvent('song_offset_saved', {
      video_id: this.currentSong.id,
      song_title: this.currentSong.title,
      song_artist: this.currentSong.artist,
      offset_seconds: sec,
      playlist_id: this.customPlaylistId || DEFAULT_PLAYLIST_ID,
      category: this.currentCategoryKey
    });

    alert(`✅ 已將「${this.currentSong.title}」設定為從第 ${sec} 秒開始發聲`);
  }

  shareCurrentChallengeUrl() {
    const baseUrl = window.location.origin + window.location.pathname;
    const encodedOffsets = encodeOffsets(this.songs);

    let targetUrl = baseUrl;
    if (this.currentCategoryKey === 'custom') {
      const payload = encodeSongsPayload(this.songs, this.customPlaylistTitle);
      if (this.customPlaylistId) {
        targetUrl += `?list=${encodeURIComponent(this.customPlaylistId)}&songs=${payload}`;
      } else {
        targetUrl += `?cat=custom&songs=${payload}`;
      }
    } else {
      targetUrl += `?list=${encodeURIComponent(DEFAULT_PLAYLIST_ID)}`;
      if (encodedOffsets) {
        targetUrl += `&offsets=${encodeURIComponent(encodedOffsets)}`;
      }
    }

    if (this.difficulty === 'hell') {
      targetUrl += `&diff=hell`;
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(targetUrl).then(() => {
        alert(`已複製挑戰連結`);
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
    this.completedSongIds.clear();
    this.saveCompletedSongs();
    this.lives = this.maxLives;
    this.runHistory = [];
    this.score = 0;
    this.streak = 0;
    this.updateLivesUI();
    this.updateStatsUI();
    if (this.playlistCompletedCard) this.playlistCompletedCard.classList.add('hidden');
    if (this.gameCentralStage) this.gameCentralStage.classList.remove('hidden');
    this.startNewRound();
  }

  showPlaylistCompleted() {
    this.showMatchSummary(true);
  }

  async selectCategory(categoryKey) {
    this.currentCategoryKey = categoryKey;
    this.categoryBtns = document.querySelectorAll('.cat-btn');
    this.categoryBtns.forEach(btn => {
      if (btn.dataset.category === categoryKey) {
        btn.className = 'cat-btn px-3 sm:px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#EB4203] to-[#FF9C5F] text-[#FCEFC3] shadow-md shadow-[#EB4203]/25 whitespace-nowrap transition-all font-bold';
      } else {
        btn.className = 'cat-btn px-3 sm:px-3.5 py-2 rounded-xl bg-slate-800/90 text-slate-300 hover:bg-slate-700 whitespace-nowrap transition-all font-bold';
      }
    });

    if (categoryKey === 'custom') {
      if (this.customSongs.length < 4) {
        alert('自訂題庫未滿 4 首歌曲');
        this.openCustomModal();
        return;
      }
      this.songs = [...this.customSongs];
    } else {
      // Default playlist: dynamically fetched from YouTube Music
      if (!this.defaultSongs || this.defaultSongs.length === 0) {
        this.setAudioStatus('buffering', '載入預設歌單');
        try {
          const data = await fetchPlaylistSongs(DEFAULT_PLAYLIST_ID);
          if (data && data.songs && data.songs.length > 0) {
            this.defaultSongs = data.songs;
          } else {
            throw new Error('無法取得歌單曲目');
          }
        } catch (err) {
          alert(`載入預設歌單失敗`);
          return;
        }
      }
      this.songs = [...this.defaultSongs];
    }

    this.loadOffsetsForCurrentCategory();
    this.loadCompletedSongs();
    this.lives = this.maxLives;
    this.runHistory = [];
    this.updateLivesUI();
    if (this.playlistCompletedCard) this.playlistCompletedCard.classList.add('hidden');
    if (this.gameCentralStage) this.gameCentralStage.classList.remove('hidden');

    const catName = categoryKey === 'custom'
      ? this.customPlaylistTitle
      : (SONG_CATEGORIES[categoryKey]?.name || DEFAULT_PLAYLIST_TITLE);

    // GA4 Track Event: category_selected
    trackEvent('category_selected', {
      category_key: categoryKey,
      playlist_title: catName,
      playlist_id: this.customPlaylistId || DEFAULT_PLAYLIST_ID,
      song_count: this.songs.length
    });

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

    this.updateTierUI();
    if (window.lucide) window.lucide.createIcons();
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
    if (window.confetti && typeof window.confetti.reset === 'function') {
      window.confetti.reset();
    }
    this.isRoundOver = false;
    this.tierIndex = 0;
    this.isPlaying = false;
    this.audioEngine.clearPlaybackTimer();
    this.audioEngine.pause();
    this.updateLivesUI();

    // Check if lives exhausted: Game Over!
    if (this.lives <= 0) {
      this.showMatchSummary(false);
      return;
    }

    // Check uncompleted songs in current playlist
    const uncompleted = this.songs.filter(s => !this.completedSongIds.has(s.id));
    if (uncompleted.length === 0 && this.songs.length > 0) {
      this.showMatchSummary(true);
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

    this.setAudioStatus('buffering', '載入中');

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
    // Unfocus active element to prevent sticky hover/focus on mobile
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

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
      btn.type = 'button';
      btn.className = 'choice-btn w-full p-3 sm:p-4 rounded-2xl glass-card text-left transition-all duration-150 flex items-center justify-between min-h-[56px] shadow-sm';
      btn.innerHTML = `
        <div class="flex items-center space-x-2.5 sm:space-x-3 overflow-hidden pointer-events-none">
          <span class="choice-badge w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-slate-800/80 text-[#00CEC8] border border-slate-700/60 flex items-center justify-center font-black text-xs transition-colors flex-shrink-0">
            ${['A', 'B', 'C', 'D'][idx]}
          </span>
          <div class="truncate">
            <p class="choice-title font-bold text-[#FCEFC3] text-sm sm:text-base truncate transition-colors">${song.title}</p>
            <p class="choice-artist text-[11px] sm:text-xs text-slate-400 truncate transition-colors">${song.artist}</p>
          </div>
        </div>
        <span class="choice-action text-slate-500 text-[11px] sm:text-xs font-mono ml-2 flex-shrink-0 transition-colors pointer-events-none">猜這首</span>
      `;
      btn.addEventListener('click', () => {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        this.handleGuess(song, btn);
      });
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
      this.searchResults.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center">找不到歌名，可輸入歌手</div>`;
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
    this.setAudioStatus('buffering', `載入中 (${durationText})`);
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
        this.setAudioStatus('playing', `🔊 正在播放 ${durationText}！`);
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
          this.setAudioStatus('timeout', '連線逾時，請點擊重試');
          this.btnPlay.classList.remove('hidden');
          this.btnPlay.innerHTML = `
            <i data-lucide="rotate-ccw" class="w-5 h-5 mr-2"></i>
            連線逾時，點擊重試
          `;
        } else {
          this.setAudioStatus('paused', '音訊結束，請作答');
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
    const earnedPoints = this.getTierPoints(this.tierIndex);
    const modeBonusText = this.gameMode === 'search' ? ' · 1.5x' : '';

    this.tierLabel.innerHTML = `
      <span class="text-slate-400 mr-1 text-[11px]">⏱️</span>
      <span class="${isHell ? 'text-[#FF9C5F] font-black' : 'text-[#00CEC8] font-bold'}">${tier.label}</span>
      <span class="text-xs ${isHell ? 'text-[#FCEFC3] font-bold' : 'text-slate-400'} ml-1.5">(+${earnedPoints}分${modeBonusText})</span>
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

    if (targetButton && typeof targetButton.blur === 'function') {
      targetButton.blur();
    }

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
      this.onRoundWrong(guessedSong);
    }
  }

  onRoundSuccess() {
    this.isRoundOver = true;
    this.isPlaying = false;
    this.audioEngine.clearPlaybackTimer();
    const tier = this.tiers[this.tierIndex];
    const earnedPoints = this.getTierPoints(this.tierIndex);

    // Record this song as completed for current playlist (no duplicates!)
    this.completedSongIds.add(this.currentSong.id);
    this.saveCompletedSongs();

    this.score += earnedPoints;
    this.streak += 1;
    if (this.streak > this.bestStreak) {
      this.bestStreak = this.streak;
      localStorage.setItem('yt_guesser_best_streak', this.bestStreak.toString());
    }

    // Record in run history
    this.runHistory.push({
      song: this.currentSong,
      result: 'correct',
      tierIndex: this.tierIndex,
      durationLabel: tier.label,
      points: earnedPoints,
      mode: this.gameMode
    });

    // GA4 Track Event: round_guess
    trackEvent('round_guess', {
      result: 'correct',
      song_id: this.currentSong.id,
      song_title: this.currentSong.title,
      tier_duration: tier.duration,
      points: earnedPoints,
      mode: this.gameMode,
      difficulty: this.difficulty,
      streak: this.streak
    });

    this.updateStatsUI();
    this.updateProgressUI();
    this.triggerConfetti();

    let badgeText = tier.badge || 'Excellent';
    if (this.gameMode === 'search') {
      if (this.difficulty === 'hell' && this.tierIndex === 0) {
        badgeText = '👑 ';
      } else {
        badgeText = `✍️ 盲猜(${tier.points} × 1.5x)`;
      }
    }

    this.showReveal(true, earnedPoints, badgeText);

    // Lock all choice buttons to prevent repeated clicks
    this.choicesGrid.classList.add('pointer-events-none');
    this.choicesGrid.querySelectorAll('.choice-btn').forEach(btn => {
      btn.disabled = true;
    });

    this.btnNextSong.innerHTML = `
      下一題 <i data-lucide="arrow-right" class="w-4 h-4 ml-1.5"></i>
    `;
    if (window.lucide) window.lucide.createIcons();

    this.audioEngine.playFull(this.currentSong.start || 0);
  }

  onRoundWrong(guessedSong) {
    this.isRoundOver = true;
    this.isPlaying = false;
    this.audioEngine.clearPlaybackTimer();

    // Deduct 1 life!
    this.lives = Math.max(0, this.lives - 1);
    this.updateLivesUI();

    this.streak = 0;
    this.updateStatsUI();

    const tier = this.tiers[this.tierIndex];
    const durationLabel = tier.label;

    // Record in run history
    this.runHistory.push({
      song: this.currentSong,
      result: 'wrong',
      tierIndex: this.tierIndex,
      durationLabel: durationLabel,
      points: 0,
      mode: this.gameMode,
      guessedTitle: guessedSong ? guessedSong.title : null
    });

    // GA4 Track Event: round_guess
    trackEvent('round_guess', {
      result: 'wrong',
      song_id: this.currentSong.id,
      song_title: this.currentSong.title,
      tier_duration: tier.duration,
      points: 0,
      mode: this.gameMode,
      difficulty: this.difficulty,
      remaining_lives: this.lives
    });

    // Lock all choice buttons and highlight the correct one in teal
    this.choicesGrid.classList.add('pointer-events-none');
    this.choicesGrid.querySelectorAll('.choice-btn').forEach(btn => {
      btn.disabled = true;
      const titleEl = btn.querySelector('.choice-title');
      if (titleEl && titleEl.textContent === this.currentSong.title) {
        btn.classList.add('border-[#00CEC8]', 'bg-[#00CEC8]/20', 'text-[#00CEC8]');
      }
    });

    const isOutOfLives = this.lives <= 0;
    const badgeText = isOutOfLives ? '💀 挑戰失敗' : '💔 猜錯了 (-1 ❤️)';
    this.showReveal(false, 0, badgeText);

    if (isOutOfLives) {
      this.btnNextSong.innerHTML = `
        <i data-lucide="skull" class="w-4 h-4 mr-1.5 text-[#FF9C5F]"></i>
        結算戰績
      `;
    } else {
      this.btnNextSong.innerHTML = `
        下一題 <i data-lucide="arrow-right" class="w-4 h-4 ml-1.5"></i>
      `;
    }
    if (window.lucide) window.lucide.createIcons();

    this.audioEngine.playFull(this.currentSong.start || 0);
  }

  giveUp() {
    if (this.isRoundOver) return;
    this.isRoundOver = true;
    this.isPlaying = false;
    this.audioEngine.clearPlaybackTimer();

    // Deduct 1 life!
    this.lives = Math.max(0, this.lives - 1);
    this.updateLivesUI();

    this.streak = 0;
    this.updateStatsUI();

    const tier = this.tiers[this.tierIndex];
    const durationLabel = tier.label;

    // Record in run history
    this.runHistory.push({
      song: this.currentSong,
      result: 'giveup',
      tierIndex: this.tierIndex,
      durationLabel: durationLabel,
      points: 0,
      mode: this.gameMode
    });

    // GA4 Track Event: round_guess
    trackEvent('round_guess', {
      result: 'giveup',
      song_id: this.currentSong.id,
      song_title: this.currentSong.title,
      tier_duration: tier.duration,
      points: 0,
      mode: this.gameMode,
      difficulty: this.difficulty,
      remaining_lives: this.lives
    });

    // Lock all choice buttons and highlight the correct one in teal
    this.choicesGrid.classList.add('pointer-events-none');
    this.choicesGrid.querySelectorAll('.choice-btn').forEach(btn => {
      btn.disabled = true;
      const titleEl = btn.querySelector('.choice-title');
      if (titleEl && titleEl.textContent === this.currentSong.title) {
        btn.classList.add('border-[#00CEC8]', 'bg-[#00CEC8]/20', 'text-[#00CEC8]');
      }
    });

    const isOutOfLives = this.lives <= 0;
    const badgeText = isOutOfLives ? '💀 挑戰失敗' : '💔 放棄 (-1 ❤️)';
    this.showReveal(false, 0, badgeText);

    if (isOutOfLives) {
      this.btnNextSong.innerHTML = `
        <i data-lucide="skull" class="w-4 h-4 mr-1.5 text-[#FF9C5F]"></i>
        結算戰績
      `;
    } else {
      this.btnNextSong.innerHTML = `
        下一題 <i data-lucide="arrow-right" class="w-4 h-4 ml-1.5"></i>
      `;
    }
    if (window.lucide) window.lucide.createIcons();

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
      this.revealStatus.textContent = `${badge}`;
      this.revealPoints.textContent = `+${points} 分`;
      this.revealPoints.className = 'text-[#00CEC8] font-extrabold text-sm';
    } else {
      this.revealStatus.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#EB4203]/20 text-[#FF9C5F] border border-[#EB4203]/30';
      this.revealStatus.textContent = badge || '再接再厲';
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

  updateLivesUI() {
    const fullHeart = '❤️';
    const emptyHeart = '🖤';
    let heartsText = '';
    for (let i = 0; i < this.maxLives; i++) {
      heartsText += (i < this.lives) ? fullHeart : emptyHeart;
    }

    if (this.livesDisplay) this.livesDisplay.textContent = heartsText;
    if (this.livesDisplayMobile) this.livesDisplayMobile.textContent = heartsText;
    if (this.livesDisplayStage) this.livesDisplayStage.textContent = heartsText;
  }

  showMatchSummary(isVictory) {
    this.isRoundOver = true;
    this.isPlaying = false;
    this.audioEngine.pause();
    this.updateProgressUI();

    const catName = this.currentCategoryKey === 'custom'
      ? this.customPlaylistTitle
      : (SONG_CATEGORIES[this.currentCategoryKey]?.name || DEFAULT_PLAYLIST_TITLE);

    if (this.scorecardPlaylistTitle) {
      this.scorecardPlaylistTitle.textContent = catName;
    }

    const totalAttempted = this.runHistory.length;
    const correctItems = this.runHistory.filter(h => h.result === 'correct');
    const correctCount = correctItems.length;
    const godlyCount = this.runHistory.filter(h => h.result === 'correct' && h.tierIndex === 0).length;

    // Calculate Rank
    const rankInfo = this.calculateRank(isVictory, correctCount, totalAttempted, godlyCount);

    if (this.scorecardStatusBadge && this.scorecardStatusIcon && this.scorecardStatusText) {
      if (isVictory) {
        this.scorecardStatusBadge.className = 'inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider mb-2 border bg-[#00CEC8]/15 border-[#00CEC8]/30 text-[#00CEC8]';
        this.scorecardStatusIcon.textContent = '🏆';
        this.scorecardStatusText.textContent = '挑戰成功！';
        if (this.completedCardDesc) {
          this.completedCardDesc.textContent = `恭喜你！順利破完「${catName}」全曲庫！`;
        }
        if (this.scorecardGlowBg) {
          this.scorecardGlowBg.className = 'absolute -top-20 -right-20 w-60 h-60 bg-[#00CEC8]/20 rounded-full blur-3xl pointer-events-none';
        }
      } else {
        this.scorecardStatusBadge.className = 'inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider mb-2 border bg-[#EB4203]/20 border-[#EB4203]/40 text-[#FF9C5F]';
        this.scorecardStatusIcon.textContent = '💀';
        this.scorecardStatusText.textContent = '挑戰結束';
        if (this.completedCardDesc) {
          this.completedCardDesc.textContent = `在「${catName}」中用盡 3 次挑戰機會，再接再厲！`;
        }
        if (this.scorecardGlowBg) {
          this.scorecardGlowBg.className = 'absolute -top-20 -right-20 w-60 h-60 bg-[#EB4203]/20 rounded-full blur-3xl pointer-events-none';
        }
      }
    }

    // Rank Badge
    if (this.scorecardRankLetter) this.scorecardRankLetter.textContent = rankInfo.letter;
    if (this.scorecardRankTitle) this.scorecardRankTitle.textContent = rankInfo.title;
    if (this.scorecardRankBadge) {
      this.scorecardRankBadge.className = `w-14 h-14 sm:w-16 sm:h-16 rounded-2xl ${rankInfo.bgClass} flex flex-col items-center justify-center shadow-lg flex-shrink-0`;
    }

    // Total Score & Hearts
    if (this.scorecardTotalScore) this.scorecardTotalScore.textContent = this.score;
    if (this.scorecardHeartsDisplay) {
      let hearts = '';
      for (let i = 0; i < this.maxLives; i++) {
        hearts += (i < this.lives) ? '❤️' : '🖤';
      }
      this.scorecardHeartsDisplay.textContent = hearts;
    }

    // Accuracy & Godly count
    const accPct = totalAttempted > 0 ? Math.round((correctCount / totalAttempted) * 100) : 0;
    if (this.scorecardAccuracyRate) {
      this.scorecardAccuracyRate.textContent = `${correctCount} / ${totalAttempted} (${accPct}%)`;
    }
    if (this.scorecardGodlyCount) {
      const fastLabel = this.difficulty === 'hell' ? '0.15s' : '0.5s';
      this.scorecardGodlyCount.textContent = `${godlyCount} 首 (${fastLabel})`;
    }

    // Track list count & items
    if (this.scorecardTrackCount) this.scorecardTrackCount.textContent = totalAttempted;
    this.renderScorecardTrackList();

    if (this.playlistCompletedCard) this.playlistCompletedCard.classList.remove('hidden');
    if (this.gameCentralStage) this.gameCentralStage.classList.add('hidden');
    this.choicesGrid.classList.add('hidden');
    this.searchContainer.classList.add('hidden');
    this.revealCard.classList.add('hidden');

    if (isVictory) {
      this.triggerConfetti();
    }
    if (window.lucide) window.lucide.createIcons();

    // GA4 Track Event: game_summary
    trackEvent('game_summary', {
      is_victory: isVictory,
      playlist_title: catName,
      playlist_id: this.customPlaylistId || this.currentCategoryKey,
      rank_letter: rankInfo.letter,
      rank_title: rankInfo.title,
      total_score: this.score,
      remaining_lives: this.lives,
      correct_count: correctCount,
      total_attempted: totalAttempted,
      accuracy_percent: accPct,
      godly_count: godlyCount,
      difficulty: this.difficulty,
      mode: this.gameMode
    });
  }

  calculateRank(isVictory, correctCount, totalAttempted, godlyCount) {
    if (isVictory) {
      if (this.lives === 3 && godlyCount >= Math.floor(this.songs.length * 0.7)) {
        return { letter: 'SSS', title: '神之耳', bgClass: 'bg-gradient-to-tr from-[#00CEC8] to-[#FCEFC3] text-slate-950 shadow-[#00CEC8]/40' };
      }
      if (this.lives >= 2) {
        return { letter: 'SS', title: 'KTV MVP', bgClass: 'bg-gradient-to-tr from-[#EB4203] to-[#FF9C5F] text-[#FCEFC3] shadow-[#EB4203]/30' };
      }
      return { letter: 'S', title: '資深樂迷', bgClass: 'bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 shadow-amber-500/30' };
    } else {
      if (correctCount >= Math.floor(this.songs.length * 0.5)) {
        return { letter: 'A', title: '還行吧', bgClass: 'bg-gradient-to-tr from-teal-600 to-teal-400 text-white shadow-teal-500/30' };
      }
      if (correctCount >= 2) {
        return { letter: 'B', title: '再接再厲', bgClass: 'bg-gradient-to-tr from-slate-700 to-slate-500 text-white shadow-slate-700/30' };
      }
      return { letter: 'C', title: '專心吃水餃', bgClass: 'bg-gradient-to-tr from-rose-700 to-red-600 text-white shadow-red-600/30' };
    }
  }

  renderScorecardTrackList() {
    if (!this.scorecardTrackList) return;
    this.scorecardTrackList.innerHTML = '';

    if (this.runHistory.length === 0) {
      this.scorecardTrackList.innerHTML = `<div class="p-3 text-xs text-slate-500 text-center">尚無作答紀錄</div>`;
      return;
    }

    this.runHistory.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs';

      const isCorrect = item.result === 'correct';
      const statusIcon = isCorrect ? '✅' : '❌';
      const badgeColor = isCorrect ? 'text-[#00CEC8] bg-[#00CEC8]/10' : 'text-[#EB4203] bg-[#EB4203]/10';
      const modeTag = item.mode === 'search' ? '✍️盲打' : item.durationLabel;
      const pointsText = isCorrect ? `+${item.points}` : '+0';

      row.innerHTML = `
        <div class="flex items-center space-x-2 overflow-hidden mr-2">
          <span class="text-xs flex-shrink-0">${statusIcon}</span>
          <span class="font-mono text-slate-500 text-[11px] flex-shrink-0">${idx + 1}.</span>
          <div class="truncate">
            <p class="font-bold text-[#FCEFC3] text-xs truncate">${item.song.title}</p>
            <p class="text-[10px] text-slate-400 truncate">${item.song.artist}</p>
          </div>
        </div>
        <div class="flex items-center space-x-2 flex-shrink-0">
          <span class="px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold ${badgeColor}">
            ${modeTag}
          </span>
          <span class="font-mono font-bold ${isCorrect ? 'text-[#00CEC8]' : 'text-slate-500'} text-xs">
            ${pointsText}
          </span>
        </div>
      `;
      this.scorecardTrackList.appendChild(row);
    });
  }

  copyScorecardSummary() {
    const catName = this.currentCategoryKey === 'custom'
      ? this.customPlaylistTitle
      : (SONG_CATEGORIES[this.currentCategoryKey]?.name || DEFAULT_PLAYLIST_TITLE);

    const isVictory = this.lives > 0 && this.completedSongIds.size === this.songs.length;
    const totalAttempted = this.runHistory.length;
    const correctCount = this.runHistory.filter(h => h.result === 'correct').length;
    const godlyCount = this.runHistory.filter(h => h.result === 'correct' && h.tierIndex === 0).length;
    const rankInfo = this.calculateRank(isVictory, correctCount, totalAttempted, godlyCount);

    let hearts = '';
    for (let i = 0; i < this.maxLives; i++) {
      hearts += (i < this.lives) ? '❤️' : '🖤';
    }

    const fastLabel = this.difficulty === 'hell' ? '0.15s' : '0.5s';
    const statusText = isVictory ? '🏆 挑戰成功！' : '💀 挑戰失敗';

    let shareLines = [
      `🎧 0.5 秒猜歌戰績！【${catName}】`,
      `${statusText} · 段位：${rankInfo.letter}【${rankInfo.title}】`,
      `⭐️ 總分：${this.score} 分 | 生命：${hearts}`,
      `🎯 答題：${correctCount} / ${totalAttempted} 首 (${godlyCount} 首 ${fastLabel} 瞬答)`,
      ``
    ];

    this.runHistory.slice(0, 8).forEach((item, idx) => {
      const icon = item.result === 'correct' ? '✅' : '❌';
      const tag = item.mode === 'search' ? '盲猜' : item.durationLabel;
      shareLines.push(`${idx + 1}. ${icon} ${item.song.title} (${tag})`);
    });

    if (this.runHistory.length > 8) {
      shareLines.push(`...其餘 ${this.runHistory.length - 8} 首歌`);
    }

    shareLines.push(``);
    shareLines.push(`🔗 來聽聽看你能猜出幾首：https://magzeng.github.io/yt-music-guesser/`);

    const fullShareText = shareLines.join('\n');

    // GA4 Track Event: scorecard_shared (text)
    trackEvent('scorecard_shared', {
      share_type: 'text',
      playlist_title: catName,
      playlist_id: this.customPlaylistId || this.currentCategoryKey,
      rank_letter: rankInfo.letter,
      total_score: this.score,
      is_victory: isVictory,
      remaining_lives: this.lives
    });

    if (navigator.clipboard) {
      navigator.clipboard.writeText(fullShareText).then(() => {
        alert('✨ 戰績已複製');
      }).catch(() => {
        alert(fullShareText);
      });
    } else {
      alert(fullShareText);
    }
  }

  async generateAndShareScorecardImage() {
    if (!this.runHistory || this.runHistory.length === 0) {
      alert('目前尚無成績');
      return;
    }

    const catName = this.currentCategoryKey === 'custom'
      ? this.customPlaylistTitle
      : (SONG_CATEGORIES[this.currentCategoryKey]?.name || DEFAULT_PLAYLIST_TITLE);

    const isVictory = this.lives > 0 && this.completedSongIds.size === this.songs.length;
    const totalAttempted = this.runHistory.length;
    const correctCount = this.runHistory.filter(h => h.result === 'correct').length;
    const godlyCount = this.runHistory.filter(h => h.result === 'correct' && h.tierIndex === 0).length;
    const rankInfo = this.calculateRank(isVictory, correctCount, totalAttempted, godlyCount);

    let hearts = '';
    for (let i = 0; i < this.maxLives; i++) {
      hearts += (i < this.lives) ? '❤️' : '🖤';
    }

    const fastLabel = this.difficulty === 'hell' ? '0.15s' : '0.5s';
    const tracksToShow = this.runHistory.slice(0, 12);

    // Canvas size
    const width = 680;
    const trackRowHeight = 44;
    const baseHeight = 340;
    const height = baseHeight + (tracksToShow.length * trackRowHeight);

    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    // 1. Dark Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#0a0f1d');
    bgGrad.addColorStop(1, '#05070c');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Corner Glows
    const glow1 = ctx.createRadialGradient(width - 50, 60, 10, width - 50, 60, 260);
    glow1.addColorStop(0, 'rgba(0, 206, 200, 0.22)');
    glow1.addColorStop(1, 'rgba(0, 206, 200, 0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, width, height);

    const glow2 = ctx.createRadialGradient(60, 120, 10, 60, 120, 240);
    glow2.addColorStop(0, 'rgba(235, 66, 3, 0.18)');
    glow2.addColorStop(1, 'rgba(235, 66, 3, 0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, width, height);

    // Outer Border
    ctx.strokeStyle = 'rgba(252, 239, 195, 0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, width - 24, height - 24);

    // Helper for rounded rect
    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    // 2. Status Badge Pill
    const badgeText = isVictory ? '🏆 挑戰成功！' : '💀 挑戰結束';
    ctx.font = 'bold 12px "Noto Sans TC", "Plus Jakarta Sans", sans-serif';
    const badgeMetrics = ctx.measureText(badgeText);
    const badgeWidth = badgeMetrics.width + 24;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = 32;

    roundRect(badgeX, badgeY, badgeWidth, 26, 13);
    ctx.fillStyle = isVictory ? 'rgba(0, 206, 200, 0.15)' : 'rgba(235, 66, 3, 0.2)';
    ctx.fill();
    ctx.strokeStyle = isVictory ? 'rgba(0, 206, 200, 0.4)' : 'rgba(235, 66, 3, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = isVictory ? '#00CEC8' : '#FF9C5F';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, width / 2, badgeY + 13);

    // 3. Playlist Title
    ctx.font = '900 24px "Noto Sans TC", "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#FCEFC3';
    ctx.fillText(catName, width / 2, 84);

    // Subtitle
    ctx.font = '12px "Noto Sans TC", "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('成績總覽', width / 2, 110);

    // 4. Rank & Score Box
    const boxX = 36;
    const boxY = 130;
    const boxW = width - 72;
    const boxH = 96;

    roundRect(boxX, boxY, boxW, boxH, 16);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Rank Badge
    roundRect(boxX + 16, boxY + 14, 68, 68, 14);
    const rankGrad = ctx.createLinearGradient(boxX + 16, boxY + 14, boxX + 84, boxY + 82);
    if (rankInfo.letter === 'SSS') {
      rankGrad.addColorStop(0, '#00CEC8');
      rankGrad.addColorStop(1, '#FCEFC3');
    } else if (rankInfo.letter === 'SS') {
      rankGrad.addColorStop(0, '#EB4203');
      rankGrad.addColorStop(1, '#FF9C5F');
    } else if (rankInfo.letter === 'S') {
      rankGrad.addColorStop(0, '#f59e0b');
      rankGrad.addColorStop(1, '#fde047');
    } else {
      rankGrad.addColorStop(0, '#334155');
      rankGrad.addColorStop(1, '#64748b');
    }
    ctx.fillStyle = rankGrad;
    ctx.fill();

    // Rank Text
    ctx.fillStyle = (rankInfo.letter === 'SSS' || rankInfo.letter === 'S') ? '#090e18' : '#FCEFC3';
    ctx.font = '900 26px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(rankInfo.letter, boxX + 50, boxY + 44);
    ctx.font = 'bold 10px "Noto Sans TC", sans-serif';
    ctx.fillText(rankInfo.title, boxX + 50, boxY + 66);

    // Score & Hearts
    ctx.textAlign = 'left';
    ctx.font = '11px "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('總得分', boxX + 100, boxY + 32);

    ctx.font = '900 30px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#00CEC8';
    ctx.fillText(this.score.toString(), boxX + 100, boxY + 60);

    ctx.font = '13px sans-serif';
    ctx.fillText(hearts, boxX + 100, boxY + 82);

    // Accuracy & Godly stats (right side)
    const accPct = totalAttempted > 0 ? Math.round((correctCount / totalAttempted) * 100) : 0;
    ctx.textAlign = 'right';
    ctx.font = '10px "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('答對率', boxX + boxW - 18, boxY + 32);
    ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#FCEFC3';
    ctx.fillText(`${correctCount} / ${totalAttempted} (${accPct}%)`, boxX + boxW - 18, boxY + 48);

    ctx.font = '10px "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`秒答 (${fastLabel})`, boxX + boxW - 18, boxY + 68);
    ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#FF9C5F';
    ctx.fillText(`${godlyCount} 首`, boxX + boxW - 18, boxY + 84);

    // 5. Track List Header
    const listStartY = boxY + boxH + 20;
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`逐首答題明細 (${totalAttempted} 首)`, boxX + 2, listStartY);

    ctx.textAlign = 'right';
    ctx.font = '10px "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('結果 · 秒數 · 得分', boxX + boxW - 2, listStartY);

    // 6. Track Rows
    tracksToShow.forEach((item, idx) => {
      const rowY = listStartY + 10 + (idx * trackRowHeight);
      roundRect(boxX, rowY, boxW, 36, 10);
      ctx.fillStyle = 'rgba(8, 12, 20, 0.85)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const isCorrect = item.result === 'correct';
      const icon = isCorrect ? '✅' : '❌';
      const pointsText = isCorrect ? `+${item.points}` : '+0';
      const modeTag = item.mode === 'search' ? '✍️盲打' : item.durationLabel;

      // Status icon & title
      ctx.textAlign = 'left';
      ctx.font = '12px sans-serif';
      ctx.fillText(icon, boxX + 10, rowY + 19);

      ctx.font = 'bold 12px "Noto Sans TC", sans-serif';
      ctx.fillStyle = '#FCEFC3';

      let displayTitle = `${idx + 1}. ${item.song.title}`;
      if (displayTitle.length > 20) displayTitle = displayTitle.slice(0, 20) + '...';
      ctx.fillText(displayTitle, boxX + 32, rowY + 19);

      // Tag & Points on right
      ctx.textAlign = 'right';
      ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = isCorrect ? '#00CEC8' : '#64748b';
      ctx.fillText(pointsText, boxX + boxW - 12, rowY + 19);

      ctx.font = '10px "Noto Sans TC", sans-serif';
      ctx.fillStyle = isCorrect ? '#00CEC8' : '#FF9C5F';
      ctx.fillText(modeTag, boxX + boxW - 60, rowY + 19);
    });

    // 7. Footer Watermark
    const footerY = height - 20;
    ctx.textAlign = 'center';
    ctx.font = '11px "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('🎧 你的歌來了 · 零秒猜歌  |  magzeng.github.io/yt-music-guesser', width / 2, footerY);

    // Export to Blob
    canvas.toBlob(async (blob) => {
      if (!blob) {
        alert('產出圖片失敗，請再試一次');
        return;
      }
      const fileName = `music-guesser-${Date.now()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // GA4 Track Event: scorecard_shared (image)
      trackEvent('scorecard_shared', {
        share_type: 'image',
        playlist_title: catName,
        playlist_id: this.customPlaylistId || this.currentCategoryKey,
        rank_letter: rankInfo.letter,
        total_score: this.score,
        is_victory: isVictory,
        remaining_lives: this.lives
      });

      // Native Web Share API (Supported on iOS Safari & Android Chrome)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `猜歌戰績：${catName}`,
            text: `我在「${catName}」猜歌挑戰拿下 ${rankInfo.letter}【${rankInfo.title}】！`
          });
          return;
        } catch (err) {
          if (err.name !== 'AbortError') console.error(err);
        }
      }

      // Fallback: Clipboard write or download
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          alert('✨ 戰績圖已複製到剪貼簿！可直接貼在聊天軟體或社群發文！');
          return;
        } catch (err) {
          console.warn('Clipboard write failed, triggering download', err);
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      alert('✨ 戰績圖已下載');
    }, 'image/png');
  }

  triggerConfetti() {
    if (window.confetti) {
      window.confetti({
        particleCount: 28,
        spread: 45,
        ticks: 35,       // Ultra-fast duration (~0.5s instead of 3-4s)
        gravity: 2.2,     // Falls quickly so it clears view immediately
        decay: 0.88,      // Fades out fast
        origin: { y: 0.6 }
      });
    }
  }

  shareResult() {
    const tierBlocks = ['⬛', '⬛', '⬛', '⬛'];
    if (this.isRoundOver && this.revealStatus.textContent.includes('神了')) {
      tierBlocks[this.tierIndex] = '🟩';
    } else {
      tierBlocks.fill('🟥');
    }

    const currentTier = this.tiers[this.tierIndex];
    const durationLabel = currentTier.duration >= 1000
      ? `${(currentTier.duration / 1000).toFixed(1)}s`
      : `${currentTier.duration}ms`;

    const modeLabel = this.gameMode === 'search' ? '✍️ 輸入歌名 (1.5x加成)' : '🎯 選擇題';
    const diffLabel = this.difficulty === 'hell' ? '🔥 挑戰模式 (0.15 秒)' : '一般模式';

    let titlePrefix = '0.5 秒猜歌挑戰！\n';
    if (this.difficulty === 'hell' && this.gameMode === 'search') {
      titlePrefix = '👑【極限挑戰】0.15 秒聽歌 + 輸入模式！\n';
    } else if (this.difficulty === 'hell') {
      titlePrefix = '🔥【進階挑戰】0.15 秒聽歌 + 選擇模式！\n';
    } else if (this.gameMode === 'search') {
      titlePrefix = '✍️【挑戰】0.5 秒聽歌 + 輸入模式！\n';
    }

    const catName = this.currentCategoryKey === 'custom'
      ? this.customPlaylistTitle
      : (SONG_CATEGORIES[this.currentCategoryKey]?.name || DEFAULT_PLAYLIST_TITLE);

    const shareText = `${titlePrefix}` +
      `關卡：${catName}\n` +
      `模式：${diffLabel} · ${modeLabel}\n` +
      `歌曲：${this.currentSong.title}\n` +
      `成績：${tierBlocks.join('')} (${durationLabel} 解鎖)\n` +
      `目前連勝：${this.streak} | 總分：${this.score}\n` +
      `快來挑戰你的音樂直覺！`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText).then(() => {
        alert('✨ 戰績已複製');
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

    // Auto-clean mobile tracking parameters (&si=..., &feature=..., etc.)
    const cleanUrl = cleanPlaylistUrl(inputVal);
    this.playlistUrlInput.value = cleanUrl;

    const playlistId = extractPlaylistId(cleanUrl);
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
      this.updateCustomNavVisibility();

      // GA4 Track Event: playlist_imported (Collect high quality community playlists)
      trackEvent('playlist_imported', {
        playlist_id: playlistId,
        playlist_title: this.customPlaylistTitle,
        song_count: data.songs.length
      });

      if (autoStart) {
        this.selectCategory('custom');
      } else {
        alert(`🎉 成功匯入「${this.customPlaylistTitle}」共 ${data.songs.length} 首歌曲`);
        this.closeCustomModal();
        this.selectCategory('custom');
      }

    } catch (err) {
      alert(`⚠️ 匯入歌單失敗：${err.message}\n請確認播放清單是否為「公開」`);
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

    // Auto-clean mobile tracking parameters
    const cleanUrl = cleanVideoUrl(url);
    this.customUrlInput.value = cleanUrl;

    const videoId = extractVideoId(cleanUrl);
    if (!videoId) {
      alert('請輸入正確的 YouTube Music 或 YouTube 影片網址！\n例如：https://music.youtube.com/watch?v=xxx');
      return;
    }

    if (this.customSongs.some(s => s.id === videoId)) {
      alert('這首歌曲已經在自訂題庫中囉！');
      return;
    }

    this.btnAddCustom.disabled = true;
    this.btnAddCustom.textContent = '匯入中';

    const songInfo = await fetchVideoInfo(videoId, startSec);
    this.customSongs.push(songInfo);
    localStorage.setItem('yt_guesser_custom_songs', JSON.stringify(this.customSongs));

    this.customUrlInput.value = '';
    if (this.customStartOffset) this.customStartOffset.value = '0';
    this.btnAddCustom.disabled = false;
    this.btnAddCustom.textContent = '+ 單曲';
    this.renderCustomSongsList();
    this.updateCustomNavVisibility();
  }

  shareCustomChallenge() {
    let challengeUrl = window.location.origin + window.location.pathname;
    if (this.customSongs && this.customSongs.length > 0) {
      const payload = encodeSongsPayload(this.customSongs, this.customPlaylistTitle);
      if (this.customPlaylistId) {
        challengeUrl += `?list=${encodeURIComponent(this.customPlaylistId)}&songs=${payload}`;
      } else {
        challengeUrl += `?cat=custom&songs=${payload}`;
      }
    } else if (this.customPlaylistId) {
      challengeUrl += `?list=${encodeURIComponent(this.customPlaylistId)}`;
    }

    const shareText = `來挑戰我的秒速猜歌\n` +
      `專屬歌單：${this.customPlaylistTitle}\n` +
      `鐵粉是你嗎？快來聽前奏 0.5 秒猜歌！\n` +
      `${challengeUrl}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText).then(() => {
        alert('✨ 專屬歌單考題連結已複製');
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
    this.updateCustomNavVisibility();
    if (this.currentCategoryKey === 'custom') {
      this.selectCategory('default');
    }
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
      this.customListEl.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">尚未匯入歌單或單曲</p>`;
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
