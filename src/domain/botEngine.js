import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fetchYouTubeChannelProfile, inferChannelCategory } from './youtubeFetcher.js';

const MAX_SAVED_SNAPSHOTS = 10;
const MAX_COMPETITOR_SCANS = 12;
const MAX_THUMBNAIL_CLONES = 15;
const MAX_TREND_SCANS = 12;

export function getDefaultBotConfig() {
  return {
    // Bot 1: Telegram Admin Center (@acb9xbot)
    telegramEnabled: true,
    telegramBotToken:
      process.env.TELEGRAM_BOT_TOKEN || '8835900254:AAFI4azbjysINfBn6jh-s6YG85G9KkivoxU',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '723401181',
    notifyOnNewUser: true,
    notifyOnViralVideo: true,
    autoTelegramBackupDaily: true,
    lastTelegramReportAt: null,
    lastTelegramUpdateId: 0,

    // Bot 2: Viral & Outlier Watchdog
    watchdogEnabled: true,
    outlierThreshold: 1.5, // Gấp 1.5x trung bình kênh trở lên
    minViralViews: 500,
    staleDaysThreshold: 5, // Quá 5 ngày chưa ra video mới
    lastWatchdogScanAt: null,

    // Bot 3: Dead-Channel & Schedule Reminder Bot (Nhắc lịch đăng video)
    scheduleBotEnabled: true,
    targetUploadEveryDays: 2, // Chu kỳ chuẩn: 2 ngày phải ra 1 video mới
    deadChannelDays: 5, // Quá 5 ngày không đăng = Kênh bỏ quên (Dead/Stale)
    autoTelegramScheduleDaily: true,
    lastScheduleScanAt: null,

    // Bot 4: Auto-Backup Cloud & Immortal Snapshot
    autoBackupEnabled: true,
    cloudBackupWebhookUrl: '',
    lastBackupAt: null,
    lastCloudSyncStatus: '',

    // Bot 5: Outlier / NexLev Competitor Hunter Bot
    competitorMinOutlier: 1.3,
    lastCompetitorScanAt: null,

    // Bot 6: Thumbnail Clone & Prompt Generator Bot
    defaultThumbnailStyle: 'viral_3d',
    lastThumbnailCloneAt: null,

    // Bot 7 (Bot 9): YouTube Search Trend Hunter Bot (/trend)
    defaultTrendMarket: 'vi',
    lastTrendScanAt: null,

    // Bot 11: Monetization & AdSense Shield Bot (/ga & /revenue)
    maxChannelsPerGa: 3, // Cảnh báo khi 1 Gà AdSense gánh từ 3 kênh trở lên
    bktAlertThresholdPct: 70, // Báo tin vui khi kênh đạt >= 70% điều kiện BKT (1000 sub & 4000h)
    lastAdSenseScanAt: null,

    // Bot 12: Cloud Report Sync Bot (Notion / Google Sheets / Cloud CSV)
    cloudReportWebhookUrl: '',
    autoCloudReportDaily: true,
    lastCloudReportSyncAt: null,
    lastCloudReportStatus: '',
  };
}

export function ensureBotCenterState(meta = {}) {
  const defaults = getDefaultBotConfig();
  if (!meta.botCenter || typeof meta.botCenter !== 'object') {
    meta.botCenter = {
      config: defaults,
      snapshots: [],
      competitorScans: [],
      thumbnailClones: [],
      trendScans: [],
      notifiedViralVideoIds: [],
      activityLogs: [],
    };
  }
  meta.botCenter.config = {
    ...defaults,
    ...(meta.botCenter.config || {}),
  };
  if (!meta.botCenter.config.telegramBotToken) {
    meta.botCenter.config.telegramBotToken = defaults.telegramBotToken;
    meta.botCenter.config.telegramEnabled = true;
  }
  if (!meta.botCenter.config.telegramChatId) {
    meta.botCenter.config.telegramChatId = defaults.telegramChatId;
  }
  if (!Array.isArray(meta.botCenter.snapshots)) {
    meta.botCenter.snapshots = [];
  }
  if (!Array.isArray(meta.botCenter.competitorScans)) {
    meta.botCenter.competitorScans = [];
  }
  if (!Array.isArray(meta.botCenter.thumbnailClones)) {
    meta.botCenter.thumbnailClones = [];
  }
  if (!Array.isArray(meta.botCenter.trendScans)) {
    meta.botCenter.trendScans = [];
  }
  if (!Array.isArray(meta.botCenter.notifiedViralVideoIds)) {
    meta.botCenter.notifiedViralVideoIds = [];
  }
  if (!Array.isArray(meta.botCenter.activityLogs)) {
    meta.botCenter.activityLogs = [];
  }
  return meta.botCenter;
}

export function appendBotLog(meta, botName, message, level = 'info') {
  const center = ensureBotCenterState(meta);
  center.activityLogs.unshift({
    id: `log-${crypto.randomUUID().slice(0, 8)}`,
    botName,
    message: String(message || ''),
    level,
    createdAt: new Date().toISOString(),
  });
  if (center.activityLogs.length > 40) {
    center.activityLogs.length = 40;
  }
}

// ============================================================================
// BOT 2: VIRAL & OUTLIER WATCHDOG BOT (CANH VIDEO NỔ VIEW & SỨC KHỎE KÊNH 24/7)
// ============================================================================
export function scanViralAndChannelHealth(store, customOptions = {}) {
  const center = ensureBotCenterState(store.state.meta);
  const cfg = center.config;
  const outlierThreshold = Number(customOptions.outlierThreshold ?? cfg.outlierThreshold) || 1.5;
  const minViralViews = Number(customOptions.minViralViews ?? cfg.minViralViews) || 100;
  const staleDaysThreshold = Number(customOptions.staleDaysThreshold ?? cfg.staleDaysThreshold) || 5;

  const channels = store.state.channels || [];
  const allVideos = store.state.videos || [];
  const channelMap = new Map(channels.map((ch) => [ch.id, ch]));

  // Tính trung bình view của từng kênh (từ cả danh sách videos và topVideos)
  const channelVideosListMap = new Map();
  for (const ch of channels) {
    const fromStore = allVideos.filter((v) => v.channelId === ch.id);
    const mergedMap = new Map();
    for (const v of fromStore) {
      const key = v.youtubeVideoId || v.id || v.title;
      mergedMap.set(key, {
        id: v.id || key,
        youtubeVideoId: v.youtubeVideoId || '',
        title: v.title || 'Video YouTube',
        views: Number(v.currentViews ?? v.views) || 0,
        publishedAt: v.publishedAt || v.lastUpdatedDate || '',
        channelId: ch.id,
      });
    }
    if (Array.isArray(ch.topVideos)) {
      for (const tv of ch.topVideos) {
        const key = tv.youtubeVideoId || tv.id || tv.title;
        if (!mergedMap.has(key)) {
          mergedMap.set(key, {
            id: tv.id || `tv-${key}`,
            youtubeVideoId: tv.youtubeVideoId || '',
            title: tv.title || 'Video YouTube',
            views: Number(tv.views ?? tv.currentViews) || 0,
            publishedAt: tv.publishedAt || '',
            channelId: ch.id,
          });
        }
      }
    }
    channelVideosListMap.set(ch.id, [...mergedMap.values()]);
  }

  const viralVideos = [];
  const channelAlerts = [];
  const nowMs = Date.now();

  for (const ch of channels) {
    const chVids = channelVideosListMap.get(ch.id) || [];
    const totalVidsCount = Math.max(chVids.length, Number(ch.totalVideos) || 0, 1);
    const sumShownViews = chVids.reduce((s, v) => s + (Number(v.views) || 0), 0);
    const avgViews =
      chVids.length > 0
        ? Math.max(1, Math.round(sumShownViews / chVids.length))
        : Math.max(1, Math.round((Number(ch.totalViews) || 0) / totalVidsCount));

    // Tìm các video nổ view (Outlier)
    for (const v of chVids) {
      const views = Number(v.views) || 0;
      if (views < minViralViews) continue;
      const multiplier = Math.round((views / avgViews) * 10) / 10;
      if (multiplier >= outlierThreshold || views >= avgViews * 1.5) {
        viralVideos.push({
          id: v.id,
          youtubeVideoId: v.youtubeVideoId,
          title: v.title,
          views,
          publishedAt: v.publishedAt || '',
          channelId: ch.id,
          channelName: ch.name,
          channelHandle: ch.handle || '',
          group: ch.group || 'Chưa gắn Group',
          manager: ch.managerEmail || ch.manager || 'Chưa gán QL',
          channelAvgViews: avgViews,
          outlierMultiplier: multiplier,
          url: v.youtubeVideoId
            ? `https://www.youtube.com/watch?v=${encodeURIComponent(v.youtubeVideoId)}`
            : ch.channelUrl || '#',
          videoUrl: v.youtubeVideoId
            ? `https://www.youtube.com/watch?v=${encodeURIComponent(v.youtubeVideoId)}`
            : ch.channelUrl || '#',
        });
      }
    }

    // Kiểm tra sức khỏe kênh (BKT / gậy / lâu chưa đăng video)
    if (ch.status === 'warning' || ch.status === 'demonetized' || Number(ch.strikeCount) > 0) {
      channelAlerts.push({
        channelId: ch.id,
        channelName: ch.name,
        group: ch.group || 'Chưa gắn Group',
        manager: ch.managerEmail || ch.manager || '',
        type: 'status_warning',
        severity: ch.status === 'demonetized' ? 'danger' : 'warning',
        message:
          ch.status === 'demonetized'
            ? `⛔ Kênh "${ch.name}" đang ở trạng thái Tắt BKT (Demonetized)!`
            : `⚠️ Kênh "${ch.name}" đang có cảnh báo (${ch.strikeCount || 1} gậy / Warning)!`,
      });
    }

    const datedVids = chVids
      .map((v) => v.publishedAt)
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a));
    const latestVideoDate = datedVids[0] || ch.firstVideoDate || '';
    if (latestVideoDate) {
      const latestMs = new Date(latestVideoDate).getTime();
      if (Number.isFinite(latestMs)) {
        const daysSince = Math.floor((nowMs - latestMs) / (24 * 60 * 60 * 1000));
        if (daysSince >= staleDaysThreshold) {
          channelAlerts.push({
            channelId: ch.id,
            channelName: ch.name,
            group: ch.group || 'Chưa gắn Group',
            manager: ch.managerEmail || ch.manager || '',
            type: 'stale_upload',
            severity: 'warning',
            daysSinceUpload: daysSince,
            lastUploadDate: latestVideoDate,
            message: `⏰ Kênh "${ch.name}" đã ${daysSince} ngày chưa có video mới (video gần nhất: ${latestVideoDate}).`,
          });
        }
      }
    }
  }

  viralVideos.sort((a, b) => b.outlierMultiplier - a.outlierMultiplier || b.views - a.views);
  center.config.lastWatchdogScanAt = new Date().toISOString();
  const topVirals = viralVideos.slice(0, 30);

  return {
    scannedAt: center.config.lastWatchdogScanAt,
    outlierThreshold,
    minViralViews,
    staleDaysThreshold,
    totalChannelsScanned: channels.length,
    summary: {
      totalChannelsScanned: channels.length,
      viralCount: topVirals.length,
      healthAlertCount: channelAlerts.length,
    },
    viralVideos: topVirals,
    healthAlerts: channelAlerts,
    channelAlerts,
  };
}

