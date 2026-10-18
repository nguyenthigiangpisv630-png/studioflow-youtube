import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StudioStore } from '../src/domain/studioStore.js';
import { createAppServer } from '../src/server.js';

async function withTestServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studioflow-api-'));
  const filePath = path.join(dir, 'studio-db.json');
  const store = new StudioStore({ filePath, seedIfEmpty: true });
  const server = createAppServer({ store, enableAutoSyncTimer: false });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await fn({ baseUrl, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('GET /api/overview trả về dữ liệu tổng hợp của 4 phân hệ (CRM, Projects, Content Vault, YouTube Daily Metrics)', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/overview`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.summary);
    assert.ok(Array.isArray(body.deals));
    assert.ok(Array.isArray(body.projects));
    assert.ok(Array.isArray(body.contents));
    assert.ok(Array.isArray(body.videos));
    assert.ok(Array.isArray(body.channels));
    assert.ok(body.summary.youtube.totalViews > 0);
  });
});

test('POST /api/deals tạo Deal mới, kiểm tra lỗi thiếu trường bắt buộc và POST /api/deals/:id/convert tạo Dự án', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const badRes = await fetch(`${baseUrl}/api/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientName: '' }),
    });
    assert.equal(badRes.status, 400);

    const createRes = await fetch(`${baseUrl}/api/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: 'Vũ Quang Huy',
        company: 'NextGen Studio',
        value: 95000000,
        stage: 'negotiation',
        owner: 'Lan Anh',
      }),
    });
    assert.equal(createRes.status, 201);
    const deal = await createRes.json();
    assert.equal(deal.company, 'NextGen Studio');

    const convertRes = await fetch(`${baseUrl}/api/deals/${deal.id}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dueDate: '2026-10-30' }),
    });
    assert.equal(convertRes.status, 201);
    const project = await convertRes.json();
    assert.equal(project.dealId, deal.id);
    assert.equal(project.budget, 95000000);
  });
});

test('POST /api/contents lưu trữ nội dung kịch bản mới và POST /api/youtube/videos/:id/metrics cập nhật lượt xem theo ngày', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const cntRes = await fetch(`${baseUrl}/api/contents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Kịch bản Shorts: 3 Mẹo Chốt Sale Cho Kênh YouTube',
        type: 'script',
        body: 'Nội dung kịch bản chi tiết...',
        tags: ['Shorts', 'Sales'],
        author: 'Minh Đức',
      }),
    });
    assert.equal(cntRes.status, 201);
    const cnt = await cntRes.json();
    assert.equal(cnt.type, 'script');

    const metricRes = await fetch(`${baseUrl}/api/youtube/videos/vid-01/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-10-17',
        views: 125000,
        likes: 6600,
        comments: 530,
      }),
    });
    assert.equal(metricRes.status, 200);
    const updatedVideo = await metricRes.json();
    assert.equal(updatedVideo.currentViews, 125000);
    assert.equal(updatedVideo.dailyViewsDelta, 12400);

    const syncRes = await fetch(`${baseUrl}/api/youtube/sync-daily`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-10-18' }),
    });
    assert.equal(syncRes.status, 200);
    const syncBody = await syncRes.json();
    assert.equal(syncBody.date, '2026-10-18');
    assert.ok(syncBody.totalDailyViewsGained > 0);
  });
});

test('GET / và /manifest.webmanifest phục vụ giao diện Web và cấu hình Mobile App (PWA)', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes('StudioFlow'));
    assert.ok(html.includes('mobile-bottom-nav'));

    const manifestRes = await fetch(`${baseUrl}/manifest.webmanifest`);
    assert.equal(manifestRes.status, 200);
    const manifest = await manifestRes.json();
    assert.equal(manifest.short_name, 'StudioFlow');
    assert.equal(manifest.display, 'standalone');

    const adminPageRes = await fetch(`${baseUrl}/admin`);
    assert.equal(adminPageRes.status, 200);
    const adminHtml = await adminPageRes.text();
    assert.ok(adminHtml.includes('StudioFlow'));

    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
  });
});

test('POST /api/youtube/channels nhập kênh mới và PATCH /api/youtube/channels/:id cập nhật tình trạng kênh', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const createRes = await fetch(`${baseUrl}/api/youtube/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Kênh Gaming Studio',
        handle: '@GamingStudioVN',
        subscribers: 45000,
        category: 'Gaming',
        manager: 'Quốc Bảo',
        status: 'active',
        monetization: 'enabled',
        statusNote: 'Kênh đang đề xuất tốt',
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.name, 'Kênh Gaming Studio');
    assert.equal(created.status, 'active');

    const patchRes = await fetch(`${baseUrl}/api/youtube/channels/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'warning',
        strikeCount: 1,
        subscribers: 46200,
        statusNote: 'Dính 1 cảnh báo bản quyền âm nhạc, đang gửi kháng nghị',
      }),
    });
    assert.equal(patchRes.status, 200);
    const updated = await patchRes.json();
    assert.equal(updated.status, 'warning');
    assert.equal(updated.strikeCount, 1);
    assert.equal(updated.subscribers, 46200);

    const deleteRes = await fetch(`${baseUrl}/api/youtube/channels/${created.id}`, {
      method: 'DELETE',
    });
    assert.equal(deleteRes.status, 200);
    const deleted = await deleteRes.json();
    assert.equal(deleted.deletedChannelId, created.id);

    const listAfterRes = await fetch(`${baseUrl}/api/youtube/channels`);
    const listAfter = await listAfterRes.json();
    assert.equal(
      listAfter.some((c) => c.id === created.id),
      false
    );
  });
});

