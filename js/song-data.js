// Song Database and Playlist Helper
export const SONG_CATEGORIES = {
  tanya: {
    id: 'tanya',
    name: '🎸 蔡健雅 寫給別人的歌',
    playlistId: 'PLdIOdhH7DBVw',
    icon: 'music',
    description: '蔡健雅詞曲創作的華語金曲，寫給其他歌手的經典之作',
    songs: [
      { id: 'vg2pgKLBYo4', title: '我不會飛', artist: '張玉華', start: 0 },
      { id: 'n_rJQv5d3yk', title: '保管', artist: '阿桑', start: 0 },
      { id: 'lbYsvfOYMA4', title: 'Miss You Forever', artist: '蕭敬騰', start: 0 },
      { id: '78SESO0YWaU', title: 'Beautiful', artist: '梁靜茹', start: 0 },
      { id: 'bsNO_azAxyk', title: '做自己', artist: '同恩', start: 0 },
      { id: 'HNpxmaBRvuY', title: '幸福的預感', artist: '梁靜茹', start: 0 },
      { id: 'MyOqkT-tbCg', title: '對愛渴望', artist: '楊宗緯', start: 0 },
      { id: '44ZEvw3QBpc', title: '多少', artist: '陳奕迅', start: 0 },
      { id: 'eHnTKwdRFGE', title: '踮起腳尖愛', artist: '洪佩瑜', start: 0 },
      { id: 'B4_yPhpC6s8', title: '無慣例的早晨', artist: '洪佩瑜', start: 0 },
      { id: 'gZ9za2AtUdQ', title: '重來', artist: '黃小琥', start: 0 }
    ]
  },
  acoustic: {
    id: 'acoustic',
    name: '☕ Acoustic x 梁靜茹',
    playlistId: 'PLbbjStBjGd-Q',
    icon: 'headphones',
    description: '純粹溫暖的木吉他與不插電編曲，靜茹治癒系代表作',
    songs: [
      { id: 'wifGxo6zNrE', title: '閃亮的星', artist: '梁靜茹', start: 0 },
      { id: '78SESO0YWaU', title: 'Beautiful', artist: '梁靜茹', start: 0 },
      { id: 'nxZH4oQTumY', title: '序', artist: '梁靜茹', start: 0 },
      { id: 'nTiyzT1ZzE4', title: '半個月亮', artist: '梁靜茹', start: 0 },
      { id: 'HNpxmaBRvuY', title: '幸福的預感', artist: '梁靜茹', start: 0 },
      { id: 'G-ktSFk6-mM', title: 'Tiffany', artist: '梁靜茹', start: 0 },
      { id: 'aYfftI2XGdw', title: '四季', artist: '梁靜茹', start: 0 },
      { id: 'DNOsKKBZbdM', title: '飛魚', artist: '梁靜茹', start: 0 },
      { id: 'Dj5EbFcdlO4', title: '三吋日光', artist: '梁靜茹', start: 0 },
      { id: 'BxyUsIb3HAc', title: '愛情之所以為愛情', artist: '梁靜茹', start: 0 }
    ]
  }
};

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
 * Extracts YouTube Playlist ID from URL or raw ID string.
 */
export function extractPlaylistId(urlOrId) {
  if (!urlOrId) return null;
  const str = urlOrId.trim();

  const match = str.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
  if (match && match[1]) {
    return match[1];
  }

  // Raw playlist ID pattern
  if (/^(?:PL|RD|OLAK5uy_)[a-zA-Z0-9_-]+$/i.test(str)) {
    return str;
  }

  return null;
}

/**
 * Extracts YouTube / YouTube Music video ID from URL or raw ID string.
 */
export function extractVideoId(urlOrId) {
  if (!urlOrId) return null;
  const str = urlOrId.trim();
  
  const matchWatch = str.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (matchWatch && matchWatch[1]) {
    return matchWatch[1];
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }
  return null;
}

/**
 * Fetch video title and author using YouTube oEmbed (No API key needed!)
 */
export async function fetchVideoInfo(videoId, start = 0) {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
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

/**
 * Fetch tracks from a YouTube / YouTube Music playlist.
 * 100% Serverless & Pure JS: Works on GitHub Pages without Python!
 */
export async function fetchPlaylistSongs(playlistId) {
  // 1. Check if it's one of the built-in preset playlists first (instant load)
  for (const key of Object.keys(SONG_CATEGORIES)) {
    if (SONG_CATEGORIES[key].playlistId === playlistId) {
      return {
        success: true,
        title: SONG_CATEGORIES[key].name,
        playlist_id: playlistId,
        count: SONG_CATEGORIES[key].songs.length,
        songs: SONG_CATEGORIES[key].songs
      };
    }
  }

  // 2. Try local backend API if available (e.g., local serve.py)
  try {
    const res = await fetch(`/api/playlist?list=${encodeURIComponent(playlistId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.songs && data.songs.length > 0) {
        data.songs = data.songs.map(s => ({
          ...s,
          artist: (s.artist || '').replace(/ - Topic$/i, '')
        }));
        return data;
      }
    }
  } catch (err) {
    // Local API not running, proceed to serverless client-side fetchers
  }

  // 3. Client-Side Serverless Fetcher: Query Invidious API mirrors (No CORS issue, returns clean JSON)
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const url = `${instance}/api/v1/playlists/${encodeURIComponent(playlistId)}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const videos = data.videos || data.relatedStreams || [];
        if (videos.length > 0) {
          const songs = videos.slice(0, 35).map(v => {
            const author = (v.author || v.uploaderName || 'YouTube Music').replace(/ - Topic$/i, '');
            return {
              id: v.videoId,
              title: v.title || '未知曲目',
              artist: author,
              start: 0
            };
          });

          return {
            success: true,
            title: data.title || '匯入歌單',
            playlist_id: playlistId,
            count: songs.length,
            songs: songs
          };
        }
      }
    } catch (e) {
      console.warn(`Mirror ${instance} failed, trying next...`, e.message);
    }
  }

  throw new Error('無法直接解析此播放清單，請確認：\n1. 歌單是否設為「公開」或「不公開」\n2. 網址是否正確 (需包含 list=PL...)');
}