// ============================================================================
// BOT 3: DEAD-CHANNEL & SCHEDULE REMINDER BOT (NHẮC LỊCH ĐĂNG VIDEO & CANH KÊNH BỎ QUÊN)
// ============================================================================
export function scanUploadScheduleAndDeadChannels(store, customOptions = {}) {
  const center = ensureBotCenterState(store.state.meta);
  const cfg = center.config;
  const targetUploadEveryDays = Math.max(
    1,
    Number(customOptions.targetUploadEveryDays ?? cfg.targetUploadEveryDays) || 2
  );
  const deadChannelDays = Math.max(
    targetUploadEveryDays + 1,
    Number(customOptions.deadChannelDays ?? cfg.deadChannelDays ?? cfg.staleDaysThreshold) || 5
  );

  const channels = store.state.channels || [];
  const allVideos = store.state.videos || [];
  const allContents = store.state.contents || [];
  const nowMs = Date.now();

  const scheduleItems = [];
  let deadCount = 0;
  let dueSoonCount = 0;
  let onTrackCount = 0;

  for (const ch of channels) {
    const fromStore = allVideos.filter((v) => v.channelId === ch.id);
    const mergedVids = [];
    const seenKeys = new Set();

    for (const v of fromStore) {
      const k = v.youtubeVideoId || v.id || v.title;
      if (!seenKeys.has(k)) {
        seenKeys.add(k);
        mergedVids.push({
          title: v.title || 'Video YouTube',
          publishedAt: v.publishedAt || v.lastUpdatedDate || '',
          views: Number(v.currentViews ?? v.views) || 0,
        });
      }
    }
    if (Array.isArray(ch.topVideos)) {
      for (const tv of ch.topVideos) {
        const k = tv.youtubeVideoId || tv.id || tv.title;
        if (!seenKeys.has(k)) {
          seenKeys.add(k);
          mergedVids.push({
            title: tv.title || 'Video YouTube',
            publishedAt: tv.publishedAt || '',
            views: Number(tv.views ?? tv.currentViews) || 0,
          });
        }
      }
    }

    const datedVids = mergedVids
      .filter((v) => v.publishedAt)
      .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));

    const latestVid = datedVids[0] || null;
    const lastUploadDate = latestVid?.publishedAt || ch.firstVideoDate || '';
    let daysSinceUpload = null;
    if (lastUploadDate) {
      const parsedMs = new Date(lastUploadDate).getTime();
      if (Number.isFinite(parsedMs)) {
        daysSinceUpload = Math.max(0, Math.floor((nowMs - parsedMs) / (24 * 60 * 60 * 1000)));
      }
    }

    const totalVideosCount = Math.max(mergedVids.length, Number(ch.totalVideos) || 0);
    let status = 'on_track';
    let badgeText = '✅ Đúng lịch';
    let recommendation = 'Đang duy trì nhịp đăng video tốt.';

    if (totalVideosCount === 0 || daysSinceUpload === null) {
      status = 'dead';
      deadCount += 1;
      badgeText = '🚨 Chưa có lịch / Chưa đăng bài';
      recommendation = 'Kênh chưa có dữ liệu ngày đăng video mới. Cần lên lịch đăng bài ngay!';
    } else if (daysSinceUpload >= deadChannelDays) {
      status = 'dead';
      deadCount += 1;
      badgeText = `🚨 Bỏ quên ${daysSinceUpload} ngày`;
      recommendation = `Đã ngâm ${daysSinceUpload} ngày (vượt ngưỡng ${deadChannelDays} ngày). Cần đăng video ngay hôm nay để giữ đề xuất!`;
    } else if (daysSinceUpload >= targetUploadEveryDays) {
      status = 'due_soon';
      dueSoonCount += 1;
      badgeText = `⏰ Đến lịch đăng (${daysSinceUpload} ngày)`;
      recommendation = `Đã đến chu kỳ ${targetUploadEveryDays} ngày/video. Hãy đăng 1 video mới trong hôm nay!`;
    } else {
      status = 'on_track';
      onTrackCount += 1;
      const nextDueIn = Math.max(1, targetUploadEveryDays - daysSinceUpload);
      badgeText =
        daysSinceUpload === 0 ? '🟢 Vừa đăng hôm nay' : `🟢 Mới đăng ${daysSinceUpload} ngày trước`;
      recommendation = `Lịch đăng tiếp theo sau ${nextDueIn} ngày nữa.`;
    }

    scheduleItems.push({
      channelId: ch.id,
      channelName: ch.name,
      channelHandle: ch.handle || '',
      channelUrl: ch.channelUrl || '#',
      group: ch.group || 'Chưa gắn Group',
      manager: ch.managerEmail || ch.manager || 'Admin (timhanhphuc)',
      totalVideos: totalVideosCount,
      lastUploadDate: lastUploadDate || 'Chưa rõ',
      latestVideoTitle: latestVid?.title || '',
      daysSinceUpload: daysSinceUpload ?? 999,
      status,
      badgeText,
      recommendation,
    });
  }

  // Sắp xếp ưu tiên kênh Bỏ quên (dead) -> Đến hạn hôm nay (due_soon) -> Đúng lịch (on_track)
  const priorityOrder = { dead: 0, due_soon: 1, on_track: 2 };
  scheduleItems.sort(
    (a, b) =>
      (priorityOrder[a.status] ?? 9) - (priorityOrder[b.status] ?? 9) ||
      b.daysSinceUpload - a.daysSinceUpload
  );

  center.config.lastScheduleScanAt = new Date().toISOString();

  return {
    scannedAt: center.config.lastScheduleScanAt,
    targetUploadEveryDays,
    deadChannelDays,
    summary: {
      totalChannels: channels.length,
      deadCount,
      dueSoonCount,
      onTrackCount,
      needActionCount: deadCount + dueSoonCount,
      savedVaultKeysCount: allContents.length,
    },
    scheduleItems,
  };
}

export function formatTelegramScheduleReport(store, customOptions = {}) {
  const sched = scanUploadScheduleAndDeadChannels(store, customOptions);
  const s = sched.summary;
  const urgentItems = sched.scheduleItems.filter((it) => it.status === 'dead' || it.status === 'due_soon');

  const urgentLines =
    urgentItems.length > 0
      ? urgentItems
          .slice(0, 12)
          .map((it, idx) => {
            const icon = it.status === 'dead' ? '🚨' : '⏰';
            const dayNote =
              it.daysSinceUpload >= 999
                ? 'Chưa có video mới'
                : `Đã <b>${it.daysSinceUpload} ngày</b> chưa đăng (gần nhất: ${escapeTgHtml(
                    it.lastUploadDate
                  )})`;
            return `${idx + 1}. ${icon} <b>${escapeTgHtml(it.channelName)}</b> (${escapeTgHtml(
              it.group
            )})\n   👤 QL: <code>${escapeTgHtml(it.manager)}</code> — ${dayNote}`;
          })
          .join('\n\n')
      : '✅ <b>Tuyệt vời! Toàn bộ kênh đều đang đúng lịch đăng video, không có kênh nào bị bỏ quên.</b>';

  return [
    `⏰ <b>BÁO CÁO NHẮC LỊCH ĐĂNG VIDEO &amp; KÊNH BỎ QUÊN (BOT 3)</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🎯 Chu kỳ mục tiêu: <b>${sched.targetUploadEveryDays} ngày/video</b> | Ngưỡng báo động đỏ: <b>${sched.deadChannelDays} ngày</b>`,
    `🚨 Kênh bỏ quên / Đứt lịch: <b>${s.deadCount} kênh</b>`,
    `⏰ Kênh đến hạn đăng hôm nay: <b>${s.dueSoonCount} kênh</b>`,
    `🟢 Kênh đúng tiến độ: <b>${s.onTrackCount} / ${s.totalChannels} kênh</b>`,
    `🗂️ Kho Key nội dung dự trữ: <b>${s.savedVaultKeysCount} chủ đề</b>`,
    ``,
    `📋 <b>DANH SÁCH KÊNH CẦN ĐĂNG BÀI NGAY:</b>`,
    urgentLines,
    `━━━━━━━━━━━━━━━━━━━━`,
    `💡 <i>Gõ /schedule (hoặc /lich) bất cứ lúc nào để kiểm tra tiến độ đăng video của cả dàn kênh!</i>`,
  ].join('\n');
}

// ============================================================================
// BOT 4: AUTO-BACKUP CLOUD & IMMORTAL SNAPSHOT BOT (SAO LƯU DỮ LIỆU BẤT TỬ)
// ============================================================================
export function buildBackupPayload(store, label = 'Auto Snapshot') {
  const rawState = store.state || {};
  // Sao chép dữ liệu sạch (không lặp lại mảng snapshots bên trong bản chụp để tránh phình dung lượng)
  const cleanMeta = { ...(rawState.meta || {}) };
  if (cleanMeta.botCenter) {
    cleanMeta.botCenter = {
      ...cleanMeta.botCenter,
      snapshots: [],
    };
  }
  const backupData = JSON.parse(
    JSON.stringify({
      meta: cleanMeta,
      users: Array.isArray(rawState.users) ? rawState.users : [],
      channels: Array.isArray(rawState.channels) ? rawState.channels : [],
      deals: Array.isArray(rawState.deals) ? rawState.deals : [],
      projects: Array.isArray(rawState.projects) ? rawState.projects : [],
      contents: Array.isArray(rawState.contents) ? rawState.contents : [],
      videos: Array.isArray(rawState.videos) ? rawState.videos : [],
    })
  );

  const jsonStr = JSON.stringify(backupData, null, 2);
  const sizeBytes = Buffer.byteLength(jsonStr, 'utf8');
  const sizeKB = Math.round((sizeBytes / 1024) * 100) / 100;
  const totalRevenue = Math.round(
    (backupData.channels || []).reduce((s, c) => s + (Number(c.totalYearlyRevenue) || 0), 0) * 100
  ) / 100;

  return {
    id: `snap-${crypto.randomUUID().slice(0, 8)}`,
    label: String(label || 'Bản sao lưu tự động').trim(),
    createdAt: new Date().toISOString(),
    sizeBytes,
    sizeKB,
    counts: {
      channels: backupData.channels.length,
      videos: backupData.videos.length,
      users: backupData.users.length,
      contents: backupData.contents.length,
    },
    stats: {
      channelsCount: backupData.channels.length,
      videosCount: backupData.videos.length,
      usersCount: backupData.users.length,
      contentsCount: backupData.contents.length,
      totalRevenue,
    },
    data: backupData,
  };
}

export async function createImmortalSnapshot(store, { label = 'Sao lưu tự động', sendToCloud = true } = {}) {
  const center = ensureBotCenterState(store.state.meta);
  const snap = buildBackupPayload(store, label);

  // 1. Lưu vào danh sách Snapshots khôi phục nhanh
  center.snapshots.unshift(snap);
  if (center.snapshots.length > MAX_SAVED_SNAPSHOTS) {
    center.snapshots.length = MAX_SAVED_SNAPSHOTS;
  }
  center.config.lastBackupAt = snap.createdAt;

  // 2. Ghi thêm bản backup dự phòng ra file cạnh studio-db.json
  try {
    if (store.filePath) {
      const backupFilePath = `${store.filePath}.backup.json`;
      fs.writeFileSync(backupFilePath, JSON.stringify(snap, null, 2), 'utf8');
    }
  } catch {}

  // 3. Nếu có cấu hình Cloud Webhook URL -> Tự động đẩy bản sao lưu lên Cloud
  let cloudSyncResult = null;
  const webhookUrl = String(center.config.cloudBackupWebhookUrl || '').trim();
  if (sendToCloud && webhookUrl && /^https?:\/\//i.test(webhookUrl)) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snap),
      });
      center.config.lastCloudSyncStatus = res.ok
        ? `✅ Đã đồng bộ Cloud (${new Date().toLocaleTimeString('vi-VN')})`
        : `⚠️ Cloud trả về HTTP ${res.status}`;
      cloudSyncResult = { ok: res.ok, status: res.status };
    } catch (err) {
      center.config.lastCloudSyncStatus = `⚠️ Lỗi kết nối Cloud: ${err.message}`;
      cloudSyncResult = { ok: false, error: err.message };
    }
  }

  appendBotLog(
    store.state.meta,
    'Bot 4 (Backup)',
    `Đã tạo bản sao lưu "${snap.label}" (${snap.stats.channelsCount} kênh, ${snap.stats.usersCount} user, ${snap.sizeKB} KB).`,
    'success'
  );

  return {
    snapshot: {
      id: snap.id,
      label: snap.label,
      createdAt: snap.createdAt,
      sizeKB: snap.sizeKB,
      stats: snap.stats,
    },
    cloudSyncResult,
  };
}

