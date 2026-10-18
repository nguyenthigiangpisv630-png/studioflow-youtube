import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudioStore, safeCompareStrings } from './domain/studioStore.js';
import {
  callTelegramApi,
  detectTelegramChatId,
  sendTelegramBackupDocument,
  formatTelegramSystemReport,
  formatTelegramScheduleReport,
  formatTelegramCompetitorReport,
  sendTelegramThumbnailClone,
  formatTelegramTrendReport,
  formatTelegramFootageReport,
  formatTelegramMonetizationReport,
  sendTelegramCloudReportDocument,
  pollTelegramBotUpdates,
  appendBotLog,
} from './domain/botEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

const MAX_BODY_BYTES = 10 * 1024 * 1024; // Giới hạn gói tin tối đa 10MB hỗ trợ khôi phục Backup JSON & chống DoS

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Studio-Token',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function extractAuthToken(req) {
  const headerToken = req.headers['x-studio-token'];
  if (headerToken && typeof headerToken === 'string') {
    return headerToken.trim();
  }
  return '';
}

async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      const err = new Error('🛡️ Dữ liệu gửi lên vượt quá giới hạn bảo mật (tối đa 2MB)!');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Dữ liệu JSON gửi lên không hợp lệ');
  }
}

export function createAppServer({
  store = new StudioStore(),
  enableAutoSyncTimer = true,
} = {}) {
  let dailyTimer = null;
  const loginFailuresByIp = new Map();
  const LOGIN_MAX_FAILURES = 8;
  const LOGIN_WINDOW_MS = 10 * 60 * 1000; // 10 phút
  const LOGIN_LOCKOUT_MS = 5 * 60 * 1000; // Khóa 5 phút khi nhập sai quá 8 lần

  function checkBruteForceLockout(ip) {
    const rec = loginFailuresByIp.get(ip);
    if (!rec) return;
    const now = Date.now();
    if (rec.lockedUntil && now < rec.lockedUntil) {
      const remainSec = Math.ceil((rec.lockedUntil - now) / 1000);
      const err = new Error(
        `🛡️ Bảo mật hệ thống: Phát hiện nhập sai mật khẩu quá nhiều lần. Tạm khóa đăng nhập trong ${remainSec} giây để chống dò mật khẩu!`
      );
      err.statusCode = 429;
      throw err;
    }
    if (now - rec.firstFailedAt > LOGIN_WINDOW_MS) {
      loginFailuresByIp.delete(ip);
    }
  }

  function recordBruteForceFailure(ip) {
    const now = Date.now();
    const rec = loginFailuresByIp.get(ip);
    if (!rec || now - rec.firstFailedAt > LOGIN_WINDOW_MS) {
      loginFailuresByIp.set(ip, { count: 1, firstFailedAt: now, lockedUntil: 0 });
      return;
    }
    rec.count += 1;
    if (rec.count >= LOGIN_MAX_FAILURES) {
      rec.lockedUntil = now + LOGIN_LOCKOUT_MS;
    }
  }

  function clearBruteForceFailures(ip) {
    loginFailuresByIp.delete(ip);
  }

  if (enableAutoSyncTimer) {
    const HOURLY_INTERVAL_MS = 60 * 60 * 1000; // 1 tiếng (60 phút) 1 lần
    let isSyncing = false;

    const checkAndRunHourlySync = async () => {
      if (isSyncing) return;
      try {
        const summary = store.getDashboardSummary();
        const lastSyncAt = summary.meta?.lastDailySyncAt
          ? new Date(summary.meta.lastDailySyncAt).getTime()
          : 0;
        const elapsedMs = Date.now() - (Number.isFinite(lastSyncAt) ? lastSyncAt : 0);
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
          now.getDate()
        ).padStart(2, '0')}`;
        const isNewDay = summary.meta?.lastDailySyncDate !== today;

        if (isNewDay || elapsedMs >= HOURLY_INTERVAL_MS) {
          isSyncing = true;
          await store.syncAllVideosDailyMetrics({ date: today });
          if (isNewDay && store.state?.meta?.botCenter?.config?.autoBackupEnabled !== false) {
            await store.createBackupSnapshot({ label: `Tự động Sao lưu ngày ${today} (Bot 4)` });
          }
        }
      } catch {
        // Bỏ qua lỗi mạng tạm thời trong tiến trình nền
      } finally {
        isSyncing = false;
      }
    };

    // Kiểm tra mỗi 1 phút để tự động reset & cập nhật chỉ số kênh/video đúng chu kỳ 1 tiếng 1 lần
    dailyTimer = setInterval(checkAndRunHourlySync, 60 * 1000);
    dailyTimer.unref?.();

    // Bot 1: Tự động lắng nghe nút bấm và lệnh (/trend, /footage, /spy, /rea, /report...) từ Telegram mỗi 2.5 giây
    const telegramPollTimer = setInterval(() => {
      pollTelegramBotUpdates(store).catch(() => {});
    }, 2500);
    telegramPollTimer.unref?.();

    // Tự động quét bổ sung ngay khi khởi động cho các kênh đang có 0 video (do lần quét trước bị YouTube đổi cấu trúc)
    const bootRepairTimer = setTimeout(async () => {
      if (isSyncing) return;
      try {
        const channels = store.state?.channels || [];
        const videos = store.state?.videos || [];
        for (const ch of channels) {
          const chVidCount = videos.filter((v) => v.channelId === ch.id).length;
          if (chVidCount === 0 && (ch.handle || ch.channelUrl)) {
            await store.syncChannelFromYouTube(ch.id);
          }
        }
        // Tạo bản Snapshot khởi động đầu tiên nếu chưa có bản nào trong Bot 4
        const existingSnaps = store.state?.meta?.botCenter?.snapshots || [];
        if (existingSnaps.length === 0) {
          await store.createBackupSnapshot({ label: 'Snapshot Khởi tạo Hệ thống (Bot 4)' });
        }
      } catch {
        // Bỏ qua lỗi mạng tạm thời khi khởi động
      }
    }, 1500);
    bootRepairTimer.unref?.();

    // Tự động ping giữ thức (Keep-Alive 24/7) mỗi 8 phút để Render.com không bao giờ rơi vào trạng thái ngủ đông (SERVICE WAKING UP)
    const keepAliveUrls = [
      process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '')}/api/health` : '',
      'https://tiphomart.io.vn/api/health',
    ].filter(Boolean);
    const keepAliveTimer = setInterval(() => {
      for (const pingUrl of keepAliveUrls) {
        fetch(pingUrl, { method: 'GET', headers: { 'User-Agent': 'StudioFlow-KeepAlive/1.0' } }).catch(() => {});
      }
    }, 8 * 60 * 1000);
    keepAliveTimer.unref?.();
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;
      const method = req.method || 'GET';

      if (method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Studio-Token',
        });
        res.end();
        return;
      }

      if (pathname === '/api/health' && method === 'GET') {
        return sendJson(res, 200, { ok: true, status: 'alive', ts: new Date().toISOString() });
      }

      // =======================================================================
      // AUTHENTICATION & PASSWORD LOCK ROUTES
      // =======================================================================
      const clientToken = extractAuthToken(req);
      const clientIp = getClientIp(req);

      if (pathname === '/api/auth/status' && method === 'GET') {
        return sendJson(res, 200, store.getAuthStatus(clientToken));
      }

      if (pathname === '/api/auth/logout' && method === 'POST') {
        const result = store.revokeSessionToken(clientToken);
        return sendJson(res, 200, result);
      }

      if (pathname === '/api/auth/login' && method === 'POST') {
        checkBruteForceLockout(clientIp);
        const body = await readJsonBody(req);
        try {
          const result = store.verifyPassword(body.password || '', body.email || body.username || '', {
            directGmailLogin: Boolean(body.directGmailLogin),
            name: body.name || '',
          });
          clearBruteForceFailures(clientIp);
          return sendJson(res, 200, result);
        } catch (loginErr) {
          if (loginErr.statusCode !== 403) {
            recordBruteForceFailure(clientIp);
          }
          throw loginErr;
        }
      }

      if (pathname === '/api/auth/register' && method === 'POST') {
        const body = await readJsonBody(req);
        const created = store.registerGmailUser({ ...body, autoApprove: false });
        return sendJson(res, 201, created);
      }

      if (pathname === '/api/auth/password' && method === 'POST') {
        checkBruteForceLockout(clientIp);
        const body = await readJsonBody(req);
        try {
          const result = store.updatePassword(body, clientToken);
          clearBruteForceFailures(clientIp);
          return sendJson(res, 200, result);
        } catch (passErr) {
          recordBruteForceFailure(clientIp);
          throw passErr;
        }
      }

      if ((pathname === '/api/auth/verify-ga' || pathname === '/api/auth/ga-password') && method === 'POST') {
        checkBruteForceLockout(clientIp);
        const body = await readJsonBody(req);
        const gaAuthStatus = store.getAuthStatus(clientToken);
        const gaUser = gaAuthStatus.user || null;
        try {
          const action = String(body.action || (pathname === '/api/auth/ga-password' ? 'set' : 'unlock'))
            .trim()
            .toLowerCase();
          const result =
            action === 'set' || action === 'reset'
              ? store.manageGaPassword({ ...body, action }, gaUser)
              : store.verifyGaPassword(body.password || '', gaUser);
          clearBruteForceFailures(clientIp);
          return sendJson(res, 200, result);
        } catch (gaErr) {
          recordBruteForceFailure(clientIp);
          throw gaErr;
        }
      }

      // Cổng nhận kết quả tự động từ dự án/Claude bên ngoài (khóa riêng STUDIOFLOW_INGEST_KEY, không cần đăng nhập)
      if (pathname === '/api/ingest/content' && method === 'POST') {
        const ingestKey = String(process.env.STUDIOFLOW_INGEST_KEY || '').trim();
        if (ingestKey.length < 16) {
          return sendJson(res, 503, { error: 'Cổng ingest chưa bật: cần đặt STUDIOFLOW_INGEST_KEY (>= 16 ký tự) trên server.' });
        }
        checkBruteForceLockout(clientIp);
        const sentKey = String(req.headers['x-ingest-key'] || '').trim();
        if (!safeCompareStrings(sentKey, ingestKey)) {
          recordBruteForceFailure(clientIp);
          return sendJson(res, 401, { error: 'Khóa ingest không hợp lệ.' });
        }
        clearBruteForceFailures(clientIp);
        const body = await readJsonBody(req);
        const baseTags = Array.isArray(body.tags)
          ? body.tags
          : String(body.tags || '')
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
        const created = store.createContentItem(
          { ...body, tags: [...new Set([...baseTags, 'ingest'])], author: body.author || 'Claude Ingest' },
          null
        );
        return sendJson(res, 201, created);
      }

      const authStatus = store.getAuthStatus(clientToken);
      if (pathname.startsWith('/api/') && pathname !== '/api/health') {
        if (authStatus.passwordEnabled && !authStatus.authenticated) {
          return sendJson(res, 401, {
            error: 'Web đã được khóa bảo mật. Vui lòng đăng nhập bằng Gmail hoặc tài khoản quản trị!',
            requiresAuth: true,
          });
        }
      }
      const currentUser = authStatus.user || null;

      // =======================================================================
      // API ROUTES
      // =======================================================================

      if (pathname === '/api/overview' && method === 'GET') {
        const isAdmin = !currentUser || currentUser.role === 'admin';
        return sendJson(res, 200, {
          currentUser,
          users: isAdmin ? store.listUsers() : [],
          botCenter: isAdmin ? store.getBotCenterStatus() : null,
          summary: store.getDashboardSummary(undefined, currentUser),
          channels: store.listChannels(currentUser),
          groups: store.listGroups(currentUser),
          deals: store.listDeals(),
          projects: store.listProjects(),
          contents: store.listContentItems({}, currentUser),
          videos: store.listVideos({}, currentUser),
        });
      }

      // 0. ADMIN USER MANAGEMENT & PERMISSIONS
      if (pathname === '/api/users' && method === 'GET') {
        if (currentUser && currentUser.role !== 'admin') {
          return sendJson(res, 403, { error: 'Chỉ Admin mới có quyền xem danh sách User!' });
        }
        return sendJson(res, 200, {
          users: store.listUsers(),
          allGroups: store.listGroups(null),
          allChannels: store.listChannels(null).map((c) => ({
            id: c.id,
            name: c.name,
            handle: c.handle,
            group: c.group,
            ownerUserId: c.ownerUserId,
            ownerEmail: c.ownerEmail,
          })),
        });
      }

      if (pathname === '/api/users' && method === 'POST') {
        if (currentUser && currentUser.role !== 'admin') {
          return sendJson(res, 403, { error: 'Chỉ Admin mới có quyền tạo và cấp quyền User!' });
        }
        const body = await readJsonBody(req);
        const created = store.registerGmailUser({
          ...body,
          autoApprove: body.autoApprove !== false,
        });
        return sendJson(res, 201, created);
      }

      const userItemMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
      if (userItemMatch && method === 'PATCH') {
        if (currentUser && currentUser.role !== 'admin') {
          return sendJson(res, 403, { error: 'Chỉ Admin mới có quyền phân quyền User!' });
        }
        const userId = decodeURIComponent(userItemMatch[1]);
        const body = await readJsonBody(req);
        const updated = store.updateUserPermissions(userId, body);
        return sendJson(res, 200, { ok: true, user: updated, ...updated });
      }

      if (userItemMatch && method === 'DELETE') {
        if (currentUser && currentUser.role !== 'admin') {
          return sendJson(res, 403, { error: 'Chỉ Admin mới có quyền xóa User!' });
        }
        const userId = decodeURIComponent(userItemMatch[1]);
        const deleted = store.deleteUser(userId);
        return sendJson(res, 200, deleted);
      }

      if (pathname === '/api/brand' && method === 'GET') {
        return sendJson(res, 200, store.getBrandProfile());
      }

      if (pathname === '/api/brand' && method === 'PATCH') {
        const body = await readJsonBody(req);
        const updated = store.updateBrandProfile(body);
        return sendJson(res, 200, updated);
      }

      // 1. CRM DEALS
      if (pathname === '/api/deals' && method === 'GET') {
        return sendJson(
          res,
          200,
          store.listDeals({
            stage: url.searchParams.get('stage') || undefined,
            search: url.searchParams.get('search') || undefined,
          })
        );
      }

      if (pathname === '/api/deals' && method === 'POST') {
        const body = await readJsonBody(req);
        const created = store.createDeal(body);
        return sendJson(res, 201, created);
      }

      const dealConvertMatch = pathname.match(/^\/api\/deals\/([^/]+)\/convert$/);
      if (dealConvertMatch && method === 'POST') {
        const dealId = decodeURIComponent(dealConvertMatch[1]);
        const body = await readJsonBody(req);
        const project = store.convertDealToProject(dealId, body);
        return sendJson(res, 201, project);
      }

      const dealItemMatch = pathname.match(/^\/api\/deals\/([^/]+)$/);
      if (dealItemMatch && method === 'PATCH') {
        const dealId = decodeURIComponent(dealItemMatch[1]);
        const body = await readJsonBody(req);
        const updated = store.updateDeal(dealId, body);
        return sendJson(res, 200, updated);
      }

      // 2. PROJECT MANAGEMENT
      if (pathname === '/api/projects' && method === 'GET') {
        return sendJson(
          res,
          200,
          store.listProjects({
            status: url.searchParams.get('status') || undefined,
            search: url.searchParams.get('search') || undefined,
          })
        );
      }

      if (pathname === '/api/projects' && method === 'POST') {
        const body = await readJsonBody(req);
        const created = store.createProject(body);
        return sendJson(res, 201, created);
      }

      const projectTaskToggleMatch = pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)\/toggle$/);
      if (projectTaskToggleMatch && method === 'PATCH') {
        const projectId = decodeURIComponent(projectTaskToggleMatch[1]);
        const taskId = decodeURIComponent(projectTaskToggleMatch[2]);
        const updatedProject = store.toggleProjectTask(projectId, taskId);
        return sendJson(res, 200, updatedProject);
      }

      const projectTasksMatch = pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
      if (projectTasksMatch && method === 'POST') {
        const projectId = decodeURIComponent(projectTasksMatch[1]);
        const body = await readJsonBody(req);
        const task = store.addTaskToProject(projectId, body);
        return sendJson(res, 201, task);
      }

      const projectItemMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (projectItemMatch && method === 'PATCH') {
        const projectId = decodeURIComponent(projectItemMatch[1]);
        const body = await readJsonBody(req);
        const updated = store.updateProject(projectId, body);
        return sendJson(res, 200, updated);
      }

      // 3. CONTENT VAULT (KHO LƯU TRỮ NỘI DUNG)
      if (pathname === '/api/contents' && method === 'GET') {
        return sendJson(
          res,
          200,
          store.listContentItems(
            {
              type: url.searchParams.get('type') || undefined,
              projectId: url.searchParams.get('projectId') || undefined,
              search: url.searchParams.get('search') || undefined,
            },
            currentUser
          )
        );
      }

      if (pathname === '/api/settings/notion' && method === 'GET') {
        return sendJson(res, 200, store.getNotionConfig());
      }

      if (pathname === '/api/settings/notion' && method === 'POST') {
        const body = await readJsonBody(req);
        const saved = store.updateNotionConfig(body);
        return sendJson(res, 200, saved);
      }

      if (pathname === '/api/contents' && method === 'POST') {
        const body = await readJsonBody(req);
        const created = store.createContentItem(body, currentUser);
        if (store.hasNotionAutoSync()) {
          try {
            const synced = await store.syncContentItemWithNotion(created.id);
            return sendJson(res, 201, synced);
          } catch (notionErr) {
            return sendJson(res, 201, {
              ...created,
              notionSynced: false,
              notionError: notionErr.message,
            });
          }
        }
        return sendJson(res, 201, created);
      }

      const contentNotionSyncMatch = pathname.match(/^\/api\/contents\/([^/]+)\/sync-notion$/);
      if (contentNotionSyncMatch && method === 'POST') {
        const contentId = decodeURIComponent(contentNotionSyncMatch[1]);
        const synced = await store.syncContentItemWithNotion(contentId);
        return sendJson(res, 200, synced);
      }

      const contentItemMatch = pathname.match(/^\/api\/contents\/([^/]+)$/);
      if (contentItemMatch && method === 'PATCH') {
        const contentId = decodeURIComponent(contentItemMatch[1]);
        const body = await readJsonBody(req);
        const updated = store.updateContentItem(contentId, body, currentUser);
        if (store.hasNotionAutoSync()) {
          try {
            const synced = await store.syncContentItemWithNotion(updated.id);
            return sendJson(res, 200, synced);
          } catch (notionErr) {
            return sendJson(res, 200, {
              ...updated,
              notionSynced: false,
              notionError: notionErr.message,
            });
          }
        }
        return sendJson(res, 200, updated);
      }
      if (contentItemMatch && method === 'DELETE') {
        const contentId = decodeURIComponent(contentItemMatch[1]);
        const deleted = store.deleteContentItem(contentId, currentUser);
        return sendJson(res, 200, deleted);
      }

      // 4. YOUTUBE CHANNELS, GROUPS, VIDEOS & DAILY METRICS
      if (pathname === '/api/youtube/groups' && method === 'GET') {
        return sendJson(res, 200, store.listGroups(currentUser));
      }

      if (pathname === '/api/youtube/groups' && method === 'POST') {
        const body = await readJsonBody(req);
        const created = store.createGroup(body, currentUser);
        return sendJson(res, 201, created);
      }

      const groupItemMatch = pathname.match(/^\/api\/youtube\/groups\/([^/]+)$/);
      if (groupItemMatch && method === 'DELETE') {
        const groupName = decodeURIComponent(groupItemMatch[1]);
        const deleted = store.deleteGroup(groupName, currentUser);
        return sendJson(res, 200, deleted);
      }

      if (pathname === '/api/youtube/channels' && method === 'GET') {
        return sendJson(res, 200, store.listChannels(currentUser));
      }

      if (pathname === '/api/youtube/channels' && method === 'POST') {
        const body = await readJsonBody(req);
        const created = await store.createChannelAndSync(body, {}, currentUser);
        return sendJson(res, 201, created);
      }

      if (pathname === '/api/youtube/studio-ingest' && method === 'POST') {
        const body = await readJsonBody(req);
        const updated = store.ingestYouTubeStudioMetrics(body);
        return sendJson(res, 200, { ok: true, channel: updated });
      }

      const channelSyncMatch = pathname.match(/^\/api\/youtube\/channels\/([^/]+)\/sync$/);
      if (channelSyncMatch && method === 'POST') {
        const channelId = decodeURIComponent(channelSyncMatch[1]);
        const synced = await store.syncChannelFromYouTube(channelId);
        return sendJson(res, 200, synced);
      }

      const channelItemMatch = pathname.match(/^\/api\/youtube\/channels\/([^/]+)$/);
      if (channelItemMatch && method === 'PATCH') {
        const channelId = decodeURIComponent(channelItemMatch[1]);
        const body = await readJsonBody(req);
        const updated = store.updateChannel(channelId, body, currentUser);
        return sendJson(res, 200, updated);
      }
      if (channelItemMatch && method === 'DELETE') {
        const channelId = decodeURIComponent(channelItemMatch[1]);
        const deleted = store.deleteChannel(channelId, currentUser);
        return sendJson(res, 200, deleted);
      }

      if (pathname === '/api/youtube/videos' && method === 'GET') {
        return sendJson(
          res,
          200,
          store.listVideos(
            {
              channelId: url.searchParams.get('channelId') || undefined,
              projectId: url.searchParams.get('projectId') || undefined,
              search: url.searchParams.get('search') || undefined,
            },
            currentUser
          )
        );
      }

      if (pathname === '/api/youtube/videos' && method === 'POST') {
        const body = await readJsonBody(req);
        const created = store.createVideo(body);
        return sendJson(res, 201, created);
      }

      const videoMetricsMatch = pathname.match(/^\/api\/youtube\/videos\/([^/]+)\/metrics$/);
      if (videoMetricsMatch && method === 'POST') {
        const videoId = decodeURIComponent(videoMetricsMatch[1]);
        const body = await readJsonBody(req);
        const updated = store.recordVideoDailyMetrics(videoId, body);
        return sendJson(res, 200, updated);
      }

      if (pathname === '/api/youtube/sync-daily' && method === 'POST') {
        const body = await readJsonBody(req);
        const result = await store.syncAllVideosDailyMetrics({ date: body.date });
        return sendJson(res, 200, result);
      }

      // =======================================================================
      // 5. BOT CENTER ROUTES (BOT 1: TELEGRAM + BOT 2: VIRAL WATCHDOG + BOT 4: IMMORTAL BACKUP)
      // =======================================================================
      if (pathname.startsWith('/api/bots/')) {
        if (currentUser && currentUser.role !== 'admin') {
          return sendJson(res, 403, { error: 'Chỉ Admin mới có quyền điều khiển Trung tâm Bot!' });
        }

        if (pathname === '/api/bots/status' && method === 'GET') {
          return sendJson(res, 200, store.getBotCenterStatus());
        }

        if (pathname === '/api/bots/config' && method === 'POST') {
          const body = await readJsonBody(req);
          const updated = store.updateBotConfig(body);
          return sendJson(res, 200, { ok: true, status: updated });
        }

        if (pathname === '/api/bots/watchdog/scan' && method === 'POST') {
          const body = await readJsonBody(req);
          const watchdog = store.runWatchdogScan(body);
          // Nếu bật thông báo Telegram cho Video nổ view và có cấu hình Telegram
          const cfg = store.state?.meta?.botCenter?.config || {};
          if (
            body.notifyTelegram &&
            cfg.telegramBotToken &&
            cfg.telegramChatId &&
            watchdog.viralVideos?.length > 0
          ) {
            const topList = watchdog.viralVideos.slice(0, 6);
            const msgLines = [
              `🔥 <b>CẢNH BÁO VIDEO NỔ VIEW (BOT 2 WATCHDOG)</b>`,
              `Hệ thống vừa phát hiện <b>${watchdog.viralVideos.length}</b> video vượt ngưỡng đề xuất (≥ x${watchdog.outlierThreshold}):`,
              ``,
              ...topList.map(
                (v, i) =>
                  `${i + 1}. <b>${v.title}</b>\n   📺 ${v.channelName} (${v.group}) — <b>${Number(
                    v.views
                  ).toLocaleString('vi-VN')} views</b> (<b>x${v.outlierMultiplier}</b> TB kênh)`
              ),
            ];
            await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
              chat_id: cfg.telegramChatId,
              text: msgLines.join('\n'),
              parse_mode: 'HTML',
            }).catch(() => {});
          }
          return sendJson(res, 200, { ok: true, watchdog, status: store.getBotCenterStatus() });
        }

        if (pathname === '/api/bots/schedule/scan' && method === 'POST') {
          const body = await readJsonBody(req);
          const scheduleRadar = store.runScheduleReminderScan(body);
          const cfg = store.state?.meta?.botCenter?.config || {};
          if (body.notifyTelegram && cfg.telegramBotToken && cfg.telegramChatId) {
            const schedHtml = formatTelegramScheduleReport(store, body);
            await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
              chat_id: cfg.telegramChatId,
              text: schedHtml,
              parse_mode: 'HTML',
            });
            appendBotLog(
              store.state.meta,
              'Bot 3 -> Telegram',
              `Đã bắn Báo cáo Nhắc lịch đăng video & Kênh bỏ quên về Telegram (Chat ID: ${cfg.telegramChatId}).`,
              'success'
            );
            store.saveState();
          }
          return sendJson(res, 200, {
            ok: true,
            scheduleRadar,
            status: store.getBotCenterStatus(),
          });
        }

        if (pathname === '/api/bots/competitor/scan' && method === 'POST') {
          const body = await readJsonBody(req);
          const scanResult = await store.runCompetitorHunterScan(body);
          const cfg = store.state?.meta?.botCenter?.config || {};
          if (body.notifyTelegram && cfg.telegramBotToken && cfg.telegramChatId) {
            const compHtml = formatTelegramCompetitorReport(scanResult);
            await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
              chat_id: cfg.telegramChatId,
              text: compHtml,
              parse_mode: 'HTML',
            });
            appendBotLog(
              store.state.meta,
              'Bot 5 -> Telegram',
              `Đã bắn Báo cáo Dò kênh đối thủ "${scanResult.channelName}" về Telegram (Chat ID: ${cfg.telegramChatId}).`,
              'success'
            );
            store.saveState();
          }
          return sendJson(res, 200, {
            ok: true,
            competitorScan: scanResult,
            scan: scanResult,
            status: store.getBotCenterStatus(),
          });
        }

        if (pathname === '/api/bots/thumbnail/clone' && method === 'POST') {
          const body = await readJsonBody(req);
          const cloneResult = await store.runThumbnailPromptGenerator(body);
          const cfg = store.state?.meta?.botCenter?.config || {};
          if (body.notifyTelegram && cfg.telegramBotToken && cfg.telegramChatId) {
            await sendTelegramThumbnailClone(store, cloneResult, cfg.telegramBotToken, cfg.telegramChatId);
            appendBotLog(
              store.state.meta,
              'Bot 6 -> Telegram',
              `Đã bắn Ảnh Thumbnail & Bộ 3 Prompt AI cho "${cloneResult.title.slice(0, 45)}" về Telegram.`,
              'success'
            );
            store.saveState();
          }
          return sendJson(res, 200, {
            ok: true,
            thumbnailClone: cloneResult,
            cloneItem: cloneResult,
            status: store.getBotCenterStatus(),
          });
        }

        if (pathname === '/api/bots/trends/scan' && method === 'POST') {
          const body = await readJsonBody(req);
          const trendScan = await store.runTrendHunterScan(body);
          const cfg = store.state?.meta?.botCenter?.config || {};
          if (body.notifyTelegram && cfg.telegramBotToken && cfg.telegramChatId) {
            const trendHtml = formatTelegramTrendReport(trendScan);
            await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
              chat_id: cfg.telegramChatId,
              text: trendHtml,
              parse_mode: 'HTML',
            });
            appendBotLog(
              store.state.meta,
              'Bot 7 -> Telegram',
              `Đã bắn Báo cáo Săn Từ Khóa Trend "${trendScan.seedKeyword}" (${trendScan.totalKeywords} từ khóa) về Telegram.`,
              'success'
            );
            store.saveState();
          }
          return sendJson(res, 200, {
            ok: true,
            trendScan,
            status: store.getBotCenterStatus(),
          });
        }

        if ((pathname === '/api/bots/footage/scan' || pathname === '/api/bots/footage/hunt') && method === 'POST') {
          const body = await readJsonBody(req);
          const footageScan = await store.runFootageHunterScan(body);
          return sendJson(res, 200, {
            ok: true,
            footageScan,
            scanItem: footageScan,
            status: store.getBotCenterStatus(),
          });
        }

        if (pathname === '/api/bots/footage/download' && method === 'GET') {
          const targetUrl = String(url.searchParams.get('url') || '').trim();
          const rawFilename = String(url.searchParams.get('filename') || 'acb9x-footage.mp4').trim();
          const safeFilename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'acb9x-footage.mp4';
          if (!/^https?:\/\//i.test(targetUrl)) {
            return sendJson(res, 400, { error: 'URL tải xuống không hợp lệ!' });
          }
          try {
            const upstream = await fetch(targetUrl, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
              },
            });
            if (!upstream.ok) {
              return sendJson(res, 502, { error: `Nguồn video trả về HTTP ${upstream.status}` });
            }
            const contentType = upstream.headers.get('content-type') || 'video/mp4';
            const arrayBuf = await upstream.arrayBuffer();
            const buf = Buffer.from(arrayBuf);
            res.writeHead(200, {
              ...SECURITY_HEADERS,
              'Content-Type': contentType,
              'Content-Length': buf.length,
              'Content-Disposition': `attachment; filename="${safeFilename}"`,
            });
            res.end(buf);
            return;
          } catch (dlErr) {
            return sendJson(res, 502, { error: `Không thể tải file trực tiếp: ${dlErr.message}` });
          }
        }

        if (pathname === '/api/bots/monetization/scan' && method === 'POST') {
          const body = await readJsonBody(req);
          const monetizationShield = store.runMonetizationShieldScan(body);
          const cfg = store.state?.meta?.botCenter?.config || {};
          if (body.notifyTelegram && cfg.telegramBotToken && cfg.telegramChatId) {
            const shieldHtml = formatTelegramMonetizationReport(store);
            await callTelegramApi(cfg.telegramBotToken, 'sendMessage', {
              chat_id: cfg.telegramChatId,
              text: shieldHtml,
              parse_mode: 'HTML',
            });
            appendBotLog(
              store.state.meta,
              'Bot 11 -> Telegram',
              `Đã bắn Báo cáo Khiên Gà AdSense & BKT ($${monetizationShield.summary.totalYearlyRevenue}) về Telegram.`,
              'success'
            );
            store.saveState();
          }
          return sendJson(res, 200, {
            ok: true,
            monetizationShield,
            status: store.getBotCenterStatus(),
          });
        }

        if (pathname === '/api/bots/cloud/sync' && method === 'POST') {
          const body = await readJsonBody(req);
          const cloudReport = await store.runCloudReportSync(body);
          const cfg = store.state?.meta?.botCenter?.config || {};
          if (body.notifyTelegram && cfg.telegramBotToken && cfg.telegramChatId) {
            await sendTelegramCloudReportDocument(store, cfg.telegramBotToken, cfg.telegramChatId);
            appendBotLog(
              store.state.meta,
              'Bot 12 -> Telegram',
              `Đã bắn file Báo cáo Google Sheets (.CSV) sang Telegram @acb9xbot.`,
              'success'
            );
            store.saveState();
          }
          return sendJson(res, 200, {
            ok: true,
            cloudReport,
            status: store.getBotCenterStatus(),
          });
        }

        if (pathname === '/api/bots/backup/create' && method === 'POST') {
          const body = await readJsonBody(req);
          const created = await store.createBackupSnapshot({
            label: body.label || 'Bản sao lưu thủ công (Bot 4)',
          });
          return sendJson(res, 201, { ok: true, ...created });
        }

        if (pathname === '/api/bots/backup/export' && method === 'GET') {
          const payload = store.exportFullBackup('Bản sao lưu đầy đủ ACB9x StudioFlow');
          const dateTag = new Date().toISOString().slice(0, 10);
          return sendJson(res, 200, payload, {
            'Content-Disposition': `attachment; filename="studioflow-backup-${dateTag}.json"`,
          });
        }

        if (pathname === '/api/bots/backup/restore' && method === 'POST') {
          const body = await readJsonBody(req);
          const restored = store.restoreFromBackup(body);
          return sendJson(res, 200, restored);
        }

        if (pathname === '/api/bots/telegram/detect-chat' && method === 'POST') {
          const body = await readJsonBody(req);
          const token = String(
            body.telegramBotToken && !String(body.telegramBotToken).includes('...')
              ? body.telegramBotToken
              : store.state?.meta?.botCenter?.config?.telegramBotToken || ''
          ).trim();
          const detected = await detectTelegramChatId(token);
          store.updateBotConfig({
            telegramEnabled: true,
            telegramBotToken: token,
            telegramChatId: detected.chatId,
          });
          appendBotLog(
            store.state.meta,
            'Bot 1 (Telegram)',
            `Đã tự động dò thấy Chat ID: ${detected.chatId} (${detected.chatTitle}) cho Bot @${detected.botUsername}.`,
            'success'
          );
          store.saveState();
          return sendJson(res, 200, {
            ok: true,
            ...detected,
            status: store.getBotCenterStatus(),
          });
        }

        if (pathname === '/api/bots/telegram/test-report' && method === 'POST') {
          const body = await readJsonBody(req);
          const cfg = store.state?.meta?.botCenter?.config || {};
          const token = String(
            body.telegramBotToken && !String(body.telegramBotToken).includes('...')
              ? body.telegramBotToken
              : cfg.telegramBotToken || ''
          ).trim();
          const chatId = String(body.telegramChatId || cfg.telegramChatId || '').trim();
          if (!token || !chatId) {
            throw new Error('Vui lòng nhập Bot Token và Chat ID (hoặc bấm "🔍 Tự dò Chat ID") trước khi gửi báo cáo!');
          }
          const reportHtml = formatTelegramSystemReport(store);
          await callTelegramApi(token, 'sendMessage', {
            chat_id: chatId,
            text: reportHtml,
            parse_mode: 'HTML',
          });
          if (store.state?.meta?.botCenter?.config) {
            store.state.meta.botCenter.config.lastTelegramReportAt = new Date().toISOString();
          }
          appendBotLog(
            store.state.meta,
            'Bot 1 (Telegram)',
            `Đã bắn Báo cáo tổng hợp Hệ thống về Telegram (Chat ID: ${chatId}).`,
            'success'
          );
          store.saveState();
          return sendJson(res, 200, {
            ok: true,
            message: 'Đã gửi Báo cáo tổng hợp về Telegram thành công!',
            status: store.getBotCenterStatus(),
          });
        }

        if (pathname === '/api/bots/telegram/send-backup' && method === 'POST') {
          const body = await readJsonBody(req);
          const cfg = store.state?.meta?.botCenter?.config || {};
          const token = String(
            body.telegramBotToken && !String(body.telegramBotToken).includes('...')
              ? body.telegramBotToken
              : cfg.telegramBotToken || ''
          ).trim();
          const chatId = String(body.telegramChatId || cfg.telegramChatId || '').trim();
          if (!token || !chatId) {
            throw new Error('Vui lòng cấu hình Bot Token và Chat ID trước khi gửi file Sao lưu sang Telegram!');
          }
          await sendTelegramBackupDocument(store, token, chatId);
          appendBotLog(
            store.state.meta,
            'Bot 4 -> Telegram',
            `Đã bắn file Sao lưu dữ liệu bất tử (.json) sang Telegram (Chat ID: ${chatId}).`,
            'success'
          );
          store.saveState();
          return sendJson(res, 200, {
            ok: true,
            message: 'Đã gửi file Sao lưu (.json) sang Telegram thành công!',
            status: store.getBotCenterStatus(),
          });
        }
      }

      // =======================================================================
      // STATIC FILES (WEB & MOBILE PWA) & /admin PORTAL ROUTE
      // =======================================================================
      const normalizedRoute = pathname.replace(/\/+$/, '') || '/';
      const relativePath =
        normalizedRoute === '/' || normalizedRoute === '/admin'
          ? 'index.html'
          : pathname.replace(/^\/+/, '');
      const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.resolve(PUBLIC_DIR, safePath);

      if (
        fullPath.startsWith(PUBLIC_DIR) &&
        !path.basename(fullPath).startsWith('.') &&
        fs.existsSync(fullPath) &&
        fs.statSync(fullPath).isFile()
      ) {
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
          ...SECURITY_HEADERS,
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        });
        fs.createReadStream(fullPath).pipe(res);
        return;
      }

      sendJson(res, 404, { error: 'Không tìm thấy đường dẫn yêu cầu' });
    } catch (err) {
      sendJson(res, err.statusCode || 400, { error: err.message || 'Lỗi xử lý yêu cầu' });
    }
  });

  server.on('close', () => {
    if (dailyTimer) clearInterval(dailyTimer);
  });

  return server;
}

// Chạy trực tiếp khi gọi `node src/server.js`
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const port = Number(process.env.PORT) || 3456;
  const store = new StudioStore({ seedIfEmpty: true });
  const server = createAppServer({ store });
  server.listen(port, '0.0.0.0', () => {
    console.log(`StudioFlow (Web & Mobile App) đang chạy tại: http://localhost:${port}`);
  });
}
