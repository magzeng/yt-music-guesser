/**
 * Lightweight i18n & Normal Distribution Statistics Engine
 * Supports zh-TW and en, URL override, and LocalStorage persistence.
 */

// Approximate Error Function (erf) using Abramowitz and Stegun approximation (formula 7.1.26)
// Maximum error: 1.5 * 10^-7
export function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  const a = Math.abs(x);

  // Constants
  const p = 0.3275911;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;

  const t = 1.0 / (1.0 + p * a);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-a * a);

  return sign * y;
}

/**
 * Standard Normal Cumulative Distribution Function (CDF)
 * Phi(z) = 0.5 * (1 + erf(z / sqrt(2)))
 */
export function normalCDF(x, mean, stdDev) {
  if (stdDev <= 0) return x >= mean ? 1 : 0;
  const z = (x - mean) / (stdDev * Math.SQRT2);
  return 0.5 * (1.0 + erf(z));
}

/**
 * Calculates user percentile based on normal distribution model:
 * maxScore M, mean = M * 0.55, stdDev = M * 0.18
 * Bound to 1% - 99%, or 99.9% for godly players
 */
export function calculatePercentile(score, maxScore, isGodlyMaster = false) {
  if (maxScore <= 0) return 50;
  const safeScore = Math.max(0, score);

  // Perfect score with godly instant answers can reach 99.9%
  if (isGodlyMaster && safeScore >= maxScore * 0.95) {
    return 99.9;
  }

  const mean = maxScore * 0.55;
  const stdDev = maxScore * 0.18;
  const cdf = normalCDF(safeScore, mean, stdDev);

  let percent = Math.round(cdf * 100);
  if (percent < 1) percent = 1;
  if (percent > 99) percent = 99;
  return percent;
}

/**
 * Multi-language Dictionary
 */