// ============================================================================
// BOT 1: TELEGRAM ADMIN CENTER BOT (DUYỆT USER, BÁO CÁO & ĐIỀU KHIỂN TỪ XA)
// ============================================================================
export async function callTelegramApi(botToken, method, payload = {}) {
  const cleanToken = String(botToken || '').trim();
  if (!cleanToken) {
    throw new Error('Chưa nhập Telegram Bot Token!');
  }
  const url = `https://api.telegram.org/bot${encodeURIComponent(cleanToken)}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.description || `Lỗi Telegram API (${res.status})`);
  }
  return data.result;
}

export async function detectTelegramChatId(botToken) {
  let botUsername = 'acb9xbot';
  try {
    const me = await callTelegramApi(botToken, 'getMe', {});
    if (me && me.username) botUsername = me.username;
  } catch {}
  const updates = await callTelegramApi(botToken, 'getUpdates', { limit: 20 });
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new Error(
      'Chưa tìm thấy tin nhắn nào! Anh hãy mở Telegram, nhắn 1 chữ bất kỳ (VD: /start) vào Bot rồi bấm lại nút này nhé.'
    );
  }
  for (let i = updates.length - 1; i >= 0; i -= 1) {
    const u = updates[i];
    const msg = u.message || u.edited_message || u.channel_post || u.callback_query?.message;
    if (msg && msg.chat && msg.chat.id) {
      return {
        chatId: String(msg.chat.id),
        chatTitle: msg.chat.title || msg.chat.username || msg.chat.first_name || 'Admin Chat',
        chatType: msg.chat.type || 'private',
        botUsername,
      };
    }
  }
  throw new Error('Không đọc được Chat ID từ tin nhắn gần nhất. Hãy nhắn /start vào Bot!');
}

export async function sendTelegramBackupDocument(store, customToken = '', customChatId = '') {
  const center = ensureBotCenterState(store.state.meta);
  const botToken = String(customToken || center.config.telegramBotToken || '').trim();
  const chatId = String(customChatId || center.config.telegramChatId || '').trim();
  if (!botToken || !chatId) {
    throw new Error('Vui lòng nhập Telegram Bot Token và Chat ID trước khi gửi file Backup qua Telegram!');
  }

  const snap = buildBackupPayload(store, 'Telegram Cloud Backup');
  const fileName = `studioflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const jsonBytes = Buffer.from(JSON.stringify(snap, null, 2), 'utf8');

  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append(
    'caption',
    `☁️ <b>BẢN SAO LƯU BẤT TỬ (BOT 4)</b>\n📅 Thời gian: ${new Date().toLocaleString('vi-VN')}\n📺 Số kênh: <b>${snap.stats.channelsCount}</b> | 👥 User: <b>${snap.stats.usersCount}</b> | 📦 Dung lượng: <b>${snap.sizeKB} KB</b>`
  );
  formData.append('parse_mode', 'HTML');
  formData.append('document', new Blob([jsonBytes], { type: 'application/json' }), fileName);

  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendDocument`;
  const res = await fetch(url, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.description || 'Không thể gửi file Backup sang Telegram');
  }

  appendBotLog(
    store.state.meta,
    'Bot 4 (Telegram Cloud)',
    `Đã gửi file ${fileName} (${snap.sizeKB} KB) vào Telegram an toàn!`,
    'success'
  );
  return { ok: true, fileName, sizeKB: snap.sizeKB };
}

export function formatTelegramSystemReport(store) {
  const summary = store.getDashboardSummary();
  const yt = summary.youtube || {};
  const usersSum = summary.meta?.usersSummary || {};
  const watchdog = scanViralAndChannelHealth(store);
  const topViral = (watchdog.viralVideos || []).slice(0, 3);

  const viralLines =
    topViral.length > 0
      ? topViral
          .map(
            (v, idx) =>
              `  ${idx + 1}. 🔥 <b>${escapeTgHtml(v.title)}</b> (${escapeTgHtml(v.channelName)}) — <b>${Number(
                v.views
              ).toLocaleString('vi-VN')} views</b> (x${v.outlierMultiplier} TB kênh)`
          )
          .join('\n')
      : '  • Chưa có video vượt ngưỡng nổ view.';

  return [
    `🤖 <b>BÁO CÁO HỆ THỐNG ACB9X STUDIOFLOW</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📺 Tổng số kênh: <b>${yt.totalChannels || 0} kênh</b>`,
    `👁️ Tổng lượt xem: <b>${Number(yt.totalViews || 0).toLocaleString('vi-VN')} views</b> (+${Number(
      yt.todayViewsDelta || 0
    ).toLocaleString('vi-VN')} hôm nay)`,
    `🎬 Tổng số video: <b>${yt.totalVideos || 0} video</b>`,
    `💰 Tổng doanh thu năm: <b>$${Number(yt.totalNetworkRevenue || 0).toLocaleString('vi-VN')}</b>`,
    `👥 Tài khoản User: <b>${usersSum.totalUsers || 0}</b> (⏳ Chờ duyệt: <b>${
      usersSum.pendingUsersCount || 0
    }</b>)`,
    ``,
    `🔥 <b>TOP VIDEO ĐANG NỔ ĐỀ XUẤT (BOT 2):</b>`,
    viralLines,
    `━━━━━━━━━━━━━━━━━━━━`,
    `💡 <i>Gõ /users để duyệt thành viên mới, /backup để lấy file sao lưu, /top để xem toàn bộ video nổ view.</i>`,
  ].join('\n');
}

function escapeTgHtml(str = '') {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function notifyTelegramNewUser(store, user) {
  if (
    process.env.NODE_TEST_CONTEXT ||
    String(store.filePath || '').includes('studioflow-test')
  ) {
    return { sent: false, skippedInTest: true };
  }
  const center = ensureBotCenterState(store.state.meta);
  const cfg = center.config;
  if (!cfg.telegramEnabled || !cfg.notifyOnNewUser || !cfg.telegramBotToken || !cfg.telegramChatId) {
    return { sent: false };
  }
  try {
    const text = [
      `🔔 <b>CÓ THÀNH VIÊN MỚI ĐĂNG KÝ TÀI KHOẢN!</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `👤 Họ tên / Nhóm: <b>${escapeTgHtml(user.name)}</b>`,
      `🔑 Username: <code>${escapeTgHtml(user.email)}</code>`,
      `📝 Ghi chú: ${escapeTgHtml(user.note || 'Không có')}`,
      `⏳ Trạng thái: <b>Đang chờ Admin (timhanhphuc) phê duyệt</b>`,
    ].join('\n');

    await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
      chat_id: cfg.telegramChatId,
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Duyệt & Cấp quyền ngay', callback_data: `approve_user:${user.id}` },
            { text: '⛔ Từ chối / Khóa', callback_data: `suspend_user:${user.id}` },
          ],
        ],
      },
    });
    appendBotLog(
      store.state.meta,
      'Bot 1 (Telegram)',
      `Đã bắn thông báo duyệt tài khoản mới "${user.email}" về Telegram Admin.`,
      'info'
    );
    return { sent: true };
  } catch (err) {
    appendBotLog(store.state.meta, 'Bot 1 (Telegram)', `Lỗi gửi thông báo User mới: ${err.message}`, 'error');
    return { sent: false, error: err.message };
  }
}

