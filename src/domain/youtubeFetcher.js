const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+999; SOCS=CAISHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzIaAmVuIAEaBgiAo_CmBg',
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

function parseRelativePublishDate(rawText = '') {
  const s = String(rawText || '').trim().toLowerCase();
  if (!s) return undefined;
  const m = s.match(/(\d+)\s*(hour|hr|h|day|d|week|wk|w|month|mo|year|yr|y)/i);
  if (!m) return undefined;
  const amount = Number(m[1]) || 0;
  const unit = m[2].toLowerCase();
  if (amount <= 0) return undefined;
  const d = new Date();
  if (unit.startsWith('h')) {
    d.setHours(d.getHours() - amount);
  } else if (unit.startsWith('d')) {
    d.setDate(d.getDate() - amount);
  } else if (unit.startsWith('w')) {
    d.setDate(d.getDate() - amount * 7);
  } else if (unit.startsWith('m')) {
    d.setMonth(d.getMonth() - amount);
  } else if (unit.startsWith('y')) {
    d.setFullYear(d.getFullYear() - amount);
  }
  return d.toISOString().slice(0, 10);
}

function collectVideoRenderers(node, list = []) {
  if (!node || typeof node !== 'object' || list.length >= 500) return list;
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
    const pubText =
      vr.publishedTimeText?.simpleText ||
      vr.publishedTimeText?.runs?.[0]?.text ||
      '';
    const views = parseCompactNumber(viewText);
    const publishedAt = parseRelativePublishDate(pubText);
    if (!list.some((x) => x.youtubeVideoId === vr.videoId)) {
      list.push({
        youtubeVideoId: vr.videoId,
        title,
        views,
        publishedAt,
        publishedText: pubText,
        likes: Math.max(10, Math.round(views * 0.042)),
        comments: Math.max(2, Math.round(views * 0.004)),
      });
    }
    return list;
  }
  if (node.lockupViewModel && node.lockupViewModel.contentId) {
    const lvm = node.lockupViewModel;
    const videoId = String(lvm.contentId || '').trim();
    if (
      videoId &&
      (!lvm.contentType ||
        lvm.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' ||
        lvm.contentType === 'LOCKUP_CONTENT_TYPE_SHORTS') &&
      !list.some((x) => x.youtubeVideoId === videoId)
    ) {
      const lMeta = lvm.metadata?.lockupMetadataViewModel;
      const title =
        lMeta?.title?.content ||
        lvm.rendererContext?.accessibilityContext?.label ||
        'Video YouTube';
      const rows = lMeta?.metadata?.contentMetadataViewModel?.metadataRows || [];
      let views = 0;
      let publishedAt;
      for (const row of rows) {
        for (const part of row.metadataParts || []) {
          const text = String(part?.text?.content || '').trim();
          const a11y = String(part?.accessibilityLabel || '').trim();
          if (
            /view|lượt xem/i.test(a11y) ||
            /view|lượt xem/i.test(text) ||
            part?.leadingIcon?.name === 'PLAY_ARROW_OUTLINED'
          ) {
            views = Math.max(views, parseCompactNumber(text || a11y));
          } else if (/ago|trước/i.test(text) || /ago|trước/i.test(a11y)) {
            publishedAt = publishedAt || parseRelativePublishDate(text || a11y);
          } else if (!views && /^[\d.,]+\s*[KMBNTr]?$/i.test(text)) {
            views = parseCompactNumber(text);
          }
        }
      }
      list.push({
        youtubeVideoId: videoId,
        title,
        views,
        publishedAt,
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
  if (node.shortsLockupViewModel) {
    const sl = node.shortsLockupViewModel;
    const videoId =
      sl.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId ||
      sl.entityId?.replace(/^shorts-shelf-item-/, '') ||
      '';
    if (videoId && !list.some((x) => x.youtubeVideoId === videoId)) {
      const title =
        sl.overlayMetadata?.primaryText?.content ||
        sl.accessibilityText?.split(',')?.[0] ||
        'YouTube Short';
      const viewText = sl.overlayMetadata?.secondaryText?.content || '0';
      const views = parseCompactNumber(viewText);
      list.push({
        youtubeVideoId: videoId,
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
      if (list.length >= 500) break;
    }
  }
  return list;
}

function findContinuationToken(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.continuationItemRenderer) {
    const token =
      node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ||
      node.continuationItemRenderer?.continuationEndpoint?.commandExecutorCommand?.commands?.find(
        (c) => c.continuationCommand?.token
      )?.continuationCommand?.token;
    if (token) return token;
  }
  for (const val of Object.values(node)) {
    if (val && typeof val === 'object') {
      const found = findContinuationToken(val);
      if (found) return found;
    }
  }
  return null;
}

async function fetchMoreContinuationVideos(initialContents, existingList = [], maxPages = 4) {
  let token = findContinuationToken(initialContents);
  let page = 0;
  while (token && page < maxPages && existingList.length < 500) {
    page += 1;
    try {
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
          continuation: token,
        }),
      });
      if (!res.ok) break;
      const data = await res.json();
      const before = existingList.length;
      collectVideoRenderers(data, existingList);
      if (existingList.length === before) break;
      token = findContinuationToken(data.onResponseReceivedActions || data);
    } catch {
      break;
    }
  }
  return existingList;
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
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(externalId)}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(rssUrl, { headers: DEFAULT_HEADERS });
      if (!res.ok) continue;
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
      if (list.length > 0) break;
    } catch {
      // Bỏ qua nếu RSS không phản hồi
    }
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
  await fetchMoreContinuationVideos(initialData?.contents, pageVideos, 5);

  const expectedCount = totalVideos || aboutMetrics.totalVideos || 0;
  if (expectedCount > pageVideos.length) {
    try {
      const shortsRes = await fetch(`${channelUrl}/shorts`, { headers: DEFAULT_HEADERS });
      if (shortsRes.ok) {
        const shortsHtml = await shortsRes.text();
        const shortsMatch = shortsHtml.match(/var ytInitialData = (\{.*?\});<\/script>/);
        if (shortsMatch) {
          const shortsData = JSON.parse(shortsMatch[1]);
          collectVideoRenderers(shortsData, pageVideos);
        }
      }
    } catch {
      // Bỏ qua nếu tab Shorts không có dữ liệu
    }
  }

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
  const rawKeywordsStr = String(meta.keywords || '').trim();
  const channelKeywords = rawKeywordsStr
    ? (rawKeywordsStr.match(/"[^"]+"|[^\s,]+/g) || [])
        .map((s) => s.replace(/^"+|"+$/g, '').trim())
        .filter((s) => s.length >= 2)
        .slice(0, 25)
    : [];
  const category = inferChannelCategory({
    name: meta.title,
    handle: cleanHandle,
    description,
    keywords: rawKeywordsStr,
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
    channelKeywords,
    videos,
    topVideos,
  };
}

function collectSearchVideoRenderers(node, list = []) {
  if (!node || typeof node !== 'object' || list.length >= 40) return list;
  if (node.videoRenderer && node.videoRenderer.videoId) {
    const vr = node.videoRenderer;
    const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || 'Video YouTube';
    const viewText = vr.viewCountText?.simpleText || vr.viewCountText?.runs?.[0]?.text || '0';
    const pubText = vr.publishedTimeText?.simpleText || vr.publishedTimeText?.runs?.[0]?.text || '';
    const ownerRun = vr.ownerText?.runs?.[0] || vr.longBylineText?.runs?.[0] || {};
    const channelName = String(ownerRun.text || 'YouTube Channel').trim();
    const browseUrl =
      ownerRun.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ||
      ownerRun.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url ||
      '';
    const handleMatch = String(browseUrl).match(/\/(@[^/?#]+)/);
    const channelHandle = handleMatch
      ? decodeURIComponent(handleMatch[1])
      : `@${channelName.replace(/\s+/g, '')}`;
    const channelUrl = browseUrl
      ? `https://www.youtube.com${browseUrl}`
      : `https://www.youtube.com/${channelHandle}`;
    const views = parseCompactNumber(viewText);
    const publishedAt = parseRelativePublishDate(pubText);
    if (!list.some((x) => x.youtubeVideoId === vr.videoId)) {
      list.push({
        youtubeVideoId: vr.videoId,
        videoId: vr.videoId,
        title,
        views,
        publishedAt,
        publishedText: pubText,
        channelName,
        channelHandle,
        channelUrl,
      });
    }
    return list;
  }
  for (const val of Object.values(node)) {
    if (val && typeof val === 'object') {
      collectSearchVideoRenderers(val, list);
      if (list.length >= 40) break;
    }
  }
  return list;
}

export async function fetchYouTubeNicheExplorer(nicheQuery = '') {
  const q = String(nicheQuery || '').trim();
  if (!q) return { videos: [], channels: [] };
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  const res = await fetch(searchUrl, { headers: DEFAULT_HEADERS });
  if (!res.ok) return { videos: [], channels: [] };
  const html = await res.text();
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/);
  if (!match) return { videos: [], channels: [] };

  const initialData = JSON.parse(match[1]);
  const videos = collectSearchVideoRenderers(initialData, []);

  const channelMap = new Map();
  for (const v of videos) {
    const key = (v.channelHandle || v.channelName || '').toLowerCase();
    if (!key) continue;
    if (!channelMap.has(key)) {
      channelMap.set(key, {
        channelName: v.channelName,
        handle: v.channelHandle,
        channelUrl: v.channelUrl,
        videoCountInTop: 0,
        totalViewsInTop: 0,
        bestVideoTitle: v.title,
        bestVideoViews: v.views,
      });
    }
    const ch = channelMap.get(key);
    ch.videoCountInTop += 1;
    ch.totalViewsInTop += Number(v.views) || 0;
    if ((Number(v.views) || 0) > ch.bestVideoViews) {
      ch.bestVideoViews = Number(v.views) || 0;
      ch.bestVideoTitle = v.title;
    }
  }

  const channels = [...channelMap.values()]
    .sort((a, b) => b.totalViewsInTop - a.totalViewsInTop || b.videoCountInTop - a.videoCountInTop)
    .slice(0, 8);

  return {
    query: q,
    videos,
    channels,
  };
}



