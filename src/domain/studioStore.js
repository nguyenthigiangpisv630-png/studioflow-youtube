import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fetchYouTubeChannelProfile, inferChannelCategory } from './youtubeFetcher.js';
import { extractNotionId, syncContentToNotion } from './notionSync.js';
import {
  ensureBotCenterState,
  appendBotLog,
  scanViralAndChannelHealth,
  scanUploadScheduleAndDeadChannels,
  huntCompetitorChannelOutliers,
  analyzeAndGenerateThumbnailPrompts,
  huntYouTubeSearchTrends,
  scanMonetizationAndAdSenseShield,
  generateCloudSyncReport,
  syncCloudReportNow,
  buildBackupPayload,
  createImmortalSnapshot,
  notifyTelegramNewUser,
} from './botEngine.js';

const VALID_DEAL_STAGES = ['lead', 'contacted', 'negotiation', 'won', 'lost'];
const VALID_PROJECT_STATUSES = ['ideation', 'scripting', 'production', 'review', 'published'];
const VALID_CONTENT_TYPES = ['script', 'outline', 'seo', 'footage', 'thumbnail', 'brand_brief'];
const VALID_CHANNEL_STATUSES = ['active', 'monetized', 'incubating', 'warning', 'demonetized', 'paused'];
const VALID_MONETIZATION = ['enabled', 'pending', 'disabled'];

function todayIsoDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function countWords(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function hashPassword(rawPassword = '') {
  const clean = String(rawPassword || '').trim();
  if (!clean) return '';
  return crypto.createHash('sha256').update(`studioflow-salt:${clean}`).digest('hex');
}

export function safeCompareStrings(a = '', b = '') {
  const strA = String(a || '');
  const strB = String(b || '');
  if (!strA || !strB) return false;
  const bufA = Buffer.from(strA, 'utf8');
  const bufB = Buffer.from(strB, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isValidUsernameOrEmail(raw = '') {
  const clean = String(raw || '').trim();
  if (clean.length <= 3 || /\s/.test(clean)) return false;
  const letterCount = (clean.match(/[a-zA-ZÀ-ỹ]/g) || []).length;
  return letterCount > 3;
}

function parseCompactVnNumber(raw = '') {
  const s = String(raw || '')
    .trim()
    .replace(/^\+/, '');
  if (!s) return 0;

  // Ví dụ: "34,5 N", "2,2 N", "1,5 Tr", "12.4K", "1.2M"
  const compactMatch = s.match(/^([\d.,]+)\s*(N|Tr|T|K|M|B)\b/i);
  if (compactMatch) {
    const numStr = compactMatch[1].replace(/\./g, '').replace(',', '.');
    const val = parseFloat(numStr);
    if (Number.isNaN(val)) return 0;
    const unit = compactMatch[2].toUpperCase();
    if (unit === 'N' || unit === 'K') return Math.round(val * 1000);
    if (unit === 'TR' || unit === 'M') return Math.round(val * 1000000);
    if (unit === 'T' || unit === 'B') return Math.round(val * 1000000000);
  }

  // Số nguyên đầy đủ có dấu chấm/phẩy phân cách hàng nghìn: "34.457" hoặc "34,457"
  const digitsOnly = s.replace(/[^\d]/g, '');
  return digitsOnly ? Number(digitsOnly) : 0;
}

export function parseYouTubeStudioText(rawText = '') {
  const text = String(rawText || '').replace(/\r/g, '\n');
  const result = {};

  // 1. Bắt câu tổng kết chính xác nhất trong Studio: "Kênh của bạn đã có 34.457 lượt xem" hoặc "got 34,457 views"
  const exactViewsMatch =
    text.match(/đã có\s+([\d.,]+)\s+lượt xem/i) ||
    text.match(/got\s+([\d.,]+)\s+views/i);
  if (exactViewsMatch) {
    const v = parseCompactVnNumber(exactViewsMatch[1]);
    if (v > 0) result.totalViews = v;
  }

  // Nếu không có câu tổng kết, bắt cụm "Lượt xem \n 34,5 N"
  if (!result.totalViews) {
    const labelViewsMatch =
      text.match(/Lượt xem\s*\n+\s*([\d.,]+(?:\s*(?:N|Tr|K|M))?)/i) ||
      text.match(/Views\s*\n+\s*([\d.,]+(?:\s*(?:K|M|B))?)/i);
    if (labelViewsMatch) {
      const v = parseCompactVnNumber(labelViewsMatch[1]);
      if (v > 0) result.totalViews = v;
    }
  }

  // 2. Thời gian xem (giờ): "Thời gian xem (giờ) \n 2,2 N" hoặc "Watch time (hours) \n 2.2K"
  const watchMatch =
    text.match(/Thời gian xem\s*\(giờ\)\s*\n+\s*([\d.,]+(?:\s*(?:N|Tr|K|M))?)/i) ||
    text.match(/Watch time\s*\(hours\)\s*\n+\s*([\d.,]+(?:\s*(?:K|M|B))?)/i);
  if (watchMatch) {
    const wh = parseCompactVnNumber(watchMatch[1]);
    if (wh >= 0) result.watchHours = wh;
  }

  // 3. Số người đăng ký: "Số người đăng ký \n +48"
  const subsMatch =
    text.match(/Số người đăng ký\s*\n+\s*([+-]?[\d.,]+(?:\s*(?:N|Tr|K|M))?)/i) ||
    text.match(/Subscribers\s*\n+\s*([+-]?[\d.,]+(?:\s*(?:K|M|B))?)/i);
  if (subsMatch) {
    const subVal = parseCompactVnNumber(subsMatch[1]);
    if (subVal > 0) result.subscribers = subVal;
  }

  // 4. Lượt xem Thời gian thực (48 giờ qua / Realtime)
  const realtimeMatch =
    text.match(/(?:Thời gian thực|48 giờ qua)[\s\S]{0,120}?([\d.,]+(?:\s*(?:N|Tr|K|M))?)\s*lượt xem/i) ||
    text.match(/([\d.,]+)\s*lượt xem\s*\n+\s*(?:Trong 48 giờ|48 giờ qua)/i) ||
    text.match(/(?:Realtime|Last 48 hours)[\s\S]{0,120}?([\d.,]+)\s*views/i);
  if (realtimeMatch) {
    const rt = parseCompactVnNumber(realtimeMatch[1]);
    if (rt > 0) result.realtimeViews48h = rt;
  }

  // 5. Tỷ lệ nhấp của số lần hiển thị (CTR %): "Tỷ lệ nhấp... \n 6,8%"
  const ctrMatch =
    text.match(/(?:Tỷ lệ nhấp|click-through rate|CTR)[^\n]*\n+\s*([\d.,]+)\s*%/i) ||
    text.match(/([\d.,]+)\s*%\s*\n+\s*(?:Tỷ lệ nhấp|Impressions click-through rate)/i);
  if (ctrMatch) {
    const ctr = parseFloat(ctrMatch[1].replace(',', '.'));
    if (!Number.isNaN(ctr) && ctr > 0) result.ctrPercent = ctr;
  }

  // 6. Thời lượng xem trung bình (AVD): "Thời lượng xem trung bình \n 3:45"
  const avdMatch =
    text.match(/(?:Thời lượng xem trung bình|Average view duration)[^\n]*\n+\s*(\d{1,2}:\d{2}(?::\d{2})?)/i);
  if (avdMatch) {
    result.avgViewDuration = avdMatch[1];
  }

  // 7. Doanh thu ước tính (Estimated revenue)
  const revMatch =
    text.match(/(?:Doanh thu ước tính|Estimated revenue)[^\n]*\n+\s*([$₫€£]?[\d.,]+\s*(?:US\$|\$|₫|đ|VNĐ)?)/i);
  if (revMatch) {
    result.estimatedRevenue = revMatch[1].trim();
  }

  return result;
}

function normalizeMonthlyRevenue(raw = {}) {
  const out = {};
  for (let m = 1; m <= 12; m += 1) {
    const key = String(m);
    const val =
      raw && typeof raw === 'object'
        ? raw[`m${m}`] !== undefined
          ? raw[`m${m}`]
          : raw[key] ?? raw[m]
        : 0;
    const cleaned = typeof val === 'number' ? val : parseFloat(String(val ?? '0').replace(/,/g, '').trim());
    out[key] = Number.isFinite(cleaned) && cleaned >= 0 ? Math.round(cleaned * 100) / 100 : 0;
  }
  return out;
}

function sumMonthlyRevenue(monthlyRevenue = {}) {
  let total = 0;
  for (let m = 1; m <= 12; m += 1) {
    total += Number(monthlyRevenue[String(m)]) || 0;
  }
  return Math.round(total * 100) / 100;
}

function sanitizeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name || u.email || 'Thành viên',
    email: String(u.email || '').trim().toLowerCase(),
    role: u.role === 'admin' ? 'admin' : 'member',
    status: ['pending', 'approved', 'suspended'].includes(u.status) ? u.status : 'pending',
    scopeMode: ['isolated', 'assigned', 'all'].includes(u.scopeMode) ? u.scopeMode : 'isolated',
    allowedGroups: Array.isArray(u.allowedGroups) ? u.allowedGroups.map((g) => String(g).trim()).filter(Boolean) : [],
    allowedChannelIds: Array.isArray(u.allowedChannelIds) ? u.allowedChannelIds.map((id) => String(id).trim()).filter(Boolean) : [],
    customGroups: Array.isArray(u.customGroups) ? u.customGroups.map((g) => String(g).trim()).filter(Boolean) : [],
    permissions: {
      canCreateChannel: u.permissions?.canCreateChannel !== false,
      canEditChannel: u.permissions?.canEditChannel !== false,
      canDeleteChannel: Boolean(u.permissions?.canDeleteChannel),
      canViewRevenue: u.permissions?.canViewRevenue !== false,
      canEditRevenue: u.permissions?.canEditRevenue !== false,
      canUseVault: u.permissions?.canUseVault !== false,
    },
    note: String(u.note || '').trim(),
    createdAt: u.createdAt || '',
    approvedAt: u.approvedAt || null,
  };
}

function normalizeChannel(ch) {
  ch.status = ch.status && VALID_CHANNEL_STATUSES.includes(ch.status) ? ch.status : 'monetized';
  ch.monetization = ch.monetization && VALID_MONETIZATION.includes(ch.monetization) ? ch.monetization : 'enabled';
  ch.group = ch.group ?? '';
  ch.manager = ch.manager ?? '';
  ch.managerEmail = ch.managerEmail ?? '';
  ch.ownerUserId = ch.ownerUserId ?? '';
  ch.ownerEmail = ch.ownerEmail ?? '';
  ch.adsenseAccount = ch.adsenseAccount ?? ch.gaConnected ?? '';
  ch.firstVideoDate = ch.firstVideoDate ?? '';
  ch.totalVideos = Number(ch.totalVideos) || 0;
  ch.totalViews = Number(ch.totalViews) || 0;
  ch.watchHours = Number(ch.watchHours) || 0;
  ch.realtimeViews48h = Number(ch.realtimeViews48h) || 0;
  ch.ctrPercent = Number(ch.ctrPercent) || 0;
  ch.avgViewDuration = ch.avgViewDuration ?? '';
  ch.estimatedRevenue = ch.estimatedRevenue ?? '';
  ch.monthlyRevenue = normalizeMonthlyRevenue(ch.monthlyRevenue);
  ch.totalYearlyRevenue = sumMonthlyRevenue(ch.monthlyRevenue);
  ch.topVideos = Array.isArray(ch.topVideos) ? ch.topVideos : [];
  ch.strikeCount = Number(ch.strikeCount) || 0;
  ch.statusNote = ch.statusNote || 'Kênh hoạt động ổn định, xanh sạch, lịch đăng video đều đặn.';
  if (!ch.category || ch.category === 'Sáng tạo nội dung') {
    ch.category = inferChannelCategory({
      name: ch.name,
      handle: ch.handle,
      description: ch.statusNote,
    });
  }
  ch.channelUrl = ch.channelUrl || `https://www.youtube.com/${ch.handle || ''}`;
  ch.updatedAt = ch.updatedAt || '2026-10-16T08:00:00.000Z';
  return ch;
}

function recalculateVideoHistory(video) {
  const sorted = [...(video.metricsHistory || [])].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < sorted.length; i += 1) {
    const item = sorted[i];
    if (i === 0) {
      item.dailyViewsDelta = typeof item.dailyViewsDelta === 'number' ? item.dailyViewsDelta : 0;
    } else {
      const prevViews = sorted[i - 1].views || 0;
      item.dailyViewsDelta = Math.max(0, (item.views || 0) - prevViews);
    }
  }
  video.metricsHistory = sorted;
  if (sorted.length > 0) {
    const latest = sorted[sorted.length - 1];
    video.currentViews = latest.views;
    video.currentLikes = latest.likes ?? video.currentLikes ?? 0;
    video.currentComments = latest.comments ?? video.currentComments ?? 0;
    video.dailyViewsDelta = latest.dailyViewsDelta || 0;
    video.lastUpdatedDate = latest.date;
  }
  return video;
}

function recalculateProjectProgress(project) {
  const tasks = project.tasks || [];
  if (tasks.length === 0) {
    project.progress = project.status === 'published' ? 100 : 0;
    return project;
  }
  const doneCount = tasks.filter((t) => t.completed).length;
  project.progress = Math.round((doneCount / tasks.length) * 100);
  return project;
}