export async function pollTelegramBotUpdates(store) {
  const center = ensureBotCenterState(store.state.meta);
  const cfg = center.config;
  if (!cfg.telegramEnabled || !cfg.telegramBotToken) return;

  try {
    const offset = (Number(cfg.lastTelegramUpdateId) || 0) + 1;
    const updates = await callTelegramApi(cfg.telegramBotToken, 'getUpdates', {
      offset,
      timeout: 0,
      limit: 15,
    });
    if (!Array.isArray(updates) || updates.length === 0) return;

    for (const u of updates) {
      if (u.update_id >= (cfg.lastTelegramUpdateId || 0)) {
        cfg.lastTelegramUpdateId = u.update_id;
      }

      // 1. Xử lý khi Admin bấm nút Inline [✅ Duyệt] hoặc [⛔ Khóa] ngay trên Telegram
      if (u.callback_query) {
        const cb = u.callback_query;
        const data = String(cb.data || '');
        const chatId = cb.message?.chat?.id || cfg.telegramChatId;
        if (data.startsWith('approve_user:')) {
          const userId = data.split(':')[1];
          try {
            const updatedUser = store.updateUserPermissions(userId, { status: 'approved' });
            await callTelegramApi(cfg.telegramBotToken, 'answerCallbackQuery', {
              callback_query_id: cb.id,
              text: `✅ Đã duyệt tài khoản ${updatedUser.email}!`,
            });
            await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
              chat_id: chatId,
              text: `✅ <b>Admin đã duyệt thành công!</b>\nTài khoản <code>${escapeTgHtml(
                updatedUser.email
              )}</code> (${escapeTgHtml(updatedUser.name)}) hiện đã có thể đăng nhập vào hệ thống.`,
              parse_mode: 'HTML',
            });
            appendBotLog(
              store.state.meta,
              'Bot 1 (Telegram)',
              `Admin đã duyệt tài khoản "${updatedUser.email}" trực tiếp từ Telegram.`,
              'success'
            );
          } catch (err) {
            await callTelegramApi(cfg.telegramBotToken, 'answerCallbackQuery', {
              callback_query_id: cb.id,
              text: `Lỗi: ${err.message}`,
            });
          }
        } else if (data.startsWith('suspend_user:')) {
          const userId = data.split(':')[1];
          try {
            const updatedUser = store.updateUserPermissions(userId, { status: 'suspended' });
            await callTelegramApi(cfg.telegramBotToken, 'answerCallbackQuery', {
              callback_query_id: cb.id,
              text: `⛔ Đã khóa tài khoản ${updatedUser.email}!`,
            });
            await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
              chat_id: chatId,
              text: `⛔ Đã tạm khóa tài khoản <code>${escapeTgHtml(updatedUser.email)}</code>.`,
              parse_mode: 'HTML',
            });
          } catch {}
        }
        continue;
      }

      // 2. Xử lý các câu lệnh chat từ Telegram (/start, /report, /top, /users, /backup)
      const msg = u.message || u.edited_message;
      if (!msg || !msg.text || !msg.chat?.id) continue;
      const chatId = String(msg.chat.id);
      if (!cfg.telegramChatId) {
        cfg.telegramChatId = chatId;
      }
      const text = String(msg.text || '').trim();

      if (text.startsWith('/start') || text.startsWith('/help')) {
        await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
          chat_id: chatId,
          parse_mode: 'HTML',
          text: [
            `👑 <b>TRUNG TÂM 9 BOT QUẢN TRỊ ACB9X STUDIOFLOW</b>`,
            `Xin chào Admin <b>timhanhphuc</b>! Các lệnh điều khiển nhanh:`,
            `• /report — Báo cáo tổng hợp Kênh, Views &amp; Doanh thu (Bot 1)`,
            `• /top — Danh sách Video đang nổ đề xuất (Bot 2)`,
            `• /schedule — Kiểm tra Lịch đăng video &amp; Kênh bỏ quên (Bot 3)`,
            `• /backup — Nhận ngay file Sao lưu dữ liệu bất tử .json (Bot 4)`,
            `• /spy <code>@TenKenh</code> — Săn ngách &amp; Dò video nổ của đối thủ (Bot 5)`,
            `• /thumb <code>Link_Video</code> — Bóc tách &amp; Sinh Prompt Thumbnail AI (Bot 6)`,
            `• /trend <code>Từ_khóa</code> — Săn từ khóa ngách &amp; Trend tìm kiếm YouTube (Bot 7)`,
            `• /ga hoặc /revenue — Cảnh báo Bật kiếm tiền, Bảo vệ Gà AdSense &amp; Doanh thu (Bot 11)`,
            `• /cloud — Xuất &amp; Đồng bộ Báo cáo Đám mây Google Sheets / Notion (Bot 12)`,
            `• /users — Duyệt thành viên mới đăng ký`,
          ].join('\n'),
        });
      } else if (text.startsWith('/report') || text.startsWith('/baocao')) {
        const reportHtml = formatTelegramSystemReport(store);
        await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
          chat_id: chatId,
          parse_mode: 'HTML',
          text: reportHtml,
        });
      } else if (text.startsWith('/schedule') || text.startsWith('/lich')) {
        const schedHtml = formatTelegramScheduleReport(store);
        await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
          chat_id: chatId,
          parse_mode: 'HTML',
          text: schedHtml,
        });
      } else if (text.startsWith('/spy') || text.startsWith('/doithu')) {
        const arg = text.replace(/^\/(spy|doithu)(@\S+)?/i, '').trim();
        if (!arg) {
          await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
            chat_id: chatId,
            parse_mode: 'HTML',
            text: `🕵️ <b>Cú pháp Bot 5 (Săn Ngách &amp; Dò Kênh Đối Thủ):</b>\nGõ <code>/spy @TenKenhDoiThu</code> hoặc dán Link kênh YouTube đối thủ.\n<i>Ví dụ:</i> <code>/spy @MrBeast</code>`,
          });
        } else {
          const scanResult = await huntCompetitorChannelOutliers(store, { query: arg });
          const html = formatTelegramCompetitorReport(scanResult);
          await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
            chat_id: chatId,
            parse_mode: 'HTML',
            text: html,
          });
        }
      } else if (text.startsWith('/thumb')) {
        const arg = text.replace(/^\/thumb(@\S+)?/i, '').trim();
        if (!arg) {
          await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
            chat_id: chatId,
            parse_mode: 'HTML',
            text: `🎨 <b>Cú pháp Bot 6 (Phân tích &amp; Sinh Prompt Thumbnail):</b>\nGõ <code>/thumb Link_Video_YouTube</code> hoặc <code>/thumb Chủ đề video</code>.\n<i>Ví dụ:</i> <code>/thumb https://www.youtube.com/watch?v=dQw4w9WgXcQ</code>`,
          });
        } else {
          const cloneItem = await analyzeAndGenerateThumbnailPrompts(store, {
            videoUrlOrId: arg,
            title: arg.startsWith('http') ? '' : arg,
          });
          await sendTelegramThumbnailClone(store, cloneItem, cfg.telegramBotToken, chatId);
        }
      } else if (text.startsWith('/trend') || text.startsWith('/tukhoa')) {
        const arg = text.replace(/^\/(trend|tukhoa)(@\S+)?/i, '').trim();
        if (!arg) {
          await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
            chat_id: chatId,
            parse_mode: 'HTML',
            text: `🔍 <b>Cú pháp Bot 7 (Săn Từ Khóa Ngách &amp; Trend Tìm Kiếm Thực Tế):</b>\nGõ <code>/trend Từ_khóa_gốc</code> để quét từ khóa người xem đang tìm thật trên YouTube.\n<i>Ví dụ:</i> <code>/trend tiểu sử tỷ phú</code> hoặc <code>/trend AI story</code>`,
          });
        } else {
          const trendScan = await huntYouTubeSearchTrends(store, { seedKeyword: arg });
          const html = formatTelegramTrendReport(trendScan);
          await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
            chat_id: chatId,
            parse_mode: 'HTML',
            text: html,
          });
        }
      } else if (
        text.startsWith('/ga') ||
        text.startsWith('/bkt') ||
        text.startsWith('/revenue') ||
        text.startsWith('/doanhthu')
      ) {
        const shieldHtml = formatTelegramMonetizationReport(store);
        await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
          chat_id: chatId,
          parse_mode: 'HTML',
          text: shieldHtml,
        });
      } else if (text.startsWith('/cloud') || text.startsWith('/sheets') || text.startsWith('/notion')) {
        await sendTelegramCloudReportDocument(store, cfg.telegramBotToken, chatId);
      } else if (text.startsWith('/top') || text.startsWith('/no')) {
        const scan = scanViralAndChannelHealth(store);
        const topList = (scan.viralVideos || []).slice(0, 8);
        const body =
          topList.length > 0
            ? topList
                .map(
                  (v, i) =>
                    `${i + 1}. 🔥 <b>${escapeTgHtml(v.title)}</b>\n   📺 ${escapeTgHtml(
                      v.channelName
                    )} (${escapeTgHtml(v.group)}) — <b>${Number(v.views).toLocaleString(
                      'vi-VN'
                    )} views</b> (<b>x${v.outlierMultiplier}</b> TB kênh)`
                )
                .join('\n\n')
            : 'Chưa có video nào vượt ngưỡng nổ view.';
        await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
          chat_id: chatId,
          parse_mode: 'HTML',
          text: `🔥 <b>DANH SÁCH VIDEO ĐANG NỔ VIEW (BOT 2):</b>\n\n${body}`,
        });
      } else if (text.startsWith('/users')) {
        const pending = (store.state.users || []).filter((usr) => usr.status === 'pending');
        if (pending.length === 0) {
          await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
            chat_id: chatId,
            text: '✅ Hiện không có tài khoản nào đang chờ duyệt!',
          });
        } else {
          for (const usr of pending) {
            await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
              chat_id: chatId,
              parse_mode: 'HTML',
              text: `⏳ <b>Chờ duyệt:</b> <code>${escapeTgHtml(usr.email)}</code> (${escapeTgHtml(
                usr.name
              )})`,
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Duyệt ngay', callback_data: `approve_user:${usr.id}` },
                    { text: '⛔ Khóa', callback_data: `suspend_user:${usr.id}` },
                  ],
                ],
              },
            });
          }
        }
      } else if (text.startsWith('/backup')) {
        await sendTelegramBackupDocument(store, cfg.telegramBotToken, chatId);
      }
    }
    if (updates.length > 0 && typeof store.saveState === 'function') {
      store.saveState();
    }
  } catch {
    // Im lặng bỏ qua lỗi mạng tạm thời khi polling
  }
}

// ============================================================================
// BOT 5: OUTLIER / NEXLEV COMPETITOR HUNTER BOT (SĂN NGÁCH & DÒ KÊNH ĐỐI THỦ)
// ============================================================================
const COMPETITOR_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'your', 'you', 'how', 'why', 'what',
  'when', 'who', 'where', 'into', 'over', 'after', 'before', 'about', 'video', 'shorts',
  'official', 'full', 'new', 'part', 'episode', 'của', 'những', 'trong', 'được', 'cách',
  'làm', 'nhất', 'không', 'người', 'này', 'cho', 'với', 'khi', 'một', 'các', 'trên',
  'như', 'thế', 'nào', 'đến', 'hay', 'cùng', 'phần', 'tập', 'năm', 'ngày',
]);

function extractHotKeywordsFromTitles(titles = []) {
  const freq = new Map();
  for (const t of titles) {
    const words = String(t || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !COMPETITOR_STOP_WORDS.has(w) && !/^\d+$/.test(w));
    for (const w of words) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }));
}

export function extractTrendingPhrasesFromVideos(videos = [], avgViews = 1) {
  const safeAvg = Math.max(1, Number(avgViews) || 1);
  const phraseStats = new Map();

  for (const v of videos) {
    const rawTitle = String(v.title || '');
    const views = Math.max(0, Number(v.views) || 0);
    const mult = Number(v.outlierMultiplier ?? v.multiplier) || Math.round((views / safeAvg) * 10) / 10;
    const tokens = rawTitle
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !/^\d+$/.test(w));

    const seenInVideo = new Set();
    for (let n = 3; n >= 2; n--) {
      for (let i = 0; i <= tokens.length - n; i++) {
        const slice = tokens.slice(i, i + n);
        if (COMPETITOR_STOP_WORDS.has(slice[0]) && COMPETITOR_STOP_WORDS.has(slice[slice.length - 1])) {
          continue;
        }
        const meaningfulCount = slice.filter((w) => w.length >= 3 && !COMPETITOR_STOP_WORDS.has(w)).length;
        if (meaningfulCount < 1) continue;
        const phrase = slice.join(' ');
        if (phrase.length < 6 || seenInVideo.has(phrase)) continue;
        seenInVideo.add(phrase);

        if (!phraseStats.has(phrase)) {
          phraseStats.set(phrase, {
            phrase,
            videoCount: 0,
            totalViews: 0,
            maxMultiplier: 0,
            sumMultiplier: 0,
            bestVideoTitle: rawTitle,
            bestVideoViews: views,
          });
        }
        const entry = phraseStats.get(phrase);
        entry.videoCount += 1;
        entry.totalViews += views;
        entry.sumMultiplier += mult;
        if (mult > entry.maxMultiplier) entry.maxMultiplier = mult;
        if (views > entry.bestVideoViews) {
          entry.bestVideoViews = views;
          entry.bestVideoTitle = rawTitle;
        }
      }
    }
  }

  return [...phraseStats.values()]
    .map((p) => {
      const avgMultiplier = Math.round((p.sumMultiplier / Math.max(1, p.videoCount)) * 10) / 10;
      const wordCountBonus = p.phrase.split(' ').length === 3 ? 1.15 : 1.0;
      const repeatBonus = p.videoCount >= 2 ? 1 + (p.videoCount - 1) * 0.6 : 0.85;
      const trendScore = Math.round(p.maxMultiplier * repeatBonus * wordCountBonus * 100) / 100;
      return {
        phrase: p.phrase,
        videoCount: p.videoCount,
        totalViews: p.totalViews,
        avgMultiplier,
        maxMultiplier: Math.round(p.maxMultiplier * 10) / 10,
        trendScore,
        bestVideoTitle: p.bestVideoTitle,
      };
    })
    .sort((a, b) => b.trendScore - a.trendScore || b.totalViews - a.totalViews)
    .slice(0, 8);
}