test('POST /api/auth/password đặt mật khẩu khóa Web, chặn 401 khi chưa đăng nhập và mở khóa qua POST /api/auth/login', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const statusBefore = await (await fetch(`${baseUrl}/api/auth/status`)).json();
    assert.equal(statusBefore.passwordEnabled, false);
    assert.equal(statusBefore.authenticated, true);

    // Đặt mật khẩu mới: "888999"
    const setPassRes = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: '888999' }),
    });
    assert.equal(setPassRes.status, 200);
    const setPassBody = await setPassRes.json();
    assert.equal(setPassBody.passwordEnabled, true);
    assert.ok(setPassBody.token);

    // Người lạ truy cập /api/overview không có token -> bị chặn 401
    const unauthRes = await fetch(`${baseUrl}/api/overview`);
    assert.equal(unauthRes.status, 401);
    const unauthBody = await unauthRes.json();
    assert.equal(unauthBody.requiresAuth, true);

    // Đăng nhập sai mật khẩu -> 400
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: '000000' }),
    });
    assert.equal(badLoginRes.status, 400);

    // Đăng nhập đúng mật khẩu -> 200 kèm token
    const goodLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: '888999' }),
    });
    assert.equal(goodLoginRes.status, 200);
    const goodLoginBody = await goodLoginRes.json();
    assert.equal(goodLoginBody.token, setPassBody.token);

    // Có X-Studio-Token hợp lệ -> truy cập /api/overview thành công 200
    const authedOverviewRes = await fetch(`${baseUrl}/api/overview`, {
      headers: { 'X-Studio-Token': goodLoginBody.token },
    });
    assert.equal(authedOverviewRes.status, 200);
  });
});

test('POST /api/auth/register đăng ký Gmail mới, chờ Admin cấp quyền và tách riêng không gian làm việc (isolated workspace)', async () => {
  await withTestServer(async ({ baseUrl }) => {
    // 1. User mới đăng ký bằng Gmail
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Minh Quân YT',
        email: 'minhquan.yt@gmail.com',
        password: '123456',
        note: 'Xin dùng không gian riêng cho team US',
      }),
    });
    assert.equal(regRes.status, 201);
    const regBody = await regRes.json();
    assert.equal(regBody.user.email, 'minhquan.yt@gmail.com');
    assert.equal(regBody.user.status, 'pending');
    assert.equal(regBody.user.scopeMode, 'isolated');

    // 2. Khi chưa được Admin duyệt -> đăng nhập trả về 403
    const pendingLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'minhquan.yt@gmail.com',
        password: '123456',
      }),
    });
    assert.equal(pendingLoginRes.status, 403);

    // 3. Admin duyệt cấp quyền cho User Gmail này
    const approveRes = await fetch(`${baseUrl}/api/users/${regBody.user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'approved',
        scopeMode: 'isolated',
      }),
    });
    assert.equal(approveRes.status, 200);
    const approveBody = await approveRes.json();
    assert.equal(approveBody.user.status, 'approved');

    // 4. User Gmail đăng nhập thành công -> nhận token riêng
    const userLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'minhquan.yt@gmail.com',
        password: '123456',
      }),
    });
    assert.equal(userLoginRes.status, 200);
    const userLoginBody = await userLoginRes.json();
    assert.ok(userLoginBody.token);
    assert.equal(userLoginBody.user.role, 'member');

    // 5. Kiểm tra không gian tách riêng: User mới chưa tạo kênh nào nên danh sách kênh = 0 (không thấy kênh của Admin)
    const userOverviewBefore = await (
      await fetch(`${baseUrl}/api/overview`, {
        headers: { 'X-Studio-Token': userLoginBody.token },
      })
    ).json();
    assert.equal(userOverviewBefore.channels.length, 0);
    assert.equal(userOverviewBefore.contents.length, 0);

    // 6. User tự tạo 1 kênh riêng trong không gian của mình -> User nhìn thấy đúng 1 kênh đó
    const userCreateChRes = await fetch(`${baseUrl}/api/youtube/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Studio-Token': userLoginBody.token,
      },
      body: JSON.stringify({
        name: 'Kênh Riêng Minh Quân US',
        handle: '@MinhQuanUS',
        subscribers: 12000,
      }),
    });
    assert.equal(userCreateChRes.status, 201);
    const userCh = await userCreateChRes.json();
    assert.equal(userCh.ownerEmail, 'minhquan.yt@gmail.com');

    const userOverviewAfter = await (
      await fetch(`${baseUrl}/api/overview`, {
        headers: { 'X-Studio-Token': userLoginBody.token },
      })
    ).json();
    assert.equal(userOverviewAfter.channels.length, 1);
    assert.equal(userOverviewAfter.channels[0].name, 'Kênh Riêng Minh Quân US');
  });
});

