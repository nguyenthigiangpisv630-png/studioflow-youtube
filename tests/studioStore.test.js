import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StudioStore } from '../src/domain/studioStore.js';

function createTempStore(seedIfEmpty = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studioflow-test-'));
  const filePath = path.join(dir, 'studio-db.json');
  return {
    store: new StudioStore({ filePath, seedIfEmpty }),
    filePath,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

test('CRM Sales Pipeline: tạo deal, cập nhật giai đoạn và tính tổng doanh thu pipeline / won', () => {
  const { store, cleanup } = createTempStore(false);
  try {
    const deal1 = store.createDeal({
      clientName: 'Nguyễn Minh Quân',
      company: 'TechGear VN',
      contactEmail: 'quan@techgear.vn',
      contactPhone: '0901234567',
      value: 45000000,
      stage: 'negotiation',
      owner: 'Lan Anh',
      notes: 'Tài trợ 1 video review laptop gaming + ghim link bình luận',
    });

    const deal2 = store.createDeal({
      clientName: 'Trần Thu Hà',
      company: 'Fintech Cloud',
      value: 80000000,
      stage: 'won',
      owner: 'Minh Đức',
    });

    assert.ok(deal1.id);
    assert.equal(deal1.stage, 'negotiation');
    assert.equal(deal2.stage, 'won');

    const summaryBefore = store.getDashboardSummary('2026-10-16');
    assert.equal(summaryBefore.crm.totalDeals, 2);
    assert.equal(summaryBefore.crm.wonRevenue, 80000000);
    assert.equal(summaryBefore.crm.activePipelineValue, 45000000);

    const updated = store.updateDeal(deal1.id, { stage: 'won' });
    assert.equal(updated.stage, 'won');

    const summaryAfter = store.getDashboardSummary('2026-10-16');
    assert.equal(summaryAfter.crm.wonRevenue, 125000000);
    assert.equal(summaryAfter.crm.activePipelineValue, 0);
  } finally {
    cleanup();
  }
});

test('Deal-to-Project Conversion: chuyển đổi Deal CRM sang Dự án sản xuất YouTube kèm các đầu việc mặc định', () => {
  const { store, cleanup } = createTempStore(false);
  try {
    const deal = store.createDeal({
      clientName: 'Lê Hoàng',
      company: 'Smarthome Việt',
      value: 60000000,
      stage: 'negotiation',
      owner: 'Hoàng Nam',
    });

    const project = store.convertDealToProject(deal.id, {
      dueDate: '2026-10-25',
    });

    assert.equal(project.dealId, deal.id);
    assert.equal(project.clientName, 'Smarthome Việt');
    assert.equal(project.budget, 60000000);
    assert.equal(project.status, 'ideation');
    assert.ok(project.tasks.length >= 4, 'Phải khởi tạo sẵn checklist công việc sản xuất YouTube');

    // Deal tự động chuyển sang trạng thái won khi đã lập dự án sản xuất
    const updatedDeal = store.listDeals().find((d) => d.id === deal.id);
    assert.equal(updatedDeal.stage, 'won');
    assert.equal(updatedDeal.projectId, project.id);

    // Chuyển đổi lại cùng 1 deal không được tạo dự án trùng lặp
    const secondConvert = store.convertDealToProject(deal.id);
    assert.equal(secondConvert.id, project.id);
  } finally {
    cleanup();
  }
});

test('Project Management: quản lý tiến độ công việc (Tasks) và tự động tính phần trăm hoàn thành dự án', () => {
  const { store, cleanup } = createTempStore(false);
  try {
    const project = store.createProject({
      title: 'Video Đánh Giá MacBook M4 Toàn Diện',
      status: 'scripting',
      priority: 'high',
      owner: 'Minh Đức',
      dueDate: '2026-10-20',
    });

    const t1 = store.addTaskToProject(project.id, {
      title: 'Viết kịch bản chi tiết & Hook 30s đầu',
      assignee: 'Lan Anh',
      stage: 'scripting',
    });
    const t2 = store.addTaskToProject(project.id, {
      title: 'Quay A-roll và B-roll sản phẩm',
      assignee: 'Quốc Bảo',
      stage: 'production',
    });

    assert.equal(store.listProjects()[0].progress, 0);

    store.toggleProjectTask(project.id, t1.id);
    assert.equal(store.listProjects()[0].progress, 50);

    store.toggleProjectTask(project.id, t2.id);
    assert.equal(store.listProjects()[0].progress, 100);
  } finally {
    cleanup();
  }
});

test('Content Vault (Nơi lưu nội dung): lưu kịch bản, SEO tags, link tài nguyên và lọc theo dự án/từ khóa', () => {
  const { store, cleanup } = createTempStore(false);
  try {
    const project = store.createProject({
      title: 'Series AI Cho Doanh Nghiệp Tập 1',
      status: 'scripting',
    });

    const scriptItem = store.createContentItem({
      title: 'Kịch bản Tập 1: Tự động hóa quy trình Sales với AI',
      type: 'script',
      projectId: project.id,
      body: '# Hook (0:00 - 0:30)\nTại sao 80% đội ngũ Sales mất 3 tiếng mỗi ngày chỉ để nhập liệu?\n\n# Nội dung chính\n1. Xây dựng phễu CRM\n2. Kết nối nội dung video YouTube...',
      assetUrl: 'https://drive.google.com/drive/folders/example-script-01',
      tags: ['AI', 'CRM', 'Sales', 'Kịch bản'],
      status: 'approved',
      author: 'Lan Anh',
    });

    const footageItem = store.createContentItem({
      title: 'Thư mục Raw Footage 4K & Thumbnail PSD',
      type: 'footage',
      projectId: project.id,
      body: 'Bao gồm 12 file MP4 quay máy Sony FX3 và 3 phương án Thumbnail A/B testing.',
      assetUrl: 'https://drive.google.com/drive/folders/example-footage-01',
      tags: ['Footage 4K', 'Thumbnail'],
      status: 'draft',
    });

    assert.ok(scriptItem.id);
    assert.equal(scriptItem.wordCount > 10, true);

    const byProject = store.listContentItems({ projectId: project.id });
    assert.equal(byProject.length, 2);

    const byType = store.listContentItems({ type: 'script' });
    assert.equal(byType.length, 1);
    assert.equal(byType[0].id, scriptItem.id);

    const bySearch = store.listContentItems({ search: 'Sony FX3' });
    assert.equal(bySearch.length, 1);
    assert.equal(bySearch[0].id, footageItem.id);
  } finally {
    cleanup();
  }
});

test('YouTube Daily Views Engine: cập nhật chỉ số lượt xem hằng ngày, upsert cùng ngày và tính chính xác dailyViewsDelta', async () => {
  const { store, cleanup } = createTempStore(false);
  try {
    const video = store.createVideo({
      title: 'Cách Xây Dựng Hệ Thống CRM & Quản Lý Kênh YouTube Hiệu Quả',
      youtubeVideoId: 'dQw4w9WgXcQ',
      channelId: 'ch-main',
      publishedAt: '2026-10-14',
      initialViews: 10000,
      initialLikes: 600,
      initialComments: 45,
      metricDate: '2026-10-14',
    });

    // Ngày 2026-10-15: Lượt xem lên 15,400 (+5,400 lượt xem trong ngày)
    const afterDay2 = store.recordVideoDailyMetrics(video.id, {
      date: '2026-10-15',
      views: 15400,
      likes: 920,
      comments: 78,
    });
    assert.equal(afterDay2.currentViews, 15400);
    assert.equal(afterDay2.dailyViewsDelta, 5400);
    assert.equal(afterDay2.metricsHistory.length, 2);

    // Ngày 2026-10-16 buổi sáng: Lượt xem lên 21,000 (+5,600 so với 15/10)
    store.recordVideoDailyMetrics(video.id, {
      date: '2026-10-16',
      views: 21000,
      likes: 1200,
      comments: 110,
    });

    // Ngày 2026-10-16 buổi tối cập nhật lại: Lượt xem lên 23,500 (Phải upsert đúng ngày 2026-10-16 và tính delta = 23,500 - 15,400 = 8,100)
    const afterDay3Evening = store.recordVideoDailyMetrics(video.id, {
      date: '2026-10-16',
      views: 23500,
      likes: 1350,
      comments: 125,
    });

    assert.equal(afterDay3Evening.metricsHistory.length, 3, 'Không được tạo trùng 2 bản ghi cho cùng ngày 2026-10-16');
    assert.equal(afterDay3Evening.currentViews, 23500);
    assert.equal(afterDay3Evening.dailyViewsDelta, 8100);
    assert.equal(afterDay3Evening.lastUpdatedDate, '2026-10-16');

    // Kiểm tra đồng bộ tự động hằng ngày (syncAllVideosDailyMetrics) sang ngày 2026-10-17
    const syncResult = await store.syncAllVideosDailyMetrics({
      date: '2026-10-17',
      fetcher: async (v) => ({
        views: v.currentViews + 4200,
        likes: v.currentLikes + 180,
        comments: v.currentComments + 22,
      }),
    });

    assert.equal(syncResult.date, '2026-10-17');
    assert.equal(syncResult.updatedCount, 1);
    assert.equal(syncResult.totalDailyViewsGained, 4200);

    const summary = store.getDashboardSummary('2026-10-17');
    assert.equal(summary.youtube.totalViews, 27700);
    assert.equal(summary.youtube.todayViewsDelta, 4200);
  } finally {
    cleanup();
  }
});

test('YouTube Channel Management: nhập kênh mới vào và cập nhật tình trạng kênh (status, monetization, subscribers, statusNote)', () => {
  const { store, cleanup } = createTempStore(false);
  try {
    const channel = store.createChannel({
      name: 'AI Creator Lab',
      handle: '@AICreatorLab',
      channelUrl: 'https://youtube.com/@AICreatorLab',
      subscribers: 12500,
      category: 'Công nghệ AI',
      manager: 'Minh Đức',
      status: 'incubating',
      monetization: 'pending',
      strikeCount: 0,
      statusNote: 'Đang xây kênh mới, đã đủ 4.000h xem, chờ duyệt bật kiếm tiền.',
    });

    assert.ok(channel.id);
    assert.equal(channel.name, 'AI Creator Lab');
    assert.equal(channel.status, 'incubating');
    assert.equal(channel.monetization, 'pending');

    const updated = store.updateChannel(channel.id, {
      status: 'monetized',
      monetization: 'enabled',
      subscribers: 15800,
      strikeCount: 0,
      statusNote: 'Đã duyệt BKT ngày 16/10, kênh xanh sạch, tương tác tăng tốt.',
    });

    assert.equal(updated.status, 'monetized');
    assert.equal(updated.monetization, 'enabled');
    assert.equal(updated.subscribers, 15800);
    assert.equal(updated.statusNote, 'Đã duyệt BKT ngày 16/10, kênh xanh sạch, tương tác tăng tốt.');
  } finally {
    cleanup();
  }
});

test('Auto-fetch YouTube Channel on Save: chỉ nhập URL hoặc tên kênh (@TinyWrist) khi bấm lưu sẽ tự động điền thông tin kênh và nạp danh sách video', async () => {
  const { store, cleanup } = createTempStore(false);
  try {
    const mockChannelFetcher = async (query) => {
      assert.ok(query.includes('TinyWrist'));
      return {
        name: 'Tiny Wrist',
        handle: '@TinyWrist',
        channelUrl: 'https://www.youtube.com/@TinyWrist',
        externalId: 'UCgobTJzPKYEgJOhh3X2d9TA',
        subscribers: 151000,
        category: 'Giáo dục & Văn hóa',
        description: 'Celebrating Vietnamese culture and language, via book and music.',
        videos: [
          {
            youtubeVideoId: 'vid_tw_01',
            title: 'Vietnamese Folk Songs For Kids',
            views: 84200,
            likes: 3100,
            comments: 190,
            publishedAt: '2026-10-10',
          },
          {
            youtubeVideoId: 'vid_tw_02',
            title: 'Learn Colors in Vietnamese',
            views: 42500,
            likes: 1850,
            comments: 95,
            publishedAt: '2026-10-14',
          },
        ],
      };
    };

    const result = await store.createChannelAndSync(
      {
        channelUrl: 'https://www.youtube.com/@TinyWrist',
      },
      { channelFetcher: mockChannelFetcher }
    );

    assert.equal(result.channel.name, 'Tiny Wrist');
    assert.equal(result.channel.handle, '@TinyWrist');
    assert.equal(result.channel.subscribers, 151000);
    assert.ok(result.channel.statusNote.includes('Celebrating Vietnamese culture'));
    assert.equal(result.importedVideosCount, 2);

    const channelVideos = store.listVideos({ channelId: result.channel.id });
    assert.equal(channelVideos.length, 2);
    assert.equal(channelVideos[0].currentViews + channelVideos[1].currentViews, 126700);
  } finally {
    cleanup();
  }
});

test('Deep YouTube Studio Ingest & Notion Auto-Sync Config: nhận chỉ số trực tiếp từ YouTube Studio (totalViews, watchHours) và cấu hình Notion Page ID', () => {
  const { store, cleanup } = createTempStore(false);
  try {
    const ch = store.createChannel({
      name: '1970s Show',
      handle: '@1970sShow',
      channelUrl: 'https://www.youtube.com/@1970sShow',
      subscribers: 48,
      totalVideos: 14,
      totalViews: 32944,
    });

    const synced = store.ingestYouTubeStudioMetrics({
      handle: '@1970sShow',
      totalViews: 34515,
      watchHours: 2200,
      subscribers: 48,
    });

    assert.equal(synced.id, ch.id);
    assert.equal(synced.totalViews, 34515);
    assert.equal(synced.watchHours, 2200);

    const notionCfg = store.updateNotionConfig({
      notionToken: 'ntn_secret_1234567890',
      notionPageUrl: 'https://www.notion.so/Kho-Kich-Ban-YouTube-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
      autoSync: true,
    });

    assert.equal(notionCfg.configured, true);
    assert.equal(notionCfg.notionPageId, '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d');
    assert.equal(store.hasNotionAutoSync(), true);
  } finally {
    cleanup();
  }
});

test('Top 3 Highest-Viewed Videos on Sync/Update: quét hàng loạt video của kênh và liệt kê đúng 3 video có lượng view cao nhất theo thứ tự giảm dần', async () => {
  const { store, cleanup } = createTempStore(false);
  try {
    const mockChannelFetcher = async () => ({
      name: '1970s Show',
      handle: '@1970sShow',
      channelUrl: 'https://www.youtube.com/@1970sShow',
      subscribers: 48,
      totalVideos: 5,
      totalViews: 32074,
      videos: [
        { youtubeVideoId: 'v1', title: 'Video A', views: 500, publishedAt: '2026-10-01' },
        { youtubeVideoId: 'v2', title: 'How Tall Was John Wayne', views: 23524, publishedAt: '2026-09-29' },
        { youtubeVideoId: 'v3', title: 'Video C', views: 253, publishedAt: '2026-10-02' },
        { youtubeVideoId: 'v4', title: 'Stephen Fry & 13 British TV Stars', views: 4063, publishedAt: '2026-10-04' },
        { youtubeVideoId: 'v5', title: '12 Old Hollywood Giants', views: 3237, publishedAt: '2026-09-30' },
      ],
    });

    const created = await store.createChannelAndSync(
      { handle: '@1970sShow' },
      { channelFetcher: mockChannelFetcher }
    );

    assert.ok(Array.isArray(created.topVideos), 'Kết quả cập nhật kênh phải trả về mảng topVideos');
    assert.equal(created.topVideos.length, 3, 'Phải liệt kê đúng 3 video nhiều view nhất');
    assert.equal(created.topVideos[0].youtubeVideoId, 'v2');
    assert.equal(created.topVideos[0].views, 23524);
    assert.equal(created.topVideos[1].youtubeVideoId, 'v4');
    assert.equal(created.topVideos[1].views, 4063);
    assert.equal(created.topVideos[2].youtubeVideoId, 'v5');
    assert.equal(created.topVideos[2].views, 3237);

    const top3FromStore = store.getChannelTopVideos(created.channel.id, 3);
    assert.equal(top3FromStore.length, 3);
    assert.deepEqual(
      top3FromStore.map((v) => v.youtubeVideoId),
      ['v2', 'v4', 'v5']
    );
  } finally {
    cleanup();
  }
});

test('Exact YouTube Views on Sync: đồng bộ kênh hoặc đồng bộ hằng ngày phải đưa về đúng con số thực tế trên YouTube, không bao giờ tự cộng view ảo', async () => {
  const { store, cleanup } = createTempStore(false);
  try {
    const ch = store.createChannel({
      name: 'FOOD 75',
      handle: '@FOOD75-h2q',
      channelUrl: 'https://www.youtube.com/@FOOD75-h2q',
      subscribers: 4,
      totalVideos: 3,
      totalViews: 84585, // Giả sử trước đó bị nhảy số ảo
    });

    // Giả sử video bị lưu nhầm số view ảo cao hơn thực tế (2279 thay vì 442)
    store.createVideo({
      title: "6 Tables Randy 'Macho Man' Savage Sat At",
      youtubeVideoId: 'd_Ft0bFYLxg',
      channelId: ch.id,
      publishedAt: '2026-10-05',
      initialViews: 2279,
      metricDate: '2026-10-16',
    });

    const mockExactFetcher = async (query) => {
      if (!String(query).includes('FOOD75')) return null;
      return {
        name: 'FOOD 75',
        handle: '@FOOD75-h2q',
        channelUrl: 'https://www.youtube.com/@FOOD75-h2q',
        subscribers: 4,
        totalVideos: 3,
        totalViews: 929,
        videos: [
          { youtubeVideoId: 'd_Ft0bFYLxg', title: "6 Tables Randy 'Macho Man' Savage Sat At", views: 443, publishedAt: '2026-10-05' },
          { youtubeVideoId: 'd5giUxqaVy8', title: '10 Wild Foods Andre the Giant Used', views: 294, publishedAt: '2026-10-01' },
          { youtubeVideoId: 'JrTFXCWmaaA', title: '12 Wild Things Hulk Hogan Put in His Body', views: 192, publishedAt: '2026-10-03' },
        ],
      };
    };

    const synced = await store.syncChannelFromYouTube(ch.id, { channelFetcher: mockExactFetcher });
    assert.equal(synced.channel.totalViews, 929, 'Tổng views của kênh phải đưa về đúng 929 thực tế');
    assert.equal(synced.topVideos[0].views, 443, 'Video #1 phải đưa về đúng 443 views thực tế (không giữ số ảo 2279)');

    // Gọi tiếp syncAllVideosDailyMetrics không truyền fetcher giả lập -> phải quét thực tế từ YouTube chứ không cộng số ảo
    await store.syncAllVideosDailyMetrics({ channelFetcher: mockExactFetcher });
    const videosAfterDaily = store.listVideos({ channelId: ch.id });
    const sumViews = videosAfterDaily.reduce((s, v) => s + v.currentViews, 0);
    assert.equal(sumViews, 929, 'Sau khi bấm đồng bộ hằng ngày, tổng view các video vẫn phải chuẩn xác 929');
  } finally {
    cleanup();
  }
});

test('Label Aggregation & Cross-Channel Top Videos Leaderboard (YouTubeLabs Insights): thống kê theo Nhãn (Group, Ngách, Quản lý) và Bảng tổng hợp Video Nổ View của cả dàn kênh', () => {
  const { store, cleanup } = createTempStore(false);
  try {
    const ch1 = store.createChannel({
      name: '1970s Show',
      handle: '@1970sShow',
      channelUrl: 'https://www.youtube.com/@1970sShow',
      group: 'Team US',
      category: 'Giải trí & Nội dung số',
      managerEmail: 'duc@team.vn',
      status: 'monetized',
      subscribers: 49,
      totalVideos: 2,
      totalViews: 27587,
    });
    const ch2 = store.createChannel({
      name: 'FOOD 75',
      handle: '@FOOD75-h2q',
      channelUrl: 'https://www.youtube.com/@FOOD75-h2q',
      group: 'Team US',
      category: 'Ẩm thực & Đời sống',
      managerEmail: 'linh@team.vn',
      status: 'active',
      subscribers: 4,
      totalVideos: 2,
      totalViews: 737,
    });

    store.createVideo({
      title: 'How Tall Was John Wayne',
      youtubeVideoId: 'vid_jw',
      channelId: ch1.id,
      publishedAt: '2026-09-29',
      initialViews: 23524,
    });
    store.createVideo({
      title: 'Stephen Fry & 13 British TV Stars',
      youtubeVideoId: 'vid_sf',
      channelId: ch1.id,
      publishedAt: '2026-10-04',
      initialViews: 4063,
    });
    store.createVideo({
      title: "6 Tables Randy 'Macho Man' Savage Sat At",
      youtubeVideoId: 'vid_mm',
      channelId: ch2.id,
      publishedAt: '2026-10-05',
      initialViews: 444,
    });
    store.createVideo({
      title: '10 Wild Foods Andre the Giant Used',
      youtubeVideoId: 'vid_ag',
      channelId: ch2.id,
      publishedAt: '2026-10-01',
      initialViews: 293,
    });

    const summary = store.getDashboardSummary();
    assert.ok(summary.youtube.labelStats, 'Phải có thống kê tổng hợp theo Nhãn (labelStats)');
    const teamUsStat = summary.youtube.labelStats.byGroup.find((g) => g.label === 'Team US');
    assert.ok(teamUsStat, 'Phải có thống kê cho nhãn Group "Team US"');
    assert.equal(teamUsStat.channelCount, 2);
    assert.equal(teamUsStat.monetizedCount, 1);
    assert.equal(teamUsStat.totalSubscribers, 53);
    assert.equal(teamUsStat.totalViews, 28324);
    assert.equal(teamUsStat.totalVideos, 4);

    assert.ok(Array.isArray(summary.youtube.topVideosLeaderboard), 'Phải có bảng tổng hợp Video Nổ View của cả dàn kênh');
    assert.equal(summary.youtube.topVideosLeaderboard.length, 4);
    assert.equal(summary.youtube.topVideosLeaderboard[0].youtubeVideoId, 'vid_jw');
    assert.equal(summary.youtube.topVideosLeaderboard[0].views, 23524);
    assert.equal(summary.youtube.topVideosLeaderboard[0].channelName, '1970s Show');
    assert.equal(summary.youtube.topVideosLeaderboard[0].group, 'Team US');
    assert.ok(summary.youtube.topVideosLeaderboard[0].outlierMultiplier > 1.5, 'Phải tính hệ số nổ view (outlierMultiplier) so với trung bình kênh');
  } finally {
    cleanup();
  }
});