export async function huntCompetitorChannelOutliers(store, options = {}) {
  const center = ensureBotCenterState(store.state.meta);
  const query = String(options.query || options.handleOrUrl || '').trim();
  if (!query) {
    throw new Error('Vui lòng nhập @Handle, Tên kênh hoặc Đường dẫn (URL) kênh đối thủ cần dò!');
  }

  const minOutlier = Math.max(
    1.0,
    Number(options.minOutlier ?? options.outlierThreshold ?? center.config.competitorMinOutlier) || 1.3
  );
  const fetcher = options.channelFetcher || fetchYouTubeChannelProfile;

  let profile = null;
  try {
    profile = await fetcher(query);
  } catch (err) {
    throw new Error(`Không thể quét kênh đối thủ "${query}": ${err.message}`);
  }

  const rawVideos = Array.isArray(profile?.videos)
    ? profile.videos
    : Array.isArray(profile?.recentVideos)
    ? profile.recentVideos
    : [];

  if (!profile || (!rawVideos.length && !profile.name)) {
    throw new Error(
      `Không tìm thấy dữ liệu video công khai cho kênh "${query}". Anh hãy kiểm tra lại @Handle hoặc URL kênh nhé!`
    );
  }

  const totalScanned = rawVideos.length;
  const sumScannedViews = rawVideos.reduce((s, v) => s + (Number(v.views) || 0), 0);
  const avgViews =
    totalScanned > 0
      ? Math.max(1, Math.round(sumScannedViews / totalScanned))
      : Math.max(
          1,
          Math.round((Number(profile.totalViews) || 1000) / Math.max(1, Number(profile.totalVideos) || 1))
        );

  const enrichedVideos = rawVideos.map((v) => {
    const views = Number(v.views) || 0;
    const outlierMultiplier = Math.round((views / avgViews) * 10) / 10;
    const vidId = v.youtubeVideoId || v.videoId || '';
    const pubText = v.publishedAt || v.publishedText || '';
    return {
      youtubeVideoId: vidId,
      videoId: vidId,
      title: v.title || 'Video đối thủ',
      views,
      publishedAt: pubText,
      publishedText: pubText,
      outlierMultiplier,
      multiplier: outlierMultiplier,
      isOutlier: outlierMultiplier >= minOutlier,
      videoUrl: vidId ? `https://www.youtube.com/watch?v=${encodeURIComponent(vidId)}` : profile.channelUrl,
      thumbnailUrl: vidId ? `https://i.ytimg.com/vi/${encodeURIComponent(vidId)}/hqdefault.jpg` : '',
      maxResThumbnailUrl: vidId ? `https://i.ytimg.com/vi/${encodeURIComponent(vidId)}/maxresdefault.jpg` : '',
    };
  });

  enrichedVideos.sort((a, b) => b.outlierMultiplier - a.outlierMultiplier || b.views - a.views);
  const outlierVideos = enrichedVideos.filter((v) => v.outlierMultiplier >= minOutlier);
  const topVideosToReturn = (outlierVideos.length > 0 ? outlierVideos : enrichedVideos).slice(0, 15);
  const topKeywords = extractHotKeywordsFromTitles(topVideosToReturn.map((v) => v.title));
  const trendingPhrases = extractTrendingPhrasesFromVideos(enrichedVideos, avgViews);
  const category =
    profile.category ||
    inferChannelCategory({
      name: profile.name,
      handle: profile.handle,
      description: profile.description || '',
      videos: rawVideos,
    });

  const scanEntry = {
    id: `spy-${crypto.randomUUID().slice(0, 8)}`,
    scannedAt: new Date().toISOString(),
    query,
    channelName: profile.name || query,
    handle: profile.handle || (query.startsWith('@') ? query : `@${query}`),
    channelUrl: profile.channelUrl || `https://www.youtube.com/${encodeURIComponent(query)}`,
    subscribers: Number(profile.subscribers) || 0,
    totalViews: Math.max(Number(profile.totalViews) || 0, sumScannedViews),
    totalVideos: Math.max(Number(profile.totalVideos) || 0, totalScanned),
    avgViewsPerVideo: avgViews,
    avgViews,
    category,
    minOutlier,
    outlierCount: outlierVideos.length,
    topKeywords,
    hotKeywords: topKeywords,
    trendingPhrases,
    videos: topVideosToReturn,
    outliers: outlierVideos.slice(0, 15),
    allVideos: enrichedVideos.slice(0, 15),
  };

  // Lưu vào danh sách lịch sử dò đối thủ (tránh trùng lặp cùng 1 handle)
  center.competitorScans = [
    scanEntry,
    ...(center.competitorScans || []).filter(
      (item) => (item.handle || '').toLowerCase() !== (scanEntry.handle || '').toLowerCase()
    ),
  ].slice(0, MAX_COMPETITOR_SCANS);
  center.config.lastCompetitorScanAt = scanEntry.scannedAt;

  appendBotLog(
    store.state.meta,
    'Bot 5 (Săn Ngách Đối Thủ)',
    `Đã dò kênh đối thủ "${scanEntry.channelName}" (${scanEntry.handle}): TB ${avgViews.toLocaleString('vi-VN')} views/video, phát hiện ${outlierVideos.length} video Outlier nổ đề xuất!`,
    'success'
  );

  return scanEntry;
}

export function formatTelegramCompetitorReport(scan) {
  const kwStr =
    Array.isArray(scan.topKeywords) && scan.topKeywords.length > 0
      ? scan.topKeywords.map((k) => `<code>#${escapeTgHtml(k.word)}</code>`).join(' ')
      : 'Chưa trích xuất';

  const phraseLines =
    Array.isArray(scan.trendingPhrases) && scan.trendingPhrases.length > 0
      ? scan.trendingPhrases
          .slice(0, 5)
          .map(
            (p, idx) =>
              `${idx + 1}. 🔥 <code>${escapeTgHtml(p.phrase)}</code> (Đỉnh <b>x${p.maxMultiplier}</b> · ${p.videoCount} video · ${Number(
                p.totalViews || 0
              ).toLocaleString('vi-VN')} views)`
          )
          .join('\n')
      : 'Chưa đủ dữ liệu cụm từ khóa.';

  const topVids = (scan.videos || []).slice(0, 6);
  const vidsHtml =
    topVids.length > 0
      ? topVids
          .map(
            (v, idx) =>
              `${idx + 1}. 🔥 <b>x${v.outlierMultiplier} TB kênh</b> — <b>${Number(
                v.views
              ).toLocaleString('vi-VN')} views</b>\n   🎬 <a href="${escapeTgHtml(
                v.videoUrl
              )}">${escapeTgHtml(v.title)}</a>`
          )
          .join('\n\n')
      : 'Không có video nào.';

  return [
    `🕵️ <b>BÁO CÁO DÒ KÊNH ĐỐI THỦ &amp; SĂN NGÁCH (BOT 5 NEXLEV)</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📺 Kênh đối thủ: <b>${escapeTgHtml(scan.channelName)}</b> (<code>${escapeTgHtml(scan.handle)}</code>)`,
    `🏷️ Ngách nội dung: <b>${escapeTgHtml(scan.category)}</b>`,
    `👥 Subscribers: <b>${Number(scan.subscribers || 0).toLocaleString('vi-VN')} sub</b>`,
    `📊 Trung bình kênh: <b>${Number(scan.avgViewsPerVideo || 0).toLocaleString('vi-VN')} views / video</b>`,
    `🔥 Số video Outlier (≥ x${scan.minOutlier}): <b>${scan.outlierCount} video</b>`,
    `🔑 Từ khóa đơn: ${kwStr}`,
    ``,
    `📈 <b>CỤM TỪ KHÓA ĐANG TREND MẠNH NHẤT TRÊN KÊNH ĐỐI THỦ:</b>`,
    phraseLines,
    ``,
    `🏆 <b>TOP VIDEO CẮN ĐỀ XUẤT MẠNH NHẤT CỦA ĐỐI THỦ:</b>`,
    vidsHtml,
    `━━━━━━━━━━━━━━━━━━━━`,
    `💡 <i>Gõ <code>/trend ${escapeTgHtml(scan.handle)}</code> để bóc tách 24 từ khóa tìm kiếm thực tế từ kênh này, hoặc gõ <code>/thumb Link_Video</code> để lấy Prompt Thumbnail!</i>`,
  ].join('\n');
}

// ============================================================================
// BOT 6: THUMBNAIL CLONE & PROMPT GENERATOR BOT (PHÂN TÍCH & SINH PROMPT THUMBNAIL)
// ============================================================================
export function extractYouTubeVideoId(rawInput = '') {
  const str = String(rawInput || '').trim();
  if (!str) return '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;

  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /i\.ytimg\.com\/vi\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const reg of patterns) {
    const m = str.match(reg);
    if (m && m[1]) return m[1];
  }
  return '';
}

function buildHookTextFromTitle(title = '') {
  const clean = String(title || '')
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/[|•—–-].*$/, '')
    .trim();
  if (!clean) return 'BÍ MẬT KHÔNG NGỜ!';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 4) return words.join(' ').toUpperCase();
  return words.slice(0, 4).join(' ').toUpperCase() + '?!';
}

