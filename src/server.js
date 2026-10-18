import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudioStore } from './domain/studioStore.js';

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

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
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
  for await (const chunk of req) {
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

      if (pathname === '/api/auth/status' && method === 'GET') {
        return sendJson(res, 200, store.getAuthStatus(clientToken));
      }

      if (pathname === '/api/auth/login' && method === 'POST') {
        const body = await readJsonBody(req);
        const result = store.verifyPassword(body.password || '', body.email || body.username || '', {
          directGmailLogin: Boolean(body.directGmailLogin),
          name: body.name || '',
        });
        return sendJson(res, 200, result);
      }

      if (pathname === '/api/auth/register' && method === 'POST') {
        const body = await readJsonBody(req);
        const created = store.registerGmailUser({ ...body, autoApprove: false });
        return sendJson(res, 201, created);
      }

      if (pathname === '/api/auth/password' && method === 'POST') {
        const body = await readJsonBody(req);
        const result = store.updatePassword(body, clientToken);
        return sendJson(res, 200, result);
      }

      if (pathname === '/api/auth/verify-ga' && method === 'POST') {
        const body = await readJsonBody(req);
        const result = store.verifyGaPassword(body.password || '');
        return sendJson(res, 200, result);
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
      // STATIC FILES (WEB & MOBILE PWA) & /admin PORTAL ROUTE
      // =======================================================================
      const normalizedRoute = pathname.replace(/\/+$/, '') || '/';
      const relativePath =
        normalizedRoute === '/' || normalizedRoute === '/admin'
          ? 'index.html'
          : pathname.replace(/^\/+/, '');
      const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(PUBLIC_DIR, safePath);

      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
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