export const translations = {
  'zh-TW': {
    app_title: '你的歌來了',
    app_subtitle: '零秒猜歌',
    mode_choice: '選擇題',
    mode_search: '輸入歌名',
    diff_normal: '一般',
    diff_hell: '挑戰',
    lives: '生命',
    streak: '連勝',
    best_streak: '最高連勝',
    score: '總分',
    cat_default: '預設',
    cat_custom: '自訂題庫',
    import_manage: '匯入/管理',
    copy_challenge: '複製挑戰連結',
    round_progress: '進度',
    reset: '重設',
    play: '播放',
    play_snippet: '播放 {time}',
    replay: '再聽一次',
    more: '聽更多',
    unlock_next_tier: '解鎖下一段',
    give_up: '看答案',
    next_song: '下一題',
    share_result: '分享成績',
    input_mode: '輸入模式',
    search_placeholder: '搜尋歌曲或歌手，按 Enter 送出',
    status_ready: '準備就緒',
    status_buffering: '載入中...',
    status_listening: '正在聆聽...',
    status_playing: '正在播放',
    status_paused: '音訊結束，請作答',
    status_timeout: '連線逾時，請點擊重試',
    audio_buffering: '音訊緩衝中...',
    retry_timeout: '連線逾時，點擊重試',
    init_youtube: '正在初始化 YouTube...',
    loading: '載入中',
    pts_unit: '+{pts} 分',
    submit: '送出',
    no_search_results: '找不到歌名，可輸入歌手',
    correct: '猜對了！',
    wrong: '猜錯了',
    offset_prefix: '⏱️ 前奏微調：從第',
    seconds_unit: '秒發聲',
    save: '儲存',
    share_offsets: '分享此題庫設定 (含秒數)',
    bonus_badge: '獎勵 1.5x',
    bonus_50: '+50%',
    bonus_2x: '2x',

    // Custom Playlist Modal
    custom_modal_title: '自訂歌單',
    custom_modal_subtitle: '貼上 YouTube Music 連結建立專屬猜歌考題',
    ytm_tip_title: '推薦使用 YouTube Music 連結',
    ytm_tip_desc: '官方 MV 常有前奏無聲期；而 <strong class="text-[#FCEFC3]">YouTube Music</strong> 為純音檔，猜歌體驗較佳',
    import_playlist_title: '匯入播放清單',
    playlist_url_placeholder: 'https://music.youtube.com/playlist?list=PL...',
    btn_import: '匯入歌單',
    playlist_support_tip: '支援 YouTube Music 或一般 YouTube 公開播放清單網址',
    add_single_title: '或是單曲新增',
    song_url_placeholder: '貼上 YouTube / YT Music 單曲網址...',
    seconds_label: '秒:',
    offset_tooltip: '若為 MV 片頭過長，可手動設定從第幾秒開始聽',
    btn_add_song: '+ 單曲',
    custom_list_header: '目前題庫曲目 ({count} 首)',
    custom_empty: '尚未匯入歌單或單曲',
    clear_all: '清空',
    delete: '刪除',
    start_at: '({s}s起)',

    // Scorecard & Summary
    challenge_success: '挑戰成功！',
    challenge_ended: '挑戰結束',
    congrats_desc: '恭喜你！順利破完「{name}」全曲庫！',
    game_over_desc: '在「{name}」中用盡 3 次挑戰機會，再接再厲！',
    scorecard_summary: '全曲庫逐首挑戰戰績看板',
    total_score: '總得分',
    accuracy: '答對率',
    instant_guess: '秒答',
    tracks_detail: '逐首答題明細',
    results_header: '結果 · 秒數 · 得分',
    surpassed_players: '超越 {percent}% 的玩家',
    save_scorecard_img: '戰績截圖',
    copy_scorecard_text: '複製戰績',
    play_again: '再玩一輪',
    copied_toast: '✨ 已複製至剪貼簿！',
    rank_sss: '神之耳',
    rank_ss: 'KTV MVP',
    rank_s: '資深樂迷',
    rank_a: '還行吧',
    rank_b: '再接再厲',
    rank_c: '專心吃水餃',
    lang_btn: 'EN',
    wordle_title: '🎵 你的歌來了 0.5s Guesser',
    wordle_rating: '🏆 評級：{title} ({score} 分)',
    wordle_percent: '📊 超越 {percent}% 的玩家',
    wordle_challenge: '🔗 來挑戰我的紀錄：https://magzeng.github.io/yt-music-guesser/',
    tag_blind: '盲打',
    tag_choice: '選擇',
    tag_giveup: '放棄',
    tag_wrong: '猜錯',
    embed_blocked: '此曲限制外部播放，請換下一題',
    embed_btn_skip: '版權限制，跳至下一題',
    click_skip: '點擊換下一題',
    no_score: '目前尚無成績'
  },
  'en': {
    app_title: 'SongGuesser',
    app_subtitle: 'Sub-second Trivia',
    mode_choice: 'Choice',
    mode_search: 'Type Name',
    diff_normal: 'Normal',
    diff_hell: 'Hard',
    lives: 'Lives',
    streak: 'Streak',
    best_streak: 'Best',
    score: 'Score',
    cat_default: 'Default',
    cat_custom: 'Custom List',
    import_manage: 'Import/Manage',
    copy_challenge: 'Copy',
    round_progress: 'Progress',
    reset: 'Reset',
    play: 'Play',
    play_snippet: 'Play {time}',
    replay: 'Replay',
    more: 'Hear More',
    unlock_next_tier: 'Next Clue',
    give_up: 'Reveal',
    next_song: 'Next Song',
    share_result: 'Share',
    input_mode: 'Input Mode',
    search_placeholder: 'Search song or artist, press Enter...',
    status_ready: 'Ready',
    status_buffering: 'Buffering...',
    status_listening: 'Listening...',
    status_playing: 'Playing',
    status_paused: 'Snippet ended, make your guess',
    status_timeout: 'Connection timeout, click to retry',
    audio_buffering: 'Buffering audio...',
    retry_timeout: 'Timeout, click to retry',
    init_youtube: 'Initializing YouTube...',
    loading: 'Loading',
    pts_unit: '+{pts} pts',
    submit: 'Submit',
    no_search_results: 'No matches, try typing artist name',
    correct: 'Correct!',
    wrong: 'Wrong',
    offset_prefix: '⏱️ Intro offset: start at',
    seconds_unit: 's',
    save: 'Save',
    share_offsets: 'Share Challenge (with offsets)',
    bonus_badge: '1.5x Bonus',
    bonus_50: '+50%',
    bonus_2x: '2x',

    // Custom Playlist Modal
    custom_modal_title: 'Custom Playlist',
    custom_modal_subtitle: 'Paste YouTube Music links to create custom challenges',
    ytm_tip_title: 'Recommended: Use YouTube Music links',
    ytm_tip_desc: 'Official MVs often have long silent intros; <strong class="text-[#FCEFC3]">YouTube Music</strong> audio provides the best trivia experience.',
    import_playlist_title: 'Import Playlist',
    playlist_url_placeholder: 'https://music.youtube.com/playlist?list=PL...',
    btn_import: 'Import',
    playlist_support_tip: 'Supports YouTube Music & public YouTube playlist URLs',
    add_single_title: 'Or Add Single Track',
    song_url_placeholder: 'Paste YouTube / YT Music song URL...',
    seconds_label: 'Sec:',
    offset_tooltip: 'If MV intro is too long, set start offset in seconds',
    btn_add_song: '+ Track',
    custom_list_header: 'Current Playlist Tracks ({count})',
    custom_empty: 'No tracks yet. Import a playlist or add tracks above.',
    clear_all: 'Clear All',
    delete: 'Delete',
    start_at: '(from {s}s)',

    // Scorecard & Summary
    challenge_success: 'Victory!',
    challenge_ended: 'Game Over',
    congrats_desc: 'Congratulations! You conquered all tracks in "{name}"!',
    game_over_desc: 'Used up all 3 lives in "{name}". Better luck next time!',
    scorecard_summary: 'Match Performance & Scorecard',
    total_score: 'Total Score',
    accuracy: 'Accuracy',
    instant_guess: 'Instant Guess',
    tracks_detail: 'Round-by-Round Breakdown',
    results_header: 'Result · Duration · Score',
    surpassed_players: 'Beat {percent}% of players',
    save_scorecard_img: 'Score Image',
    copy_scorecard_text: 'Copy Score',
    play_again: 'Play Again',
    copied_toast: '✨ Copied to clipboard!',
    rank_sss: "God's Ear",
    rank_ss: 'KTV MVP',
    rank_s: 'Music Connoisseur',
    rank_a: 'Pretty Good',
    rank_b: 'Keep Trying',
    rank_c: 'Snack Eater',
    lang_btn: '繁中',
    wordle_title: '🎵 SongGuesser 0.5s Guesser',
    wordle_rating: '🏆 Rank: {title} ({score} pts)',
    wordle_percent: '📊 Beat {percent}% of players',
    wordle_challenge: '🔗 Challenge my record: https://magzeng.github.io/yt-music-guesser/',
    tag_blind: 'Blind',
    tag_choice: 'Choice',
    tag_giveup: 'Pass',
    tag_wrong: 'Miss',
    embed_blocked: 'Playback restricted by artist, skip to next',
    embed_btn_skip: 'Restricted, skip to next',
    click_skip: 'Click to skip track',
    no_score: 'No score recorded yet'
  }
};