export async function analyzeAndGenerateThumbnailPrompts(store, input = {}) {
  const center = ensureBotCenterState(store.state.meta);
  const rawCombined = String(input.videoUrlOrTitle || '').trim();
  const rawUrlOrId = String(
    input.videoUrlOrId || input.videoUrl || input.youtubeVideoId || rawCombined || ''
  ).trim();
  const videoId = extractYouTubeVideoId(rawUrlOrId);
  let resolvedTitle = String(input.title || (!videoId && rawCombined ? rawCombined : '') || '').trim();
  let resolvedChannel = String(input.channelName || '').trim();

  // Nếu có videoId mà chưa có tiêu đề -> tự động lấy tiêu đề qua YouTube oEmbed
  if (videoId && !resolvedTitle) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`;
      const res = await fetch(oembedUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.title) resolvedTitle = String(data.title).trim();
        if (data.author_name && !resolvedChannel) resolvedChannel = String(data.author_name).trim();
      }
    } catch {}
  }

  if (!resolvedTitle && !videoId) {
    throw new Error('Vui lòng nhập Link Video YouTube, Mã Video ID hoặc Tiêu đề/Chủ đề cần tạo Thumbnail!');
  }

  const finalTitle = resolvedTitle || `YouTube Viral Video (${videoId})`;
  const stylePreset = String(
    input.customStyle || input.stylePreset || center.config.defaultThumbnailStyle || 'viral_3d'
  ).trim();
  const hookText = String(input.hookText || buildHookTextFromTitle(finalTitle)).trim();

  const hqThumbnailUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
  const maxResThumbnailUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : '';
  const videoUrl = videoId
    ? `https://www.youtube.com/watch?v=${videoId}`
    : rawUrlOrId.startsWith('http')
    ? rawUrlOrId
    : '';

  const styleDescriptors = {
    viral_3d:
      'MrBeast & high-CTR YouTube viral thumbnail style, hyper-expressive close-up subject, dramatic rim lighting, vibrant saturated teal and warm orange-yellow contrast, ultra-sharp 8k render, Unreal Engine 5 cinematic depth of field',
    cinematic_dark:
      'Dark investigative documentary YouTube thumbnail style, dramatic chiaroscuro spotlight, intense mystery atmosphere, high-contrast red and cyan accents, photorealistic 85mm lens, 8k',
    bright_comparison:
      'Split-screen BEFORE vs AFTER comparison YouTube thumbnail style, extreme visual contrast between left side and right side, glowing arrow indicator, vibrant studio lighting, ultra-clear focal point, 8k',
  };
  const selectedStyleDesc = styleDescriptors[stylePreset] || styleDescriptors.viral_3d;

  const midjourneyPrompt = `/imagine prompt: YouTube viral thumbnail for video titled "${finalTitle}", ${selectedStyleDesc}, strong rule-of-thirds focal point on the right, clean negative space on the left for bold typography, extreme curiosity gap emotion, ultra-detailed --ar 16:9 --v 6.1 --stylize 250`;

  const fluxIdeogramPrompt = `A high-CTR 16:9 widescreen YouTube thumbnail inspired by "${finalTitle}". ${selectedStyleDesc}. On the left side, bold 3D impact typography in glowing yellow and white with thick black stroke reading "${hookText}". High contrast, eye-catching composition.`;

  const vietnameseBrief = [
    `🎯 Chủ thể chính (60% khung hình phải): Nhân vật hoặc vật thể trung tâm thể hiện rõ nội dung "${finalTitle}", phóng lớn nét mặt/chi tiết đắt giá nhất, viền sáng tách nền (Rim Light).`,
    `🎨 Phối màu kích thích CTR: Nền tối hoặc làm mờ nhẹ (Blur 15%), dùng 2 tông màu đối lập mạnh (Vàng Chanh / Đỏ Cam kết hợp Xanh Cyan).`,
    `🔤 Chữ trên Thumbnail (Hook Text 2-4 từ bên trái): "${hookText}" — Font không chân dày ( Anton / Montserrat Black ), chữ Vàng/Trắng viền Đen đổ bóng sâu.`,
  ].join('\n');

  const cloneEntry = {
    id: `thumb-${crypto.randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    youtubeVideoId: videoId,
    videoUrl,
    title: finalTitle,
    videoTitle: finalTitle,
    channelName: resolvedChannel || 'YouTube Reference',
    views: Number(input.views) || 0,
    outlierMultiplier: Number(input.outlierMultiplier) || 0,
    stylePreset,
    hookText,
    hookTextSuggestion: hookText,
    hqThumbnailUrl,
    thumbnailHq: hqThumbnailUrl,
    maxResThumbnailUrl,
    thumbnailMaxRes: maxResThumbnailUrl,
    prompts: {
      midjourney: midjourneyPrompt,
      fluxIdeogram: fluxIdeogramPrompt,
      vietnameseBrief,
    },
  };

  center.thumbnailClones = [
    cloneEntry,
    ...(center.thumbnailClones || []).filter((it) => it.id !== cloneEntry.id),
  ].slice(0, MAX_THUMBNAIL_CLONES);
  center.config.lastThumbnailCloneAt = cloneEntry.createdAt;

  appendBotLog(
    store.state.meta,
    'Bot 6 (Thumbnail Clone)',
    `Đã bóc tách & sinh bộ 3 Prompt Thumbnail AI cho chủ đề "${finalTitle.slice(0, 60)}".`,
    'success'
  );

  return cloneEntry;
}

export function formatTelegramThumbnailReport(item) {
  return [
    `🎨 <b>BÓC TÁCH &amp; PROMPT THUMBNAIL AI (BOT 6)</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🎬 Tiêu đề gốc: <b>${escapeTgHtml(item.title)}</b>`,
    item.channelName ? `📺 Kênh tham chiếu: <b>${escapeTgHtml(item.channelName)}</b>` : '',
    `🔤 Gợi ý Chữ gắn Thumbnail (Hook Text): <b>"${escapeTgHtml(item.hookText)}"</b>`,
    item.maxResThumbnailUrl
      ? `🖼️ <a href="${escapeTgHtml(item.maxResThumbnailUrl)}">Mở tải Ảnh Thumbnail Gốc Full HD (1280x720)</a>`
      : '',
    ``,
    `🤖 <b>1. PROMPT MIDJOURNEY V6.1 (Copy dán ngay):</b>`,
    `<code>${escapeTgHtml(item.prompts?.midjourney || '')}</code>`,
    ``,
    `⚡ <b>2. PROMPT FLUX.1 / IDEOGRAM / LEONARDO (Kèm chữ):</b>`,
    `<code>${escapeTgHtml(item.prompts?.fluxIdeogram || '')}</code>`,
    ``,
    `📐 <b>3. BỐ CỤC THIẾT KẾ GỢI Ý:</b>`,
    escapeTgHtml(item.prompts?.vietnameseBrief || ''),
  ]
    .filter(Boolean)
    .join('\n');
}

export async function sendTelegramThumbnailClone(store, cloneItem, customToken = '', customChatId = '') {
  const center = ensureBotCenterState(store.state.meta);
  const token = String(customToken || center.config.telegramBotToken || '').trim();
  const chatId = String(customChatId || center.config.telegramChatId || '').trim();
  if (!token || !chatId) {
    throw new Error('Vui lòng cấu hình Telegram Bot Token và Chat ID trước khi gửi sang Telegram!');
  }

  const htmlText = formatTelegramThumbnailReport(cloneItem);
  if (cloneItem.hqThumbnailUrl) {
    try {
      await callTelegramApi(token, 'sendPhoto', {
        chat_id: chatId,
        photo: cloneItem.maxResThumbnailUrl || cloneItem.hqThumbnailUrl,
        caption: `🎨 <b>Thumbnail Gốc:</b> ${escapeTgHtml(cloneItem.title)}\n🔤 Hook Text: <b>${escapeTgHtml(
          cloneItem.hookText
        )}</b>`,
        parse_mode: 'HTML',
      });
    } catch {}
  }

  await callTelegramApi(token, 'sendMessage', {
    chat_id: chatId,
    text: htmlText,
    parse_mode: 'HTML',
  });
  return { ok: true };
}

// ============================================================================
// BOT 7 (BOT 9): YOUTUBE SEARCH TREND HUNTER BOT (SĂN TỪ KHÓA NGÁCH & TREND /trend)
// ============================================================================
async function fetchYouTubeAutocompleteSuggestions(query, hl = 'vi', gl = 'VN') {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=${encodeURIComponent(
    hl
  )}&gl=${encodeURIComponent(gl)}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.[1]) ? data[1].map((s) => String(s || '').trim()).filter(Boolean) : [];
}

function classifyTrendKeyword(keyword = '', market = 'vi') {
  const lower = String(keyword || '').toLowerCase();
  const isEn = market === 'en';
  if (/^(how|why|what|cách|tại sao|làm sao|hướng dẫn|bí quyết)/i.test(lower)) {
    return {
      intentTag: '🎯 Hướng dẫn / Giải pháp',
      suggestedTitle: isEn
        ? `How "${keyword}" Actually Works (Step-by-Step Guide 2026)`
        : `Sự Thật Về "${keyword}" Ít Ai Tiết Lộ (Hướng Dẫn Chi Tiết)`,
    };
  }
  if (/(2026|2025|mới nhất|trend|ai|automation|full|review|top|best)/i.test(lower)) {
    return {
      intentTag: '🔥 Xu hướng đang lên (Rising Trend)',
      suggestedTitle: isEn
        ? `Why Everyone Is Switching To "${keyword}" Right Now!`
        : `Tại Sao "${keyword}" Đang Bùng Nổ Mạnh Mẽ Năm 2026?`,
    };
  }
  if (lower.split(/\s+/).length >= 4) {
    return {
      intentTag: '💎 Ngách con ít cạnh tranh (Micro-Niche)',
      suggestedTitle: isEn
        ? `The Untold Story of ${keyword} (99% Miss This)`
        : `Bí Mật Đằng Sau "${keyword}" Khiến Hàng Triệu Người Kinh Ngạc`,
    };
  }
  return {
    intentTag: '⚡ Từ khóa gốc lưu lượng cao',
    suggestedTitle: isEn
      ? `${keyword}: 7 Secrets Nobody Tells You`
      : `Top 5 Sự Thật Về "${keyword}" Bạn Cần Biết Ngay Hôm Nay`,
  };
}

export async function huntYouTubeSearchTrends(store, options = {}) {
  const center = ensureBotCenterState(store.state.meta);
  const rawSeed = String(options.seedKeyword || options.query || '').trim();
  if (!rawSeed) {
    throw new Error(
      'Vui lòng nhập Từ khóa gốc hoặc @Handle / Link kênh đối thủ cần phân tích Trend (VD: tiểu sử tỷ phú, @TinyWrist)!'
    );
  }

  const market = String(options.market || center.config.defaultTrendMarket || 'vi').toLowerCase();
  const hl = market === 'en' ? 'en' : 'vi';
  const gl = market === 'en' ? 'US' : 'VN';

  let seedKeyword = rawSeed;
  let sourceChannel = null;
  const isCompetitorChannelInput =
    rawSeed.startsWith('@') ||
    /youtube\.com\/|youtu\.be\//i.test(rawSeed) ||
    Boolean(options.fromCompetitorChannel);

  if (isCompetitorChannelInput) {
    const compScan = await huntCompetitorChannelOutliers(store, {
      query: rawSeed,
      channelFetcher: options.channelFetcher,
    });
    const topPhrase =
      compScan.trendingPhrases?.[0]?.phrase ||
      compScan.topKeywords?.slice(0, 2).map((k) => k.word).join(' ') ||
      compScan.channelName;
    seedKeyword = topPhrase;
    sourceChannel = {
      channelName: compScan.channelName,
      handle: compScan.handle,
      channelUrl: compScan.channelUrl,
      subscribers: compScan.subscribers,
      avgViews: compScan.avgViews,
      outlierCount: compScan.outlierCount,
      trendingPhrases: (compScan.trendingPhrases || []).slice(0, 6),
      topKeywords: (compScan.topKeywords || []).slice(0, 8),
    };
  }

  const extraCompetitorPhrases = sourceChannel
    ? (sourceChannel.trendingPhrases || []).slice(0, 3).map((p) => p.phrase)
    : [];

  const baseVariations =
    market === 'en'
      ? [
          seedKeyword,
          `${seedKeyword} 2026`,
          `how to ${seedKeyword}`,
          `why ${seedKeyword}`,
          `best ${seedKeyword}`,
        ]
      : [
          seedKeyword,
          `${seedKeyword} mới nhất`,
          `cách ${seedKeyword}`,
          `bí mật ${seedKeyword}`,
          `tại sao ${seedKeyword}`,
        ];

  const queryVariations = [...new Set([...extraCompetitorPhrases, ...baseVariations])].slice(0, 6);

  const fetcher = options.suggestFetcher || fetchYouTubeAutocompleteSuggestions;
  const collected = new Set();

  // Nếu dò từ kênh đối thủ, đưa luôn các cụm từ khóa đang nổ view nhất của đối thủ lên đầu danh sách
  if (sourceChannel && Array.isArray(sourceChannel.trendingPhrases)) {
    for (const p of sourceChannel.trendingPhrases.slice(0, 4)) {
      if (p.phrase) collected.add(p.phrase);
    }
  }

  try {
    const settled = await Promise.allSettled(
      queryVariations.map((q) => fetcher(q, hl, gl))
    );
    for (const r of settled) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        for (const item of r.value) {
          const clean = String(item || '').trim();
          if (clean) collected.add(clean);
        }
      }
    }
  } catch {}

  // Nếu mạng bị chặn hoặc từ khóa quá mới, bổ sung bộ mở rộng ngách thông minh
  if (collected.size < 6) {
    const fallbackSuffixes =
      market === 'en'
        ? [
            `${seedKeyword} full documentary`,
            `${seedKeyword} untold story`,
            `how ${seedKeyword} changed everything`,
            `${seedKeyword} step by step 2026`,
            `${seedKeyword} explained simply`,
            `best ${seedKeyword} for beginners`,
          ]
        : [
            `${seedKeyword} mới nhất 2026`,
            `bí mật ${seedKeyword} ít người biết`,
            `hướng dẫn ${seedKeyword} từ A đến Z`,
            `tóm tắt ${seedKeyword} dễ hiểu nhất`,
            `sự thật về ${seedKeyword}`,
            `câu chuyện ${seedKeyword} truyền cảm hứng`,
          ];
    for (const fb of fallbackSuffixes) collected.add(fb);
  }

  const competitorPhraseMap = new Map(
    (sourceChannel?.trendingPhrases || []).map((p) => [p.phrase.toLowerCase(), p])
  );

  const keywords = [...collected].slice(0, 24).map((kw, idx) => {
    const meta = classifyTrendKeyword(kw, market);
    const compMatch = competitorPhraseMap.get(kw.toLowerCase());
    const intentTag = compMatch
      ? `🔥 Đang nổ trên kênh ${sourceChannel.handle} (Đỉnh x${compMatch.maxMultiplier} · ${Number(
          compMatch.totalViews || 0
        ).toLocaleString('vi-VN')} views)`
      : meta.intentTag;
    return {
      rank: idx + 1,
      keyword: kw,
      intentTag,
      suggestedTitle: meta.suggestedTitle,
      youtubeSearchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(kw)}`,
    };
  });

  const microNicheCount = keywords.filter((k) => k.intentTag.includes('Ngách con')).length;
  const risingCount = keywords.filter(
    (k) => k.intentTag.includes('Xu hướng') || k.intentTag.includes('Đang nổ trên kênh')
  ).length;

  const trendEntry = {
    id: `trend-${crypto.randomUUID().slice(0, 8)}`,
    scannedAt: new Date().toISOString(),
    rawInput: rawSeed,
    seedKeyword,
    sourceChannel,
    market,
    totalKeywords: keywords.length,
    microNicheCount,
    risingCount,
    keywords,
  };

  center.trendScans = [
    trendEntry,
    ...(center.trendScans || []).filter(
      (it) => String(it.rawInput || it.seedKeyword || '').toLowerCase() !== rawSeed.toLowerCase()
    ),
  ].slice(0, MAX_TREND_SCANS);
  center.config.lastTrendScanAt = trendEntry.scannedAt;

  appendBotLog(
    store.state.meta,
    'Bot 7 (Săn Từ Khóa Trend)',
    sourceChannel
      ? `Đã bóc tách kênh đối thủ "${sourceChannel.channelName}" (${sourceChannel.handle}) -> Tìm ra cụm trend "${seedKeyword}" và ${keywords.length} từ khóa tìm kiếm thực tế!`
      : `Đã quét YouTube Search Autocomplete cho "${seedKeyword}" (${market.toUpperCase()}): thu về ${keywords.length} từ khóa tìm kiếm thực tế (${microNicheCount} ngách con)!`,
    'success'
  );

  return trendEntry;
}

