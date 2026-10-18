import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_SAVED_SNAPSHOTS = 10;

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
  };
}

export function ensureBotCenterState(meta = {}) {
  const defaults = getDefaultBotConfig();
  if (!meta.botCenter || typeof meta.botCenter !== 'object') {
    meta.botCenter = {
      config: defaults,
      snapshots: [],
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
            `👑 <b>TRUNG TÂM BOT QUẢN TRỊ ACB9X STUDIOFLOW</b>`,
            `Xin chào Admin <b>timhanhphuc</b>! Các lệnh điều khiển nhanh:`,
            `• /report — Xem báo cáo tổng hợp Kênh, Views & Doanh thu`,
            `• /top — Xem danh sách Video đang nổ đề xuất (Bot 2)`,
            `• /schedule — Kiểm tra Lịch đăng video & Kênh bỏ quên (Bot 3)`,
            `• /users — Danh sách thành viên đang chờ duyệt kèm nút Duyệt`,
            `• /backup — Nhận ngay file Sao lưu dữ liệu bất tử (.json)`,
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
