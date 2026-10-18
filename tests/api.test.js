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