export function formatTelegramTrendReport(trendScan) {
  const topKw = (trendScan.keywords || []).slice(0, 12);
  const rows = topKw
    .map(
      (k) =>
        `${k.rank}. 🔑 <code>${escapeTgHtml(k.keyword)}</code>\n   🏷️ ${escapeTgHtml(
          k.intentTag
        )}\n   🎬 <i>Gợi ý tiêu đề:</i> ${escapeTgHtml(k.suggestedTitle)}`
    )
    .join('\n\n');

  const competitorBlock = trendScan.sourceChannel
    ? [
        `🕵️ <b>Phân tích từ Kênh Đối Thủ:</b> <b>${escapeTgHtml(
          trendScan.sourceChannel.channelName
        )}</b> (<code>${escapeTgHtml(trendScan.sourceChannel.handle)}</code> · TB ${Number(
          trendScan.sourceChannel.avgViews || 0
        ).toLocaleString('vi-VN')} views/video)`,
        `🔥 <b>Top Cụm Từ Khóa Đang Nổ View Của Đối Thủ:</b>`,
        ...(trendScan.sourceChannel.trendingPhrases || [])
          .slice(0, 4)
          .map(
            (p) =>
              `  • <code>${escapeTgHtml(p.phrase)}</code> — Đỉnh <b>x${p.maxMultiplier}</b> (${p.videoCount} video · ${Number(
                p.totalViews || 0
              ).toLocaleString('vi-VN')} views)`
          ),
        ``,
      ].join('\n')
    : '';

  return [
    `🔍 <b>BÁO CÁO SĂN TỪ KHÓA NGÁCH &amp; TREND TÌM KIẾM YOUTUBE (BOT 7)</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    competitorBlock,
    `🎯 Chủ đề / Từ khóa gốc: <b>${escapeTgHtml(trendScan.seedKeyword)}</b> (${escapeTgHtml(
      String(trendScan.market || 'vi').toUpperCase()
    )})`,
    `📊 Tổng từ khóa khán giả đang gõ tìm: <b>${trendScan.totalKeywords} từ khóa</b>`,
    `💎 Ngách con ít cạnh tranh (Micro-Niche): <b>${trendScan.microNicheCount} ngách</b>`,
    `🔥 Xu hướng &amp; Key nổ view: <b>${trendScan.risingCount} từ khóa</b>`,
    ``,
    `🏆 <b>TOP TỪ KHÓA &amp; TIÊU ĐỀ GỢI Ý LÀM VIDEO NGAY:</b>`,
    rows,
    `━━━━━━━━━━━━━━━━━━━━`,
    `💡 <i>Chạm vào từ khóa để Copy hoặc mở Web bấm 1-Click <b>+ Lưu Key</b> vào Kho nội dung!</i>`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ============================================================================
// BOT 11: MONETIZATION & ADSENSE SHIELD BOT (CẢNH BÁO BKT, BẢO VỆ GÀ & DOANH THU /ga, /revenue)
// ============================================================================
function maskAdSenseName(raw = '') {
  const str = String(raw || '').trim();
  if (!str) return '';
  if (str.length <= 6) return str;
  return `${str.slice(0, 4)}***${str.slice(-3)}`;
}

export function scanMonetizationAndAdSenseShield(store, customOptions = {}) {
  const center = ensureBotCenterState(store.state.meta);
  const cfg = center.config;
  const maxChannelsPerGa = Math.max(
    1,
    Number(customOptions.maxChannelsPerGa ?? cfg.maxChannelsPerGa) || 3
  );
  const bktAlertThresholdPct = Math.max(
    20,
    Number(customOptions.bktAlertThresholdPct ?? cfg.bktAlertThresholdPct) || 70
  );

  const channels = store.state.channels || [];
  const monetizedChannels = [];
  const bktCandidates = [];
  const unlinkedMonetizedChannels = [];
  const gaMap = new Map();

  const monthlyTotals = Array.from({ length: 12 }, (_, idx) => ({
    month: idx + 1,
    label: `Tháng ${idx + 1}`,
    revenue: 0,
  }));
  let totalYearlyRevenue = 0;

  for (const ch of channels) {
    const subs = Math.max(0, Number(ch.subscribers) || 0);
    const watchHours = Math.max(0, Number(ch.watchHours) || 0);
    const monNorm = String(ch.monetization || '').trim().toLowerCase();
    const statusNorm = String(ch.status || '').trim().toLowerCase();
    const isMonetized = monNorm === 'enabled' || monNorm === 'đã bật';
    const isDemonetized =
      monNorm === 'disabled' || monNorm === 'tắt kiếm tiền' || statusNorm === 'demonetized';
    const isHealthy =
      !['warning', 'demonetized', 'cảnh báo', 'tắt kiếm tiền'].includes(statusNorm) &&
      (Number(ch.strikeCount) || 0) === 0;
    const rawGa = String(ch.adsenseAccount || '').trim();

    // Cộng doanh thu 12 tháng
    let chYearRev = 0;
    const mRev = ch.monthlyRevenue && typeof ch.monthlyRevenue === 'object' ? ch.monthlyRevenue : {};
    for (let m = 1; m <= 12; m++) {
      const val = Math.max(0, Number(mRev[String(m)] ?? mRev[m] ?? mRev[`m${m}`] ?? 0) || 0);
      monthlyTotals[m - 1].revenue += val;
      chYearRev += val;
    }
    if (chYearRev === 0 && Number(ch.totalYearlyRevenue) > 0) {
      chYearRev = Number(ch.totalYearlyRevenue);
    }
    totalYearlyRevenue += chYearRev;

    if (isMonetized) {
      monetizedChannels.push({
        channelId: ch.id,
        channelName: ch.name || 'Kênh YouTube',
        handle: ch.handle || '',
        group: ch.group || 'Chưa phân nhóm',
        manager: ch.manager || 'Chưa gán',
        subscribers: subs,
        watchHours,
        totalYearlyRevenue: Math.round(chYearRev * 100) / 100,
        hasGaLinked: Boolean(rawGa),
        maskedGa: rawGa ? maskAdSenseName(rawGa) : 'Chưa gắn Gà',
        status: ch.status || 'Kênh tốt',
      });
      if (!rawGa) {
        unlinkedMonetizedChannels.push({
          channelId: ch.id,
          channelName: ch.name || 'Kênh YouTube',
          handle: ch.handle || '',
          group: ch.group || 'Chưa phân nhóm',
          manager: ch.manager || 'Chưa gán',
        });
      }
    } else {
      // Tính tiến độ Bật kiếm tiền (1.000 Sub & 4.000 Giờ xem)
      const subPct = Math.min(100, Math.round((subs / 1000) * 100));
      const watchPct = Math.min(100, Math.round((watchHours / 4000) * 100));
      const overallPct = Math.round(subPct * 0.5 + watchPct * 0.5);
      const bktStage =
        subPct >= 100 && watchPct >= 100
          ? 'READY_NOW'
          : overallPct >= bktAlertThresholdPct
          ? 'ALMOST_THERE'
          : 'GROWING';

      bktCandidates.push({
        channelId: ch.id,
        channelName: ch.name || 'Kênh YouTube',
        handle: ch.handle || '',
        group: ch.group || 'Chưa phân nhóm',
        manager: ch.manager || 'Chưa gán',
        subscribers: subs,
        watchHours,
        subPct,
        watchPct,
        overallPct,
        bktStage,
        missingSubs: Math.max(0, 1000 - subs),
        missingHours: Math.max(0, Math.round(4000 - watchHours)),
      });
    }

    // Gom nhóm theo tài khoản Gà AdSense để kiểm tra rủi ro chết chùm
    if (rawGa) {
      const key = rawGa.toLowerCase();
      if (!gaMap.has(key)) {
        gaMap.set(key, {
          maskedGa: maskAdSenseName(rawGa),
          channelCount: 0,
          totalRevenueUsd: 0,
          hasRiskyChannel: false,
          channels: [],
        });
      }
      const entry = gaMap.get(key);
      entry.channelCount += 1;
      entry.totalRevenueUsd = Math.round((entry.totalRevenueUsd + chYearRev) * 100) / 100;
      if (!isHealthy || isDemonetized) {
        entry.hasRiskyChannel = true;
      }
      entry.channels.push({
        channelId: ch.id,
        channelName: ch.name || 'Kênh YouTube',
        handle: ch.handle || '',
        status: ch.status || 'Kênh tốt',
        monetization: isMonetized ? 'Đã bật' : isDemonetized ? 'Tắt kiếm tiền' : 'Chưa bật',
      });
    }
  }

  bktCandidates.sort((a, b) => b.overallPct - a.overallPct || b.subscribers - a.subscribers);
  monetizedChannels.sort((a, b) => b.totalYearlyRevenue - a.totalYearlyRevenue || b.subscribers - a.subscribers);

  const adsenseGroups = [...gaMap.values()]
    .map((g) => {
      let riskLevel = 'SAFE';
      let riskMessage = '✅ An toàn (Số lượng kênh hợp lý & sức khỏe kênh tốt)';
      if (g.hasRiskyChannel && g.channelCount > 1) {
        riskLevel = 'DANGER';
        riskMessage = `🚨 NGUY HIỂM CHẾT CHÙM: Có kênh đang bị Cảnh báo/Tắt kiếm tiền nằm chung Gà với ${
          g.channelCount - 1
        } kênh khác!`;
      } else if (g.channelCount >= maxChannelsPerGa) {
        riskLevel = 'WARNING';
        riskMessage = `⚠️ Rủi ro tập trung: 1 Gà đang gánh ${g.channelCount} kênh (Vượt ngưỡng khuyến nghị ${maxChannelsPerGa} kênh/Gà).`;
      }
      return {
        ...g,
        riskLevel,
        riskMessage,
      };
    })
    .sort((a, b) => {
      const order = { DANGER: 0, WARNING: 1, SAFE: 2 };
      return (order[a.riskLevel] ?? 9) - (order[b.riskLevel] ?? 9) || b.channelCount - a.channelCount;
    });

  const bestMonthObj = [...monthlyTotals].sort((a, b) => b.revenue - a.revenue)[0] || {
    label: 'Tháng 1',
    revenue: 0,
  };

  const readyOrAlmostBkt = bktCandidates.filter(
    (c) => c.bktStage === 'READY_NOW' || c.bktStage === 'ALMOST_THERE'
  );
  const riskyGaCount = adsenseGroups.filter((g) => g.riskLevel !== 'SAFE').length;

  const result = {
    scannedAt: new Date().toISOString(),
    summary: {
      totalChannels: channels.length,
      monetizedCount: monetizedChannels.length,
      readyOrAlmostBktCount: readyOrAlmostBkt.length,
      unlinkedMonetizedCount: unlinkedMonetizedChannels.length,
      totalGaAccounts: adsenseGroups.length,
      riskyGaCount,
      totalYearlyRevenue: Math.round(totalYearlyRevenue * 100) / 100,
      bestMonthLabel: bestMonthObj.label,
      bestMonthRevenue: Math.round(bestMonthObj.revenue * 100) / 100,
    },
    bktCandidates,
    adsenseGroups,
    unlinkedMonetizedChannels,
    topEarningChannels: monetizedChannels.slice(0, 8),
    monthlyTotals,
  };

  cfg.lastAdSenseScanAt = result.scannedAt;
  return result;
}

export function formatTelegramMonetizationReport(store) {
  const shield = scanMonetizationAndAdSenseShield(store);
  const s = shield.summary;

  const bktLines =
    shield.bktCandidates.length > 0
      ? shield.bktCandidates
          .slice(0, 5)
          .map((c) => {
            const badge =
              c.bktStage === 'READY_NOW'
                ? '🎉 <b>ĐỦ ĐIỀU KIỆN BKT NGAY!</b>'
                : c.bktStage === 'ALMOST_THERE'
                ? `🔥 <b>Đạt ${c.overallPct}% điều kiện BKT</b>`
                : `🌱 Đạt ${c.overallPct}%`;
            return `• <b>${escapeTgHtml(c.channelName)}</b> (${escapeTgHtml(
              c.group
            )}) — ${badge}\n  └ 👥 ${c.subscribers.toLocaleString('vi-VN')}/1.000 sub · ⏱️ ${c.watchHours.toLocaleString(
              'vi-VN'
            )}/4.000 giờ`;
          })
          .join('\n')
      : '✅ Tất cả kênh đều đã Bật kiếm tiền!';

  const gaLines =
    shield.adsenseGroups.length > 0
      ? shield.adsenseGroups
          .slice(0, 6)
          .map(
            (g) =>
              `• Gà <code>${escapeTgHtml(g.maskedGa)}</code> (${g.channelCount} kênh · $${g.totalRevenueUsd.toLocaleString(
                'vi-VN'
              )})\n  └ ${escapeTgHtml(g.riskMessage)}`
          )
          .join('\n')
      : '⚪ Chưa có kênh nào khai báo mã Gà kết nối.';

  const topRevLines =
    shield.topEarningChannels.length > 0
      ? shield.topEarningChannels
          .slice(0, 5)
          .map(
            (ch, idx) =>
              `${idx + 1}. 💵 <b>$${ch.totalYearlyRevenue.toLocaleString('vi-VN')}</b> — <b>${escapeTgHtml(
                ch.channelName
              )}</b> (${escapeTgHtml(ch.group)})`
          )
          .join('\n')
      : 'Chưa có dữ liệu doanh thu.';

  return [
    `💰 <b>BÁO CÁO BẬT KIẾM TIỀN, KHIÊN BẢO VỆ GÀ &amp; DOANH THU (BOT 11)</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📺 Kênh Đã Bật Kiếm Tiền: <b>${s.monetizedCount} / ${s.totalChannels} kênh</b>`,
    `🎯 Kênh Sắp/Đủ điều kiện BKT: <b>${s.readyOrAlmostBktCount} kênh</b>`,
    `🛡️ Số tài khoản Gà AdSense: <b>${s.totalGaAccounts} Gà</b> (Cảnh báo rủi ro: <b>${s.riskyGaCount}</b>)`,
    `💵 Tổng Doanh Thu Năm: <b>$${s.totalYearlyRevenue.toLocaleString('vi-VN')}</b> (${escapeTgHtml(
      s.bestMonthLabel
    )} đỉnh nhất: <b>$${s.bestMonthRevenue.toLocaleString('vi-VN')}</b>)`,
    ``,
    `🎯 <b>1. RADAR KÊNH SẮP BẬT KIẾM TIỀN (1.000 SUB &amp; 4.000 GIỜ):</b>`,
    bktLines,
    ``,
    `🛡️ <b>2. KHIÊN BẢO VỆ GÀ ADSENSE (CHỐNG CHẾT CHÙM):</b>`,
    gaLines,
    s.unlinkedMonetizedCount > 0
      ? `⚠️ <i>Lưu ý: Có <b>${s.unlinkedMonetizedCount} kênh</b> đã Bật kiếm tiền nhưng chưa điền thông tin Gà kết nối!</i>`
      : '',
    ``,
    `🏆 <b>3. TOP KÊNH DOANH THU CAO NHẤT:</b>`,
    topRevLines,
  ]
    .filter(Boolean)
    .join('\n');
}

// ============================================================================
// BOT 12: CLOUD REPORT AUTO-SYNC BOT (ĐỒNG BỘ BÁO CÁO ĐÁM MÂY NOTION / GOOGLE SHEETS / CSV)
// ============================================================================
export function generateCloudSyncReport(store) {
  const channels = store.state.channels || [];
  const videos = store.state.videos || [];
  const watchdog = scanViralAndChannelHealth(store);
  const schedule = scanUploadScheduleAndDeadChannels(store);
  const shield = scanMonetizationAndAdSenseShield(store);

  const scheduleMap = new Map((schedule.scheduleItems || []).map((it) => [it.channelId, it]));

  const rows = channels.map((ch, idx) => {
    const mRev = ch.monthlyRevenue && typeof ch.monthlyRevenue === 'object' ? ch.monthlyRevenue : {};
    let yearRev = 0;
    for (let m = 1; m <= 12; m++) {
      yearRev += Math.max(0, Number(mRev[String(m)] ?? mRev[m] ?? mRev[`m${m}`] ?? 0) || 0);
    }
    if (yearRev === 0 && Number(ch.totalYearlyRevenue) > 0) {
      yearRev = Number(ch.totalYearlyRevenue);
    }
    const schedItem = scheduleMap.get(ch.id);
    const monNorm = String(ch.monetization || '').trim().toLowerCase();
    const monLabel =
      monNorm === 'enabled' || monNorm === 'đã bật'
        ? 'Đã bật'
        : monNorm === 'disabled' || monNorm === 'tắt kiếm tiền'
        ? 'Tắt kiếm tiền'
        : 'Chưa bật';
    return {
      stt: idx + 1,
      name: ch.name || 'Kênh YouTube',
      handle: ch.handle || '',
      group: ch.group || 'Chưa phân nhóm',
      category: ch.category || 'Chung',
      manager: ch.manager || 'Chưa gán',
      subscribers: Number(ch.subscribers) || 0,
      totalViews: Number(ch.totalViews) || 0,
      watchHours: Number(ch.watchHours) || 0,
      monetization: monLabel,
      status: ch.status || 'Kênh tốt',
      yearlyRevenueUsd: Math.round(yearRev * 100) / 100,
      scheduleStatus: schedItem ? schedItem.statusLabel : 'Đúng lịch',
      channelUrl: ch.channelUrl || '',
    };
  });

  // 1. Chuỗi TSV (Tab-Separated Values) để bấm 1-Click Copy trên Web rồi Ctrl+V thẳng vào Google Sheets / Excel
  const headers = [
    'STT',
    'Tên Kênh',
    'Handle',
    'Group',
    'Ngách',
    'Quản Lý',
    'Subscribers',
    'Tổng Views',
    'Giờ Xem',
    'Kiếm Tiền',
    'Doanh Thu Năm ($)',
    'Lịch Đăng',
    'Tình Trạng',
    'Link Kênh',
  ];
  const tsvLines = [
    headers.join('\t'),
    ...rows.map((r) =>
      [
        r.stt,
        r.name,
        r.handle,
        r.group,
        r.category,
        r.manager,
        r.subscribers,
        r.totalViews,
        r.watchHours,
        r.monetization,
        r.yearlyRevenueUsd,
        r.scheduleStatus,
        r.status,
        r.channelUrl,
      ]
        .map((cell) => String(cell ?? '').replace(/[\t\r\n]+/g, ' '))
        .join('\t')
    ),
  ];
  const sheetsTsv = tsvLines.join('\n');

  // 2. Chuỗi CSV chuẩn UTF-8 BOM (mở trực tiếp bằng Excel hoặc Google Sheets không lỗi font tiếng Việt)
  const csvEscape = (val) => {
    const s = String(val ?? '');
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csvContent =
    '\uFEFF' +
    [
      headers.map(csvEscape).join(','),
      ...rows.map((r) =>
        [
          r.stt,
          r.name,
          r.handle,
          r.group,
          r.category,
          r.manager,
          r.subscribers,
          r.totalViews,
          r.watchHours,
          r.monetization,
          r.yearlyRevenueUsd,
          r.scheduleStatus,
          r.status,
          r.channelUrl,
        ]
          .map(csvEscape)
          .join(',')
      ),
    ].join('\r\n');

  // 3. Chuỗi Markdown chuẩn Notion (1-Click Copy dán thẳng vào trang Notion tạo bảng tự động)
  const notionMarkdown = [
    `# 📊 BÁO CÁO ĐÁM MÂY HỆ THỐNG KÊNH ACB9X (${new Date().toLocaleDateString('vi-VN')})`,
    ``,
    `> **Tổng quan:** **${channels.length}** Kênh · **${videos.length}** Video · **${shield.summary.monetizedCount}** Kênh đã BKT · Tổng Doanh thu Năm: **$${shield.summary.totalYearlyRevenue.toLocaleString('vi-VN')}** · Video đang nổ view: **${watchdog.summary.viralCount}**`,
    ``,
    `| STT | Tên Kênh | Group | Quản Lý | Subscribers | Tổng Views | Kiếm Tiền | Doanh Thu ($) | Tiến Độ Đăng |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
    ...rows.map(
      (r) =>
        `| ${r.stt} | **${r.name}** (${r.handle}) | ${r.group} | ${r.manager} | ${r.subscribers.toLocaleString(
          'vi-VN'
        )} | ${r.totalViews.toLocaleString('vi-VN')} | ${r.monetization} | $${r.yearlyRevenueUsd.toLocaleString(
          'vi-VN'
        )} | ${r.scheduleStatus} |`
    ),
  ].join('\n');

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalChannels: channels.length,
      totalVideos: videos.length,
      monetizedCount: shield.summary.monetizedCount,
      totalYearlyRevenue: shield.summary.totalYearlyRevenue,
      viralVideoCount: watchdog.summary.viralCount,
      needUploadCount: schedule.summary.needActionCount,
    },
    rows,
    sheetsTsv,
    csvContent,
    notionMarkdown,
  };
}

export async function syncCloudReportNow(store, options = {}) {
  const center = ensureBotCenterState(store.state.meta);
  const cfg = center.config;
  const webhookUrl = String(options.cloudReportWebhookUrl ?? cfg.cloudReportWebhookUrl ?? '').trim();
  const report = generateCloudSyncReport(store);

  let webhookDelivered = false;
  let webhookMessage = 'Đã tạo bảng báo cáo Google Sheets (.CSV / TSV) & Notion Markdown.';

  if (webhookUrl && /^https?:\/\//i.test(webhookUrl)) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'ACB9x StudioFlow Bot 12 Cloud Sync',
          generatedAt: report.generatedAt,
          summary: report.summary,
          channels: report.rows,
          notionMarkdown: report.notionMarkdown,
        }),
      });
      webhookDelivered = res.ok;
      webhookMessage = res.ok
        ? `✅ Đã đồng bộ tự động lên Cloud Webhook (${res.status}) lúc ${new Date().toLocaleTimeString('vi-VN')}`
        : `⚠️ Cloud Webhook trả về mã ${res.status}`;
    } catch (err) {
      webhookMessage = `⚠️ Lỗi gửi Cloud Webhook: ${err.message}`;
    }
  }

  cfg.lastCloudReportSyncAt = report.generatedAt;
  cfg.lastCloudReportStatus = webhookMessage;

  appendBotLog(
    store.state.meta,
    'Bot 12 (Đồng bộ Đám mây)',
    `Đã xuất Báo cáo Đám mây (${report.summary.totalChannels} kênh, tổng doanh thu $${report.summary.totalYearlyRevenue}). ${webhookMessage}`,
    'success'
  );

  return {
    ...report,
    webhookDelivered,
    webhookMessage,
  };
}

export async function sendTelegramCloudReportDocument(store, customToken = '', customChatId = '') {
  const center = ensureBotCenterState(store.state.meta);
  const token = String(customToken || center.config.telegramBotToken || '').trim();
  const chatId = String(customChatId || center.config.telegramChatId || '').trim();
  if (!token || !chatId) {
    throw new Error('Vui lòng cấu hình Telegram Bot Token và Chat ID trước khi gửi báo cáo Đám mây!');
  }

  const report = await syncCloudReportNow(store);
  const dateTag = new Date().toISOString().slice(0, 10);
  const filename = `ACB9x-GoogleSheets-Report-${dateTag}.csv`;

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append(
    'caption',
    [
      `☁️ <b>BÁO CÁO ĐỒNG BỘ GOOGLE SHEETS / EXCEL &amp; NOTION (BOT 12)</b>`,
      `📅 Ngày xuất: <b>${dateTag}</b>`,
      `📺 Tổng số kênh: <b>${report.summary.totalChannels} kênh</b> (Đã BKT: <b>${report.summary.monetizedCount}</b>)`,
      `💵 Tổng Doanh Thu Năm: <b>$${report.summary.totalYearlyRevenue.toLocaleString('vi-VN')}</b>`,
      `💡 <i>Anh tải file .CSV đính kèm này về mở trực tiếp bằng Excel hoặc import vào Google Sheets / Notion (đã chuẩn hóa tiếng Việt UTF-8)!</i>`,
    ].join('\n')
  );
  form.append('parse_mode', 'HTML');
  form.append('document', new Blob([report.csvContent], { type: 'text/csv;charset=utf-8' }), filename);

  const url = `https://api.telegram.org/bot${token}/sendDocument`;
  const res = await fetch(url, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || 'Không thể gửi file CSV sang Telegram');
  }
  return { ok: true, filename, report };
}