/**
 * i18n Manager
 */
export class I18nManager {
  constructor() {
    this.currentLang = this.detectLanguage();
  }

  detectLanguage() {
    // 1. URL Query Parameter (?lang=en or ?hl=en)
    const params = new URLSearchParams(window.location.search);
    const urlLang = params.get('lang') || params.get('hl');
    if (urlLang && (urlLang.startsWith('en') || urlLang === 'en')) return 'en';
    if (urlLang && (urlLang.includes('zh') || urlLang === 'zh-TW')) return 'zh-TW';

    // 2. LocalStorage (priority: 'lang' > 'yt_guesser_lang')
    const stored = localStorage.getItem('lang') || localStorage.getItem('yt_guesser_lang');
    if (stored === 'en' || stored === 'zh-TW') return stored;

    // 3. Browser Navigator Language
    const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (nav.startsWith('zh')) return 'zh-TW';
    if (nav.startsWith('en')) return 'en';

    return 'zh-TW';
  }

  setLanguage(lang) {
    if (lang !== 'zh-TW' && lang !== 'en') return;
    this.currentLang = lang;
    localStorage.setItem('lang', lang);
    localStorage.setItem('yt_guesser_lang', lang);
    this.applyToDOM();
    if (typeof this.onLanguageChange === 'function') {
      this.onLanguageChange(lang);
    }
  }

  toggleLanguage() {
    const next = this.currentLang === 'zh-TW' ? 'en' : 'zh-TW';
    this.setLanguage(next);
    return next;
  }

  t(key, params = {}) {
    const dict = translations[this.currentLang] || translations['zh-TW'];
    let text = dict[key] || translations['zh-TW'][key] || key;
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    return text;
  }

  applyToDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (key) {
        el.textContent = this.t(key);
      }
    });

    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.dataset.i18nHtml;
      if (key) {
        el.innerHTML = this.t(key);
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      if (key) {
        el.placeholder = this.t(key);
      }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      if (key) {
        el.title = this.t(key);
      }
    });

    const langToggleText = document.getElementById('lang-toggle-text');
    if (langToggleText) {
      langToggleText.textContent = this.t('lang_btn');
    }
  }
}

export const i18n = new I18nManager();
