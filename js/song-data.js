// Song Database and Playlist Helper (Dynamic Fetching Architecture)
export const DEFAULT_PLAYLIST_ID = 'PLSFoGAp7QeTQ';
export const DEFAULT_PLAYLIST_TITLE = '零秒猜歌';

// Cloudflare Worker Proxy for YouTube Music Traditional Chinese (zh-TW) resolving
export const WORKER_PROXY_URL = 'https://worker-music-guesser.mag5323.workers.dev';

export const SONG_CATEGORIES = {
  default: {
    id: 'default',
    name: '🔥 零秒猜歌',
    playlistId: DEFAULT_PLAYLIST_ID,
    icon: 'flame',
    description: '熱門華語經典金曲，YouTube Music 官方正版音檔'
  }
};

/**
 * Clean playlist URL: strips tracking parameters like &si=..., &feature=..., etc.
 */
export function cleanPlaylistUrl(urlOrId) {
  if (!urlOrId) return '';
  const str = urlOrId.trim();
  const playlistId = extractPlaylistId(str);
  if (!playlistId) return str;
  if (str.includes('music.youtube.com')) {
    return `https://music.youtube.com/playlist?list=${playlistId}`;
  }
  return `https://www.youtube.com/playlist?list=${playlistId}`;
}

/**
 * Clean video URL: strips tracking parameters like &si=..., &feature=..., etc.
 */