function buildSeedData() {
  const channels = [
    normalizeChannel({
      id: 'ch-techstudio',
      name: 'TechStudio Việt Nam',
      handle: '@TechStudioVN',
      channelUrl: 'https://www.youtube.com/@TechStudioVN',
      subscribers: 248000,
      category: 'Công nghệ & Đánh giá',
      manager: 'Minh Đức',
      status: 'monetized',
      monetization: 'enabled',
      strikeCount: 0,
      statusNote: 'Đã bật kiếm tiền (BKT), kênh xanh sạch, RPM trung bình $3.4, tần suất 3 video/tuần.',
      updatedAt: '2026-10-16T08:00:00.000Z',
    }),
    normalizeChannel({
      id: 'ch-bizcreator',
      name: 'BizCreator Academy',
      handle: '@BizCreatorVN',
      channelUrl: 'https://www.youtube.com/@BizCreatorVN',
      subscribers: 112500,
      category: 'Kinh doanh & Tự động hóa',
      manager: 'Lan Anh',
      status: 'active',
      monetization: 'enabled',
      strikeCount: 0,
      statusNote: 'Kênh hoạt động tốt, tỷ lệ chuyển đổi khách hàng B2B cao từ phần mô tả video.',
      updatedAt: '2026-10-16T08:00:00.000Z',
    }),
  ];

  const deals = [
    {
      id: 'deal-01',
      clientName: 'Nguyễn Minh Quân',
      company: 'ASUS ROG Vietnam',
      contactEmail: 'quan.nguyen@asus-partner.vn',
      contactPhone: '0903112233',
      value: 85000000,
      stage: 'won',
      owner: 'Lan Anh',
      expectedCloseDate: '2026-10-10',
      projectId: 'proj-01',
      notes: 'Gói tài trợ Dedicated Video + Ghim bình luận 30 ngày cho dòng Laptop Gaming AI 2026.',
      createdAt: '2026-10-02T09:00:00.000Z',
    },
    {
      id: 'deal-02',
      clientName: 'Trần Thu Hà',
      company: 'FinCloud ERP',
      contactEmail: 'hatran@fincloud.vn',
      contactPhone: '0918223344',
      value: 62000000,
      stage: 'won',
      owner: 'Minh Đức',
      expectedCloseDate: '2026-10-12',
      projectId: 'proj-02',
      notes: 'Tích hợp 90s Mid-roll giới thiệu giải pháp quản lý dòng tiền + Link tải Ebook.',
      createdAt: '2026-10-05T10:15:00.000Z',
    },
    {
      id: 'deal-03',
      clientName: 'Lê Hoàng Nam',
      company: 'Smarthome EcoVibe',
      contactEmail: 'nam.le@ecovibe.vn',
      contactPhone: '0987654321',
      value: 54000000,
      stage: 'negotiation',
      owner: 'Lan Anh',
      expectedCloseDate: '2026-10-20',
      projectId: null,
      notes: 'Đang chốt điều khoản KPI cam kết tối thiểu 50.000 lượt xem trong 14 ngày đầu.',
      createdAt: '2026-10-11T14:20:00.000Z',
    },
    {
      id: 'deal-04',
      clientName: 'Phạm Bảo Ngọc',
      company: 'ClickAI Workspace',
      contactEmail: 'ngoc@clickai.io',
      contactPhone: '0933445566',
      value: 40000000,
      stage: 'contacted',
      owner: 'Quốc Bảo',
      expectedCloseDate: '2026-10-25',
      projectId: null,
      notes: 'Khách quan tâm combo 1 video dài trên YouTube + 2 YouTube Shorts cắt ngắn.',
      createdAt: '2026-10-14T08:30:00.000Z',
    },
    {
      id: 'deal-05',
      clientName: 'Đỗ Tuấn Kiệt',
      company: 'HyperAudio Gear',
      contactEmail: 'kiet@hyperaudio.vn',
      contactPhone: '0977889900',
      value: 35000000,
      stage: 'lead',
      owner: 'Minh Đức',
      expectedCloseDate: '2026-10-28',
      projectId: null,
      notes: 'Lead từ form đăng ký hợp tác truyền thông chiến dịch Black Friday.',
      createdAt: '2026-10-15T16:00:00.000Z',
    },
  ];

  const projects = [
    {
      id: 'proj-01',
      title: 'Đánh Giá Laptop Gaming AI 2026: Hiệu Năng Thực Tế Sau 30 Ngày',
      status: 'published',
      priority: 'high',
      owner: 'Minh Đức',
      clientName: 'ASUS ROG Vietnam',
      dealId: 'deal-01',
      channelId: 'ch-techstudio',
      budget: 85000000,
      dueDate: '2026-10-12',
      description: 'Video đánh giá chuyên sâu hiệu năng render 4K, nhiệt độ và thời lượng pin thực tế.',
      tasks: [
        { id: 't-101', title: 'Lên dàn ý & Phê duyệt kịch bản với nhãn hàng', assignee: 'Lan Anh', stage: 'scripting', completed: true },
        { id: 't-102', title: 'Quay A-roll tại Studio & B-roll test game thực tế', assignee: 'Quốc Bảo', stage: 'production', completed: true },
        { id: 't-103', title: 'Dựng hậu kỳ, chỉnh màu & Thiết kế 2 phương án Thumbnail', assignee: 'Hoàng Nam', stage: 'production', completed: true },
        { id: 't-104', title: 'Xuất bản lên kênh & Gắn link tracking ở mô tả/bình luận', assignee: 'Minh Đức', stage: 'published', completed: true },
      ],
      progress: 100,
    },
    {
      id: 'proj-02',
      title: 'Cách Xây Dựng Hệ Thống CRM & Quản Lý Dự Án Cho Team Sáng Tạo',
      status: 'published',
      priority: 'high',
      owner: 'Lan Anh',
      clientName: 'FinCloud ERP',
      dealId: 'deal-02',
      channelId: 'ch-bizcreator',
      budget: 62000000,
      dueDate: '2026-10-14',
      description: 'Hướng dẫn quy trình vận hành khép kín từ chốt sale đến sản xuất video YouTube.',
      tasks: [
        { id: 't-201', title: 'Hoàn thiện kịch bản chi tiết & lồng ghép 90s tài trợ tự nhiên', assignee: 'Lan Anh', stage: 'scripting', completed: true },
        { id: 't-202', title: 'Quay màn hình demo hệ thống & thu âm giọng đọc', assignee: 'Minh Đức', stage: 'production', completed: true },
        { id: 't-203', title: 'Duyệt bản dựng nháp với đại diện FinCloud ERP', assignee: 'Lan Anh', stage: 'review', completed: true },
        { id: 't-204', title: 'Đăng tải công khai & theo dõi chỉ số lượt xem 7 ngày đầu', assignee: 'Minh Đức', stage: 'published', completed: true },
      ],
      progress: 100,
    },
    {
      id: 'proj-03',
      title: 'Top 5 Thiết Bị Smarthome Đáng Đầu Tư Nhất Cho Căn Hộ Hiện Đại',
      status: 'production',
      priority: 'urgent',
      owner: 'Quốc Bảo',
      clientName: 'Smarthome EcoVibe',
      dealId: 'deal-03',
      channelId: 'ch-techstudio',
      budget: 54000000,
      dueDate: '2026-10-21',
      description: 'Video tổng hợp thực tế lắp đặt cảm biến thông minh, khóa vân tay và kịch bản tự động hóa.',
      tasks: [
        { id: 't-301', title: 'Chốt danh sách 5 thiết bị & kịch bản phân cảnh', assignee: 'Lan Anh', stage: 'scripting', completed: true },
        { id: 't-302', title: 'Quay ngoại cảnh tại căn hộ mẫu', assignee: 'Quốc Bảo', stage: 'production', completed: true },
        { id: 't-303', title: 'Dựng bản Rough Cut & lồng nhạc nền bản quyền', assignee: 'Hoàng Nam', stage: 'production', completed: false },
        { id: 't-304', title: 'Thiết kế bộ 3 Thumbnail A/B test', assignee: 'Hoàng Nam', stage: 'review', completed: false },
      ],
      progress: 50,
    },
    {
      id: 'proj-04',
      title: 'Tối Ưu SEO YouTube 2026: Tăng Tỷ Lệ Nhấp (CTR) Và Giữ Chân Khán Giả',
      status: 'scripting',
      priority: 'medium',
      owner: 'Lan Anh',
      clientName: 'Nội bộ Studio',
      dealId: null,
      channelId: 'ch-bizcreator',
      budget: 18000000,
      dueDate: '2026-10-24',
      description: 'Phân tích số liệu thực tế từ 50 video đã đăng để rút ra công thức đặt tiêu đề & mở đầu 30 giây.',
      tasks: [
        { id: 't-401', title: 'Tổng hợp dữ liệu CTR & Retention từ kênh', assignee: 'Minh Đức', stage: 'ideation', completed: true },
        { id: 't-402', title: 'Viết kịch bản chi tiết (2.200 từ)', assignee: 'Lan Anh', stage: 'scripting', completed: false },
        { id: 't-403', title: 'Chuẩn bị slide minh họa & biểu đồ động', assignee: 'Hoàng Nam', stage: 'production', completed: false },
      ],
      progress: 33,
    },
  ];

  const contents = [
    {
      id: 'cnt-01',
      title: 'Kịch bản hoàn chỉnh: Đánh Giá Laptop Gaming AI 2026 (Bản quay chính thức)',
      type: 'script',
      projectId: 'proj-01',
      status: 'approved',
      author: 'Lan Anh',
      assetUrl: 'https://drive.google.com/drive/folders/rog-script-2026',
      tags: ['Kịch bản', 'Laptop AI', 'ASUS ROG', 'Đã duyệt'],
      body: `[00:00 - 00:35] HOOK MỞ ĐẦU
"Nếu bạn đang định bỏ ra hơn 50 triệu đồng cho một chiếc laptop vừa dựng phim 4K vừa chơi mượt mọi tựa game AAA trong năm 2026, đừng xuống tiền trước khi xem hết bài kiểm tra khắc nghiệt suốt 30 ngày qua của bọn mình!"

[00:35 - 03:20] PHẦN 1: THIẾT KẾ & TRẢI NGHIỆM THỰC TẾ
- Kiểm tra độ cứng cáp của khung hợp kim nhôm CNC.
- Bàn phím hành trình 1.7mm và màn hình OLED 240Hz chuẩn màu 100% DCI-P3.

[03:20 - 06:45] PHẦN 2: BENCHMARK HIỆU NĂNG DỰNG VIDEO & AI LOCAL
- Xuất project Premiere Pro 4K dài 15 phút: chỉ mất 4 phút 12 giây.
- Chạy mô hình LLM cục bộ trên NPU 50 TOPS.

[06:45 - 08:15] THÔNG ĐIỆP NHÃN HÀNG & TỔNG KẾT
- Link ưu đãi độc quyền giảm ngay 3.000.000đ đặt tại dòng đầu tiên phần mô tả và bình luận ghim.`,
      wordCount: 158,
      updatedAt: '2026-10-11T15:30:00.000Z',
    },
    {
      id: 'cnt-02',
      title: 'Kịch bản & Khung chương trình: Xây Dựng Hệ Thống CRM & Quản Lý Kênh YouTube',
      type: 'script',
      projectId: 'proj-02',
      status: 'approved',
      author: 'Lan Anh',
      assetUrl: 'https://drive.google.com/drive/folders/crm-script-02',
      tags: ['Kịch bản', 'CRM', 'YouTube Workflow', 'FinCloud'],
      body: `[00:00 - 00:40] ĐẶT VẤN ĐỀ
Khi kênh YouTube của bạn bắt đầu có từ 5-10 nhãn hàng liên hệ booking mỗi tháng, việc quản lý qua tin nhắn rời rạc sẽ khiến bạn bỏ sót hợp đồng và trễ hạn giao video.

[00:40 - 04:00] BƯỚC 1: QUẢN TRỊ PHỄU SALES (CRM)
- Phân tách rõ 4 trạng thái: Lead mới -> Đang tư vấn -> Đàm phán -> Đã chốt.
- Tự động chuyển đổi hợp đồng đã chốt sang dự án sản xuất chỉ với 1 thao tác.

[04:00 - 07:30] BƯỚC 2: KHO LƯU TRỮ NỘI DUNG & THEO DÕI LƯỢT XEM HẰNG NGÀY
- Lưu toàn bộ kịch bản, từ khóa SEO và link Footage ở một nơi duy nhất.
- Theo dõi chỉ số lượt xem cập nhật hằng ngày để báo cáo nghiệm thu với nhãn hàng.`,
      wordCount: 141,
      updatedAt: '2026-10-13T11:20:00.000Z',
    },
    {
      id: 'cnt-03',
      title: 'Bộ Từ Khóa SEO, Mô Tả Chuẩn & Timestamp: Top 5 Thiết Bị Smarthome',
      type: 'seo',
      projectId: 'proj-03',
      status: 'review',
      author: 'Minh Đức',
      assetUrl: 'https://drive.google.com/drive/folders/smarthome-seo-pack',
      tags: ['SEO YouTube', 'Từ khóa', 'Description', 'Smarthome'],
      body: `TIÊU ĐỀ ĐỀ XUẤT (CTR MỤC TIÊU > 8.5%):
1. Top 5 Thiết Bị Smarthome Đáng Tiền Nhất 2026 (Tránh Mua Nhầm!)
2. Biến Căn Hộ Thường Thành Nhà Thông Minh Chỉ Với 15 Triệu Đồng

TỪ KHÓA CHÍNH (TAGS):
nhà thông minh 2026, smarthome việt nam, khóa vân tay, cảm biến hiện diện, tự động hóa nhà ở, ecovibe smarthome

MẪU MÔ TẢ VIDEO:
00:00 Mở đầu & Sai lầm khi lắp Smarthome
01:45 1. Cảm biến hiện diện mmWave thế hệ mới
04:10 2. Công tắc thông minh không cần dây nguội
07:00 3. Khóa cửa nhận diện khuôn mặt 3D`,
      wordCount: 112,
      updatedAt: '2026-10-15T17:10:00.000Z',
    },
    {
      id: 'cnt-04',
      title: 'Kho Raw Footage 4K Sony FX3 & Bộ Thumbnail A/B Testing (Smarthome)',
      type: 'footage',
      projectId: 'proj-03',
      status: 'draft',
      author: 'Hoàng Nam',
      assetUrl: 'https://drive.google.com/drive/folders/smarthome-4k-footage',
      tags: ['Footage 4K', 'Sony FX3', 'Thumbnail PSD', 'B-Roll'],
      body: `Danh sách thư mục lưu trữ Media:
- /01_A_Roll_Studio (14 clips, 4K 60fps 10-bit 4:2:2)
- /02_B_Roll_CanHoMau (28 clips cận cảnh thiết bị hoạt động)
- /03_Audio_Voiceover (File WAV 48kHz đã khử ồn)
- /04_Thumbnails (3 phiên bản PSD + PNG xuất sẵn cho A/B Testing trên YouTube Studio)`,
      wordCount: 54,
      updatedAt: '2026-10-16T09:45:00.000Z',
    },
  ];

  const videos = [
    recalculateVideoHistory({
      id: 'vid-01',
      title: 'Đánh Giá Laptop Gaming AI 2026: Hiệu Năng Thực Tế Sau 30 Ngày Sử Dụng!',
      youtubeVideoId: 'M7lc1UVf-VE',
      channelId: 'ch-techstudio',
      projectId: 'proj-01',
      contentId: 'cnt-01',
      publishedAt: '2026-10-10',
      status: 'public',
      metricsHistory: [
        { date: '2026-10-10', views: 18400, likes: 1120, comments: 94, dailyViewsDelta: 18400 },
        { date: '2026-10-11', views: 34200, likes: 2050, comments: 168 },
        { date: '2026-10-12', views: 51900, likes: 3100, comments: 245 },
        { date: '2026-10-13', views: 66400, likes: 3890, comments: 312 },
        { date: '2026-10-14', views: 79800, likes: 4520, comments: 366 },
        { date: '2026-10-15', views: 94100, likes: 5180, comments: 419 },
        { date: '2026-10-16', views: 112600, likes: 6040, comments: 488 },
      ],
    }),
    recalculateVideoHistory({
      id: 'vid-02',
      title: 'Cách Xây Dựng Hệ Thống CRM & Quản Lý Dự Án Cho Team YouTube Chuyên Nghiệp',
      youtubeVideoId: 'dQw4w9WgXcQ',
      channelId: 'ch-bizcreator',
      projectId: 'proj-02',
      contentId: 'cnt-02',
      publishedAt: '2026-10-12',
      status: 'public',
      metricsHistory: [
        { date: '2026-10-12', views: 9200, likes: 680, comments: 62, dailyViewsDelta: 9200 },
        { date: '2026-10-13', views: 19500, likes: 1420, comments: 128 },
        { date: '2026-10-14', views: 31400, likes: 2190, comments: 195 },
        { date: '2026-10-15', views: 44800, likes: 3010, comments: 264 },
        { date: '2026-10-16', views: 59300, likes: 3940, comments: 342 },
      ],
    }),
    recalculateVideoHistory({
      id: 'vid-03',
      title: 'Bí Quyết Viết Kịch Bản Video Giữ Chân 70% Khán Giả Đến Phút Cuối',
      youtubeVideoId: 'jNQXAC9IVRw',
      channelId: 'ch-bizcreator',
      projectId: 'proj-04',
      contentId: null,
      publishedAt: '2026-10-11',
      status: 'public',
      metricsHistory: [
        { date: '2026-10-11', views: 12000, likes: 890, comments: 74, dailyViewsDelta: 12000 },
        { date: '2026-10-12', views: 20100, likes: 1450, comments: 115 },
        { date: '2026-10-13', views: 27600, likes: 1920, comments: 149 },
        { date: '2026-10-14', views: 34900, likes: 2380, comments: 182 },
        { date: '2026-10-15', views: 41200, likes: 2790, comments: 210 },
        { date: '2026-10-16', views: 48950, likes: 3260, comments: 248 },
      ],
    }),
  ];

  return {
    meta: {
      lastDailySyncDate: '2026-10-16',
      lastDailySyncAt: '2026-10-16T08:00:00.000Z',
    },
    users: [],
    channels,
    deals,
    projects,
    contents,
    videos,
  };
}

export class StudioStore {
  constructor({ filePath, seedIfEmpty = true } = {}) {
    this.filePath = filePath || path.resolve(process.cwd(), 'data', 'studio-db.json');
    this.seedIfEmpty = seedIfEmpty;
    this.state = this.#loadOrInit();
  }

