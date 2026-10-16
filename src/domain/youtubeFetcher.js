const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

export function parseCompactNumber(rawText = '') {
  const str = String(rawText || '').trim();
  if (!str) return 0;

  // Ví dụ: "151K subscribers", "1.25M subscribers", "48,950 views", "248 N người đăng ký", "1,2 Tr"
  const compactMatch = str.match(/([\d.,]+)\s*(K|M|B|N|Tr|T)?/i);
  if (!compactMatch) return 0;

  let numStr = compactMatch[1];
  const suffix = (compactMatch[2] || '').toUpperCase();

  if (suffix) {
    // Có hậu tố K/M/B/N/Tr -> dấu phẩy hoặc chấm là phần thập phân
    numStr = numStr.replace(',', '.');
    const base = parseFloat(numStr);
    if (!Number.isFinite(base)) return 0;
    if (suffix === 'K' || suffix === 'N') return Math.round(base * 1_000);
    if (suffix === 'M' || suffix === 'TR') return Math.round(base * 1_000_000);
    if (suffix === 'B' || suffix === 'T') return Math.round(base * 1_000_000_000);
    return Math.round(base);
  }

  // Không có hậu tố -> dấu phẩy/chấm là phân tách hàng nghìn ("48,950 views")
  const digitsOnly = numStr.replace(/[^\d]/g, '');
  return Number(digitsOnly) || 0;
}

export function normalizeChannelTargetUrl(query = '') {
  const q = String(query || '').trim();
  if (!q) return null;

  if (/^https?:\/\//i.test(q)) {
    const clean = q.replace(/\/+$/, '').replace(/\/(videos|featured|shorts|streams)$/i, '');
    return `${clean}/videos`;
  }

  if (q.startsWith('@')) {
    return `https://www.youtube.com/${encodeURIComponent(q).replace(/^%40/, '@')}/videos`;
  }

  if (/^UC[\w-]{20,}$/.test(q)) {
    return `https://www.youtube.com/channel/${q}/videos`;
  }

  const slug = q.replace(/\s+/g, '');
  return `https://www.youtube.com/@${encodeURIComponent(slug)}/videos`;
}

function collectVideoRenderers(node, list = []) {
  if (!node || typeof node !== 'object' || list.length >= 200) return list;
  if (node.videoRenderer && node.videoRenderer.videoId) {
    const vr = node.videoRenderer;
    const title =
      vr.title?.runs?.[0]?.text ||
      vr.title?.simpleText ||
      'Video YouTube';
    const viewText =
      vr.viewCountText?.simpleText ||
      vr.viewCountText?.runs?.[0]?.text ||
      '0';
    const views = parseCompactNumber(viewText);
    if (!list.some((x) => x.youtubeVideoId === vr.videoId)) {
      list.push({
        youtubeVideoId: vr.videoId,
        title,
        views,
        likes: Math.max(10, Math.round(views * 0.042)),
        comments: Math.max(2, Math.round(views * 0.004)),
      });
    }
    return list;
  }
  if (node.reelItemRenderer && node.reelItemRenderer.videoId) {
    const rr = node.reelItemRenderer;
    const title = rr.headline?.simpleText || rr.headline?.runs?.[0]?.text || 'YouTube Short';
    const viewText = rr.viewCountText?.simpleText || rr.viewCountText?.runs?.[0]?.text || '0';
    const views = parseCompactNumber(viewText);
    if (!list.some((x) => x.youtubeVideoId === rr.videoId)) {
      list.push({
        youtubeVideoId: rr.videoId,
        title,
        views,
        likes: Math.max(10, Math.round(views * 0.042)),
        comments: Math.max(2, Math.round(views * 0.004)),
      });
    }
    return list;
  }
  for (const val of Object.values(node)) {
    if (val && typeof val === 'object') {
      collectVideoRenderers(val, list);
      if (list.length >= 200) break;
    }
  }
  return list;
}

function extractHandleAndSubscribers(initialData, fallbackHandle) {
  let handle = fallbackHandle || '';
  let subscribers = 0;
  let totalVideos = 0;

  const vanity = initialData?.metadata?.channelMetadataRenderer?.vanityChannelUrl || '';
  const vanityMatch = vanity.match(/\/(@[^/]+)$/);
  if (vanityMatch) {
    handle = vanityMatch[1];
  }

  const rows =
    initialData?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.metadata
      ?.contentMetadataViewModel?.metadataRows || [];

  for (const row of rows) {
    for (const part of row.metadataParts || []) {
      const text = part?.text?.content || '';
      if (text.startsWith('@') && !handle) {
        handle = text.trim();
      }
      if (/subscriber|người đăng ký/i.test(text)) {
        subscribers = parseCompactNumber(text);
      }
      if (/video/i.test(text)) {
        totalVideos = parseCompactNumber(text);
      }
    }
  }

  if (!subscribers) {
    const legacySub =
      initialData?.header?.c4TabbedHeaderRenderer?.subscriberCountText?.simpleText || '';
    if (legacySub) subscribers = parseCompactNumber(legacySub);
  }

  return { handle, subscribers, totalVideos };
}