test('Đăng ký Gmail mới ở trạng thái pending phải được Admin chấp nhận (approved) mới đăng nhập được', async () => {
  await withTestServer(async ({ baseUrl }) => {
    // 1. User chưa đăng ký không thể đăng nhập thẳng
    const unregisteredRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'hoangnam.media@gmail.com',
        password: 'password123',
        directGmailLogin: true,
      }),
    });
    assert.equal(unregisteredRes.status, 400);

    // 2. User đăng ký mới qua /api/auth/register -> trạng thái pending
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Hoàng Nam Media',
        email: 'hoangnam.media@gmail.com',
        password: 'password123',
      }),
    });
    assert.equal(regRes.status, 201);
    const regBody = await regRes.json();
    assert.equal(regBody.status, 'pending');
    assert.equal(regBody.user.status, 'pending');

    // 3. Khi Admin chưa chấp nhận -> cố đăng nhập sẽ bị chặn 403
    const pendingLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'hoangnam.media@gmail.com',
        password: 'password123',
        directGmailLogin: true,
      }),
    });
    assert.equal(pendingLoginRes.status, 403);

    // 4. Admin chấp nhận (phê duyệt) tài khoản trong Trang Quản lý User
    const approveRes = await fetch(`${baseUrl}/api/users/${regBody.user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(approveRes.status, 200);

    // 5. Sau khi được Admin chấp nhận -> đăng nhập thành công vào Không gian riêng
    const approvedLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'hoangnam.media@gmail.com',
        password: 'password123',
        directGmailLogin: true,
      }),
    });
    assert.equal(approvedLoginRes.status, 200);
    const approvedLoginBody = await approvedLoginRes.json();
    assert.equal(approvedLoginBody.ok, true);
    assert.ok(approvedLoginBody.token);
    assert.equal(approvedLoginBody.user.email, 'hoangnam.media@gmail.com');
    assert.equal(approvedLoginBody.user.status, 'approved');
    assert.equal(approvedLoginBody.user.scopeMode, 'isolated');
  });
});

test('Bảo mật Web (Security Headers, Thu hồi Token khi Logout, và Chống dò mật khẩu Brute-Force 429)', async () => {
  await withTestServer(async ({ baseUrl }) => {
    // 1. Kiểm tra HTTP Security Headers
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.headers.get('x-frame-options'), 'DENY');
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(healthRes.headers.get('content-security-policy')?.includes("default-src 'self'"));

    // 2. Đặt mật khẩu Admin -> lấy session token -> Logout thu hồi token ngay trên server
    const setPassRes = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: '999888' }),
    });
    const { token } = await setPassRes.json();
    assert.ok(token);

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'X-Studio-Token': token },
    });
    assert.equal(logoutRes.status, 200);
    const logoutBody = await logoutRes.json();
    assert.equal(logoutBody.revoked, true);

    // Token cũ đã bị thu hồi -> gọi /api/overview bị chặn 401
    const afterLogoutRes = await fetch(`${baseUrl}/api/overview`, {
      headers: { 'X-Studio-Token': token },
    });
    assert.equal(afterLogoutRes.status, 401);

    // 3. Thử dò mật khẩu sai 8 lần liên tiếp từ 1 IP -> lần thứ 9 bị khóa 429
    for (let i = 0; i < 8; i += 1) {
      const failRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '203.0.113.99',
        },
        body: JSON.stringify({ password: `wrong-${i}` }),
      });
      assert.equal(failRes.status, 400);
    }

    const lockedRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.99',
      },
      body: JSON.stringify({ password: '999888' }),
    });
    assert.equal(lockedRes.status, 429);
  });
});

test('Đăng ký & Đăng nhập bằng Username (không cần @gmail.com), bắt buộc trên 3 chữ cái', async () => {
  await withTestServer(async ({ baseUrl }) => {
    // 1. Username chỉ có 3 chữ cái ('abc') -> bị từ chối 400
    const shortRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ngắn',
        email: 'abc',
        password: '123456',
      }),
    });
    assert.equal(shortRes.status, 400);

    // 2. Username có trên 3 chữ cái ('minhquan99') -> đăng ký thành công (pending)
    const validRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Minh Quân',
        email: 'minhquan99',
        password: '123456',
      }),
    });
    assert.equal(validRes.status, 201);
    const validBody = await validRes.json();
    assert.equal(validBody.user.email, 'minhquan99');
    assert.equal(validBody.user.status, 'pending');

    // 3. Admin duyệt -> đăng nhập bằng Username 'minhquan99' thành công
    await fetch(`${baseUrl}/api/users/${validBody.user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'minhquan99',
        password: '123456',
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginBody = await loginRes.json();
    assert.equal(loginBody.ok, true);
    assert.equal(loginBody.user.email, 'minhquan99');

    // 4. Giao diện & API của User thường không có quyền thấy hoặc chạy bất kỳ Bot nào (403 Forbidden)
    const userOverviewRes = await fetch(`${baseUrl}/api/overview`, {
      headers: { 'X-Studio-Token': loginBody.token },
    });
    const userOverviewData = await userOverviewRes.json();
    assert.equal(userOverviewData.botCenter, null);

    const userFootageRes = await fetch(`${baseUrl}/api/bots/footage/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Studio-Token': loginBody.token,
      },
      body: JSON.stringify({ query: 'test user' }),
    });
    assert.equal(userFootageRes.status, 403);
  });
});

test('Gà kết nối: Cho phép Set Pass (đặt/đổi mật khẩu riêng) và Lấy lại Pass khi quên (Reset Pass)', async () => {
  await withTestServer(async ({ baseUrl }) => {
    // Đặt mật khẩu khóa Web Admin là 'admin123'
    const passRes = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: 'admin123' }),
    });
    const { token } = await passRes.json();

    // 1. Đặt mật khẩu Gà kết nối riêng lần đầu (Set Pass): 'ga-vip-888'
    const setRes = await fetch(`${baseUrl}/api/auth/verify-ga`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Studio-Token': token,
      },
      body: JSON.stringify({
        action: 'set',
        newPassword: 'ga-vip-888',
      }),
    });
    assert.equal(setRes.status, 200);
    const setBody = await setRes.json();
    assert.equal(setBody.ok, true);
    assert.equal(setBody.hasCustomGaPassword, true);

    // 2. Mở khóa bằng mật khẩu sai -> báo lỗi 400
    const badUnlock = await fetch(`${baseUrl}/api/auth/verify-ga`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Studio-Token': token,
      },
      body: JSON.stringify({
        action: 'unlock',
        password: 'wrong-password',
      }),
    });
    assert.equal(badUnlock.status, 400);

    // 3. Mở khóa bằng đúng mật khẩu Gà ('ga-vip-888') -> 200
    const goodUnlock = await fetch(`${baseUrl}/api/auth/verify-ga`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Studio-Token': token,
      },
      body: JSON.stringify({
        action: 'unlock',
        password: 'ga-vip-888',
      }),
    });
    assert.equal(goodUnlock.status, 200);

    // 4. Quên mật khẩu Gà -> Lấy lại pass bằng mật khẩu đăng nhập Web ('admin123') và đặt pass mới 'ga-new-999'
    const resetRes = await fetch(`${baseUrl}/api/auth/verify-ga`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Studio-Token': token,
      },
      body: JSON.stringify({
        action: 'reset',
        recoveryPassword: 'admin123',
        newPassword: 'ga-new-999',
      }),
    });
    assert.equal(resetRes.status, 200);
    const resetBody = await resetRes.json();
    assert.equal(resetBody.ok, true);

    // 5. Mở khóa bằng mật khẩu Gà mới sau khi lấy lại ('ga-new-999') -> 200
    const unlockAfterReset = await fetch(`${baseUrl}/api/auth/verify-ga`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Studio-Token': token,
      },
      body: JSON.stringify({
        action: 'unlock',
        password: 'ga-new-999',
      }),
    });
    assert.equal(unlockAfterReset.status, 200);
  });
});


test('POST /api/ingest/content: tắt khi chưa có khóa, từ chối khóa sai, lưu vào Kho nội dung khi đúng khóa', async () => {
  const oldKey = process.env.STUDIOFLOW_INGEST_KEY;
  try {
    await withTestServer(async ({ baseUrl, store }) => {
      const post = (key, body) =>
        fetch(`${baseUrl}/api/ingest/content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Ingest-Key': key } : {}) },
          body: JSON.stringify(body),
        });

      delete process.env.STUDIOFLOW_INGEST_KEY;
      assert.equal((await post('whatever-key-1234567', { title: 'A' })).status, 503);

      process.env.STUDIOFLOW_INGEST_KEY = 'test-ingest-key-123456';
      assert.equal((await post('sai-khoa-sai-khoa-1', { title: 'A' })).status, 401);
      assert.equal((await post('', { title: 'A' })).status, 401);
      assert.equal((await post('test-ingest-key-123456', { title: '' })).status, 400);

      const ok = await post('test-ingest-key-123456', {
        title: 'Kịch bản người nổi tiếng',
        type: 'script',
        body: 'Nội dung kịch bản hoàn chỉnh',
        tags: 'celebrity',
      });
      assert.equal(ok.status, 201);
      const item = await ok.json();
      assert.ok(item.tags.includes('ingest') && item.tags.includes('celebrity'));
      assert.ok(store.listContentItems({ search: 'Kịch bản người nổi tiếng' }).length >= 1);
    });
  } finally {
    if (oldKey === undefined) delete process.env.STUDIOFLOW_INGEST_KEY;
    else process.env.STUDIOFLOW_INGEST_KEY = oldKey;
  }
});

