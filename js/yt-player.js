/**
 * YouTube IFrame Audio Controller
 * Handles exact sub-second / second audio playback with buffering latency compensation,
 * watchdog timeouts, and audio state reporting.
 */

export class YouTubeAudioEngine {
  constructor(elementId, initialVideoId = 'Bbp9ZaJD_eA') {
    this.elementId = elementId;
    this.initialVideoId = initialVideoId;
    this.player = null;
    this.isReady = false;
    this.currentVideoId = null;
    this.isPlayingSnippet = false;
    this.playbackTimer = null;
    this.snippetWatchdogTimer = null;
    this.activeSnippetListener = null;
    this.pendingTrack = null;
    this.onStateChangeCallbacks = [];
    this.onErrorCallback = null;
    this.onStateUpdateCallback = null;
  }

  /**
   * Initializes the YouTube Iframe API
   */
  async init(videoId = null) {
    if (videoId) {
      this.initialVideoId = videoId;
    }

    return new Promise((resolve) => {
      // If API already available
      if (window.YT && window.YT.Player) {
        this._createPlayer(resolve);
        return;
      }

      // Load IFrame API Script
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

      // Global callback
      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousCallback === 'function') previousCallback();
        this._createPlayer(resolve);
      };
    });
  }

  _createPlayer(resolve) {
    const originConfig = (window.location.origin && window.location.origin !== 'null') 
      ? { origin: window.location.origin } 
      : {};

    this.player = new window.YT.Player(this.elementId, {
      width: '100%',
      height: '100%',
      videoId: this.initialVideoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        disablekb: 1,
        fs: 0,
        rel: 0,
        modestbranding: 1,
        iv_load_policy: 3,
        enablejsapi: 1,
        playsinline: 1,
        ...originConfig
      },
      events: {
        onReady: () => {
          this.isReady = true;
          try {
            this.player.unMute();
            this.player.setVolume(100);
          } catch (e) {}

          // If a track was queued before ready, cue it now
          if (this.pendingTrack) {
            this.loadTrack(this.pendingTrack.videoId, this.pendingTrack.startSeconds);
            this.pendingTrack = null;
          }

          if (typeof this.onStateUpdateCallback === 'function') {
            this.onStateUpdateCallback('ready', 5);
          }

          resolve(this);
        },
        onStateChange: (event) => {
          this._handleStateChange(event);
        },
        onError: (err) => {
          const errCode = err.data;
          const errorMap = {
            2: '無效的影片 ID 或播放參數 (Error 2)',
            5: 'HTML5 播放器錯誤 (Error 5)',
            100: '找不到此影片或影片已被設為私人 (Error 100)',
            101: '此影片作者禁止在第三方外部網站嵌入播放 (Error 101)',
            150: '此影片作者禁止在第三方外部網站嵌入播放 (Error 150)'
          };
          const msg = errorMap[errCode] || `播放錯誤 (${errCode})`;
          console.warn('[YouTube Audio Engine]', msg, err);

          if (typeof this.onErrorCallback === 'function') {
            this.onErrorCallback(errCode, msg);
          }
        }
      }
    });
  }

  _handleStateChange(event) {
    const stateMap = {
      '-1': 'unstarted',
      0: 'ended',
      1: 'playing',
      2: 'paused',
      3: 'buffering',
      5: 'cued'
    };
    const stateName = stateMap[event.data] || 'unknown';

    if (typeof this.onStateUpdateCallback === 'function') {
      this.onStateUpdateCallback(stateName, event.data);
    }

    // Call registered listeners
    const callbacks = [...this.onStateChangeCallbacks];
    callbacks.forEach(cb => cb(event));
  }

  /**
   * Loads a video into the player and cues it ready for playback
   */
  async loadTrack(videoId, startSeconds = 0) {
    if (!videoId) return;
    this.currentVideoId = videoId;
    this.clearPlaybackTimer();

    if (typeof this.onStateUpdateCallback === 'function') {
      this.onStateUpdateCallback('loading', -1);
    }

    // If player is not initialized yet, save to queue
    if (!this.isReady || !this.player || typeof this.player.cueVideoById !== 'function') {
      this.pendingTrack = { videoId, startSeconds };
      return;
    }

    try {
      this.player.cueVideoById({
        videoId: videoId,
        startSeconds: startSeconds
      });
    } catch (err) {
      try {
        this.player.cueVideoById(videoId, startSeconds);
      } catch (e) {
        console.warn('Failed to cue video:', e);
      }
    }
  }

  /**
   * Plays exactly `durationMs` of audio starting from `startSeconds`.
   * Compensates for YouTube buffering latency by timing ONLY after PLAYING event fires.
   * Includes an 8-second watchdog timer to guarantee recovery if YouTube stalls.
   */
  playSnippet(durationMs, startSeconds = 0, onStart, onEnd) {
    if (!this.isReady || !this.player) return;
    
    // Clear any previous running or pending snippet session
    this.clearPlaybackTimer();
    this.isPlayingSnippet = true;

    if (typeof this.onStateUpdateCallback === 'function') {
      this.onStateUpdateCallback('buffering', 3);
    }

    try {
      this.player.unMute();
      this.player.setVolume(100);
      this.player.seekTo(startSeconds, true);
      this.player.playVideo();
    } catch (e) {
      console.warn('Playback start error:', e);
    }

    let hasStarted = false;

    // Watchdog timer: If YouTube fails to fire PLAYING within 8 seconds, abort gracefully
    this.snippetWatchdogTimer = setTimeout(() => {
      if (!hasStarted) {
        console.warn('[YouTube Audio Engine] Buffering watchdog triggered (8s timeout). Resetting state.');
        this.clearPlaybackTimer();
        if (typeof onEnd === 'function') onEnd({ timeout: true });
        if (typeof this.onStateUpdateCallback === 'function') {
          this.onStateUpdateCallback('timeout', -1);
        }
      }
    }, 8000);

    // Listen for the exact moment audio starts playback
    const stateListener = (event) => {
      if (event.data === window.YT.PlayerState.PLAYING && !hasStarted) {
        hasStarted = true;
        if (this.snippetWatchdogTimer) {
          clearTimeout(this.snippetWatchdogTimer);
          this.snippetWatchdogTimer = null;
        }

        const startTime = performance.now();
        if (typeof onStart === 'function') onStart();
        if (typeof this.onStateUpdateCallback === 'function') {
          this.onStateUpdateCallback('playing', 1);
        }

        // High precision loop to stop exactly at durationMs
        const checkStop = () => {
          if (!this.isPlayingSnippet) return;
          const elapsed = performance.now() - startTime;
          if (elapsed >= durationMs) {
            try {
              this.player.pauseVideo();
            } catch (e) {}
            this.clearPlaybackTimer();
            if (typeof onEnd === 'function') onEnd({ timeout: false });
            if (typeof this.onStateUpdateCallback === 'function') {
              this.onStateUpdateCallback('paused', 2);
            }
          } else {
            this.playbackTimer = requestAnimationFrame(checkStop);
          }
        };

        this.playbackTimer = requestAnimationFrame(checkStop);
      }
    };

    this.activeSnippetListener = stateListener;
    this.onStateChangeCallbacks.push(stateListener);
  }

  /**
   * Plays full audio continuously (e.g., when answer is revealed)
   */
  playFull(startSeconds = 0) {
    if (!this.isReady || !this.player) return;
    this.clearPlaybackTimer();
    this.isPlayingSnippet = false;
    try {
      this.player.unMute();
      this.player.setVolume(100);
      if (startSeconds > 0) {
        this.player.seekTo(startSeconds, true);
      }
      this.player.playVideo();
    } catch (e) {
      console.warn('playFull error:', e);
    }
  }

  pause() {
    if (!this.isReady || !this.player) return;
    this.clearPlaybackTimer();
    this.isPlayingSnippet = false;
    try {
      this.player.pauseVideo();
    } catch (e) {}
  }

  clearPlaybackTimer() {
    if (this.playbackTimer) {
      cancelAnimationFrame(this.playbackTimer);
      this.playbackTimer = null;
    }
    if (this.snippetWatchdogTimer) {
      clearTimeout(this.snippetWatchdogTimer);
      this.snippetWatchdogTimer = null;
    }
    if (this.activeSnippetListener) {
      const idx = this.onStateChangeCallbacks.indexOf(this.activeSnippetListener);
      if (idx !== -1) {
        this.onStateChangeCallbacks.splice(idx, 1);
      }
      this.activeSnippetListener = null;
    }
    this.isPlayingSnippet = false;
  }
}