async function fetchChannelAboutMetrics(initialData) {
  try {
    const headerStr = JSON.stringify(initialData?.header || {});
    const tokenMatch = headerStr.match(/"continuationCommand":\{"token":"([^"]+)"/);
    if (!tokenMatch) return { totalViews: 0, subscribers: 0, totalVideos: 0 };

    const res = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20241015.01.00',
          },
        },
        continuation: tokenMatch[1],
      }),
    });
    if (!res.ok) return { totalViews: 0, subscribers: 0, totalVideos: 0 };

    const raw = await res.text();
    const viewCountRaw = raw.match(/"viewCountText":"([^"]+)"/)?.[1] || '';
    const subCountRaw = raw.match(/"subscriberCountText":"([^"]+)"/)?.[1] || '';
    const videoCountRaw = raw.match(/"videoCountText":"([^"]+)"/)?.[1] || '';

    return {
      totalViews: parseCompactNumber(viewCountRaw),
      subscribers: parseCompactNumber(subCountRaw),
      totalVideos: parseCompactNumber(videoCountRaw),
    };
  } catch {
    return { totalViews: 0, subscribers: 0, totalVideos: 0 };
  }
}

async function fetchRssVideos(externalId) {
  const list = [];
  if (!externalId) return list;
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(externalId)}`;
    const res = await fetch(rssUrl, { headers: DEFAULT_HEADERS });
    if (!res.ok) return list;
    const xml = await res.text();
    const entries = xml.split('<entry>').slice(1);
    for (const entry of entries) {
      const idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
      const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
      const pubMatch = entry.match(/<published>(\d{4}-\d{2}-\d{2})/);
      const viewsMatch = entry.match(/<media:statistics views="(\d+)"/);
      const ratingMatch = entry.match(/<media:starRating count="(\d+)"/);
      if (idMatch) {
        const views = viewsMatch ? Number(viewsMatch[1]) : 0;
        const likes = ratingMatch ? Number(ratingMatch[1]) : Math.max(10, Math.round(views * 0.035));
        list.push({
          youtubeVideoId: idMatch[1].trim(),
          title: titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim() : 'Video YouTube',
          publishedAt: pubMatch ? pubMatch[1] : undefined,
          views,
          likes,
          comments: Math.max(2, Math.round(likes * 0.08)),
        });
      }
    }
  } catch {
    // Bỏ qua nếu RSS không phản hồi
  }
  return list;
}

const NICHE_RULES = [
  {
    category: 'Du lịch & Khám phá',
    keywords: [
      'travel',
      'du lịch',
      'destination',
      'destinations',
      'explore',
      'planet',
      'journey',
      'tour',
      'world',
      'nature',
      'scenic',
      'landscape',
      'adventure',
      'phượt',
      'khám phá',
    ],
  },
  {
    category: 'Văn hóa & Âm nhạc',
    keywords: [
      'culture',
      'văn hóa',
      'music',
      'âm nhạc',
      'song',
      'book',
      'language',
      'vietnamese',
      'melody',
      'playlist',
      'acoustic',
      'lofi',
      'ca nhạc',
      'nhạc',
    ],
  },
  {
    category: 'Công nghệ & Đánh giá',
    keywords: [
      'tech',
      'công nghệ',
      'laptop',
      'smartphone',
      'ai ',
      'review',
      'đánh giá',
      'hardware',
      'coding',
      'software',
      'gadget',
    ],
  },
  {
    category: 'Gaming & Esports',
    keywords: [
      'gaming',
      'game',
      'esports',
      'stream',
      'playthrough',
      'minecraft',
      'valorant',
      'roblox',
      'ps5',
      'liên quân',
    ],
  },
  {
    category: 'Kinh doanh & Tài chính',
    keywords: [
      'business',
      'kinh doanh',
      'finance',
      'tài chính',
      'invest',
      'đầu tư',
      'marketing',
      'crm',
      'khởi nghiệp',
      'money',
      'chứng khoán',
      'crypto',
      'bất động sản',
    ],
  },
  {
    category: 'Ẩm thực & Đời sống',
    keywords: [
      'food',
      'ẩm thực',
      'cooking',
      'nấu ăn',
      'recipe',
      'kitchen',
      'mukbang',
      'street food',
      'món ngon',
      'lifestyle',
      'vlog',
      'đời sống',
    ],
  },
  {
    category: 'Giáo dục & Kiến thức',
    keywords: [
      'education',
      'giáo dục',
      'academy',
      'học',
      'learn',
      'science',
      'khoa học',
      'history',
      'lịch sử',
      'documentary',
      'podcast',
      'kiến thức',
    ],
  },
  {
    category: 'Sức khỏe & Thể thao',
    keywords: [
      'fitness',
      'gym',
      'health',
      'sức khỏe',
      'yoga',
      'workout',
      'sport',
      'thể thao',
      'bóng đá',
    ],
  },
  {
    category: 'Phim ảnh & Giải trí',
    keywords: [
      'movie',
      'film',
      'phim',
      'anime',
      'animation',
      'hoạt hình',
      'entertainment',
      'giải trí',
      'comedy',
      'hài',
    ],
  },
];

export function inferChannelCategory({
  name = '',
  handle = '',
  description = '',
  keywords = '',
  videos = [],
} = {}) {
  const videoTitles = Array.isArray(videos) ? videos.map((v) => v.title || '').join(' ') : '';
  const corpus = `${name} ${handle} ${description} ${keywords} ${videoTitles}`.toLowerCase();

  let bestCategory = '';
  let bestScore = 0;

  for (const rule of NICHE_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (corpus.includes(kw)) {
        score += name.toLowerCase().includes(kw) ? 3 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
    }
  }

  return bestCategory || 'Giải trí & Nội dung số';
}

export async function fetchYouTubeChannelProfile(rawQuery) {
  const targetUrl = normalizeChannelTargetUrl(rawQuery);
  if (!targetUrl) return null;

  const res = await fetch(targetUrl, { headers: DEFAULT_HEADERS });
  if (!res.ok) {
    return null;
  }
  const html = await res.text();
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/);
  if (!match) return null;

  const initialData = JSON.parse(match[1]);
  const meta = initialData?.metadata?.channelMetadataRenderer;
  if (!meta || !meta.title) return null;

  const { handle, subscribers, totalVideos } = extractHandleAndSubscribers(initialData, '');
  const externalId = meta.externalId || '';
  const cleanHandle = handle || `@${meta.title.replace(/\s+/g, '')}`;
  const channelUrl = `https://www.youtube.com/${cleanHandle}`;

  const [rssVideos, aboutMetrics] = await Promise.all([
    fetchRssVideos(externalId),
    fetchChannelAboutMetrics(initialData),
  ]);
  const pageVideos = collectVideoRenderers(initialData, []);

  // Ưu tiên danh sách từ RSS Feed (có ngày đăng và lượt xem chính xác từ YouTube XML) kết hợp pageVideos
  const mergedMap = new Map();
  for (const v of [...rssVideos, ...pageVideos]) {
    const prev = mergedMap.get(v.youtubeVideoId);
    if (!prev) {
      mergedMap.set(v.youtubeVideoId, { ...v });
    } else {
      mergedMap.set(v.youtubeVideoId, {
        ...prev,
        views: Math.max(prev.views || 0, v.views || 0),
        likes: Math.max(prev.likes || 0, v.likes || 0),
        publishedAt: prev.publishedAt || v.publishedAt,
      });
    }
  }

  const allMerged = [...mergedMap.values()];
  const publishedDates = allMerged
    .map((v) => v.publishedAt)
    .filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const firstVideoDate = publishedDates[0] || '';

  const videos = allMerged;
  const topVideos = [...videos]
    .sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0))
    .slice(0, 3);
  const sumVideoViews = videos.reduce((sum, v) => sum + (Number(v.views) || 0), 0);
  const totalViews = Math.max(aboutMetrics.totalViews || 0, sumVideoViews);
  const finalSubscribers = Math.max(subscribers || 0, aboutMetrics.subscribers || 0);
  const finalTotalVideos = totalVideos || aboutMetrics.totalVideos || videos.length;

  const description = String(meta.description || '').trim();
  const category = inferChannelCategory({
    name: meta.title,
    handle: cleanHandle,
    description,
    keywords: String(meta.keywords || ''),
    videos,
  });

  return {
    name: meta.title,
    handle: cleanHandle,
    channelUrl,
    externalId,
    subscribers: finalSubscribers,
    totalViews,
    totalVideos: finalTotalVideos,
    firstVideoDate,
    category,
    description,
    videos,
    topVideos,
  };
}