export function cleanVideoUrl(urlOrId) {
  if (!urlOrId) return '';
  const str = urlOrId.trim();
  const videoId = extractVideoId(str);
  if (!videoId) return str;
  if (str.includes('music.youtube.com')) {
    return `https://music.youtube.com/watch?v=${videoId}`;
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Encodes custom songs with Chinese metadata into a URL-friendly compact string.
 * Format: title;id:title:artist:start;id:title:artist:start...
 */
export function encodeSongsPayload(songs, title = '') {
  if (!Array.isArray(songs) || songs.length === 0) return '';
  const sanitizedTitle = (title || '自訂題庫').replace(/[;:|]/g, ' ');
  const parts = songs.map(s => {
    const id = s.id || '';
    const sTitle = (s.title || '').replace(/[;:|]/g, ' ');
    const sArtist = (s.artist || '').replace(/[;:|]/g, ' ');
    const start = s.start || 0;
    return `${id}:${sTitle}:${sArtist}:${start}`;
  });
  return encodeURIComponent(`${sanitizedTitle};${parts.join(';')}`);
}

/**
 * Decodes custom songs payload from URL string.
 */
export function decodeSongsPayload(payloadStr) {
  if (!payloadStr) return null;
  try {
    const raw = decodeURIComponent(payloadStr);
    const segments = raw.split(';');
    if (segments.length === 0) return null;

    let title = '匯入題庫';
    let songParts = segments;

    if (!segments[0].includes(':')) {
      title = segments[0] || '匯入題庫';
      songParts = segments.slice(1);
    }

    const songs = [];
    for (const p of songParts) {
      const bits = p.split(':');
      if (bits.length >= 3 && bits[0]) {
        songs.push({
          id: bits[0].trim(),
          title: bits[1].trim() || '未知曲目',
          artist: bits[2].trim() || 'YouTube Music',
          start: parseFloat(bits[3]) || 0
        });
      }
    }

    if (songs.length > 0) {
      return { title, songs };
    }
  } catch (e) {
    console.warn('Failed to decode songs payload:', e);
  }
  return null;
}

/**
 * Parses offset query param string (e.g. "vg2pgKLBYo4:3,n_rJQv5d3yk:4.5")
 * Returns a map { [videoId]: offsetSeconds }
 */
export function parseOffsets(offsetStr) {
  const map = {};
  if (!offsetStr) return map;
  const parts = offsetStr.split(',');
  for (const part of parts) {
    const [id, sec] = part.split(':');
    if (id && sec !== undefined) {
      const num = parseFloat(sec);
      if (!isNaN(num) && num >= 0) {
        map[id.trim()] = num;
      }
    }
  }
  return map;
}

/**
 * Encodes songs with non-zero offsets into URL-friendly string "id:sec,id:sec"
 */
export function encodeOffsets(songs) {
  if (!Array.isArray(songs)) return '';
  const entries = [];
  for (const s of songs) {
    if (s.id && s.start && s.start > 0) {
      entries.push(`${s.id}:${s.start}`);
    }
  }
  return entries.join(',');
}

/**
 * Applies offset map to a list of songs
 */
export function applyOffsetsToSongs(songs, offsetMap) {
  if (!Array.isArray(songs) || !offsetMap) return songs;
  return songs.map(s => ({
    ...s,
    start: offsetMap[s.id] !== undefined ? offsetMap[s.id] : (s.start || 0)
  }));
}

/**
 * Extracts YouTube Playlist ID from URL or raw ID string, stripping tracking params like &si=...
 */
export function extractPlaylistId(urlOrId) {
  if (!urlOrId) return null;
  const str = urlOrId.trim();

  // Match list query parameter
  const match = str.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
  if (match && match[1]) {
    return match[1];
  }

  // Strip anything after & or ? or # if someone pasted raw ID with params
  const cleanId = str.split(/[?&#]/)[0].trim();
  if (/^(?:PL|RD|OLAK5uy_|VL)[a-zA-Z0-9_-]+$/i.test(cleanId)) {
    return cleanId;
  }

  return null;
}

/**
 * Extracts YouTube / YouTube Music video ID from URL or raw ID string, stripping tracking params.
 */
export function extractVideoId(urlOrId) {
  if (!urlOrId) return null;
  const str = urlOrId.trim();
  
  const matchWatch = str.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (matchWatch && matchWatch[1]) {
    return matchWatch[1];
  }

  const cleanId = str.split(/[?&#]/)[0].trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
    return cleanId;
  }
  return null;
}

/**
 * Fetch video title and author using YouTube oEmbed (No API key needed!)
 */
export async function fetchVideoInfo(videoId, start = 0) {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json&hl=zh-TW`;
    const res = await fetch(oembedUrl);
    if (!res.ok) throw new Error('無法取得影片資訊');
    const data = await res.json();
    let artist = data.author_name || 'YouTube Music';
    artist = artist.replace(/ - Topic$/i, '');
    return {
      id: videoId,
      title: data.title || '未知曲目',
      artist: artist,
      start: Number(start) || 0
    };
  } catch (err) {
    console.warn('oEmbed fetch error:', err);
    return {
      id: videoId,
      title: `歌曲 (${videoId})`,
      artist: '自訂曲目',
      start: Number(start) || 0
    };
  }
}

// High-availability public CORS-friendly Invidious API endpoints
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.flokinet.to',
  'https://yt.artemislena.eu',
  'https://invidious.private.coffee'
];

// In-memory runtime cache
const playlistMemoryCache = new Map();

/**
 * Checks if a string looks purely ASCII/English (i.e. potentially auto-translated by overseas nodes)
 */
function isAsciiOnly(str) {
  if (!str) return true;
  // If contains Han characters, it's Chinese
  return !/[\u4e00-\u9fa5]/.test(str);
}

/**
 * Normalizes song list with YouTube official oEmbed in client's local locale (zh-TW)
 * Only calls oEmbed if the title appears to be translated into English
 */
async function normalizeSongsWithLocale(songs) {
  if (!Array.isArray(songs) || songs.length === 0) return songs;
  
  // Find songs that might have been English-translated
  const tasks = songs.map(async (song) => {
    if (isAsciiOnly(song.title) && song.id) {
      try {
        const info = await fetchVideoInfo(song.id, song.start || 0);
        if (info && info.title && !isAsciiOnly(info.title)) {
          return {
            ...song,
            title: info.title,
            artist: (info.artist || song.artist || '').replace(/ - Topic$/i, '')
          };
        }
      } catch (e) {
        // Keep original if oEmbed fails
      }
    }
    return song;
  });

  return Promise.all(tasks);
}

/**
 * Fetch tracks from a YouTube / YouTube Music playlist with persistent cache and locale normalization.
 * 1. Checks LocalStorage cache (instant 0ms load!)
 * 2. Fetches via Cloudflare Worker (fastest, authentic zh-TW)
 * 3. Fallbacks to Invidious + oEmbed Chinese title repair
 */
export async function fetchPlaylistSongs(playlistId, forceRefresh = false) {
  const cleanId = extractPlaylistId(playlistId) || playlistId;
  const cacheKey = `yt_cache_playlist_${cleanId}`;

  // 1. Check Memory Cache & LocalStorage Cache (0ms instant open!)
  if (!forceRefresh) {
    if (playlistMemoryCache.has(cleanId)) {
      return playlistMemoryCache.get(cleanId);
    }
    try {
      const cachedStr = localStorage.getItem(cacheKey);
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        // Valid if cached within 24 hours
        if (cached && cached.songs && cached.songs.length > 0 && (Date.now() - (cached.timestamp || 0) < 86400000)) {
          playlistMemoryCache.set(cleanId, cached.data);
          return cached.data;
        }
      }
    } catch (e) {
      console.warn('Playlist cache read error:', e);
    }
  }

  let result = null;

  // 2. Try local backend API with native YouTube Music Chinese resolver (serve.py)
  try {
    const res = await fetch(`/api/playlist?list=${encodeURIComponent(cleanId)}&hl=zh-TW`);
    if (res.ok) {
      const data = await res.json();
      if (data.songs && data.songs.length > 0) {
        data.songs = data.songs.map(s => ({
          ...s,
          artist: (s.artist || '').replace(/ - Topic$/i, '')
        }));
        result = data;
      }
    }
  } catch (err) {
    // Local API not running, proceed to Cloudflare Worker proxy
  }

  // 3. Try Cloudflare Worker Proxy (Taiwan/Hong Kong edge, WEB_REMIX zh-TW)
  if (!result) {
    const workerProxy = WORKER_PROXY_URL || localStorage.getItem('yt_guesser_worker_proxy') || window.YTM_WORKER_PROXY;
    if (workerProxy) {
      try {
        const proxyUrl = `${workerProxy.replace(/\/$/, '')}/?list=${encodeURIComponent(cleanId)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) {
          const data = await res.json();
          if (data.songs && data.songs.length > 0) {
            data.songs = data.songs.map(s => ({
              ...s,
              artist: (s.artist || '').replace(/ - Topic$/i, '')
            }));
            result = data;
          }
        }
      } catch (err) {
        console.warn('Worker proxy fetch failed:', err);
      }
    }
  }

  // 4. Fallback: Invidious mirrors + oEmbed zh-TW normalization
  if (!result) {
    for (const instance of INVIDIOUS_INSTANCES) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const url = `${instance}/api/v1/playlists/${encodeURIComponent(cleanId)}?hl=zh-TW&region=TW`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          const videos = data.videos || data.relatedStreams || [];
          if (videos.length > 0) {
            let songs = videos.slice(0, 35).map(v => {
              const author = (v.author || v.uploaderName || 'YouTube Music').replace(/ - Topic$/i, '');
              return {
                id: v.videoId,
                title: v.title || '未知曲目',
                artist: author,
                start: 0
              };
            });

            // Double check: if Invidious gave English titles, normalize with user's local oEmbed!
            songs = await normalizeSongsWithLocale(songs);

            result = {
              success: true,
              title: data.title || '自訂歌單',
              playlist_id: cleanId,
              count: songs.length,
              songs: songs
            };
            break;
          }
        }
      } catch (e) {
        console.warn(`Mirror ${instance} failed, trying next...`, e.message);
      }
    }
  }

  if (result && result.songs && result.songs.length > 0) {
    // Save to Memory & LocalStorage Cache
    playlistMemoryCache.set(cleanId, result);
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        data: result
      }));
    } catch (e) {
      console.warn('Playlist cache write error:', e);
    }
    return result;
  }

  // If network failed but we have expired local cache, use it as emergency offline fallback!
  try {
    const expiredStr = localStorage.getItem(cacheKey);
    if (expiredStr) {
      const expired = JSON.parse(expiredStr);
      if (expired && expired.data && expired.data.songs) {
        console.info('Using stale playlist cache due to network failure');
        return expired.data;
      }
    }
  } catch (e) {}

  throw new Error('無法直接解析此播放清單，請確認：\n1. 歌單是否設為「公開」或「不公開」\n2. 網址是否正確 (需包含 list=PL...)');
}