  #loadOrInit() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        parsed.meta = parsed.meta || {};
        parsed.users = Array.isArray(parsed.users) ? parsed.users : [];
        (parsed.channels || []).forEach(normalizeChannel);
        const existingCustom = Array.isArray(parsed.meta.customGroups)
          ? parsed.meta.customGroups.map((g) => String(g || '').trim()).filter(Boolean)
          : [];
        const channelGroups = (parsed.channels || [])
          .map((ch) => String(ch.group || '').trim())
          .filter(Boolean);
        const seenLower = new Set();
        parsed.meta.customGroups = [];
        for (const g of [...existingCustom, ...channelGroups]) {
          const lower = g.toLowerCase();
          if (!seenLower.has(lower)) {
            seenLower.add(lower);
            parsed.meta.customGroups.push(g);
          }
        }
        ensureBotCenterState(parsed.meta);
        (parsed.videos || []).forEach(recalculateVideoHistory);
        (parsed.projects || []).forEach(recalculateProjectProgress);
        return parsed;
      } catch {
        // Fallback to fresh state if corrupted
      }
    }

    const initial = this.seedIfEmpty
      ? buildSeedData()
      : {
          meta: { lastDailySyncDate: null, lastDailySyncAt: null },
          users: [],
          channels: [
            normalizeChannel({
              id: 'ch-main',
              name: 'Kênh YouTube Chính',
              handle: '@MainChannel',
              subscribers: 50000,
              category: 'Sáng tạo nội dung',
            }),
          ],
          deals: [],
          projects: [],
          contents: [],
          videos: [],
        };

    ensureBotCenterState(initial.meta);
    this.#save(initial);
    return initial;
  }

  #save(nextState = this.state) {
    this.state = nextState;
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  saveState() {
    this.#save();
  }

  // ===========================================================================
  // 1. CRM (SALES PIPELINE)
  // ===========================================================================

  listDeals(filter = {}) {
    let list = [...this.state.deals];
    if (filter.stage && filter.stage !== 'all') {
      list = list.filter((d) => d.stage === filter.stage);
    }
    if (filter.search) {
      const q = String(filter.search).toLowerCase().trim();
      list = list.filter(
        (d) =>
          d.clientName.toLowerCase().includes(q) ||
          (d.company || '').toLowerCase().includes(q) ||
          (d.notes || '').toLowerCase().includes(q) ||
          (d.owner || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

  createDeal(input = {}) {
    const clientName = String(input.clientName || '').trim();
    if (!clientName) {
      throw new Error('Tên khách hàng (clientName) là bắt buộc');
    }
    const stage = input.stage && VALID_DEAL_STAGES.includes(input.stage) ? input.stage : 'lead';
    const deal = {
      id: `deal-${crypto.randomUUID().slice(0, 8)}`,
      clientName,
      company: String(input.company || clientName).trim(),
      contactEmail: String(input.contactEmail || '').trim(),
      contactPhone: String(input.contactPhone || '').trim(),
      value: Number(input.value) || 0,
      stage,
      owner: String(input.owner || 'Sales Team').trim(),
      expectedCloseDate: input.expectedCloseDate || todayIsoDate(),
      projectId: input.projectId || null,
      notes: String(input.notes || '').trim(),
      createdAt: new Date().toISOString(),
    };
    this.state.deals.unshift(deal);
    this.#save();
    return deal;
  }

  updateDeal(id, patch = {}) {
    const deal = this.state.deals.find((d) => d.id === id);
    if (!deal) {
      throw new Error(`Không tìm thấy Deal CRM với mã: ${id}`);
    }
    if (patch.stage && !VALID_DEAL_STAGES.includes(patch.stage)) {
      throw new Error(`Giai đoạn Deal không hợp lệ: ${patch.stage}`);
    }
    if (patch.clientName !== undefined) deal.clientName = String(patch.clientName).trim();
    if (patch.company !== undefined) deal.company = String(patch.company).trim();
    if (patch.contactEmail !== undefined) deal.contactEmail = String(patch.contactEmail).trim();
    if (patch.contactPhone !== undefined) deal.contactPhone = String(patch.contactPhone).trim();
    if (patch.value !== undefined) deal.value = Number(patch.value) || 0;
    if (patch.stage !== undefined) deal.stage = patch.stage;
    if (patch.owner !== undefined) deal.owner = String(patch.owner).trim();
    if (patch.expectedCloseDate !== undefined) deal.expectedCloseDate = patch.expectedCloseDate;
    if (patch.notes !== undefined) deal.notes = String(patch.notes).trim();
    if (patch.projectId !== undefined) deal.projectId = patch.projectId;
    this.#save();
    return deal;
  }

  convertDealToProject(dealId, options = {}) {
    const deal = this.state.deals.find((d) => d.id === dealId);
    if (!deal) {
      throw new Error(`Không tìm thấy Deal CRM với mã: ${dealId}`);
    }
    if (deal.projectId) {
      const existing = this.state.projects.find((p) => p.id === deal.projectId);
      if (existing) return existing;
    }

    const defaultChannelId = options.channelId || this.state.channels[0]?.id || 'ch-main';
    const project = this.createProject({
      title: options.title || `Chiến dịch Video YouTube — ${deal.company || deal.clientName}`,
      status: 'ideation',
      priority: 'high',
      owner: deal.owner || 'Producer',
      clientName: deal.company || deal.clientName,
      dealId: deal.id,
      channelId: defaultChannelId,
      budget: deal.value,
      dueDate: options.dueDate || deal.expectedCloseDate || todayIsoDate(),
      description: deal.notes || `Dự án sản xuất nội dung YouTube chuyển đổi từ hợp đồng của ${deal.company}.`,
      tasks: [
        {
          id: `task-${crypto.randomUUID().slice(0, 6)}`,
          title: 'Lên ý tưởng (Concept) & Dàn ý gửi khách hàng duyệt',
          assignee: deal.owner || 'Content Lead',
          stage: 'ideation',
          completed: false,
        },
        {
          id: `task-${crypto.randomUUID().slice(0, 6)}`,
          title: 'Viết kịch bản chi tiết & Lồng ghép thông điệp tài trợ',
          assignee: 'Scriptwriter',
          stage: 'scripting',
          completed: false,
        },
        {
          id: `task-${crypto.randomUUID().slice(0, 6)}`,
          title: 'Quay A-Roll/B-Roll, dựng hậu kỳ & Thiết kế Thumbnail',
          assignee: 'Video Editor',
          stage: 'production',
          completed: false,
        },
        {
          id: `task-${crypto.randomUUID().slice(0, 6)}`,
          title: 'Đăng tải YouTube & Theo dõi chỉ số lượt xem hằng ngày',
          assignee: 'Channel Manager',
          stage: 'published',
          completed: false,
        },
      ],
    });

    deal.stage = 'won';
    deal.projectId = project.id;
    this.#save();
    return project;
  }

  // ===========================================================================
  // 2. PROJECT MANAGEMENT (QUẢN LÝ DỰ ÁN YOUTUBE)
  // ===========================================================================

  listProjects(filter = {}) {
    let list = [...this.state.projects];
    if (filter.status && filter.status !== 'all') {
      list = list.filter((p) => p.status === filter.status);
    }
    if (filter.search) {
      const q = String(filter.search).toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.clientName || '').toLowerCase().includes(q) ||
          (p.owner || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

  createProject(input = {}) {
    const title = String(input.title || '').trim();
    if (!title) {
      throw new Error('Tên dự án (title) là bắt buộc');
    }
    const status =
      input.status && VALID_PROJECT_STATUSES.includes(input.status) ? input.status : 'ideation';

    const project = recalculateProjectProgress({
      id: `proj-${crypto.randomUUID().slice(0, 8)}`,
      title,
      status,
      priority: input.priority || 'medium',
      owner: String(input.owner || 'Team Sản Xuất').trim(),
      clientName: String(input.clientName || 'Nội bộ Studio').trim(),
      dealId: input.dealId || null,
      channelId: input.channelId || this.state.channels[0]?.id || 'ch-main',
      budget: Number(input.budget) || 0,
      dueDate: input.dueDate || todayIsoDate(),
      description: String(input.description || '').trim(),
      tasks: Array.isArray(input.tasks) ? input.tasks : [],
      progress: 0,
    });

    this.state.projects.unshift(project);
    this.#save();
    return project;
  }

  updateProject(id, patch = {}) {
    const project = this.state.projects.find((p) => p.id === id);
    if (!project) {
      throw new Error(`Không tìm thấy Dự án với mã: ${id}`);
    }
    if (patch.status && !VALID_PROJECT_STATUSES.includes(patch.status)) {
      throw new Error(`Trạng thái dự án không hợp lệ: ${patch.status}`);
    }
    if (patch.title !== undefined) project.title = String(patch.title).trim();
    if (patch.status !== undefined) project.status = patch.status;
    if (patch.priority !== undefined) project.priority = patch.priority;
    if (patch.owner !== undefined) project.owner = String(patch.owner).trim();
    if (patch.clientName !== undefined) project.clientName = String(patch.clientName).trim();
    if (patch.dueDate !== undefined) project.dueDate = patch.dueDate;
    if (patch.budget !== undefined) project.budget = Number(patch.budget) || 0;
    if (patch.description !== undefined) project.description = String(patch.description).trim();
    recalculateProjectProgress(project);
    this.#save();
    return project;
  }

  addTaskToProject(projectId, taskInput = {}) {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) {
      throw new Error(`Không tìm thấy Dự án với mã: ${projectId}`);
    }
    const title = String(taskInput.title || '').trim();
    if (!title) {
      throw new Error('Tên công việc (title) là bắt buộc');
    }
    const task = {
      id: `task-${crypto.randomUUID().slice(0, 8)}`,
      title,
      assignee: String(taskInput.assignee || project.owner || 'Thành viên').trim(),
      stage: taskInput.stage || project.status || 'production',
      completed: Boolean(taskInput.completed),
    };
    project.tasks.push(task);
    recalculateProjectProgress(project);
    this.#save();
    return task;
  }

  toggleProjectTask(projectId, taskId) {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) {
      throw new Error(`Không tìm thấy Dự án với mã: ${projectId}`);
    }
    const task = project.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new Error(`Không tìm thấy Công việc với mã: ${taskId}`);
    }
    task.completed = !task.completed;
    recalculateProjectProgress(project);
    this.#save();
    return project;
  }

  // ===========================================================================
  // 3. CONTENT VAULT (KHO LƯU TRỮ NỘI DUNG: KỊCH BẢN, SEO, FOOTAGE, THUMBNAIL)
  // ===========================================================================

  listContentItems(filter = {}, user = null) {
    let list = [...this.state.contents];
    if (user && user.role !== 'admin' && user.scopeMode !== 'all') {
      list = list.filter((c) => c.ownerUserId === user.id);
    }
    if (filter.type && filter.type !== 'all') {
      list = list.filter((c) => c.type === filter.type);
    }
    if (filter.projectId && filter.projectId !== 'all') {
      list = list.filter((c) => c.projectId === filter.projectId);
    }
    if (filter.search) {
      const q = String(filter.search).toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.body || '').toLowerCase().includes(q) ||
          (c.tags || []).some((t) => t.toLowerCase().includes(q)) ||
          (c.author || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

  createContentItem(input = {}, user = null) {
    if (user && user.role !== 'admin' && user.permissions?.canUseVault === false) {
      throw new Error('Tài khoản của bạn chưa được Admin cấp quyền sử dụng Kho nội dung!');
    }
    const title = String(input.title || '').trim();
    if (!title) {
      throw new Error('Tiêu đề nội dung (title) là bắt buộc');
    }
    const type = input.type && VALID_CONTENT_TYPES.includes(input.type) ? input.type : 'script';
    const body = String(input.body || '').trim();
    const tags = Array.isArray(input.tags)
      ? input.tags.map((t) => String(t).trim()).filter(Boolean)
      : String(input.tags || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

    const item = {
      id: `cnt-${crypto.randomUUID().slice(0, 8)}`,
      title,
      type,
      projectId: input.projectId || null,
      status: input.status || 'draft',
      author: String(input.author || user?.name || user?.email || 'Content Team').trim(),
      ownerUserId: user && user.role !== 'admin' ? user.id : String(input.ownerUserId || ''),
      ownerEmail: user && user.role !== 'admin' ? user.email : String(input.ownerEmail || ''),
      assetUrl: String(input.assetUrl || '').trim(),
      notionUrl: String(input.notionUrl || '').trim(),
      notionPageId: String(input.notionPageId || '').trim(),
      lastNotionSyncAt: input.lastNotionSyncAt || null,
      tags,
      body,
      wordCount: countWords(body),
      updatedAt: new Date().toISOString(),
    };
    this.state.contents.unshift(item);
    this.#save();
    return item;
  }

  updateContentItem(id, patch = {}, user = null) {
    const item = this.state.contents.find((c) => c.id === id);
    if (!item) {
      throw new Error(`Không tìm thấy Nội dung lưu trữ với mã: ${id}`);
    }
    if (user && user.role !== 'admin' && user.scopeMode !== 'all' && item.ownerUserId && item.ownerUserId !== user.id) {
      throw new Error('Bạn không có quyền chỉnh sửa nội dung này!');
    }
    if (patch.title !== undefined) item.title = String(patch.title).trim();
    if (patch.type !== undefined && VALID_CONTENT_TYPES.includes(patch.type)) item.type = patch.type;
    if (patch.projectId !== undefined) item.projectId = patch.projectId;
    if (patch.status !== undefined) item.status = patch.status;
    if (patch.author !== undefined) item.author = String(patch.author).trim();
    if (patch.assetUrl !== undefined) item.assetUrl = String(patch.assetUrl).trim();
    if (patch.notionUrl !== undefined) item.notionUrl = String(patch.notionUrl).trim();
    if (patch.notionPageId !== undefined) item.notionPageId = String(patch.notionPageId).trim();
    if (patch.lastNotionSyncAt !== undefined) item.lastNotionSyncAt = patch.lastNotionSyncAt;
    if (patch.body !== undefined) {
      item.body = String(patch.body);
      item.wordCount = countWords(item.body);
    }
    if (patch.tags !== undefined) {
      item.tags = Array.isArray(patch.tags)
        ? patch.tags.map((t) => String(t).trim()).filter(Boolean)
        : String(patch.tags)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
    }
    item.updatedAt = new Date().toISOString();
    this.#save();
    return item;
  }

  getRequiredPasswordHash() {
    const envPass = String(process.env.STUDIOFLOW_PASSWORD || '').trim();
    if (envPass) {
      return hashPassword(envPass);
    }
    return String(this.state.meta?.authPasswordHash || '').trim();
  }

  getAdminUserProfile() {
    const rawAdmin = String(this.state.meta?.adminEmail || '').trim().toLowerCase();
    const adminEmail =
      !rawAdmin || rawAdmin === 'admin' || rawAdmin === 'admin@gmail.com'
        ? 'timhanhphuc'
        : rawAdmin;
    return {
      id: 'admin',
      name: 'timhanhphuc',
      email: adminEmail,
      role: 'admin',
      status: 'approved',
      scopeMode: 'all',
      allowedGroups: [],
      allowedChannelIds: [],
      customGroups: [],
      permissions: {
        canCreateChannel: true,
        canEditChannel: true,
        canDeleteChannel: true,
        canViewRevenue: true,
        canEditRevenue: true,
        canUseVault: true,
      },
    };
  }

  getAdminSessionToken() {
    if (!this.state.meta) this.state.meta = {};
    if (!this.state.meta.adminSessionToken) {
      this.state.meta.adminSessionToken = `adm_tok_${crypto.randomUUID().replace(/-/g, '')}`;
      this.#save();
    }
    return this.state.meta.adminSessionToken;
  }

  revokeSessionToken(token = '') {
    const cleanToken = String(token || '').trim();
    if (!cleanToken) return { ok: true, revoked: false };
    const matchedUser = (this.state.users || []).find(
      (u) => u.sessionToken && safeCompareStrings(u.sessionToken, cleanToken)
    );
    if (matchedUser) {
      matchedUser.sessionToken = `usr_tok_${crypto.randomUUID().replace(/-/g, '')}`;
      this.#save();
      return { ok: true, revoked: true };
    }
    const adminSessionToken = String(this.state.meta?.adminSessionToken || '').trim();
    const requiredHash = this.getRequiredPasswordHash();
    if (
      (adminSessionToken && safeCompareStrings(cleanToken, adminSessionToken)) ||
      (requiredHash && safeCompareStrings(cleanToken, requiredHash))
    ) {
      if (!this.state.meta) this.state.meta = {};
      this.state.meta.adminSessionToken = `adm_tok_${crypto.randomUUID().replace(/-/g, '')}`;
      this.#save();
      return { ok: true, revoked: true };
    }
    return { ok: true, revoked: false };
  }

  resolveUserFromToken(token = '') {
    const cleanToken = String(token || '').trim();
    const requiredHash = this.getRequiredPasswordHash();
    if (cleanToken) {
      const matchedUser = (this.state.users || []).find(
        (u) => u.sessionToken && safeCompareStrings(u.sessionToken, cleanToken)
      );
      if (matchedUser) {
        if (matchedUser.status !== 'approved') {
          return { valid: false, status: matchedUser.status };
        }
        return {
          valid: true,
          isAdmin: matchedUser.role === 'admin',
          user: sanitizeUser(matchedUser),
        };
      }
      const adminToken = String(this.state.meta?.adminSessionToken || '').trim();
      if (
        requiredHash &&
        (safeCompareStrings(cleanToken, requiredHash) ||
          (adminToken && safeCompareStrings(cleanToken, adminToken)))
      ) {
        return {
          valid: true,
          isAdmin: true,
          user: this.getAdminUserProfile(),
        };
      }
    }
    if (!requiredHash) {
      return {
        valid: true,
        isAdmin: true,
        user: this.getAdminUserProfile(),
      };
    }
    return { valid: false };
  }

  getAuthStatus(token = '') {
    const requiredHash = this.getRequiredPasswordHash();
    const resolved = this.resolveUserFromToken(token);
    const activeUser = resolved.valid ? resolved.user : !requiredHash ? this.getAdminUserProfile() : null;
    const gaStatus = this.getGaPasswordStatus(activeUser);
    if (!requiredHash) {
      return {
        passwordEnabled: false,
        authenticated: true,
        hasCustomGaPassword: gaStatus.hasCustomGaPassword,
        user: activeUser,
      };
    }
    return {
      passwordEnabled: true,
      authenticated: Boolean(resolved.valid),
      hasCustomGaPassword: gaStatus.hasCustomGaPassword,
      user: resolved.valid ? resolved.user : null,
    };
  }

  verifyPassword(password = '', emailOrUsername = '', options = {}) {
    const requiredHash = this.getRequiredPasswordHash();
    const rawId = String(emailOrUsername || '').trim().toLowerCase();
    const adminEmail = String(this.state.meta?.adminEmail || '').trim().toLowerCase();
    const candidateHash = hashPassword(password);
    const directGmailLogin = Boolean(options?.directGmailLogin);

    const isAdminUsername =
      !rawId ||
      rawId === 'timhanhphuc' ||
      rawId === 'admin' ||
      (adminEmail && rawId === adminEmail && !directGmailLogin);

    // 1. Kiểm tra nếu người dùng đăng nhập bằng Username hoặc Gmail ở màn hình ngoài
    if (!isAdminUsername) {
      if (!isValidUsernameOrEmail(rawId)) {
        throw new Error('Username đăng nhập bắt buộc phải có trên 3 chữ cái (tối thiểu 4 chữ cái)!');
      }
      const normalizedGmail = rawId.includes('@') ? rawId : `${rawId}@gmail.com`;
      const rawLocal = rawId.includes('@') ? rawId.split('@')[0] : rawId;
      const foundUser = (this.state.users || []).find((u) => {
        const uEmail = String(u.email || '').trim().toLowerCase();
        const uLocal = uEmail.includes('@') ? uEmail.split('@')[0] : uEmail;
        return uEmail === rawId || uEmail === normalizedGmail || uLocal === rawLocal;
      });
      if (foundUser) {
        if (!candidateHash || !safeCompareStrings(candidateHash, foundUser.passwordHash)) {
          throw new Error('Mật khẩu của tài khoản này không chính xác. Vui lòng kiểm tra lại!');
        }
        if (foundUser.status === 'suspended') {
          const err = new Error('Tài khoản này hiện đang tạm khóa. Vui lòng liên hệ Admin!');
          err.statusCode = 403;
          throw err;
        }
        if (foundUser.status !== 'approved') {
          const err = new Error(
            '⏳ Tài khoản của bạn đã đăng ký thành công nhưng đang chờ Admin chấp nhận (phê duyệt)!'
          );
          err.statusCode = 403;
          throw err;
        }
        if (!foundUser.sessionToken) {
          foundUser.sessionToken = `usr_tok_${crypto.randomUUID().replace(/-/g, '')}`;
          this.#save();
        }
        return {
          ok: true,
          passwordEnabled: true,
          token: foundUser.sessionToken,
          user: sanitizeUser(foundUser),
        };
      }

      // Nếu nhập tài khoản của Admin kèm đúng mật khẩu Admin gốc -> lưu & cho vào
      if (requiredHash && safeCompareStrings(candidateHash, requiredHash) && rawId.includes('@')) {
        if (!this.state.meta) this.state.meta = {};
        this.state.meta.adminEmail = rawId;
        this.#save();
        return {
          ok: true,
          passwordEnabled: true,
          token: this.getAdminSessionToken(),
          user: this.getAdminUserProfile(),
        };
      }

      throw new Error(
        'Username này chưa được đăng ký. Vui lòng bấm sang tab "Đăng ký tài khoản" để đăng ký và chờ Admin chấp nhận!'
      );
    }

    // 2. Đăng nhập tài khoản Admin gốc
    if (!requiredHash) {
      return {
        ok: true,
        passwordEnabled: false,
        token: '',
        user: this.getAdminUserProfile(),
      };
    }
    if (!candidateHash || !safeCompareStrings(candidateHash, requiredHash)) {
      throw new Error('Mật khẩu Admin không chính xác. Vui lòng kiểm tra lại!');
    }
    return {
      ok: true,
      passwordEnabled: true,
      token: this.getAdminSessionToken(),
      user: this.getAdminUserProfile(),
    };
  }

  registerGmailUser(input = {}) {
    if (!Array.isArray(this.state.users)) {
      this.state.users = [];
    }
    const rawEmail = String(input.username || input.email || '').trim().toLowerCase();
    const rawName = String(input.name || '').trim();
    const rawPassword = String(input.password || '').trim();
    const rawNote = String(input.note || '').trim();

    if (!isValidUsernameOrEmail(rawEmail)) {
      throw new Error(
        'Username đăng ký bắt buộc phải có trên 3 chữ cái (tối thiểu 4 chữ cái, không chứa khoảng trắng, ví dụ: minhquan)!'
      );
    }
    if (!rawPassword || rawPassword.length < 3) {
      throw new Error('Mật khẩu đăng ký phải có ít nhất 3 ký tự!');
    }
    const rawLocal = rawEmail.includes('@') ? rawEmail.split('@')[0] : rawEmail;
    if (rawLocal === 'timhanhphuc' || rawLocal === 'admin') {
      throw new Error('Username này là tài khoản Quản trị viên (Admin), vui lòng chọn Username khác!');
    }
    const existing = this.state.users.find((u) => {
      const uEmail = String(u.email || '').trim().toLowerCase();
      const uLocal = uEmail.includes('@') ? uEmail.split('@')[0] : uEmail;
      return uEmail === rawEmail || uLocal === rawLocal;
    });
    if (existing) {
      throw new Error('Username / Tài khoản này đã được đăng ký! Vui lòng đăng nhập hoặc chờ Admin cấp quyền.');
    }

    const autoApprove = Boolean(input.autoApprove);
    const scopeMode = ['isolated', 'assigned', 'all'].includes(input.scopeMode)
      ? input.scopeMode
      : 'isolated';

    const newUser = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      name: rawName || rawEmail.split('@')[0],
      email: rawEmail,
      passwordHash: hashPassword(rawPassword),
      sessionToken: `usr_tok_${crypto.randomUUID().replace(/-/g, '')}`,
      role: input.role === 'admin' ? 'admin' : 'member',
      status: autoApprove ? 'approved' : 'pending',
      scopeMode,
      allowedGroups: Array.isArray(input.allowedGroups)
        ? input.allowedGroups.map((g) => String(g).trim()).filter(Boolean)
        : [],
      allowedChannelIds: Array.isArray(input.allowedChannelIds)
        ? input.allowedChannelIds.map((id) => String(id).trim()).filter(Boolean)
        : [],
      customGroups: [],
      permissions: {
        canCreateChannel: input.permissions?.canCreateChannel !== false,
        canEditChannel: input.permissions?.canEditChannel !== false,
        canDeleteChannel: Boolean(input.permissions?.canDeleteChannel),
        canViewRevenue: input.permissions?.canViewRevenue !== false,
        canEditRevenue: input.permissions?.canEditRevenue !== false,
        canUseVault: input.permissions?.canUseVault !== false,
      },
      note: rawNote,
      createdAt: new Date().toISOString(),
      approvedAt: autoApprove ? new Date().toISOString() : null,
    };

    this.state.users.unshift(newUser);
    this.#save();

    if (!autoApprove) {
      notifyTelegramNewUser(this, newUser)
        .then(() => {
          this.#save();
        })
        .catch(() => {});
    }

    return {
      ok: true,
      status: newUser.status,
      message: autoApprove
        ? `Đã tạo và cấp quyền cho tài khoản ${newUser.email}!`
        : 'Đăng ký tài khoản thành công! Tài khoản đang chờ Admin phê duyệt và cấp quyền sử dụng riêng.',
      user: sanitizeUser(newUser),
    };
  }

  listUsers() {
    if (!Array.isArray(this.state.users)) return [];
    return this.state.users.map((u) => {
      const clean = sanitizeUser(u);
      const ownedChannels = (this.state.channels || []).filter((ch) => ch.ownerUserId === u.id);
      const accessibleChannels = (this.state.channels || []).filter((ch) =>
        this.canUserAccessChannel(clean, ch)
      );
      return {
        ...clean,
        ownedChannelsCount: ownedChannels.length,
        accessibleChannelsCount: accessibleChannels.length,
      };
    });
  }

  updateUserPermissions(userId, patch = {}) {
    if (!Array.isArray(this.state.users)) this.state.users = [];
    const user = this.state.users.find((u) => u.id === userId);
    if (!user) {
      throw new Error(`Không tìm thấy User với mã: ${userId}`);
    }
    if (patch.name !== undefined) {
      user.name = String(patch.name).trim() || user.name;
    }
    if (patch.email !== undefined) {
      const nextEmail = String(patch.email).trim().toLowerCase();
      if (isValidUsernameOrEmail(nextEmail)) {
        user.email = nextEmail;
      }
    }
    if (patch.status !== undefined && ['pending', 'approved', 'suspended'].includes(patch.status)) {
      user.status = patch.status;
      if (patch.status === 'approved' && !user.approvedAt) {
        user.approvedAt = new Date().toISOString();
      }
      if (patch.status === 'suspended') {
        user.sessionToken = `usr_tok_${crypto.randomUUID().replace(/-/g, '')}`;
      }
    }
    if (patch.role !== undefined && ['admin', 'member'].includes(patch.role)) {
      user.role = patch.role;
    }
    if (patch.scopeMode !== undefined && ['isolated', 'assigned', 'all'].includes(patch.scopeMode)) {
      user.scopeMode = patch.scopeMode;
    }
    if (Array.isArray(patch.allowedGroups)) {
      user.allowedGroups = patch.allowedGroups.map((g) => String(g).trim()).filter(Boolean);
    }
    if (Array.isArray(patch.allowedChannelIds)) {
      user.allowedChannelIds = patch.allowedChannelIds.map((id) => String(id).trim()).filter(Boolean);
    }
    if (patch.permissions && typeof patch.permissions === 'object') {
      user.permissions = {
        canCreateChannel:
          patch.permissions.canCreateChannel !== undefined
            ? Boolean(patch.permissions.canCreateChannel)
            : user.permissions?.canCreateChannel !== false,
        canEditChannel:
          patch.permissions.canEditChannel !== undefined
            ? Boolean(patch.permissions.canEditChannel)
            : user.permissions?.canEditChannel !== false,
        canDeleteChannel:
          patch.permissions.canDeleteChannel !== undefined
            ? Boolean(patch.permissions.canDeleteChannel)
            : Boolean(user.permissions?.canDeleteChannel),
        canViewRevenue:
          patch.permissions.canViewRevenue !== undefined
            ? Boolean(patch.permissions.canViewRevenue)
            : user.permissions?.canViewRevenue !== false,
        canEditRevenue:
          patch.permissions.canEditRevenue !== undefined
            ? Boolean(patch.permissions.canEditRevenue)
            : user.permissions?.canEditRevenue !== false,
        canUseVault:
          patch.permissions.canUseVault !== undefined
            ? Boolean(patch.permissions.canUseVault)
            : user.permissions?.canUseVault !== false,
      };
    }
    if (patch.newPassword !== undefined && String(patch.newPassword).trim() !== '') {
      const nextPass = String(patch.newPassword).trim();
      if (nextPass.length < 3) {
        throw new Error('Mật khẩu cấp mới cho User phải có ít nhất 3 ký tự!');
      }
      user.passwordHash = hashPassword(nextPass);
      user.sessionToken = `usr_tok_${crypto.randomUUID().replace(/-/g, '')}`;
    }
    if (patch.note !== undefined) {
      user.note = String(patch.note).trim();
    }
    this.#save();
    return sanitizeUser(user);
  }

  deleteUser(userId) {
    if (!Array.isArray(this.state.users)) return { deletedUserId: userId };
    const idx = this.state.users.findIndex((u) => u.id === userId);
    if (idx === -1) {
      throw new Error(`Không tìm thấy User với mã: ${userId}`);
    }
    const [removed] = this.state.users.splice(idx, 1);
    this.#save();
    return {
      deletedUserId: removed.id,
      deletedEmail: removed.email,
    };
  }

  canUserAccessChannel(user, ch) {
    if (!user || user.role === 'admin' || user.scopeMode === 'all') {
      return true;
    }
    if (!ch) return false;
    // 1. Kênh do chính User này tạo
    if (ch.ownerUserId && ch.ownerUserId === user.id) {
      return true;
    }
    // 2. Kênh được Admin tích chọn cấp quyền trực tiếp
    if (Array.isArray(user.allowedChannelIds) && user.allowedChannelIds.includes(ch.id)) {
      return true;
    }
    // 3. Kênh nằm trong Group được Admin cấp quyền cho User
    const chGroup = String(ch.group || '').trim().toLowerCase();
    if (
      chGroup &&
      Array.isArray(user.allowedGroups) &&
      user.allowedGroups.some((g) => String(g).trim().toLowerCase() === chGroup)
    ) {
      return true;
    }
    // 4. Kênh có Mail QL trùng với Gmail đăng ký của User (nếu ở chế độ assigned hoặc isolated)
    const chMail = String(ch.managerEmail || '').trim().toLowerCase();
    if (chMail && user.email && chMail === String(user.email).trim().toLowerCase()) {
      return true;
    }
    return false;
  }

  getGaPasswordStatus(user = null) {
    if (!this.state.meta) this.state.meta = {};
    if (user && user.id && user.id !== 'admin') {
      const foundUser = (this.state.users || []).find((u) => u.id === user.id);
      const userGaHash = String(foundUser?.gaPasswordHash || '').trim();
      return {
        hasCustomGaPassword: Boolean(userGaHash),
        hasAnyPassword: Boolean(userGaHash || foundUser?.passwordHash),
      };
    }
    const gaHash = String(this.state.meta.gaPasswordHash || '').trim();
    const webHash = this.getRequiredPasswordHash();
    return {
      hasCustomGaPassword: Boolean(gaHash),
      hasAnyPassword: Boolean(gaHash || webHash),
    };
  }

  verifyGaPassword(password = '', user = null) {
    if (!this.state.meta) this.state.meta = {};
    const cleanPass = String(password || '').trim();
    if (!cleanPass) {
      throw new Error('Vui lòng nhập mật khẩu để mở khóa xem Gà kết nối!');
    }
    const candidateHash = hashPassword(cleanPass);

    if (user && user.id && user.id !== 'admin') {
      const foundUser = (this.state.users || []).find((u) => u.id === user.id);
      if (foundUser) {
        const userGaHash = String(foundUser.gaPasswordHash || '').trim();
        const userLoginHash = String(foundUser.passwordHash || '').trim();
        if (userGaHash) {
          if (!safeCompareStrings(candidateHash, userGaHash)) {
            throw new Error(
              'Mật khẩu Gà kết nối không chính xác. Nếu quên mật khẩu, hãy bấm sang tab "Quên Pass / Lấy lại"!'
            );
          }
          return {
            ok: true,
            firstTimeSet: false,
            hasCustomGaPassword: true,
          };
        }
        if (userLoginHash) {
          if (!safeCompareStrings(candidateHash, userLoginHash)) {
            throw new Error('Mật khẩu không chính xác. Không thể mở xem Gà kết nối!');
          }
          return {
            ok: true,
            firstTimeSet: false,
            hasCustomGaPassword: false,
          };
        }
        foundUser.gaPasswordHash = candidateHash;
        this.#save();
        return {
          ok: true,
          firstTimeSet: true,
          hasCustomGaPassword: true,
        };
      }
    }

    const gaHash = String(this.state.meta.gaPasswordHash || '').trim();
    const webHash = this.getRequiredPasswordHash();

    if (gaHash) {
      const matchedGa = safeCompareStrings(candidateHash, gaHash);
      if (!matchedGa) {
        throw new Error(
          'Mật khẩu Gà kết nối không chính xác. Nếu quên mật khẩu, hãy bấm sang tab "Quên Pass / Lấy lại"!'
        );
      }
      return {
        ok: true,
        firstTimeSet: false,
        hasCustomGaPassword: true,
      };
    }

    if (webHash) {
      const matchedWeb = safeCompareStrings(candidateHash, webHash);
      if (!matchedWeb) {
        throw new Error('Mật khẩu không chính xác. Không thể mở xem Gà kết nối!');
      }
      return {
        ok: true,
        firstTimeSet: false,
        hasCustomGaPassword: false,
      };
    }

    this.state.meta.gaPasswordHash = candidateHash;
    this.#save();
    return {
      ok: true,
      firstTimeSet: true,
      hasCustomGaPassword: true,
    };
  }

  manageGaPassword(input = {}, user = null) {
    if (!this.state.meta) this.state.meta = {};
    const action = String(input.action || 'set').trim().toLowerCase();
    const cleanNew = String(input.newPassword || '').trim();
    if (!cleanNew || cleanNew.length < 3) {
      throw new Error('Mật khẩu Gà kết nối mới phải có ít nhất 3 ký tự!');
    }
    const newHash = hashPassword(cleanNew);

    const isMember = Boolean(user && user.id && user.id !== 'admin');
    const foundUser = isMember ? (this.state.users || []).find((u) => u.id === user.id) : null;
    const existingGaHash = isMember
      ? String(foundUser?.gaPasswordHash || '').trim()
      : String(this.state.meta.gaPasswordHash || '').trim();
    const loginHash = isMember
      ? String(foundUser?.passwordHash || '').trim()
      : this.getRequiredPasswordHash();

    if (action === 'set') {
      if (existingGaHash) {
        const cleanCurrent = String(input.currentPassword || '').trim();
        if (!cleanCurrent) {
          throw new Error(
            'Bạn đã đặt mật khẩu Gà kết nối trước đó. Vui lòng nhập mật khẩu hiện tại hoặc bấm sang tab "Quên Pass / Lấy lại"!'
          );
        }
        const currentHash = hashPassword(cleanCurrent);
        const matchedGa = safeCompareStrings(currentHash, existingGaHash);
        const matchedLogin = Boolean(loginHash && safeCompareStrings(currentHash, loginHash));
        if (!matchedGa && !matchedLogin) {
          throw new Error(
            'Mật khẩu Gà hiện tại không chính xác! Nếu quên, hãy bấm sang tab "Quên Pass / Lấy lại".'
          );
        }
      }
      if (isMember && foundUser) {
        foundUser.gaPasswordHash = newHash;
      } else {
        this.state.meta.gaPasswordHash = newHash;
      }
      this.#save();
      return {
        ok: true,
        action: 'set',
        hasCustomGaPassword: true,
        message: existingGaHash
          ? 'Đã đổi mật khẩu Gà kết nối thành công!'
          : 'Đã đặt mật khẩu (Set Pass) cho Gà kết nối thành công!',
      };
    }

    if (action === 'reset') {
      const cleanRecovery = String(input.recoveryPassword || '').trim();
      const recoveryHash = hashPassword(cleanRecovery);
      const lowerRecovery = cleanRecovery.toLowerCase();

      if (isMember && foundUser) {
        const uEmail = String(foundUser.email || '').trim().toLowerCase();
        const uLocal = uEmail.includes('@') ? uEmail.split('@')[0] : uEmail;
        const matchedLoginPass = Boolean(loginHash && safeCompareStrings(recoveryHash, loginHash));
        const matchedUsername = Boolean(
          lowerRecovery && (lowerRecovery === uEmail || lowerRecovery === uLocal)
        );
        if (loginHash && !matchedLoginPass && !matchedUsername) {
          throw new Error(
            'Mật khẩu đăng nhập tài khoản hoặc Username xác nhận không chính xác! Vui lòng kiểm tra lại.'
          );
        }
        foundUser.gaPasswordHash = newHash;
        this.#save();
        return {
          ok: true,
          action: 'reset',
          hasCustomGaPassword: true,
          message: 'Đã lấy lại và đặt mật khẩu Gà kết nối mới thành công!',
        };
      }

      // Admin hoặc chế độ không khóa Web
      if (loginHash) {
        const adminEmail = String(this.state.meta.adminEmail || 'timhanhphuc').trim().toLowerCase();
        const adminLocal = adminEmail.includes('@') ? adminEmail.split('@')[0] : adminEmail;
        const matchedAdminPass = safeCompareStrings(recoveryHash, loginHash);
        const matchedAdminId = Boolean(
          lowerRecovery &&
            (lowerRecovery === 'timhanhphuc' ||
              lowerRecovery === 'admin' ||
              lowerRecovery === adminEmail ||
              lowerRecovery === adminLocal)
        );
        if (!matchedAdminPass && !matchedAdminId) {
          throw new Error(
            'Mật khẩu đăng nhập Admin hoặc tên tài khoản xác nhận không chính xác! Vui lòng kiểm tra lại.'
          );
        }
      }

      this.state.meta.gaPasswordHash = newHash;
      this.#save();
      return {
        ok: true,
        action: 'reset',
        hasCustomGaPassword: true,
        message: 'Đã lấy lại và đặt mật khẩu Gà kết nối mới thành công!',
      };
    }

    throw new Error(`Thao tác mật khẩu Gà kết nối không hợp lệ: ${action}`);
  }

  updatePassword(input = {}, currentAuthToken = '') {
    if (!this.state.meta) this.state.meta = {};
    // Nếu là User thành viên tự đổi mật khẩu của chính mình
    const resolved = this.resolveUserFromToken(currentAuthToken);
    if (resolved.valid && resolved.user && resolved.user.id !== 'admin') {
      const targetUser = (this.state.users || []).find((u) => u.id === resolved.user.id);
      if (targetUser) {
        const newPassword = String(input.newPassword || '').trim();
        if (!newPassword || newPassword.length < 3) {
          throw new Error('Mật khẩu mới phải có ít nhất 3 ký tự!');
        }
        targetUser.passwordHash = hashPassword(newPassword);
        targetUser.sessionToken = `usr_tok_${crypto.randomUUID().replace(/-/g, '')}`;
        this.#save();
        return {
          passwordEnabled: true,
          token: targetUser.sessionToken,
          user: sanitizeUser(targetUser),
        };
      }
    }

    const requiredHash = this.getRequiredPasswordHash();
    const adminToken = String(this.state.meta?.adminSessionToken || '').trim();
    const providedCurrentPass = String(input.currentPassword || '').trim();
    const isAlreadyAuthed = Boolean(
      requiredHash &&
        (safeCompareStrings(currentAuthToken, requiredHash) ||
          (adminToken && safeCompareStrings(currentAuthToken, adminToken)))
    );

    if (requiredHash && !isAlreadyAuthed) {
      if (!safeCompareStrings(hashPassword(providedCurrentPass), requiredHash)) {
        throw new Error('Mật khẩu hiện tại không đúng!');
      }
    }

    const disableLock = Boolean(input.disableLock);
    const newPassword = String(input.newPassword || '').trim();
    if (disableLock) {
      this.state.meta.authPasswordHash = '';
      this.state.meta.adminSessionToken = '';
      this.#save();
      return {
        passwordEnabled: false,
        token: '',
      };
    }

    if (!newPassword || newPassword.length < 3) {
      throw new Error('Mật khẩu mới phải có ít nhất 3 ký tự!');
    }

    const nextHash = hashPassword(newPassword);
    this.state.meta.authPasswordHash = nextHash;
    this.state.meta.adminSessionToken = `adm_tok_${crypto.randomUUID().replace(/-/g, '')}`;
    this.#save();
    return {
      passwordEnabled: true,
      token: this.state.meta.adminSessionToken,
    };
  }

  getBrandProfile() {
    const raw = this.state.meta?.brandProfile || {};
    return {
      brandName: String(raw.brandName || 'STUDIOFLOW').trim(),
      commercialTitle: String(raw.commercialTitle || 'STUDIOFLOW ENTERPRISE™').trim(),
      tagline: String(
        raw.tagline || 'Hệ Điều Hành Quản Trị Mạng Lưới Kênh YouTube & Tài Sản Nội Dung Số Tương Lai'
      ).trim(),
      companyName: String(raw.companyName || 'TIPHOMART MEDIA & DIGITAL ASSETS CORP').trim(),
      domain: String(raw.domain || 'tiphomart.io.vn').trim(),
      hotline: String(raw.hotline || '0988.888.999').trim(),
      email: String(raw.email || 'commercial@tiphomart.io.vn').trim(),
      address: String(
        raw.address || 'Trung Tâm Điều Hành Truyền Thông & Tài Sản Số — Việt Nam & Global Network'
      ).trim(),
      edition: String(raw.edition || 'COMMERCIAL ENTERPRISE v2.4 · MỆNH KIM FUTURISTIC').trim(),
      licenseCode: String(raw.licenseCode || 'SF-ENT-2026-GOLD').trim(),
      updatedAt: raw.updatedAt || '2026-10-17T00:00:00.000Z',
    };
  }

  updateBrandProfile(input = {}) {
    if (!this.state.meta) this.state.meta = {};
    const prev = this.getBrandProfile();
    this.state.meta.brandProfile = {
      brandName: input.brandName !== undefined ? String(input.brandName).trim() || prev.brandName : prev.brandName,
      commercialTitle:
        input.commercialTitle !== undefined
          ? String(input.commercialTitle).trim() || prev.commercialTitle
          : prev.commercialTitle,
      tagline: input.tagline !== undefined ? String(input.tagline).trim() || prev.tagline : prev.tagline,
      companyName:
        input.companyName !== undefined ? String(input.companyName).trim() || prev.companyName : prev.companyName,
      domain: input.domain !== undefined ? String(input.domain).trim() || prev.domain : prev.domain,
      hotline: input.hotline !== undefined ? String(input.hotline).trim() : prev.hotline,
      email: input.email !== undefined ? String(input.email).trim() : prev.email,
      address: input.address !== undefined ? String(input.address).trim() : prev.address,
      edition: input.edition !== undefined ? String(input.edition).trim() || prev.edition : prev.edition,
      licenseCode:
        input.licenseCode !== undefined ? String(input.licenseCode).trim() || prev.licenseCode : prev.licenseCode,
      updatedAt: new Date().toISOString(),
    };
    this.#save();
    return this.getBrandProfile();
  }

  getNotionConfig() {
    const cfg = this.state.meta?.notionConfig || {};
    const token = String(cfg.notionToken || process.env.NOTION_TOKEN || '').trim();
    const pageUrl = String(cfg.notionPageUrl || process.env.NOTION_PAGE_URL || '').trim();
    const notionPageId = extractNotionId(pageUrl);
    return {
      hasToken: Boolean(token),
      maskedToken: token
        ? token.length > 12
          ? `${token.slice(0, 7)}...${token.slice(-4)}`
          : 'Đã lưu Token'
        : '',
      notionPageUrl: pageUrl,
      notionPageId,
      autoSync: cfg.autoSync !== false,
      configured: Boolean(token && notionPageId),
    };
  }

  hasNotionAutoSync() {
    const info = this.getNotionConfig();
    return Boolean(info.configured && info.autoSync);
  }

  updateNotionConfig(input = {}) {
    if (!this.state.meta) this.state.meta = {};
    const prev = this.state.meta.notionConfig || {};
    const nextToken =
      input.notionToken !== undefined && String(input.notionToken).trim() !== ''
        ? String(input.notionToken).trim()
        : prev.notionToken || '';
    const nextPageUrl =
      input.notionPageUrl !== undefined ? String(input.notionPageUrl).trim() : prev.notionPageUrl || '';
    const nextAutoSync = input.autoSync !== undefined ? Boolean(input.autoSync) : prev.autoSync !== false;

    this.state.meta.notionConfig = {
      notionToken: nextToken,
      notionPageUrl: nextPageUrl,
      autoSync: nextAutoSync,
      updatedAt: new Date().toISOString(),
    };
    this.#save();
    return this.getNotionConfig();
  }

  async syncContentItemWithNotion(id, options = {}) {
    const item = this.state.contents.find((c) => c.id === id);
    if (!item) {
      throw new Error(`Không tìm thấy Nội dung lưu trữ với mã: ${id}`);
    }
    const cfg = this.state.meta?.notionConfig || {};
    const result = await syncContentToNotion(item, cfg, options.fetchImpl);
    if (result.synced) {
      item.notionPageId = result.notionPageId || item.notionPageId || '';
      item.notionUrl = result.notionUrl || item.notionUrl || '';
      item.lastNotionSyncAt = new Date().toISOString();
      this.#save();
    }
    return {
      ...item,
      notionSynced: Boolean(result.synced),
      notionUrl: item.notionUrl,
    };
  }

  // ===========================================================================
  // 4. YOUTUBE MANAGEMENT & DAILY VIEWS TRACKER (CHỈ SỐ CẬP NHẬT HẰNG NGÀY)
  // ===========================================================================

  listChannels(user = null) {
    const visible = (this.state.channels || []).filter((ch) => this.canUserAccessChannel(user, ch));
    const canSeeRev = !user || user.role === 'admin' || user.permissions?.canViewRevenue !== false;
    return visible.map((ch) => {
      const topVideos = this.getChannelTopVideos(ch.id, 3);
      if (topVideos.length > 0) {
        ch.topVideos = topVideos;
      }
      if (!canSeeRev) {
        return {
          ...ch,
          monthlyRevenue: normalizeMonthlyRevenue({}),
          totalYearlyRevenue: 0,
        };
      }
      return ch;
    });
  }

  listGroups(user = null) {
    if (user && user.role !== 'admin' && user.scopeMode !== 'all') {
      const uRecord = (this.state.users || []).find((u) => u.id === user.id) || user;
      const userCustom = Array.isArray(uRecord.customGroups)
        ? uRecord.customGroups.map((g) => String(g || '').trim()).filter(Boolean)
        : [];
      const userAllowed = Array.isArray(uRecord.allowedGroups)
        ? uRecord.allowedGroups.map((g) => String(g || '').trim()).filter(Boolean)
        : [];
      const visibleChannelGroups = this.listChannels(user)
        .map((ch) => String(ch.group || '').trim())
        .filter(Boolean);
      return [...new Set([...userCustom, ...userAllowed, ...visibleChannelGroups])];
    }

    const customGroups = Array.isArray(this.state.meta?.customGroups)
      ? this.state.meta.customGroups.map((g) => String(g || '').trim()).filter(Boolean)
      : [];
    const userGroups = (this.state.users || []).flatMap((u) =>
      Array.isArray(u.customGroups) ? u.customGroups.map((g) => String(g || '').trim()).filter(Boolean) : []
    );
    const channelGroups = (this.state.channels || [])
      .map((ch) => String(ch.group || '').trim())
      .filter(Boolean);
    return [...new Set([...customGroups, ...userGroups, ...channelGroups])];
  }

  #registerCustomGroupName(groupName = '', user = null) {
    const name = String(groupName || '').trim();
    if (!name) return;

    if (user && user.role !== 'admin' && user.scopeMode !== 'all') {
      const uRecord = (this.state.users || []).find((u) => u.id === user.id);
      if (uRecord) {
        if (!Array.isArray(uRecord.customGroups)) uRecord.customGroups = [];
        const existsUserGrp = uRecord.customGroups.some(
          (g) => String(g || '').trim().toLowerCase() === name.toLowerCase()
        );
        if (!existsUserGrp) {
          uRecord.customGroups.push(name);
        }
        if (uRecord.scopeMode === 'assigned') {
          if (!Array.isArray(uRecord.allowedGroups)) uRecord.allowedGroups = [];
          const existsAllowed = uRecord.allowedGroups.some(
            (g) => String(g || '').trim().toLowerCase() === name.toLowerCase()
          );
          if (!existsAllowed) {
            uRecord.allowedGroups.push(name);
          }
        }
        return;
      }
    }

    if (!this.state.meta) this.state.meta = {};
    if (!Array.isArray(this.state.meta.customGroups)) {
      this.state.meta.customGroups = [];
    }
    const existsCaseInsensitive = this.state.meta.customGroups.some(
      (g) => String(g || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (!existsCaseInsensitive) {
      this.state.meta.customGroups.push(name);
    }
  }

  createGroup(input = {}, user = null) {
    if (user && user.role !== 'admin' && user.permissions?.canCreateChannel === false) {
      throw new Error('Tài khoản của bạn chưa được Admin cấp quyền tạo Group mới!');
    }
    const name = String(input.name || '').trim();
    if (!name) {
      throw new Error('Vui lòng nhập tên Group cần tạo!');
    }

    this.#registerCustomGroupName(name, user);

    let assignedCount = 0;
    if (Array.isArray(input.channelIds) && input.channelIds.length > 0) {
      const idSet = new Set(input.channelIds.map((id) => String(id)));
      for (const ch of this.state.channels || []) {
        if (idSet.has(ch.id) && this.canUserAccessChannel(user, ch)) {
          ch.group = name;
          ch.updatedAt = new Date().toISOString();
          assignedCount += 1;
        }
      }
    }

    this.#save();
    return {
      name,
      assignedCount,
      groups: this.listGroups(user),
    };
  }

  deleteGroup(groupName = '', user = null) {
    const clean = String(groupName || '').trim();
    if (!clean) {
      throw new Error('Tên Group không hợp lệ');
    }
    if (user && user.role !== 'admin' && user.scopeMode !== 'all') {
      const uRecord = (this.state.users || []).find((u) => u.id === user.id);
      if (uRecord && Array.isArray(uRecord.customGroups)) {
        uRecord.customGroups = uRecord.customGroups.filter(
          (g) => String(g || '').trim().toLowerCase() !== clean.toLowerCase()
        );
      }
      for (const ch of this.state.channels || []) {
        if (
          this.canUserAccessChannel(user, ch) &&
          String(ch.group || '').trim().toLowerCase() === clean.toLowerCase()
        ) {
          ch.group = '';
          ch.updatedAt = new Date().toISOString();
        }
      }
      this.#save();
      return {
        deleted: clean,
        groups: this.listGroups(user),
      };
    }

    if (this.state.meta && Array.isArray(this.state.meta.customGroups)) {
      this.state.meta.customGroups = this.state.meta.customGroups.filter(
        (g) => String(g || '').trim().toLowerCase() !== clean.toLowerCase()
      );
    }
    for (const ch of this.state.channels || []) {
      if (String(ch.group || '').trim().toLowerCase() === clean.toLowerCase()) {
        ch.group = '';
        ch.updatedAt = new Date().toISOString();
      }
    }
    this.#save();
    return {
      deleted: clean,
      groups: this.listGroups(user),
    };
  }

  getChannelTopVideos(channelId, limit = 3) {
    const chVideos = (this.state.videos || []).filter((v) => v.channelId === channelId);
    if (chVideos.length === 0) {
      const ch = (this.state.channels || []).find((c) => c.id === channelId);
      return Array.isArray(ch?.topVideos) ? ch.topVideos.slice(0, limit) : [];
    }
    return [...chVideos]
      .sort((a, b) => (Number(b.currentViews ?? b.views) || 0) - (Number(a.currentViews ?? a.views) || 0))
      .slice(0, limit)
      .map((v) => ({
        id: v.id,
        youtubeVideoId: v.youtubeVideoId,
        title: v.title,
        views: Number(v.currentViews ?? v.views) || 0,
        likes: Number(v.currentLikes ?? v.likes) || 0,
        comments: Number(v.currentComments ?? v.comments) || 0,
        publishedAt: v.publishedAt || '',
      }));
  }

  createChannel(input = {}, user = null) {
    if (user && user.role !== 'admin' && user.permissions?.canCreateChannel === false) {
      throw new Error('Tài khoản của bạn chưa được Admin cấp quyền thêm kênh mới!');
    }
    let rawName = String(input.name || '').trim();
    let rawHandle = String(input.handle || '').trim();
    const rawUrl = String(input.channelUrl || '').trim();

    // Nếu người dùng dán URL vào ô Tên kênh hoặc chỉ nhập URL / Handle
    if (!rawUrl && /^https?:\/\//i.test(rawName)) {
      input = { ...input, channelUrl: rawName };
      rawName = '';
    }
    if (!rawHandle && rawName.startsWith('@')) {
      rawHandle = rawName;
    }
    if (!rawHandle && rawUrl) {
      const m = rawUrl.match(/\/(@[^/?#]+)/);
      if (m) rawHandle = decodeURIComponent(m[1]);
    }
    if (!rawName && rawHandle) {
      rawName = rawHandle.replace(/^@/, '');
    }
    if (!rawName && rawUrl) {
      rawName = rawUrl.replace(/^https?:\/\/(www\.)?youtube\.com\/+/i, '').replace(/\/.*$/, '');
    }

    if (!rawName) {
      throw new Error('Vui lòng nhập Tên kênh, @Handle hoặc Đường dẫn (URL) kênh YouTube');
    }

    const handle = rawHandle
      ? rawHandle.startsWith('@')
        ? rawHandle
        : `@${rawHandle}`
      : `@${rawName.replace(/\s+/g, '')}`;

    const status =
      input.status && VALID_CHANNEL_STATUSES.includes(input.status) ? input.status : 'active';
    const monetization =
      input.monetization && VALID_MONETIZATION.includes(input.monetization)
        ? input.monetization
        : status === 'monetized'
        ? 'enabled'
        : 'pending';

    const isMemberIsolated = Boolean(user && user.role !== 'admin' && user.scopeMode !== 'all');
    const existingChannel = this.state.channels.find((c) => {
      if ((c.handle || '').toLowerCase() !== handle.toLowerCase()) return false;
      if (isMemberIsolated) {
        return c.ownerUserId === user.id || this.canUserAccessChannel(user, c);
      }
      return true;
    });
    if (existingChannel) {
      return this.updateChannel(
        existingChannel.id,
        {
          name: rawName || existingChannel.name,
          handle,
          channelUrl: rawUrl || existingChannel.channelUrl || `https://www.youtube.com/${handle}`,
          subscribers:
            input.subscribers !== undefined && Number(input.subscribers) > 0
              ? Number(input.subscribers)
              : existingChannel.subscribers,
          totalVideos:
            input.totalVideos !== undefined && Number(input.totalVideos) > 0
              ? Number(input.totalVideos)
              : existingChannel.totalVideos,
          totalViews:
            input.totalViews !== undefined && Number(input.totalViews) > 0
              ? Number(input.totalViews)
              : existingChannel.totalViews,
          firstVideoDate: input.firstVideoDate || existingChannel.firstVideoDate,
          category: input.category || existingChannel.category,
          group: input.group !== undefined ? input.group : existingChannel.group,
          manager: input.manager !== undefined ? input.manager : existingChannel.manager,
          managerEmail: input.managerEmail !== undefined ? input.managerEmail : existingChannel.managerEmail,
          adsenseAccount:
            input.adsenseAccount !== undefined
              ? input.adsenseAccount
              : input.gaConnected !== undefined
              ? input.gaConnected
              : existingChannel.adsenseAccount,
          status: input.status || existingChannel.status,
          monetization: input.monetization || existingChannel.monetization,
          statusNote: input.statusNote || existingChannel.statusNote,
        },
        user
      );
    }

    const channel = normalizeChannel({
      id: `ch-${crypto.randomUUID().slice(0, 8)}`,
      name: rawName,
      handle,
      channelUrl: rawUrl || `https://www.youtube.com/${handle}`,
      subscribers: Math.max(0, Number(input.subscribers) || 0),
      totalVideos: Math.max(0, Number(input.totalVideos) || 0),
      totalViews: Math.max(0, Number(input.totalViews) || 0),
      firstVideoDate: String(input.firstVideoDate || '').trim(),
      category: String(input.category || 'Sáng tạo nội dung').trim(),
      group: String(input.group || '').trim(),
      manager: String(input.manager || (isMemberIsolated ? user.name : '') || '').trim(),
      managerEmail: String(input.managerEmail || (isMemberIsolated ? user.email : '') || '').trim(),
      ownerUserId: isMemberIsolated ? user.id : String(input.ownerUserId || '').trim(),
      ownerEmail: isMemberIsolated ? user.email : String(input.ownerEmail || '').trim(),
      adsenseAccount: String(input.adsenseAccount ?? input.gaConnected ?? '').trim(),
      status,
      monetization,
      strikeCount: Math.max(0, Number(input.strikeCount) || 0),
      statusNote: String(input.statusNote || 'Kênh mới khởi tạo trên hệ thống.').trim(),
      updatedAt: new Date().toISOString(),
    });

    if (channel.group) {
      this.#registerCustomGroupName(channel.group, user);
    }
    this.state.channels.unshift(channel);
    this.#save();
    return channel;
  }

  async createChannelAndSync(input = {}, options = {}, user = null) {
    if (user && user.role !== 'admin' && user.permissions?.canCreateChannel === false) {
      throw new Error('Tài khoản của bạn chưa được Admin cấp quyền thêm kênh mới!');
    }
    const query = String(input.channelUrl || input.handle || input.name || '').trim();
    if (!query) {
      throw new Error('Vui lòng nhập Tên kênh, @Handle hoặc Đường dẫn (URL) kênh YouTube');
    }

    const channelFetcher = options.channelFetcher || fetchYouTubeChannelProfile;
    let remote = null;
    try {
      remote = await channelFetcher(query);
    } catch {
      remote = null;
    }

    const mergedInput = { ...input };
    if (remote) {
      // Nếu người dùng không nhập tên riêng (hoặc chỉ nhập URL/@handle), lấy tên chuẩn từ YouTube
      const userTypedUrlOrHandleAsName =
        !input.name ||
        /^https?:\/\//i.test(input.name) ||
        String(input.name).trim().startsWith('@') ||
        String(input.name).trim().toLowerCase() === remote.handle.replace(/^@/, '').toLowerCase();

      if (userTypedUrlOrHandleAsName && remote.name) {
        mergedInput.name = remote.name;
      }
      if (remote.handle) {
        mergedInput.handle = remote.handle;
      }
      if (remote.channelUrl) {
        mergedInput.channelUrl = remote.channelUrl;
      }
      if (remote.subscribers > 0 && (!input.subscribers || Number(input.subscribers) <= 1000)) {
        mergedInput.subscribers = remote.subscribers;
      }
      if (remote.totalVideos > 0) {
        mergedInput.totalVideos = remote.totalVideos;
      }
      if (remote.totalViews > 0) {
        mergedInput.totalViews = remote.totalViews;
      }
      if (remote.firstVideoDate && !input.firstVideoDate) {
        mergedInput.firstVideoDate = remote.firstVideoDate;
      }
      if (!input.category || input.category === 'Sáng tạo nội dung') {
        mergedInput.category =
          remote.category ||
          inferChannelCategory({
            name: remote.name || mergedInput.name,
            handle: remote.handle || mergedInput.handle,
            description: remote.description || '',
            videos: remote.videos || [],
          });
      }
      if (!input.status) {
        mergedInput.status =
          (mergedInput.subscribers || 0) >= 1000
            ? 'monetized'
            : (mergedInput.subscribers || 0) > 0
            ? 'active'
            : 'incubating';
      }
      if (!input.monetization) {
        mergedInput.monetization = (mergedInput.subscribers || 0) >= 1000 ? 'enabled' : 'pending';
      }
      if (!input.statusNote && remote.description) {
        mergedInput.statusNote = `Tự động đồng bộ từ YouTube: ${remote.description.slice(0, 180)}`;
      }
    }

    const channel = this.createChannel(mergedInput, user);
    let importedVideosCount = 0;

    if (remote && Array.isArray(remote.videos)) {
      const today = todayIsoDate();
      // Đảo ngược để video mới nhất nằm lên đầu sau khi unshift
      for (const v of [...remote.videos].reverse()) {
        const exactViews = Math.max(0, Number(v.views) || 0);
        const existing = this.state.videos.find(
          (x) => x.youtubeVideoId === v.youtubeVideoId && x.channelId === channel.id
        );
        if (existing) {
          existing.channelId = channel.id;
          if (v.title) existing.title = v.title;
          if (v.publishedAt && !existing.publishedAt) existing.publishedAt = v.publishedAt;
          existing.metricsHistory = (existing.metricsHistory || [])
            .filter((m) => m.date < today)
            .map((m) => ({
              ...m,
              views: Math.min(Number(m.views) || 0, exactViews),
            }));
          this.recordVideoDailyMetrics(existing.id, {
            date: today,
            views: exactViews,
            likes: v.likes ?? existing.currentLikes ?? 0,
            comments: v.comments ?? existing.currentComments ?? 0,
          });
        } else {
          this.createVideo({
            title: v.title,
            youtubeVideoId: v.youtubeVideoId,
            channelId: channel.id,
            publishedAt: v.publishedAt || today,
            initialViews: exactViews,
            initialLikes: v.likes || 0,
            initialComments: v.comments || 0,
            metricDate: today,
          });
          importedVideosCount += 1;
        }
      }
      const sumScannedViews = remote.videos.reduce((s, v) => s + (Number(v.views) || 0), 0);
      channel.totalViews = Math.max(Number(remote.totalViews) || 0, sumScannedViews);
    }

    const topVideos = this.getChannelTopVideos(channel.id, 3);
    channel.topVideos = topVideos;
    this.#save();

    return {
      ...channel,
      channel,
      topVideos,
      scannedVideosCount: remote?.videos?.length || 0,
      importedVideosCount,
      autoSynced: Boolean(remote),
    };
  }

  async syncChannelFromYouTube(channelId, options = {}) {
    const channel = this.state.channels.find((c) => c.id === channelId);
    if (!channel) {
      throw new Error(`Không tìm thấy Kênh YouTube với mã: ${channelId}`);
    }
    const query = channel.channelUrl || channel.handle || channel.name;
    const channelFetcher = options.channelFetcher || fetchYouTubeChannelProfile;
    const remote = await channelFetcher(query);
    if (!remote) {
      throw new Error(`Không thể lấy dữ liệu trực tuyến từ YouTube cho kênh: ${query}`);
    }

    const nextSubs = remote.subscribers > 0 ? remote.subscribers : channel.subscribers;
    const autoCategory =
      remote.category ||
      inferChannelCategory({
        name: remote.name || channel.name,
        handle: remote.handle || channel.handle,
        description: remote.description || channel.statusNote,
        videos: remote.videos || [],
      });

    const sumScannedViews = (remote.videos || []).reduce((s, v) => s + (Number(v.views) || 0), 0);
    const exactChannelTotalViews = Math.max(Number(remote.totalViews) || 0, sumScannedViews);

    this.updateChannel(channel.id, {
      name: remote.name || channel.name,
      handle: remote.handle || channel.handle,
      channelUrl: remote.channelUrl || channel.channelUrl,
      subscribers: nextSubs,
      totalVideos: remote.totalVideos > 0 ? remote.totalVideos : channel.totalVideos,
      totalViews: exactChannelTotalViews > 0 ? exactChannelTotalViews : channel.totalViews,
      firstVideoDate: channel.firstVideoDate || remote.firstVideoDate || '',
      category: autoCategory,
    });

    let importedVideosCount = 0;
    const today = todayIsoDate();
    for (const v of [...(remote.videos || [])].reverse()) {
      const exactViews = Math.max(0, Number(v.views) || 0);
      const existing = this.state.videos.find(
        (x) => x.youtubeVideoId === v.youtubeVideoId && (x.channelId === channel.id || !this.state.channels.some((c) => c.id === x.channelId))
      );
      if (existing) {
        existing.channelId = channel.id;
        if (v.title) existing.title = v.title;
        if (v.publishedAt && !existing.publishedAt) existing.publishedAt = v.publishedAt;
        existing.metricsHistory = (existing.metricsHistory || [])
          .filter((m) => m.date < today)
          .map((m) => ({
            ...m,
            views: Math.min(Number(m.views) || 0, exactViews),
          }));
        this.recordVideoDailyMetrics(existing.id, {
          date: today,
          views: exactViews,
          likes: v.likes ?? existing.currentLikes ?? 0,
          comments: v.comments ?? existing.currentComments ?? 0,
        });
      } else {
        this.createVideo({
          title: v.title,
          youtubeVideoId: v.youtubeVideoId,
          channelId: channel.id,
          publishedAt: v.publishedAt || today,
          initialViews: exactViews,
          initialLikes: v.likes || 0,
          initialComments: v.comments || 0,
          metricDate: today,
        });
        importedVideosCount += 1;
      }
    }

    const topVideos = this.getChannelTopVideos(channel.id, 3);
    channel.topVideos = topVideos;
    this.#save();

    return {
      channel,
      topVideos,
      scannedVideosCount: (remote.videos || []).length,
      importedVideosCount,
      autoSynced: true,
    };
  }

  updateChannel(id, patch = {}, user = null) {
    const channel = this.state.channels.find((c) => c.id === id);
    if (!channel) {
      throw new Error(`Không tìm thấy Kênh YouTube với mã: ${id}`);
    }
    if (user && user.role !== 'admin') {
      if (!this.canUserAccessChannel(user, channel)) {
        throw new Error('Bạn không có quyền truy cập hoặc chỉnh sửa kênh này!');
      }
      if (user.permissions?.canEditChannel === false) {
        throw new Error('Tài khoản của bạn chưa được Admin cấp quyền chỉnh sửa kênh!');
      }
      if (patch.monthlyRevenue !== undefined && user.permissions?.canEditRevenue === false) {
        throw new Error('Tài khoản của bạn chưa được Admin cấp quyền nhập/sửa doanh thu!');
      }
    }
    if (patch.status !== undefined) {
      if (!VALID_CHANNEL_STATUSES.includes(patch.status)) {
        throw new Error(`Tình trạng kênh không hợp lệ: ${patch.status}`);
      }
      channel.status = patch.status;
    }
    if (patch.monetization !== undefined) {
      if (!VALID_MONETIZATION.includes(patch.monetization)) {
        throw new Error(`Trạng thái bật kiếm tiền không hợp lệ: ${patch.monetization}`);
      }
      channel.monetization = patch.monetization;
    }
    if (patch.name !== undefined) channel.name = String(patch.name).trim();
    if (patch.handle !== undefined) {
      const h = String(patch.handle).trim();
      channel.handle = h.startsWith('@') ? h : `@${h}`;
    }
    if (patch.channelUrl !== undefined) channel.channelUrl = String(patch.channelUrl).trim();
    if (patch.subscribers !== undefined) channel.subscribers = Math.max(0, Number(patch.subscribers) || 0);
    if (patch.totalVideos !== undefined) channel.totalVideos = Math.max(0, Number(patch.totalVideos) || 0);
    if (patch.totalViews !== undefined) channel.totalViews = Math.max(0, Number(patch.totalViews) || 0);
    if (patch.watchHours !== undefined) channel.watchHours = Math.max(0, Number(patch.watchHours) || 0);
    if (patch.realtimeViews48h !== undefined) {
      channel.realtimeViews48h = Math.max(0, Number(patch.realtimeViews48h) || 0);
    }
    if (patch.ctrPercent !== undefined) channel.ctrPercent = Math.max(0, Number(patch.ctrPercent) || 0);
    if (patch.avgViewDuration !== undefined) channel.avgViewDuration = String(patch.avgViewDuration).trim();
    if (patch.estimatedRevenue !== undefined) channel.estimatedRevenue = String(patch.estimatedRevenue).trim();
    if (patch.firstVideoDate !== undefined) channel.firstVideoDate = String(patch.firstVideoDate).trim();
    if (patch.category !== undefined) channel.category = String(patch.category).trim();
    if (patch.group !== undefined) {
      channel.group = String(patch.group).trim();
      if (channel.group) {
        this.#registerCustomGroupName(channel.group, user);
      }
    }
    if (patch.manager !== undefined) channel.manager = String(patch.manager).trim();
    if (patch.managerEmail !== undefined) channel.managerEmail = String(patch.managerEmail).trim();
    if (patch.adsenseAccount !== undefined) channel.adsenseAccount = String(patch.adsenseAccount).trim();
    if (patch.gaConnected !== undefined) channel.adsenseAccount = String(patch.gaConnected).trim();
    if (patch.monthlyRevenue !== undefined && typeof patch.monthlyRevenue === 'object') {
      channel.monthlyRevenue = normalizeMonthlyRevenue({
        ...(channel.monthlyRevenue || {}),
        ...patch.monthlyRevenue,
      });
      channel.totalYearlyRevenue = sumMonthlyRevenue(channel.monthlyRevenue);
    }
    if (patch.strikeCount !== undefined) channel.strikeCount = Math.max(0, Number(patch.strikeCount) || 0);
    if (patch.statusNote !== undefined) channel.statusNote = String(patch.statusNote).trim();
    channel.updatedAt = new Date().toISOString();
    this.#save();
    return channel;
  }

  ingestYouTubeStudioMetrics(payload = {}) {
    const rawName = String(payload.name || '').trim().toLowerCase();
    const rawHandle = String(payload.handle || '').trim().toLowerCase();
    const targetId = String(payload.channelId || '').trim();

    let channel = this.state.channels.find(
      (c) =>
        (targetId && c.id === targetId) ||
        (rawHandle && (c.handle || '').toLowerCase() === rawHandle) ||
        (rawName && (c.name || '').toLowerCase() === rawName)
    );

    if (!channel && this.state.channels.length > 0 && targetId) {
      channel = this.state.channels[0];
    }

    if (!channel) {
      throw new Error('Không tìm thấy kênh khớp với dữ liệu YouTube Studio');
    }

    const parsedFromText = payload.rawStudioText
      ? parseYouTubeStudioText(payload.rawStudioText)
      : {};
    const merged = { ...parsedFromText, ...payload };

    const patch = {};
    if (merged.totalViews !== undefined && Number(merged.totalViews) > 0) {
      patch.totalViews = Number(merged.totalViews);
    }
    if (merged.watchHours !== undefined && Number(merged.watchHours) >= 0 && String(merged.watchHours) !== '') {
      patch.watchHours = Number(merged.watchHours);
    }
    if (merged.subscribers !== undefined && Number(merged.subscribers) > 0) {
      patch.subscribers = Number(merged.subscribers);
    }
    if (merged.totalVideos !== undefined && Number(merged.totalVideos) > 0) {
      patch.totalVideos = Number(merged.totalVideos);
    }
    if (merged.realtimeViews48h !== undefined && Number(merged.realtimeViews48h) >= 0 && String(merged.realtimeViews48h) !== '') {
      patch.realtimeViews48h = Number(merged.realtimeViews48h);
    }
    if (merged.ctrPercent !== undefined && Number(merged.ctrPercent) >= 0 && String(merged.ctrPercent) !== '') {
      patch.ctrPercent = Number(merged.ctrPercent);
    }
    if (merged.avgViewDuration !== undefined && String(merged.avgViewDuration).trim() !== '') {
      patch.avgViewDuration = String(merged.avgViewDuration).trim();
    }
    if (merged.estimatedRevenue !== undefined && String(merged.estimatedRevenue).trim() !== '') {
      patch.estimatedRevenue = String(merged.estimatedRevenue).trim();
    }
    return this.updateChannel(channel.id, patch);
  }

  deleteChannel(id, user = null) {
    const idx = this.state.channels.findIndex((c) => c.id === id);
    if (idx === -1) {
      throw new Error(`Không tìm thấy Kênh YouTube với mã: ${id}`);
    }
    const targetCh = this.state.channels[idx];
    if (user && user.role !== 'admin') {
      if (!this.canUserAccessChannel(user, targetCh)) {
        throw new Error('Bạn không có quyền xóa kênh này!');
      }
      const isOwnChannel = Boolean(targetCh.ownerUserId && targetCh.ownerUserId === user.id);
      if (!isOwnChannel && !user.permissions?.canDeleteChannel) {
        throw new Error('Tài khoản của bạn chưa được Admin cấp quyền xóa kênh của hệ thống!');
      }
    }

    // Bot 4 Auto-Shield: Tự động chụp Snapshot khôi phục trước khi xóa kênh
    try {
      if (!this.state.meta) this.state.meta = {};
      const center = ensureBotCenterState(this.state.meta);
      const shieldSnap = buildBackupPayload(
        this,
        `🛡️ Auto-Shield trước khi xóa kênh "${targetCh.name || targetCh.id}"`
      );
      center.snapshots.unshift(shieldSnap);
      if (center.snapshots.length > 15) center.snapshots.length = 15;
      appendBotLog(
        this.state.meta,
        'Bot 4 (Auto-Shield)',
        `Đã tự động chụp Snapshot bảo vệ trước khi xóa kênh "${targetCh.name || targetCh.id}".`,
        'info'
      );
    } catch {}

    const [removed] = this.state.channels.splice(idx, 1);
    const beforeVideos = this.state.videos.length;
    this.state.videos = this.state.videos.filter((v) => v.channelId !== id);
    const removedVideosCount = beforeVideos - this.state.videos.length;
    this.#save();
    return {
      deletedChannelId: removed.id,
      deletedChannelName: removed.name,
      removedVideosCount,
    };
  }

  deleteContentItem(id, user = null) {
    const idx = this.state.contents.findIndex((c) => c.id === id);
    if (idx === -1) {
      throw new Error(`Không tìm thấy Nội dung lưu trữ với mã: ${id}`);
    }
    const targetItem = this.state.contents[idx];
    if (
      user &&
      user.role !== 'admin' &&
      user.scopeMode !== 'all' &&
      targetItem.ownerUserId &&
      targetItem.ownerUserId !== user.id
    ) {
      throw new Error('Bạn không có quyền xóa nội dung này!');
    }
    const [removed] = this.state.contents.splice(idx, 1);
    this.#save();
    return {
      deletedContentId: removed.id,
      deletedTitle: removed.title,
    };
  }

  listVideos(filter = {}, user = null) {
    let list = [...this.state.videos];
    if (user && user.role !== 'admin' && user.scopeMode !== 'all') {
      const allowedChannelIdSet = new Set(this.listChannels(user).map((ch) => ch.id));
      list = list.filter((v) => allowedChannelIdSet.has(v.channelId));
    }
    if (filter.channelId && filter.channelId !== 'all') {
      list = list.filter((v) => v.channelId === filter.channelId);
    }
    if (filter.projectId && filter.projectId !== 'all') {
      list = list.filter((v) => v.projectId === filter.projectId);
    }
    if (filter.search) {
      const q = String(filter.search).toLowerCase().trim();
      list = list.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          (v.youtubeVideoId || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

  createVideo(input = {}) {
    const title = String(input.title || '').trim();
    if (!title) {
      throw new Error('Tiêu đề video YouTube (title) là bắt buộc');
    }
    const publishedAt = input.publishedAt || todayIsoDate();
    const metricDate = input.metricDate || publishedAt;
    const initialViews = Math.max(0, Number(input.initialViews) || 0);
    const initialLikes = Math.max(0, Number(input.initialLikes) || 0);
    const initialComments = Math.max(0, Number(input.initialComments) || 0);

    const video = recalculateVideoHistory({
      id: `vid-${crypto.randomUUID().slice(0, 8)}`,
      title,
      youtubeVideoId: String(input.youtubeVideoId || `YT-${crypto.randomUUID().slice(0, 6)}`).trim(),
      channelId: input.channelId || this.state.channels[0]?.id || 'ch-main',
      projectId: input.projectId || null,
      contentId: input.contentId || null,
      publishedAt,
      status: input.status || 'public',
      metricsHistory: [
        {
          date: metricDate,
          views: initialViews,
          likes: initialLikes,
          comments: initialComments,
          dailyViewsDelta: initialViews,
        },
      ],
    });

    this.state.videos.unshift(video);
    this.#save();
    return video;
  }

  recordVideoDailyMetrics(videoId, snapshot = {}) {
    const video = this.state.videos.find((v) => v.id === videoId);
    if (!video) {
      throw new Error(`Không tìm thấy Video YouTube với mã: ${videoId}`);
    }
    const date = String(snapshot.date || todayIsoDate()).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`Định dạng ngày không hợp lệ (cần YYYY-MM-DD): ${date}`);
    }
    const views = Number(snapshot.views);
    if (!Number.isFinite(views) || views < 0) {
      throw new Error('Số lượt xem (views) phải là số không âm');
    }

    const likes = snapshot.likes !== undefined ? Math.max(0, Number(snapshot.likes) || 0) : video.currentLikes || 0;
    const comments =
      snapshot.comments !== undefined ? Math.max(0, Number(snapshot.comments) || 0) : video.currentComments || 0;

    const existingIndex = video.metricsHistory.findIndex((m) => m.date === date);
    if (existingIndex >= 0) {
      video.metricsHistory[existingIndex] = {
        ...video.metricsHistory[existingIndex],
        date,
        views,
        likes,
        comments,
      };
    } else {
      video.metricsHistory.push({
        date,
        views,
        likes,
        comments,
      });
    }

    recalculateVideoHistory(video);
    this.state.meta.lastDailySyncDate = date;
    this.state.meta.lastDailySyncAt = new Date().toISOString();
    this.#save();
    return video;
  }

  async syncAllVideosDailyMetrics(options = {}) {
    const date = options.date || todayIsoDate();

    // Nếu không truyền fetcher tùy chỉnh (tức là bấm nút "Đồng bộ chỉ số hôm nay" thực tế),
    // quét lại trực tiếp tất cả các kênh từ YouTube để đưa về đúng con số thực tế chuẩn xác 100%!
    if (!options.fetcher) {
      for (const ch of this.state.channels) {
        try {
          await this.syncChannelFromYouTube(ch.id, {
            channelFetcher: options.channelFetcher,
          });
        } catch {
          // Bỏ qua nếu kênh ngoại tuyến tạm thời
        }
      }
      const totalDailyViewsGained = this.state.videos.reduce(
        (sum, v) => sum + (Number(v.dailyViewsDelta) || 0),
        0
      );
      this.state.meta.lastDailySyncDate = date;
      this.state.meta.lastDailySyncAt = new Date().toISOString();
      this.#save();
      return {
        date,
        syncedAt: this.state.meta.lastDailySyncAt,
        updatedCount: this.state.videos.length,
        totalDailyViewsGained,
        videos: this.state.videos,
      };
    }

    const fetcher = options.fetcher;
    let totalDailyViewsGained = 0;
    const updatedVideos = [];

    for (const video of this.state.videos) {
      const stats = await fetcher(video);
      const updated = this.recordVideoDailyMetrics(video.id, {
        date,
        views: stats.views,
        likes: stats.likes,
        comments: stats.comments,
      });
      totalDailyViewsGained += updated.dailyViewsDelta || 0;
      updatedVideos.push(updated);
    }

    this.state.meta.lastDailySyncDate = date;
    this.state.meta.lastDailySyncAt = new Date().toISOString();
    this.#save();

    return {
      date,
      syncedAt: this.state.meta.lastDailySyncAt,
      updatedCount: updatedVideos.length,
      totalDailyViewsGained,
      videos: updatedVideos,
    };
  }

  // ===========================================================================
  // 5. DASHBOARD & ANALYTICS AGGREGATION
  // ===========================================================================

  getDashboardSummary(referenceDate, user = null) {
    const deals = this.state.deals;
    const projects = this.state.projects;
    const contents = this.listContentItems({}, user);
    const channels = this.listChannels(user);
    const videos = this.listVideos({}, user);

    const wonDeals = deals.filter((d) => d.stage === 'won');
    const activeDeals = deals.filter((d) => !['won', 'lost'].includes(d.stage));
    const wonRevenue = wonDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    const activePipelineValue = activeDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

    const totalViews = videos.reduce((sum, v) => sum + (Number(v.currentViews) || 0), 0);
    const totalLikes = videos.reduce((sum, v) => sum + (Number(v.currentLikes) || 0), 0);
    const totalComments = videos.reduce((sum, v) => sum + (Number(v.currentComments) || 0), 0);

    // Tổng hợp chuỗi thời gian lượt xem theo ngày trên toàn bộ kênh
    const dateMap = new Map();
    for (const video of videos) {
      for (const point of video.metricsHistory || []) {
        const prev = dateMap.get(point.date) || { date: point.date, totalViews: 0, dailyDelta: 0 };
        prev.totalViews += point.views || 0;
        prev.dailyDelta += point.dailyViewsDelta || 0;
        dateMap.set(point.date, prev);
      }
    }
    const dailyTrend = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const targetDate = referenceDate || this.state.meta.lastDailySyncDate || dailyTrend.at(-1)?.date || todayIsoDate();

    const todayViewsDelta = videos.reduce((sum, v) => {
      const match = (v.metricsHistory || []).find((m) => m.date === targetDate) || (v.metricsHistory || []).at(-1);
      return sum + (match ? match.dailyViewsDelta || 0 : 0);
    }, 0);

    // 1. Thống kê tổng hợp theo Nhãn (Group, Ngách/Category, Người quản lý) — cảm hứng từ YouTubeLabs asset_label_generator
    const buildLabelBreakdown = (getKeyFn) => {
      const map = new Map();
      for (const ch of channels) {
        const { label, filterKey } = getKeyFn(ch);
        const chVideos = videos.filter((v) => v.channelId === ch.id);
        const sumVideoViews = chVideos.reduce((s, v) => s + (Number(v.currentViews) || 0), 0);
        const chViews = Math.max(Number(ch.totalViews) || 0, sumVideoViews);
        const chVideoCount = Math.max(Number(ch.totalVideos) || 0, chVideos.length);
        const isMonetized = ch.status === 'monetized' || ch.monetization === 'enabled';

        const prev = map.get(filterKey) || {
          label,
          filterKey,
          channelCount: 0,
          monetizedCount: 0,
          totalSubscribers: 0,
          totalViews: 0,
          totalVideos: 0,
        };
        prev.channelCount += 1;
        if (isMonetized) prev.monetizedCount += 1;
        prev.totalSubscribers += Number(ch.subscribers) || 0;
        prev.totalViews += chViews;
        prev.totalVideos += chVideoCount;
        map.set(filterKey, prev);
      }
      return [...map.values()].sort((a, b) => b.totalViews - a.totalViews || b.channelCount - a.channelCount);
    };

    const byGroupList = buildLabelBreakdown((ch) => {
      const g = String(ch.group || '').trim();
      return g ? { label: g, filterKey: g } : { label: 'Chưa gắn Group', filterKey: '__none__' };
    });
    const existingGroupKeys = new Set(byGroupList.map((item) => item.filterKey.toLowerCase()));
    for (const grpName of this.listGroups(user)) {
      if (!existingGroupKeys.has(grpName.toLowerCase())) {
        existingGroupKeys.add(grpName.toLowerCase());
        byGroupList.push({
          label: grpName,
          filterKey: grpName,
          channelCount: 0,
          monetizedCount: 0,
          totalSubscribers: 0,
          totalViews: 0,
          totalVideos: 0,
        });
      }
    }

    const labelStats = {
      byGroup: byGroupList,
      byCategory: buildLabelBreakdown((ch) => {
        const c = String(ch.category || 'Giải trí & Nội dung số').trim();
        return { label: c, filterKey: c };
      }),
      byManager: buildLabelBreakdown((ch) => {
        const m = String(ch.managerEmail || ch.manager || '').trim();
        return m ? { label: m, filterKey: m } : { label: 'Chưa phân công', filterKey: '__none__' };
      }),
    };

    // 2. Bảng tổng hợp "Video Nổ View" của cả dàn kênh — cảm hứng từ YouTubeLabs ai_video_recap_for_channels
    const channelMap = new Map(channels.map((c) => [c.id, c]));
    const channelAvgViewsMap = new Map();
    for (const ch of channels) {
      const chVids = videos.filter((v) => v.channelId === ch.id);
      if (chVids.length > 0) {
        const sumV = chVids.reduce((s, v) => s + (Number(v.currentViews) || 0), 0);
        channelAvgViewsMap.set(ch.id, Math.max(Math.round(sumV / chVids.length), 1));
      } else {
        const totalV = Number(ch.totalViews) || 0;
        const countV = Math.max(Number(ch.totalVideos) || 1, 1);
        channelAvgViewsMap.set(ch.id, Math.max(Math.round(totalV / countV), 1));
      }
    }

    const topVideosLeaderboard = [...videos]
      .map((v) => {
        const ch = channelMap.get(v.channelId) || {};
        const vViews = Number(v.currentViews ?? v.views) || 0;
        const avgViews = channelAvgViewsMap.get(v.channelId) || Math.max(vViews, 1);
        const outlierMultiplier = Number((vViews / Math.max(avgViews, 1)).toFixed(2));
        return {
          id: v.id,
          youtubeVideoId: v.youtubeVideoId || '',
          title: v.title,
          views: vViews,
          publishedAt: v.publishedAt || '',
          channelId: v.channelId,
          channelName: ch.name || 'Kênh YouTube',
          channelHandle: ch.handle || '',
          channelUrl: ch.channelUrl || '',
          group: String(ch.group || '').trim(),
          category: String(ch.category || 'Giải trí & Nội dung số').trim(),
          manager: String(ch.managerEmail || ch.manager || '').trim(),
          channelAvgViews: avgViews,
          outlierMultiplier,
        };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, 25);

    const lastSyncIso = this.state.meta.lastDailySyncAt || new Date().toISOString();
    const lastSyncMs = new Date(lastSyncIso).getTime() || Date.now();
    const nextHourlySyncAt = new Date(lastSyncMs + 60 * 60 * 1000).toISOString();
    const totalNetworkRevenue = Math.round(
      channels.reduce((sum, ch) => sum + (Number(ch.totalYearlyRevenue) || 0), 0) * 100
    ) / 100;

    const allUsers = Array.isArray(this.state.users) ? this.state.users : [];
    const pendingUsersCount = allUsers.filter((u) => u.status === 'pending').length;

    return {
      meta: {
        lastDailySyncDate: this.state.meta.lastDailySyncDate || targetDate,
        lastDailySyncAt: lastSyncIso,
        nextHourlySyncAt,
        autoSyncIntervalMinutes: 60,
        notion: this.getNotionConfig(),
        brand: this.getBrandProfile(),
        customGroups: this.listGroups(user),
        usersSummary: {
          totalUsers: allUsers.length,
          pendingUsersCount,
          approvedUsersCount: allUsers.filter((u) => u.status === 'approved').length,
        },
      },
      crm: {
        totalDeals: deals.length,
        wonDealsCount: wonDeals.length,
        wonRevenue,
        activePipelineValue,
        winRate: deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0,
      },
      projects: {
        totalProjects: projects.length,
        inProductionCount: projects.filter((p) => p.status !== 'published').length,
        publishedCount: projects.filter((p) => p.status === 'published').length,
        averageProgress:
          projects.length > 0
            ? Math.round(projects.reduce((sum, p) => sum + (p.progress || 0), 0) / projects.length)
            : 0,
      },
      contentVault: {
        totalItems: contents.length,
        scriptsCount: contents.filter((c) => c.type === 'script').length,
        approvedCount: contents.filter((c) => c.status === 'approved').length,
      },
      youtube: {
        totalChannels: channels.length,
        totalVideos: videos.length,
        totalViews,
        totalLikes,
        totalComments,
        todayViewsDelta,
        totalNetworkRevenue,
        dailyTrend,
        labelStats,
        topVideosLeaderboard,
      },
    };
  }

  // ===========================================================================
  // 6. BOT CENTER (BOT 1: TELEGRAM ADMIN + BOT 2: VIRAL WATCHDOG + BOT 4: IMMORTAL BACKUP)
  // ===========================================================================

  getBotCenterStatus() {
    if (!this.state.meta) this.state.meta = {};
    const center = ensureBotCenterState(this.state.meta);
    const watchdog = scanViralAndChannelHealth(this);
    const scheduleRadar = scanUploadScheduleAndDeadChannels(this);
    const monetizationShield = scanMonetizationAndAdSenseShield(this);
    const cloudReport = generateCloudSyncReport(this);
    const snapshots = (center.snapshots || []).map((snap) => ({
      id: snap.id,
      label: snap.label,
      createdAt: snap.createdAt,
      sizeBytes: snap.sizeBytes,
      diffSummary: snap.diffSummary || 'Bản chụp chuẩn hệ thống',
      counts: snap.counts || {},
    }));
    const rawToken = String(center.config.telegramBotToken || '').trim();
    const maskedToken = rawToken
      ? rawToken.length > 14
        ? `${rawToken.slice(0, 8)}...${rawToken.slice(-4)}`
        : 'Đã cấu hình Token'
      : '';

    return {
      config: {
        ...center.config,
        hasTelegramToken: Boolean(rawToken),
        maskedTelegramToken: maskedToken,
      },
      watchdog,
      scheduleRadar,
      monetizationShield,
      cloudReport,
      snapshots,
      competitorScans: Array.isArray(center.competitorScans) ? center.competitorScans : [],
      thumbnailClones: Array.isArray(center.thumbnailClones) ? center.thumbnailClones : [],
      trendScans: Array.isArray(center.trendScans) ? center.trendScans : [],
      activityLogs: (center.activityLogs || []).slice(0, 30),
    };
  }

  updateBotConfig(patch = {}) {
    if (!this.state.meta) this.state.meta = {};
    const center = ensureBotCenterState(this.state.meta);
    const prev = center.config;

    if (patch.telegramEnabled !== undefined) prev.telegramEnabled = Boolean(patch.telegramEnabled);
    if (patch.telegramBotToken !== undefined) {
      const nextTok = String(patch.telegramBotToken).trim();
      if (nextTok && !nextTok.includes('...')) {
        prev.telegramBotToken = nextTok;
      } else if (patch.clearTelegramToken) {
        prev.telegramBotToken = '';
      }
    }
    if (patch.telegramChatId !== undefined) {
      prev.telegramChatId = String(patch.telegramChatId).trim();
    }
    if (patch.notifyOnNewUser !== undefined) prev.notifyOnNewUser = Boolean(patch.notifyOnNewUser);
    if (patch.notifyOnViralVideo !== undefined) prev.notifyOnViralVideo = Boolean(patch.notifyOnViralVideo);
    if (patch.autoTelegramBackupDaily !== undefined) {
      prev.autoTelegramBackupDaily = Boolean(patch.autoTelegramBackupDaily);
    }

    if (patch.watchdogEnabled !== undefined) prev.watchdogEnabled = Boolean(patch.watchdogEnabled);
    if (patch.outlierThreshold !== undefined) {
      prev.outlierThreshold = Math.max(1.1, Number(patch.outlierThreshold) || 1.5);
    }
    if (patch.minViralViews !== undefined) {
      prev.minViralViews = Math.max(0, Number(patch.minViralViews) || 100);
    }
    if (patch.staleDaysThreshold !== undefined) {
      prev.staleDaysThreshold = Math.max(1, Number(patch.staleDaysThreshold) || 5);
    }

    // Bot 3: Schedule & Dead-Channel Reminder
    if (patch.scheduleBotEnabled !== undefined) {
      prev.scheduleBotEnabled = Boolean(patch.scheduleBotEnabled);
    }
    if (patch.targetUploadEveryDays !== undefined) {
      prev.targetUploadEveryDays = Math.max(1, Number(patch.targetUploadEveryDays) || 2);
    }
    if (patch.deadChannelDays !== undefined) {
      prev.deadChannelDays = Math.max(2, Number(patch.deadChannelDays) || 5);
    }
    if (patch.autoTelegramScheduleDaily !== undefined) {
      prev.autoTelegramScheduleDaily = Boolean(patch.autoTelegramScheduleDaily);
    }

    // Bot 5 & Bot 6 & Bot 7 & Bot 11 & Bot 12
    if (patch.competitorMinOutlier !== undefined) {
      prev.competitorMinOutlier = Math.max(1.0, Number(patch.competitorMinOutlier) || 1.3);
    }
    if (patch.defaultThumbnailStyle !== undefined) {
      prev.defaultThumbnailStyle = String(patch.defaultThumbnailStyle || 'viral_3d').trim();
    }
    if (patch.defaultTrendMarket !== undefined) {
      prev.defaultTrendMarket = String(patch.defaultTrendMarket || 'vi').trim();
    }
    if (patch.maxChannelsPerGa !== undefined) {
      prev.maxChannelsPerGa = Math.max(1, Number(patch.maxChannelsPerGa) || 3);
    }
    if (patch.bktAlertThresholdPct !== undefined) {
      prev.bktAlertThresholdPct = Math.max(20, Number(patch.bktAlertThresholdPct) || 70);
    }
    if (patch.cloudReportWebhookUrl !== undefined) {
      prev.cloudReportWebhookUrl = String(patch.cloudReportWebhookUrl).trim();
    }
    if (patch.autoCloudReportDaily !== undefined) {
      prev.autoCloudReportDaily = Boolean(patch.autoCloudReportDaily);
    }

    if (patch.autoBackupEnabled !== undefined) prev.autoBackupEnabled = Boolean(patch.autoBackupEnabled);
    if (patch.cloudBackupWebhookUrl !== undefined) {
      prev.cloudBackupWebhookUrl = String(patch.cloudBackupWebhookUrl).trim();
    }

    appendBotLog(
      this.state.meta,
      'Bot Center',
      'Đã lưu cấu hình Trung tâm 9 Bot tự động hóa.',
      'success'
    );
    this.#save();
    return this.getBotCenterStatus();
  }

  runWatchdogScan(customOptions = {}) {
    if (!this.state.meta) this.state.meta = {};
    const result = scanViralAndChannelHealth(this, customOptions);
    appendBotLog(
      this.state.meta,
      'Bot 2 (Canh nổ view)',
      `Quét xong ${result.summary.totalChannelsScanned} kênh: Phát hiện ${result.summary.viralCount} video nổ đề xuất (>= x${result.outlierThreshold}) và ${result.summary.healthAlertCount} cảnh báo kênh.`,
      result.summary.viralCount > 0 ? 'success' : 'info'
    );
    this.#save();
    return result;
  }

  runScheduleReminderScan(customOptions = {}) {
    if (!this.state.meta) this.state.meta = {};
    const result = scanUploadScheduleAndDeadChannels(this, customOptions);
    appendBotLog(
      this.state.meta,
      'Bot 3 (Nhắc lịch đăng)',
      `Kiểm tra lịch đăng ${result.summary.totalChannels} kênh: ${result.summary.deadCount} kênh bỏ quên/đứt lịch, ${result.summary.dueSoonCount} kênh đến hạn đăng hôm nay, ${result.summary.onTrackCount} kênh đúng tiến độ.`,
      result.summary.needActionCount > 0 ? 'warning' : 'success'
    );
    this.#save();
    return result;
  }

  async runCompetitorHunterScan(options = {}) {
    if (!this.state.meta) this.state.meta = {};
    const scanEntry = await huntCompetitorChannelOutliers(this, options);
    this.#save();
    return scanEntry;
  }

  async runThumbnailPromptGenerator(input = {}) {
    if (!this.state.meta) this.state.meta = {};
    const cloneEntry = await analyzeAndGenerateThumbnailPrompts(this, input);
    this.#save();
    return cloneEntry;
  }

  async runTrendHunterScan(options = {}) {
    if (!this.state.meta) this.state.meta = {};
    const trendEntry = await huntYouTubeSearchTrends(this, options);
    this.#save();
    return trendEntry;
  }

  runMonetizationShieldScan(options = {}) {
    if (!this.state.meta) this.state.meta = {};
    const shield = scanMonetizationAndAdSenseShield(this, options);
    appendBotLog(
      this.state.meta,
      'Bot 11 (BKT & Khiên Gà)',
      `Đã quét Khiên Gà & BKT: ${shield.summary.monetizedCount} kênh đã BKT, ${shield.summary.readyOrAlmostBktCount} kênh sắp đủ BKT, ${shield.summary.riskyGaCount} cảnh báo Gà, tổng doanh thu $${shield.summary.totalYearlyRevenue}.`,
      shield.summary.riskyGaCount > 0 ? 'warning' : 'success'
    );
    this.#save();
    return shield;
  }

  async runCloudReportSync(options = {}) {
    if (!this.state.meta) this.state.meta = {};
    const report = await syncCloudReportNow(this, options);
    this.#save();
    return report;
  }

  async createBackupSnapshot(options = {}) {
    if (!this.state.meta) this.state.meta = {};
    const res = await createImmortalSnapshot(this, options);
    this.#save();
    return {
      ...res,
      status: this.getBotCenterStatus(),
    };
  }

  exportFullBackup(label = 'Bản sao lưu đầy đủ ACB9x StudioFlow') {
    return buildBackupPayload(this, label);
  }

  restoreFromBackup(input = {}) {
    if (!this.state.meta) this.state.meta = {};
    const center = ensureBotCenterState(this.state.meta);
    let sourceData = null;
    let sourceLabel = '';

    if (input.snapshotId) {
      const foundSnap = (center.snapshots || []).find((s) => s.id === input.snapshotId);
      if (!foundSnap || !foundSnap.data) {
        throw new Error('Không tìm thấy bản Snapshot cần khôi phục!');
      }
      sourceData = foundSnap.data;
      sourceLabel = `Snapshot "${foundSnap.label}" (${foundSnap.id})`;
    } else if (input.backupData && typeof input.backupData === 'object') {
      sourceData = input.backupData.data && typeof input.backupData.data === 'object'
        ? input.backupData.data
        : input.backupData;
      sourceLabel = String(input.backupData.label || 'File Backup JSON tải lên');
    } else {
      throw new Error('Dữ liệu khôi phục không hợp lệ! Vui lòng chọn Snapshot hoặc tải file .json hợp lệ.');
    }

    if (!Array.isArray(sourceData.channels) && !Array.isArray(sourceData.videos)) {
      throw new Error('File Backup không đúng định dạng dữ liệu StudioFlow (thiếu danh sách channels/videos)!');
    }

    // Giữ lại cấu hình Bot Center và danh sách Snapshots hiện hành để không bị mất kết nối Telegram
    const preservedBotCenter = JSON.parse(JSON.stringify(center));
    const nextMeta = {
      ...(this.state.meta || {}),
      ...(sourceData.meta || {}),
      botCenter: preservedBotCenter,
    };

    const nextChannels = Array.isArray(sourceData.channels)
      ? sourceData.channels.map(normalizeChannel)
      : this.state.channels;
    const nextVideos = Array.isArray(sourceData.videos)
      ? JSON.parse(JSON.stringify(sourceData.videos))
      : this.state.videos;
    nextVideos.forEach(recalculateVideoHistory);

    const nextProjects = Array.isArray(sourceData.projects)
      ? JSON.parse(JSON.stringify(sourceData.projects))
      : this.state.projects;
    nextProjects.forEach(recalculateProjectProgress);

    const nextUsers = Array.isArray(sourceData.users)
      ? JSON.parse(JSON.stringify(sourceData.users))
      : this.state.users;
    const nextContents = Array.isArray(sourceData.contents)
      ? JSON.parse(JSON.stringify(sourceData.contents))
      : this.state.contents;
    const nextDeals = Array.isArray(sourceData.deals)
      ? JSON.parse(JSON.stringify(sourceData.deals))
      : this.state.deals;

    this.state = {
      meta: nextMeta,
      users: nextUsers,
      channels: nextChannels,
      videos: nextVideos,
      contents: nextContents,
      deals: nextDeals,
      projects: nextProjects,
    };

    appendBotLog(
      this.state.meta,
      'Bot 4 (Khôi phục bất tử)',
      `Đã khôi phục toàn bộ dữ liệu thành công từ ${sourceLabel}: ${nextChannels.length} kênh, ${nextVideos.length} video, ${nextUsers.length} user.`,
      'success'
    );
    this.#save();

    return {
      ok: true,
      restoredFrom: sourceLabel,
      counts: {
        channels: nextChannels.length,
        videos: nextVideos.length,
        users: nextUsers.length,
        contents: nextContents.length,
      },
      status: this.getBotCenterStatus(),
    };
  }
}