test('Trung tâm 3 Bot (Bot 4 Sao lưu bất tử & Khôi phục 1-Click + Bot 2 Canh nổ view + Bot 1 Telegram Config)', async () => {
  await withTestServer(async ({ baseUrl, store }) => {
    // 1. Tạo dữ liệu mẫu để kiểm thử Bot 2 (Canh nổ view) & Bot 4 (Sao lưu bất tử)
    const ch = store.createChannel({
      name: 'Kênh Test Bot Nổ View',
      handle: '@TestBotChannel',
      group: 'Group Bot Test',
    });
    store.createVideo({
      title: 'Video Bình Thường 1',
      channelId: ch.id,
      initialViews: 1000,
    });
    store.createVideo({
      title: 'Video Bình Thường 2',
      channelId: ch.id,
      initialViews: 1200,
    });
    store.createVideo({
      title: 'Video Cắn Đề Xuất Nổ View',
      channelId: ch.id,
      initialViews: 15000,
    });

    // 2. Quét Bot 2 Watchdog
    const scanRes = await fetch(`${baseUrl}/api/bots/watchdog/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outlierThreshold: 1.5, minViralViews: 500 }),
    });
    assert.equal(scanRes.status, 200);
    const scanData = await scanRes.json();
    assert.equal(scanData.ok, true);
    const viralHit = scanData.watchdog.viralVideos.find((v) => v.title === 'Video Cắn Đề Xuất Nổ View');
    assert.ok(viralHit);
    assert.ok(viralHit.tubebuddyBooster && viralHit.tubebuddyBooster.pinnedCommentSuggestion);
    assert.ok(viralHit.tubebuddyBooster.endScreenStrategy.includes('End-Screen'));

    // 2b. Quét Bot 3 Nhắc Lịch Đăng Video, Canh Kênh Bỏ Quên & Auto Giao Đề Tài
    const schedRes = await fetch(`${baseUrl}/api/bots/schedule/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUploadEveryDays: 2, deadChannelDays: 5 }),
    });
    assert.equal(schedRes.status, 200);
    const schedData = await schedRes.json();
    assert.equal(schedData.ok, true);
    assert.ok(Array.isArray(schedData.scheduleRadar.scheduleItems));
    assert.ok(Array.isArray(schedData.scheduleRadar.managerKpis));
    assert.ok(
      schedData.scheduleRadar.scheduleItems.some(
        (it) => it.channelId === ch.id && it.primeUploadWindow && it.assignedTopicSuggestion
      )
    );

    // 3. Tạo Snapshot Bất Tử (Bot 4) kèm mã băm SHA-256 khi đang có kênh Test
    const snapRes = await fetch(`${baseUrl}/api/bots/backup/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Snapshot Trước Khi Xóa' }),
    });
    assert.equal(snapRes.status, 201);
    const snapData = await snapRes.json();
    assert.equal(snapData.ok, true);
    const savedSnapshotId = snapData.snapshot.id;
    assert.ok(savedSnapshotId);
    assert.ok(snapData.snapshot.sha256Checksum && snapData.snapshot.sha256Checksum.length >= 12);
    assert.equal(snapData.snapshot.integrityVerified, true);

    // 4. Xóa kênh Test đi, xác nhận kênh đã bị xóa & Bot 4 Auto-Shield tự động chụp Snapshot bảo vệ
    store.deleteChannel(ch.id);
    assert.equal(
      store.listChannels().some((c) => c.id === ch.id),
      false
    );
    assert.ok(
      store.getBotCenterStatus().snapshots.some((s) => String(s.label).includes('Auto-Shield'))
    );

    // 5. Bấm Khôi phục 1-Click từ Snapshot vừa lưu (Bot 4) -> Kênh và Video quay trở lại nguyên vẹn!
    const restoreRes = await fetch(`${baseUrl}/api/bots/backup/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotId: savedSnapshotId }),
    });
    assert.equal(restoreRes.status, 200);
    const restoreData = await restoreRes.json();
    assert.equal(restoreData.ok, true);
    assert.equal(
      store.listChannels().some((c) => c.id === ch.id && c.name === 'Kênh Test Bot Nổ View'),
      true
    );

    // 6. Bot 5 — Săn Ngách, Dò Kênh Đối Thủ (NexLev + vidIQ + 1of10 + Viewstats + SocialBlade)
    const spyScan = await store.runCompetitorHunterScan({
      handleOrUrl: '@MockCompetitor',
      outlierThreshold: 1.5,
      channelFetcher: async () => ({
        name: 'Kênh Đối Thủ Test',
        handle: '@MockCompetitor',
        channelUrl: 'https://www.youtube.com/@MockCompetitor',
        subscribers: 50000,
        recentVideos: [
          { videoId: 'vid001', title: 'Bí Mật Làm Giàu Ngách AI Automation', views: 10000, publishedText: '5 days ago' },
          { videoId: 'vid002', title: 'Hướng Dẫn Cơ Bản AI Automation', views: 12000, publishedText: '4 days ago' },
          { videoId: 'vid003', title: 'Siêu Phẩm AI Automation Nổ Triệu View', views: 95000, publishedText: '1 day ago' },
        ],
      }),
    });
    assert.equal(spyScan.channelName, 'Kênh Đối Thủ Test');
    assert.equal(spyScan.outlierCount, 1);
    assert.equal(spyScan.outliers[0].videoId, 'vid003');
    assert.equal(spyScan.outliers[0].oneOfTenRank, 1);
    assert.ok(spyScan.outliers[0].oneOfTenBadge.includes('1/10'));
    assert.ok(spyScan.outliers[0].multiplier >= 2);
    assert.ok(spyScan.outliers[0].vph > 100);
    assert.ok(spyScan.outliers[0].viewsToSubRatio >= 1.5);
    assert.equal(spyScan.outliers[0].isDiamondOutlier, true);
    assert.ok(spyScan.nexlevDossier && spyScan.nexlevDossier.avgVph > 0);
    assert.ok(spyScan.nexlevDossier.facelessVerdict.includes('Faceless'));
    assert.ok(spyScan.vidiqAudit && spyScan.vidiqAudit.seoScore >= 75);
    assert.ok(spyScan.vidiqAudit.tagsCsv.includes('automation'));
    assert.ok(spyScan.socialBladeDossier && spyScan.socialBladeDossier.grade);
    assert.ok(spyScan.socialBladeDossier.monthlyEarningsRange.includes('$'));
    assert.ok(spyScan.oneOfTenDossier && spyScan.oneOfTenDossier.best1of10Video);
    assert.ok(Array.isArray(spyScan.oneOfTenDossier.deadTopicsToAvoid));
    assert.ok(spyScan.viewstatsDossier && spyScan.viewstatsDossier.sweetSpotDuration);
    assert.ok(spyScan.estimatedMonthlyRevenueUsd > 0);
    assert.ok(spyScan.estimatedRpmUsd > 0);
    assert.ok(spyScan.hotKeywords.some((k) => k.word === 'automation'));
    assert.ok(Array.isArray(spyScan.trendingPhrases) && spyScan.trendingPhrases.length > 0);
    assert.ok(spyScan.trendingPhrases.some((p) => p.phrase.includes('ai automation')));

    // 7. Bot 6 — Dịch Ngược REA (/rea), ThumbsUp.tv Safe-Zone, TubeBuddy A/B & Canva Pack
    const thumbRes = await fetch(`${baseUrl}/api/bots/thumbnail/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoUrlOrTitle: 'Bí Mật Kiếm 10.000 USD Từ YouTube Nước Ngoài',
        stylePreset: 'mrbeast',
      }),
    });
    assert.equal(thumbRes.status, 200);
    const thumbData = await thumbRes.json();
    assert.equal(thumbData.ok, true);
    assert.ok(thumbData.cloneItem.ctrScore >= 80);
    assert.equal(thumbData.cloneItem.hookVariants.length, 3);
    assert.ok(thumbData.cloneItem.designStudioPack && thumbData.cloneItem.designStudioPack.thumbsUpPreview);
    assert.equal(thumbData.cloneItem.designStudioPack.canvaPhotoshopPack.primaryHex, '#FFD700');
    assert.ok(thumbData.cloneItem.prompts.midjourney.includes('--ar 16:9'));
    assert.ok(thumbData.cloneItem.prompts.fluxIdeogram.length > 20);
    assert.ok(thumbData.cloneItem.prompts.reaReconstruction.includes('REA 1:1'));
    assert.ok(thumbData.cloneItem.reaDossier && thumbData.cloneItem.reaDossier.binaryEvidence);
    assert.ok(thumbData.cloneItem.prompts.vietnameseBrief.length > 20);
    assert.ok(Array.isArray(thumbData.cloneItem.referenceGallery) && thumbData.cloneItem.referenceGallery.length >= 4);
    assert.ok(thumbData.cloneItem.proxiedBackdropUrl.includes('/api/bots/footage/download'));
    assert.ok(thumbData.cloneItem.externalStudioLinks && thumbData.cloneItem.externalStudioLinks.canvaUrl);

    // Kiểm thử nút Again (variationSeed = 1) đổi phương án Giật Tít & Phối màu
    const thumbAgainRes = await fetch(`${baseUrl}/api/bots/thumbnail/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Bí Mật Kiếm 10.000 USD Từ YouTube Nước Ngoài',
        customStyle: 'luxury_gold',
        variationSeed: 1,
      }),
    });
    assert.equal(thumbAgainRes.status, 200);
    const thumbAgainData = await thumbAgainRes.json();
    assert.equal(thumbAgainData.cloneItem.variationSeed, 1);
    assert.equal(thumbAgainData.cloneItem.designStudioPack.canvaPhotoshopPack.primaryHex, '#38BDF8');

    // 8. Bot 7 (Bot 9) — Săn Từ Khóa vidIQ + Ngách Đại Dương Xanh Ít Cạnh Tranh + 12 Thị Trường (/trend)
    const trendScan = await store.runTrendHunterScan({
      seedKeyword: 'tiểu sử tỷ phú',
      market: 'vi',
      suggestFetcher: async (q) => [
        `${q} tự thân làm giàu`,
        `${q} bí mật thành công 2026`,
        `cách ${q} đầu tư bất động sản`,
      ],
    });
    assert.equal(trendScan.seedKeyword, 'tiểu sử tỷ phú');
    assert.ok(trendScan.totalKeywords >= 6);
    assert.ok(trendScan.marketInfo && trendScan.marketInfo.code === 'vi');
    assert.ok(Array.isArray(trendScan.blueOceanNiches) && trendScan.blueOceanNiches.length === 5);
    assert.ok(trendScan.blueOceanNiches[0].competitionScore <= 25);
    assert.ok(trendScan.blueOceanNiches[0].opportunityScore >= 90);
    assert.ok(trendScan.blueOceanNiches[0].subNicheKeyword.includes('tiểu sử tỷ phú'));
    assert.ok(trendScan.keywords.some((k) => k.keyword.includes('tự thân làm giàu')));
    assert.ok(trendScan.keywords[0].opportunityScore >= 75);
    assert.ok(trendScan.keywords[0].vidiqVolumeScore >= 60);
    assert.ok(trendScan.keywords[0].vidiqCompetitionScore >= 15);
    assert.ok(trendScan.keywords[0].vidiqOverallScore >= 75);
    assert.ok(trendScan.keywords[0].googleTrendsWave);
    assert.ok(Array.isArray(trendScan.keywords[0].audienceQuestions) && trendScan.keywords[0].audienceQuestions.length === 3);
    assert.ok(trendScan.keywords[0].voiceoverHook30s.includes('99%'));
    assert.ok(trendScan.keywords[0].vidiqTagsCsv.includes('tiểu sử tỷ phú'));
    assert.ok(trendScan.vidiqSummary && trendScan.vidiqSummary.bestOverallScore >= 75);
    assert.ok(trendScan.vidiqSummary.masterTagsCsv.includes('tiểu sử tỷ phú'));
    assert.ok(trendScan.keywords[0].seoPackage.scriptOutline5Parts.includes('Phần 1'));

    // Kiểm thử đa thị trường quốc tế RPM cao (Nhật Bản JP & Đức DE)
    const jpTrendScan = await store.runTrendHunterScan({
      seedKeyword: '歴史 ミステリー',
      market: 'jp',
      suggestFetcher: async (q) => [`${q} 2026`, `${q} 真相`],
    });
    assert.equal(jpTrendScan.market, 'jp');
    assert.ok(jpTrendScan.marketInfo.label.includes('Nhật Bản'));
    assert.ok(jpTrendScan.marketInfo.rpmRange.includes('$6.0'));
    assert.equal(jpTrendScan.blueOceanNiches.length, 5);
    assert.ok(jpTrendScan.blueOceanNiches[0].subNicheKeyword.includes('歴史 ミステリー'));

    const compTrendScan = await store.runTrendHunterScan({
      seedKeyword: '@MockCompetitor',
      market: 'vi',
      channelFetcher: async () => ({
        name: 'Kênh Đối Thủ Test',
        handle: '@MockCompetitor',
        channelUrl: 'https://www.youtube.com/@MockCompetitor',
        subscribers: 50000,
        recentVideos: [
          { videoId: 'vid001', title: 'Bí Mật Làm Giàu Ngách AI Automation', views: 10000, publishedText: '5 days ago' },
          { videoId: 'vid002', title: 'Hướng Dẫn Cơ Bản AI Automation', views: 12000, publishedText: '4 days ago' },
          { videoId: 'vid003', title: 'Siêu Phẩm AI Automation Nổ Triệu View', views: 95000, publishedText: '1 day ago' },
        ],
      }),
      suggestFetcher: async (q) => [`${q} kiếm tiền youtube 2026`, `${q} cho người mới`],
    });
    assert.ok(compTrendScan.sourceChannel);
    assert.equal(compTrendScan.sourceChannel.handle, '@MockCompetitor');
    assert.ok(Array.isArray(compTrendScan.nicheCompetitors) && compTrendScan.nicheCompetitors.length > 0);
    assert.ok(compTrendScan.keywords.some((k) => k.keyword.includes('ai automation')));

    // 9. Bot 11 — Đếm Ngược BKT, Bảo Vệ Gà AdSense & Dự Báo Dòng Tiền SocialBlade (/ga & /revenue)
    store.updateChannel(ch.id, {
      subscribers: 920,
      watchHours: 3800,
      adsenseAccount: 'PUB-GA-88889999',
      monthlyRevenue: { m1: 1200, m2: 1850 },
    });
    const shieldRes = await fetch(`${baseUrl}/api/bots/monetization/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxChannelsPerGa: 2, bktAlertThresholdPct: 70 }),
    });
    assert.equal(shieldRes.status, 200);
    const shieldData = await shieldRes.json();
    assert.equal(shieldData.ok, true);
    assert.ok(shieldData.monetizationShield.summary.totalYearlyRevenue >= 3050);
    assert.ok(shieldData.monetizationShield.revenueForecast.projectedNext30DaysUsd > 0);
    assert.ok(shieldData.monetizationShield.revenueForecast.projectedEndOfYearUsd > 0);
    assert.ok(
      shieldData.monetizationShield.bktCandidates.some(
        (c) => c.channelId === ch.id && c.overallPct >= 90 && Boolean(c.bktEtaLabel)
      )
    );

    // 10. Bot 12 — Đồng Bộ Báo Cáo Đám Mây & Bảng Xếp Hạng CFO Unit Economics ($/Video)
    const cloudRes = await fetch(`${baseUrl}/api/bots/cloud/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifyTelegram: false }),
    });
    assert.equal(cloudRes.status, 200);
    const cloudData = await cloudRes.json();
    assert.equal(cloudData.ok, true);
    assert.ok(Array.isArray(cloudData.cloudReport.groupLeaderboard));
    assert.ok(cloudData.cloudReport.groupLeaderboard[0].revenuePerVideoUsd >= 0);
    assert.ok(Array.isArray(cloudData.cloudReport.managerLeaderboard));
    assert.ok(cloudData.cloudReport.rows.some((r) => r.revenuePerVideoUsd > 0));
    assert.ok(cloudData.cloudReport.sheetsTsv.includes('Kênh Test Bot Nổ View'));
    assert.ok(cloudData.cloudReport.notionMarkdown.includes('BÁO CÁO ĐÁM MÂY HỆ THỐNG KÊNH ACB9X'));
    assert.ok(cloudData.cloudReport.csvContent.includes('Kênh Test Bot Nổ View'));

    // 11. Bot 10 — Kho Săn & Tải Footage Đa Nền Tảng 4K (/footage)
    const footageRes = await fetch(`${baseUrl}/api/bots/footage/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'sức khỏe người già',
        category: 'health_elderly',
        notifyTelegram: false,
      }),
    });
    assert.equal(footageRes.status, 200);
    const footageData = await footageRes.json();
    assert.equal(footageData.ok, true);
    assert.ok(footageData.footageScan);
    assert.equal(footageData.footageScan.category, 'health_elderly');
    assert.ok(footageData.footageScan.queryPack.englishCinematicQuery.includes('elderly'));
    assert.ok(footageData.footageScan.queryPack.chineseDouyinQuery.length > 0);
    assert.ok(
      Array.isArray(footageData.footageScan.directDownloadClips) &&
        footageData.footageScan.directDownloadClips.length >= 6
    );
    assert.ok(
      footageData.footageScan.directDownloadClips[0].downloadApiUrl.includes(
        '/api/bots/footage/download?'
      )
    );
    assert.ok(
      Array.isArray(footageData.footageScan.platformHubs) &&
        footageData.footageScan.platformHubs.length >= 10
    );
    assert.ok(
      Array.isArray(footageData.footageScan.shotlist5Scenes) &&
        footageData.footageScan.shotlist5Scenes.length === 5
    );
    assert.ok(
      footageData.footageScan.downloadPackages.batchDownloaderBat.includes('yt-dlp')
    );
    assert.ok(
      footageData.footageScan.downloadPackages.shotlistTxt.includes('SHOTLIST 5 ĐẠI CẢNH')
    );
    assert.ok(
      footageData.footageScan.downloadPackages.footageCsv.includes('Direct MP4 Clip')
    );
    assert.ok(
      footageData.footageScan.aiAgentDirector &&
        Array.isArray(footageData.footageScan.aiAgentDirector.agents) &&
        footageData.footageScan.aiAgentDirector.agents.length === 5
    );

    // 12. Bot 10 — Bóc tách File Excel/Sheet/Notion/Kịch Bản Dựng Từng Cảnh + AI Agent + Nút Again (Re-roll) + QC 1 Lượt
    const scriptRes = await fetch(`${baseUrl}/api/bots/footage/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'Đế chế tỷ phú & AI',
        category: 'cinematic',
        agentMode: 'luxury_cinema',
        variationSeed: 1,
        scriptText: [
          '00:00-00:05 | Mở đầu bằng cảnh siêu du thuyền tỷ phú lướt trên đại dương | siêu du thuyền tỷ phú',
          '00:05-00:15 | Bên trong sàn giao dịch chứng khoán Phố Wall căng thẳng | chứng khoán phố wall',
          '00:15-00:30 | Trí tuệ nhân tạo AI và robot điều khiển ngân hàng | trí tuệ nhân tạo AI',
        ].join('\n'),
        notifyTelegram: false,
      }),
    });
    assert.equal(scriptRes.status, 200);
    const scriptData = await scriptRes.json();
    assert.equal(scriptData.ok, true);
    assert.equal(scriptData.footageScan.agentMode, 'luxury_cinema');
    assert.equal(scriptData.footageScan.variationSeed, 1);
    assert.equal(scriptData.footageScan.totalScriptScenes, 3);
    assert.equal(scriptData.footageScan.scriptScenesBreakdown.length, 3);
    assert.ok(
      scriptData.footageScan.scriptScenesBreakdown[0].matchedClip.filename.includes('Scene-01-') &&
        scriptData.footageScan.scriptScenesBreakdown[0].matchedClip.filename.includes('-v2.mp4')
    );
    assert.ok(
      scriptData.footageScan.scriptScenesBreakdown[0].qcReport &&
        scriptData.footageScan.scriptScenesBreakdown[0].qcReport.qcPassed === true &&
        scriptData.footageScan.scriptScenesBreakdown[0].qcReport.qcScore >= 90 &&
        scriptData.footageScan.scriptScenesBreakdown[0].qcReport.previewImageUrl.startsWith('https://i.ytimg.com/vi/') &&
        scriptData.footageScan.scriptScenesBreakdown[0].qcReport.finalApprovedLink.startsWith('https://www.youtube.com/watch?v=')
    );
    assert.ok(
      Array.isArray(scriptData.footageScan.editorialPhotos) &&
        scriptData.footageScan.editorialPhotos.length >= 6 &&
        scriptData.footageScan.editorialPhotos[0].gettyPhotosUrl.startsWith('https://www.gettyimages.com/photos/') &&
        scriptData.footageScan.editorialPhotos[0].imdbUrl.startsWith('https://www.imdb.com/') &&
        scriptData.footageScan.editorialPhotos[0].alamyUrl.startsWith('https://www.alamy.com/stock-photo/') &&
        scriptData.footageScan.editorialPhotos[0].istockPhotosUrl.startsWith('https://www.istockphoto.com/search/2/image')
    );
    assert.ok(
      scriptData.footageScan.platformHubs.length >= 14 &&
        scriptData.footageScan.platformHubs.some((p) => p.id === 'getty_images') &&
        scriptData.footageScan.platformHubs.some((p) => p.id === 'imdb_stills') &&
        scriptData.footageScan.platformHubs.some((p) => p.id === 'alamy_stock') &&
        scriptData.footageScan.platformHubs.some((p) => p.id === 'istockphoto')
    );
    assert.ok(
      scriptData.footageScan.scriptScenesBreakdown[0].editorialPhoto &&
        scriptData.footageScan.scriptScenesBreakdown[0].platformLinks.gettyPhotosUrl.startsWith('https://www.gettyimages.com/photos/') &&
        scriptData.footageScan.scriptScenesBreakdown[0].platformLinks.imdbUrl.startsWith('https://www.imdb.com/') &&
        scriptData.footageScan.scriptScenesBreakdown[0].platformLinks.alamyUrl.startsWith('https://www.alamy.com/stock-photo/') &&
        scriptData.footageScan.scriptScenesBreakdown[0].platformLinks.istockPhotosUrl.startsWith('https://www.istockphoto.com/search/2/image')
    );
    assert.ok(
      scriptData.footageScan.scriptScenesBreakdown[0].agentDirectorNote.cameraAngle.length > 0
    );
    assert.ok(
      scriptData.footageScan.downloadPackages.batchDownloaderBat.includes('Scene-01-')
    );
  });
});

