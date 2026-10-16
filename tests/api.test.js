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
