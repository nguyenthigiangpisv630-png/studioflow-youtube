const state = {
  summary: null,
  channels: [],
  deals: [],
  projects: [],
  contents: [],
  videos: [],
  activeTab: 'insights',
  pmView: 'kanban',
  selectedContentId: null,
  selectedVideoId: null,
  activeChannelDeepId: null,
  deepChannelVideoSort: 'views', // 'views' | 'outlier' | 'date'
  unlockedGaChannels: new Set(),
  filters: {
    crmSearch: '',
    crmStage: 'all',
    projectSearch: '',
    projectStatus: 'all',
    contentSearch: '',
    contentType: 'all',
    contentProject: 'all',
    ytSearch: '',
    ytChannel: 'all',
    ytCategory: 'all',
    ytGroup: 'all',
    ytManager: 'all',
  },
  insightsLabelMode: 'group', // 'group' | 'category' | 'manager'
  insightsVideoSort: 'views', // 'views' | 'outlier'
  insightsShowAllVideos: false,
  insightsCollapsed: false,
};

const STAGE_META = {
  lead: { label: 'Lead mới', badge: 'badge-slate' },
  contacted: { label: 'Đang tư vấn', badge: 'badge-blue' },
  negotiation: { label: 'Đàm phán hợp đồng', badge: 'badge-amber' },
  won: { label: 'Đã chốt (Won)', badge: 'badge-emerald' },
  lost: { label: 'Đã hủy (Lost)', badge: 'badge-crimson' },
};

const PROJECT_STATUS_META = {
  ideation: { label: '1. Lên ý tưởng', badge: 'badge-slate' },
  scripting: { label: '2. Viết kịch bản', badge: 'badge-blue' },
  production: { label: '3. Quay dựng', badge: 'badge-amber' },
  review: { label: '4. Duyệt nội dung', badge: 'badge-crimson' },
  published: { label: '5. Đã xuất bản', badge: 'badge-emerald' },
};

const CONTENT_TYPE_META = {
  script: { label: 'Kịch bản (Script)', badge: 'badge-blue' },
  outline: { label: 'Dàn ý (Outline)', badge: 'badge-slate' },
  seo: { label: 'Từ khóa & Mô tả SEO', badge: 'badge-emerald' },
  footage: { label: 'Kho Footage / Media', badge: 'badge-amber' },
  thumbnail: { label: 'Thiết kế Thumbnail', badge: 'badge-crimson' },
  brand_brief: { label: 'Brief Nhãn hàng', badge: 'badge-slate' },
};

const TAB_TITLES = {
  contents: {
    title: 'Nơi lưu nội dung (Content Vault)',
    subtitle: 'Lưu trữ tập trung kịch bản toàn văn, dàn ý, bộ từ khóa SEO và đường dẫn kho Footage / Thumbnail',
  },
  insights: {
    title: 'Bảng Thống kê theo Nhãn & Video Nổ View cả dàn kênh',
    subtitle: 'Tổng hợp hiệu suất theo Group / Ngách / Quản lý và bảng xếp hạng các video nổ đề xuất mạnh nhất',
  },
  youtube: {
    title: 'Quản lý YouTube & Chỉ số lượt xem hằng ngày',
    subtitle: 'Theo dõi danh sách kênh hàng ngang, tình trạng kênh và biểu đồ tăng trưởng lượt xem từng ngày (+Views/ngày)',
  },
};

function formatCurrency(val) {
  return `${Number(val || 0).toLocaleString('vi-VN')} ₫`;
}

function formatNumber(val) {
  return Number(val || 0).toLocaleString('vi-VN');
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTodayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

function showBanner(message, isError = false) {
  const banner = document.getElementById('status-banner');
  if (!banner) return;
  banner.textContent = message;
  banner.style.background = isError ? '#FEF2F2' : '#FDF8E7';
  banner.style.borderColor = isError ? '#FECACA' : '#D4AF37';
  banner.style.color = isError ? '#991B1B' : '#6B4D04';
  banner.hidden = false;
  clearTimeout(banner._timer);
  banner._timer = setTimeout(() => {
    banner.hidden = true;
  }, 4200);
}

const AUTH_TOKEN_KEY = 'studioflow_session_token';

function getStoredAuthToken() {
  try {
    localStorage.removeItem('studioflow_auth_token');
    return sessionStorage.getItem(AUTH_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function setStoredAuthToken(token = '') {
  try {
    localStorage.removeItem('studioflow_auth_token');
    if (token) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // Bỏ qua nếu trình duyệt chặn sessionStorage
  }
}

function showAuthLockOverlay(visible) {
  const overlay = document.getElementById('auth-lock-overlay');
  const wrapper = document.getElementById('platform-wrapper');
  if (wrapper) {
    wrapper.hidden = Boolean(visible);
  }
  if (!overlay) return;
  overlay.hidden = !visible;
  if (visible) {
    setTimeout(() => {
      document.getElementById('input-auth-login-pass')?.focus();
    }, 60);
  }
}

function updatePasswordUiState() {
  const btn = document.getElementById('btn-password-settings');
  const logoutBtn = document.getElementById('btn-logout-header');
  const currentField = document.getElementById('field-current-password');
  const lockNowBtn = document.getElementById('btn-lock-now');

  const enabled = Boolean(state.passwordEnabled);
  if (btn) {
    btn.textContent = enabled ? '🔒 Đổi mật khẩu' : '🔓 Đặt mật khẩu Web';
  }
  if (logoutBtn) logoutBtn.hidden = !enabled;
  if (currentField) currentField.hidden = !enabled;
  if (lockNowBtn) lockNowBtn.hidden = !enabled;
}

async function apiRequest(url, options = {}) {
  const token = getStoredAuthToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Studio-Token': token } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && data.requiresAuth) {
      state.passwordEnabled = true;
      updatePasswordUiState();
      showAuthLockOverlay(true);
    }
    throw new Error(data.error || 'Yêu cầu thất bại');
  }
  return data;
}

async function loadOverview() {
  const authStatus = await apiRequest('/api/auth/status');
  state.passwordEnabled = Boolean(authStatus.passwordEnabled);
  updatePasswordUiState();

  if (authStatus.passwordEnabled && !authStatus.authenticated) {
    showAuthLockOverlay(true);
    return;
  }
  showAuthLockOverlay(false);

  const data = await apiRequest('/api/overview');
  state.summary = data.summary;
  state.channels = data.channels || [];
  state.deals = data.deals || [];
  state.projects = data.projects || [];
  state.contents = data.contents || [];
  state.videos = data.videos || [];

  if (!state.selectedContentId && state.contents.length > 0) {
    state.selectedContentId = state.contents[0].id;
  }
  if (!state.selectedVideoId && state.videos.length > 0) {
    state.selectedVideoId = state.videos[0].id;
  }

  renderAll();
}

function renderAll() {
  renderTopMetrics();
  renderSelectOptions();
  renderContentsTab();
  renderYoutubeTab();
}

function renderTopMetrics() {
  const s = state.summary;
  if (!s) return;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const totalChannels = state.channels.length;
  const monetizedCount = state.channels.filter(
    (c) => c.monetization === 'enabled' || c.status === 'monetized'
  ).length;
  const totalSubscribers = state.channels.reduce((sum, c) => sum + (Number(c.subscribers) || 0), 0);

  setText('nav-count-contents', s.contentVault.totalItems);
  setText('nav-count-youtube', totalChannels);
  setText('nav-count-insights', state.videos.length);

  setText('stat-channels-total', `${totalChannels}`);
  setText('stat-channels-sub', `${monetizedCount} BKT`);

  setText('stat-subscribers-total', formatNumber(totalSubscribers));
  setText('stat-contents-total', `${s.contentVault.totalItems}`);

  setText('stat-yt-views', formatNumber(s.youtube.totalViews));
  setText('stat-yt-delta', `+${formatNumber(s.youtube.todayViewsDelta)}/ngày`);
  updateHourlySyncBadge();
}

function updateHourlySyncBadge() {
  const badgeBtn = document.getElementById('btn-hourly-auto-sync');
  const textEl = document.getElementById('hourly-sync-text');
  if (!badgeBtn || !textEl) return;

  const lastSyncIso = state.summary?.meta?.lastDailySyncAt;
  const lastSyncMs = lastSyncIso ? new Date(lastSyncIso).getTime() : Date.now();
  const nextSyncMs = (Number.isFinite(lastSyncMs) ? lastSyncMs : Date.now()) + 60 * 60 * 1000;
  const diffMs = Math.max(0, nextSyncMs - Date.now());
  const remainMins = Math.max(1, Math.ceil(diffMs / 60000));

  const lastTimeStr = lastSyncIso
    ? new Date(lastSyncIso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
  const nextTimeStr = new Date(nextSyncMs).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  textEl.textContent = `🔄 Auto 1h: ${remainMins}p`;
  badgeBtn.title = `Tự động reset & cập nhật chỉ số toàn bộ kênh 1 tiếng/lần.\n• Cập nhật gần nhất: ${lastTimeStr}\n• Tự động cập nhật kế tiếp: ${nextTimeStr} (còn ~${remainMins} phút)\n👉 Bấm vào đây để cập nhật ngay lập tức!`;
}

function renderSelectOptions() {
  const projectFilter = document.getElementById('content-project-filter');
  const contentFormProj = document.getElementById('content-form-project-select');
  const videoFormProj = document.getElementById('video-form-project-select');

  if (projectFilter) {
    const current = state.filters.contentProject;
    projectFilter.innerHTML =
      `<option value="all">Tất cả dự án</option>` +
      state.projects
        .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title)}</option>`)
        .join('');
    projectFilter.value = current;
  }

  const projOpts =
    `<option value="">-- Kho chung Studio --</option>` +
    state.projects.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title)}</option>`).join('');

  if (contentFormProj) contentFormProj.innerHTML = projOpts;
  if (videoFormProj) videoFormProj.innerHTML = projOpts;

  const ytChannelFilter = document.getElementById('yt-channel-filter');
  const videoFormChannel = document.getElementById('video-form-channel-select');

  if (ytChannelFilter) {
    const currentCh = state.filters.ytChannel;
    ytChannelFilter.innerHTML =
      `<option value="all">Tất cả kênh YouTube</option>` +
      state.channels
        .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} (${escapeHtml(c.handle)})</option>`)
        .join('');
    ytChannelFilter.value = currentCh;
  }

  const ytCategoryFilter = document.getElementById('yt-category-filter');
  if (ytCategoryFilter) {
    const currentCat = state.filters.ytCategory || 'all';
    const categories = [
      ...new Set(state.channels.map((c) => c.category || 'Giải trí & Nội dung số').filter(Boolean)),
    ];
    ytCategoryFilter.innerHTML =
      `<option value="all">Tất cả danh mục (${state.channels.length})</option>` +
      categories
        .map((cat) => {
          const count = state.channels.filter(
            (c) => (c.category || 'Giải trí & Nội dung số') === cat
          ).length;
          return `<option value="${escapeHtml(cat)}">${escapeHtml(cat)} (${count})</option>`;
        })
        .join('');
    ytCategoryFilter.value = categories.includes(currentCat) ? currentCat : 'all';
  }

  if (videoFormChannel) {
    videoFormChannel.innerHTML = state.channels
      .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
      .join('');
  }
}

// =============================================================================
// BIỂU ĐỒ CHỈ SỐ LƯỢT XEM HẰNG NGÀY (DAILY VIEWS BAR + DELTA CHART)
// =============================================================================
function renderDailyViewsChart(series = [], valueKey = 'totalViews', deltaKey = 'dailyDelta') {
  if (!series || series.length === 0) {
    return `<p class="panel-desc">Chưa có dữ liệu lịch sử lượt xem theo ngày.</p>`;
  }
  const maxViews = Math.max(...series.map((d) => Number(d[valueKey]) || 1), 1);

  return `
    <div class="daily-bars-grid">
      ${series
        .map((point) => {
          const views = Number(point[valueKey]) || 0;
          const delta = Number(point[deltaKey]) || 0;
          const heightPct = Math.max(12, Math.round((views / maxViews) * 100));
          return `
            <div class="bar-col">
              <span class="bar-delta-tag">+${formatNumber(delta)}</span>
              <div class="bar-track" title="Ngày ${escapeHtml(point.date)}: ${formatNumber(views)} lượt xem (+${formatNumber(delta)} trong ngày)">
                <div class="bar-fill" style="height: ${heightPct}%"></div>
              </div>
              <span class="bar-views-num">${formatNumber(views)}</span>
              <span class="bar-date-label">${escapeHtml(point.date.slice(5))}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

// =============================================================================
// TAB 1: TỔNG QUAN
// =============================================================================
function renderOverviewTab() {
  const s = state.summary;
  if (!s) return;

  const chartEl = document.getElementById('overview-daily-chart');
  if (chartEl) {
    chartEl.innerHTML = renderDailyViewsChart(s.youtube.dailyTrend, 'totalViews', 'dailyDelta');
  }

  const topVideosEl = document.getElementById('overview-top-videos');
  if (topVideosEl) {
    const sortedVideos = [...state.videos].sort((a, b) => (b.dailyViewsDelta || 0) - (a.dailyViewsDelta || 0));
    topVideosEl.innerHTML = sortedVideos
      .map(
        (v) => `
        <div class="compact-item">
          <div>
            <strong style="display:block;font-size:0.8125rem;">${escapeHtml(v.title)}</strong>
            <span style="font-size:0.75rem;color:var(--ink-muted);">Cập nhật ngày ${escapeHtml(
              v.lastUpdatedDate || '--'
            )} · Mã YT: <code>${escapeHtml(v.youtubeVideoId)}</code></span>
          </div>
          <div style="text-align:right;flex-shrink:0;" class="num">
            <strong style="display:block;font-size:0.875rem;">${formatNumber(v.currentViews)} views</strong>
            <span class="badge badge-emerald">+${formatNumber(v.dailyViewsDelta)} hôm nay</span>
          </div>
        </div>
      `
      )
      .join('');
  }

  const activeWorkEl = document.getElementById('overview-active-work');
  if (activeWorkEl) {
    const recentProjects = state.projects.slice(0, 4);
    activeWorkEl.innerHTML = recentProjects
      .map((p) => {
        const meta = PROJECT_STATUS_META[p.status] || PROJECT_STATUS_META.ideation;
        return `
          <div class="compact-item">
            <div>
              <strong style="display:block;font-size:0.8125rem;">${escapeHtml(p.title)}</strong>
              <span style="font-size:0.75rem;color:var(--ink-muted);">Khách hàng: ${escapeHtml(
                p.clientName
              )} · Phụ trách: ${escapeHtml(p.owner)}</span>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <span class="badge ${meta.badge}">${meta.label}</span>
              <span class="num" style="display:block;font-size:0.75rem;color:var(--ink-secondary);margin-top:3px;">Tiến độ: ${
                p.progress
              }%</span>
            </div>
          </div>
        `;
      })
      .join('');
  }
}

// =============================================================================
// TAB 2: CRM (SALES)
// =============================================================================
function renderCrmTab() {
  const tbody = document.getElementById('crm-table-body');
  if (!tbody) return;

  const q = state.filters.crmSearch.toLowerCase().trim();
  const stage = state.filters.crmStage;

  const filtered = state.deals.filter((d) => {
    if (stage !== 'all' && d.stage !== stage) return false;
    if (!q) return true;
    return (
      d.clientName.toLowerCase().includes(q) ||
      (d.company || '').toLowerCase().includes(q) ||
      (d.owner || '').toLowerCase().includes(q) ||
      (d.notes || '').toLowerCase().includes(q)
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--ink-muted);padding:28px;">Chưa có hợp đồng nào khớp bộ lọc. Nhấn "Thêm khách hàng / Hợp đồng" để tạo mới.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((d) => {
      const stageMeta = STAGE_META[d.stage] || STAGE_META.lead;
      const linkedProj = d.projectId ? state.projects.find((p) => p.id === d.projectId) : null;

      return `
        <tr>
          <td>
            <strong style="display:block;color:var(--ink-primary);">${escapeHtml(d.company)}</strong>
            <span style="color:var(--ink-secondary);font-size:0.75rem;">${escapeHtml(d.clientName)} · ${escapeHtml(
        d.contactPhone || d.contactEmail || 'Chưa cập nhật SĐT'
      )}</span>
          </td>
          <td>
            <select class="select-control" data-deal-stage-id="${escapeHtml(d.id)}" style="padding:4px 8px;font-size:0.75rem;">
              ${Object.entries(STAGE_META)
                .map(
                  ([key, info]) =>
                    `<option value="${key}" ${d.stage === key ? 'selected' : ''}>${info.label}</option>`
                )
                .join('')}
            </select>
            <div style="margin-top:4px;"><span class="badge ${stageMeta.badge}">${stageMeta.label}</span></div>
          </td>
          <td class="num-col">
            <strong class="num">${formatCurrency(d.value)}</strong>
          </td>
          <td>${escapeHtml(d.owner)}</td>
          <td class="num">${escapeHtml(d.expectedCloseDate || '--')}</td>
          <td>
            <div style="max-width:300px;color:var(--ink-secondary);">${escapeHtml(d.notes || 'Không có ghi chú')}</div>
            ${
              linkedProj
                ? `<div style="margin-top:4px;"><span class="badge badge-emerald">Đã gắn dự án: ${escapeHtml(
                    linkedProj.title.slice(0, 36)
                  )}...</span></div>`
                : ''
            }
          </td>
          <td class="action-col">
            ${
              linkedProj
                ? `<button type="button" class="btn btn-secondary btn-sm" data-open-project="${escapeHtml(
                    linkedProj.id
                  )}">Xem Dự án</button>`
                : `<button type="button" class="btn btn-primary btn-sm" data-convert-deal="${escapeHtml(
                    d.id
                  )}">Chuyển thành Dự án</button>`
            }
          </td>
        </tr>
      `;
    })
    .join('');
}

// =============================================================================
// TAB 3: QUẢN LÝ DỰ ÁN (KANBAN & LIST)
// =============================================================================
function renderProjectsTab() {
  const container = document.getElementById('projects-container');
  if (!container) return;

  const q = state.filters.projectSearch.toLowerCase().trim();
  const statusFilter = state.filters.projectStatus;

  const filtered = state.projects.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      (p.clientName || '').toLowerCase().includes(q) ||
      (p.owner || '').toLowerCase().includes(q)
    );
  });

  if (state.pmView === 'kanban') {
    const columns = Object.entries(PROJECT_STATUS_META);
    container.innerHTML = `
      <div class="kanban-board">
        ${columns
          .map(([statusKey, meta]) => {
            const colProjects = filtered.filter((p) => p.status === statusKey);
            return `
              <div class="kanban-col">
                <div class="kanban-col-header">
                  <span>${meta.label}</span>
                  <span class="badge ${meta.badge} num">${colProjects.length}</span>
                </div>
                ${
                  colProjects.length === 0
                    ? `<div style="font-size:0.75rem;color:var(--ink-muted);padding:12px 4px;">Trống</div>`
                    : colProjects
                        .map(
                          (p) => `
                        <article class="kanban-card">
                          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                            <span class="badge badge-slate">${escapeHtml(p.clientName)}</span>
                            <span class="num" style="font-size:0.75rem;color:var(--ink-muted);">Hạn: ${escapeHtml(
                              p.dueDate
                            )}</span>
                          </div>
                          <h3 class="kanban-card-title">${escapeHtml(p.title)}</h3>
                          <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--ink-secondary);">
                            <span>Chủ trì: <strong>${escapeHtml(p.owner)}</strong></span>
                            <span class="num"><strong>${p.progress}%</strong></span>
                          </div>
                          <div class="progress-bar-track">
                            <div class="progress-bar-fill" style="width:${p.progress}%"></div>
                          </div>

                          <ul class="task-checklist">
                            ${(p.tasks || [])
                              .map(
                                (t) => `
                                <li class="task-item ${t.completed ? 'done' : ''}">
                                  <input type="checkbox" ${
                                    t.completed ? 'checked' : ''
                                  } data-toggle-task="${escapeHtml(t.id)}" data-project-id="${escapeHtml(p.id)}" />
                                  <span>${escapeHtml(t.title)}</span>
                                </li>
                              `
                              )
                              .join('')}
                          </ul>

                          <form class="inline-task-form" data-add-task-project="${escapeHtml(p.id)}">
                            <input type="text" name="taskTitle" placeholder="+ Thêm đầu việc..." required />
                            <button type="submit" class="btn btn-secondary btn-sm">Thêm</button>
                          </form>

                          <div style="padding-top:6px;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:0.6875rem;color:var(--ink-muted);">Chuyển bước:</span>
                            <select class="select-control" data-project-status-id="${escapeHtml(
                              p.id
                            )}" style="padding:3px 6px;font-size:0.75rem;">
                              ${Object.entries(PROJECT_STATUS_META)
                                .map(
                                  ([k, info]) =>
                                    `<option value="${k}" ${p.status === k ? 'selected' : ''}>${info.label}</option>`
                                )
                                .join('')}
                            </select>
                          </div>
                        </article>
                      `
                        )
                        .join('')
                }
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="panel-box no-pad">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Dự án sản xuất YouTube</th>
                <th>Khách hàng</th>
                <th>Trạng thái</th>
                <th>Chủ trì</th>
                <th class="num-col">Ngân sách</th>
                <th class="num-col">Tiến độ</th>
                <th>Hạn xuất bản</th>
              </tr>
            </thead>
            <tbody>
              ${filtered
                .map((p) => {
                  const meta = PROJECT_STATUS_META[p.status] || PROJECT_STATUS_META.ideation;
                  return `
                    <tr>
                      <td>
                        <strong>${escapeHtml(p.title)}</strong>
                        <div style="font-size:0.75rem;color:var(--ink-muted);">${
                          (p.tasks || []).filter((t) => t.completed).length
                        }/${(p.tasks || []).length} đầu việc hoàn tất</div>
                      </td>
                      <td>${escapeHtml(p.clientName)}</td>
                      <td><span class="badge ${meta.badge}">${meta.label}</span></td>
                      <td>${escapeHtml(p.owner)}</td>
                      <td class="num-col">${formatCurrency(p.budget)}</td>
                      <td class="num-col"><strong>${p.progress}%</strong></td>
                      <td class="num">${escapeHtml(p.dueDate)}</td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}

// =============================================================================
// TAB 4: NƠI LƯU NỘI DUNG (CONTENT VAULT)
// =============================================================================
function renderContentsTab() {
  const listEl = document.getElementById('vault-list');
  const readerEl = document.getElementById('vault-reader');
  if (!listEl || !readerEl) return;

  const notionMeta = state.summary?.meta?.notion || {};
  const notionBtn = document.getElementById('btn-toggle-notion-config');
  const pageUrlInput = document.getElementById('input-notion-page-url');
  const tokenInput = document.getElementById('input-notion-token');
  if (notionBtn) {
    if (notionMeta.configured) {
      notionBtn.innerHTML = `<span style="color:#0D7A5F;">●</span> Đã bật tự động lưu Notion`;
    } else {
      notionBtn.innerHTML = `<span>○</span> Cấu hình tự động lưu Notion`;
    }
  }
  if (pageUrlInput && notionMeta.notionPageUrl && !pageUrlInput.value) {
    pageUrlInput.value = notionMeta.notionPageUrl;
  }
  if (tokenInput && notionMeta.hasToken) {
    tokenInput.placeholder = `Đã lưu Token (${notionMeta.maskedToken}) — nhập mới nếu muốn đổi`;
  }

  const q = state.filters.contentSearch.toLowerCase().trim();
  const type = state.filters.contentType;
  const projId = state.filters.contentProject;

  const filtered = state.contents.filter((c) => {
    if (type !== 'all' && c.type !== type) return false;
    if (projId !== 'all' && c.projectId !== projId) return false;
    if (!q) return true;
    return (
      c.title.toLowerCase().includes(q) ||
      (c.body || '').toLowerCase().includes(q) ||
      (c.tags || []).some((t) => t.toLowerCase().includes(q)) ||
      (c.author || '').toLowerCase().includes(q)
    );
  });

  if (filtered.length > 0 && !filtered.some((c) => c.id === state.selectedContentId)) {
    state.selectedContentId = filtered[0].id;
  }

  listEl.innerHTML =
    filtered.length === 0
      ? `<div class="panel-box"><p class="panel-desc">Không tìm thấy nội dung lưu trữ phù hợp.</p></div>`
      : filtered
          .map((c) => {
            const typeMeta = CONTENT_TYPE_META[c.type] || CONTENT_TYPE_META.script;
            const isSelected = c.id === state.selectedContentId;
            return `
              <div class="vault-card ${isSelected ? 'active' : ''}" data-select-content="${escapeHtml(c.id)}">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                  <span class="badge ${typeMeta.badge}">${typeMeta.label}</span>
                  <div style="display:flex;align-items:center;gap:6px;">
                    ${
                      c.notionUrl
                        ? `<span class="badge badge-emerald" title="Đã tự động đồng bộ lên Notion">Notion ✓</span>`
                        : ''
                    }
                    <span class="num" style="font-size:0.75rem;color:var(--ink-muted);">${c.wordCount || 0} từ</span>
                  </div>
                </div>
                <h3 class="vault-card-title">${escapeHtml(c.title)}</h3>
                <div style="font-size:0.75rem;color:var(--ink-secondary);">Tác giả: ${escapeHtml(
                  c.author
                )} · Trạng thái: <strong>${escapeHtml(c.status)}</strong></div>
                <div class="tag-row">
                  ${(c.tags || []).map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}
                </div>
              </div>
            `;
          })
          .join('');

  const selected = state.contents.find((c) => c.id === state.selectedContentId);
  if (!selected) {
    readerEl.innerHTML = `<p class="panel-desc">Chọn một kịch bản hoặc tài liệu bên trái để đọc và chỉnh sửa.</p>`;
    return;
  }

  const linkedProject = selected.projectId ? state.projects.find((p) => p.id === selected.projectId) : null;
  const typeMeta = CONTENT_TYPE_META[selected.type] || CONTENT_TYPE_META.script;

  readerEl.innerHTML = `
    <form id="form-edit-content" data-content-id="${escapeHtml(selected.id)}">
      <div class="panel-header">
        <div>
          <span class="badge ${typeMeta.badge}">${typeMeta.label}</span>
          <h2 style="margin-top:8px;">${escapeHtml(selected.title)}</h2>
          <p class="panel-desc">
            Dự án: <strong>${escapeHtml(linkedProject ? linkedProject.title : 'Kho chung Studio')}</strong> ·
            Tác giả: <strong>${escapeHtml(selected.author)}</strong> ·
            Độ dài: <strong class="num">${selected.wordCount || 0} từ</strong>
          </p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          ${
            selected.notionUrl
              ? `<a href="${escapeHtml(
                  selected.notionUrl
                )}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Mở File Notion ↗</a>`
              : ''
          }
          <button type="button" class="btn btn-secondary btn-sm" data-sync-notion-id="${escapeHtml(
            selected.id
          )}" title="Đẩy hoặc cập nhật nội dung này lên trang Notion ngay lập tức">Đồng bộ Notion</button>
          <button type="button" class="btn btn-danger-outline btn-sm" data-delete-content-id="${escapeHtml(
            selected.id
          )}">Xóa</button>
          <button type="submit" class="btn btn-primary">Lưu &amp; Cập nhật Notion</button>
        </div>
      </div>

      <div class="form-grid" style="margin-bottom:12px;">
        <label class="field span-2">
          <span>Tiêu đề nội dung</span>
          <input type="text" name="title" value="${escapeHtml(selected.title)}" required />
        </label>
        <label class="field">
          <span>Trạng thái duyệt</span>
          <select name="status">
            <option value="draft" ${selected.status === 'draft' ? 'selected' : ''}>Bản nháp (Draft)</option>
            <option value="review" ${selected.status === 'review' ? 'selected' : ''}>Chờ duyệt (In Review)</option>
            <option value="approved" ${selected.status === 'approved' ? 'selected' : ''}>Đã duyệt (Approved)</option>
          </select>
        </label>
        <label class="field">
          <span>Thẻ phân loại (Tags)</span>
          <input type="text" name="tags" value="${escapeHtml((selected.tags || []).join(', '))}" />
        </label>
        <label class="field span-full">
          <span>Link thư mục tài nguyên gốc (Google Drive / Footage 4K / Frame.io / Thumbnail PSD)</span>
          <div style="display:flex;gap:8px;">
            <input type="url" name="assetUrl" style="flex:1;" value="${escapeHtml(selected.assetUrl || '')}" placeholder="https://drive.google.com/..." />
            ${
              selected.assetUrl
                ? `<a href="${escapeHtml(
                    selected.assetUrl
                  )}" target="_blank" rel="noopener" class="btn btn-secondary">Mở Link File Gốc ↗</a>`
                : ''
            }
          </div>
        </label>
      </div>

      <label class="field">
        <span>Nội dung lưu trữ (Kịch bản, Lời thoại, Dàn ý SEO, Danh mục file...)</span>
        <textarea name="body" class="script-editor-area">${escapeHtml(selected.body)}</textarea>
      </label>
    </form>
  `;
}

// =============================================================================
// TAB 5: QUẢN LÝ YOUTUBE (KÊNH, TÌNH TRẠNG KÊNH & CHỈ SỐ LƯỢT XEM HẰNG NGÀY)
// =============================================================================
const CHANNEL_STATUS_META = {
  monetized: { label: 'Đã bật kiếm tiền (BKT / Xanh)', badge: 'badge-emerald' },
  active: { label: 'Đang hoạt động tốt', badge: 'badge-blue' },
  incubating: { label: 'Đang nuôi kênh / Xây mới', badge: 'badge-slate' },
  warning: { label: 'Cảnh báo / Gậy / Bóp tương tác', badge: 'badge-amber' },
  demonetized: { label: 'Tắt kiếm tiền / Kháng nghị', badge: 'badge-crimson' },
  paused: { label: 'Tạm nghỉ / Lưu trữ', badge: 'badge-slate' },
};

const MONETIZATION_META = {
  enabled: { label: 'Đã bật BKT', badge: 'badge-emerald' },
  pending: { label: 'Chờ duyệt BKT', badge: 'badge-amber' },
  disabled: { label: 'Chưa bật / Đã tắt', badge: 'badge-crimson' },
};

const CATEGORY_COLOR_PALETTE = [
  'niche-teal',
  'niche-violet',
  'niche-blue',
  'niche-gold',
  'niche-indigo',
  'niche-amber',
  'niche-emerald',
  'niche-cyan',
  'niche-rose',
];

const CATEGORY_COLOR_MAP = {
  'Du lịch & Khám phá': 'niche-teal',
  'Văn hóa & Âm nhạc': 'niche-violet',
  'Công nghệ & Đánh giá': 'niche-blue',
  'Kinh doanh & Tự động hóa': 'niche-gold',
  'Kinh doanh & Tài chính': 'niche-gold',
  'Gaming & Esports': 'niche-indigo',
  'Ẩm thực & Đời sống': 'niche-amber',
  'Giáo dục & Kiến thức': 'niche-emerald',
  'Sức khỏe & Thể thao': 'niche-cyan',
  'Phim ảnh & Giải trí': 'niche-rose',
  'Giải trí & Nội dung số': 'niche-rose',
};

function getCategoryColorClass(category) {
  const cat = String(category || 'Giải trí & Nội dung số').trim();
  if (CATEGORY_COLOR_MAP[cat]) return CATEGORY_COLOR_MAP[cat];
  let hash = 0;
  for (let i = 0; i < cat.length; i++) {
    hash = (hash * 31 + cat.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_COLOR_PALETTE[hash % CATEGORY_COLOR_PALETTE.length];
}

function renderCategoryDropdown() {
  const dropdownEl = document.getElementById('yt-category-dropdown');
  if (!dropdownEl) return;

  const isOpen = dropdownEl.classList.contains('open');
  const currentCat = state.filters.ytCategory || 'all';
  const categoryCounts = new Map();
  state.channels.forEach((ch) => {
    const cat = (ch.category || 'Giải trí & Nội dung số').trim();
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
  });

  const activeCount =
    currentCat === 'all' ? state.channels.length : categoryCounts.get(currentCat) || 0;
  const triggerColorClass =
    currentCat === 'all' ? 'cat-trigger-all' : getCategoryColorClass(currentCat);
  const triggerLabel = currentCat === 'all' ? 'Tất cả danh mục' : currentCat;

  const allItemHtml = `
    <button
      type="button"
      class="cat-dropdown-item cat-item-all ${currentCat === 'all' ? 'active' : ''}"
      data-select-category="all"
    >
      <span class="cat-item-left">
        <span class="cat-dot cat-dot-all"></span>
        <span>Tất cả danh mục</span>
      </span>
      <strong class="cat-pill-count num">${state.channels.length}</strong>
    </button>
  `;

  const catItemsHtml = Array.from(categoryCounts.entries())
    .map(([cat, count]) => {
      const colorClass = getCategoryColorClass(cat);
      const isActive = currentCat === cat;
      return `
        <button
          type="button"
          class="cat-dropdown-item ${colorClass} ${isActive ? 'active' : ''}"
          data-select-category="${escapeHtml(cat)}"
        >
          <span class="cat-item-left">
            <span class="cat-dot"></span>
            <span>${escapeHtml(cat)}</span>
          </span>
          <strong class="cat-pill-count num">${count}</strong>
        </button>
      `;
    })
    .join('');

  dropdownEl.innerHTML = `
    <button
      type="button"
      class="cat-dropdown-trigger ${triggerColorClass}"
      data-toggle-cat-dropdown="true"
      aria-expanded="${isOpen ? 'true' : 'false'}"
      title="Lọc kênh theo danh mục (Ngách)"
    >
      <span class="cat-dot"></span>
      <span class="cat-trigger-text">${escapeHtml(triggerLabel)}</span>
      <strong class="cat-pill-count num">${activeCount}</strong>
      <span class="cat-chevron" aria-hidden="true">▾</span>
    </button>
    <div class="cat-dropdown-menu" role="listbox" aria-label="Danh sách danh mục kênh">
      <div class="cat-dropdown-header">Lọc theo danh mục (Ngách)</div>
      ${allItemHtml}
      ${catItemsHtml}
    </div>
  `;
}

function renderGroupDropdown() {
  const dropdownEl = document.getElementById('yt-group-dropdown');
  const datalistEl = document.getElementById('yt-groups-datalist');

  const groupCounts = new Map();
  let ungroupedCount = 0;
  state.channels.forEach((ch) => {
    const grp = String(ch.group || '').trim();
    if (grp) {
      groupCounts.set(grp, (groupCounts.get(grp) || 0) + 1);
    } else {
      ungroupedCount += 1;
    }
  });

  if (datalistEl) {
    const defaultSuggestions = ['Group 1', 'Group 2', 'Group 3', 'Team US', 'Team VN'];
    const allSuggested = [...new Set([...groupCounts.keys(), ...defaultSuggestions])];
    datalistEl.innerHTML = allSuggested
      .map((g) => `<option value="${escapeHtml(g)}"></option>`)
      .join('');
  }

  if (!dropdownEl) return;

  const isOpen = dropdownEl.classList.contains('open');
  const currentGroup = state.filters.ytGroup || 'all';
  const activeCount =
    currentGroup === 'all'
      ? state.channels.length
      : currentGroup === '__none__'
      ? ungroupedCount
      : groupCounts.get(currentGroup) || 0;
  const triggerColorClass =
    currentGroup === 'all' || currentGroup === '__none__'
      ? 'cat-trigger-all'
      : getCategoryColorClass(currentGroup);
  const triggerLabel =
    currentGroup === 'all'
      ? 'Tất cả Group'
      : currentGroup === '__none__'
      ? 'Chưa phân Group'
      : `Group: ${currentGroup}`;

  const allItemHtml = `
    <button
      type="button"
      class="cat-dropdown-item cat-item-all ${currentGroup === 'all' ? 'active' : ''}"
      data-select-group="all"
    >
      <span class="cat-item-left">
        <span class="cat-dot cat-dot-all"></span>
        <span>Tất cả Group</span>
      </span>
      <strong class="cat-pill-count num">${state.channels.length}</strong>
    </button>
  `;

  const groupItemsHtml = Array.from(groupCounts.entries())
    .map(([grp, count]) => {
      const colorClass = getCategoryColorClass(grp);
      const isActive = currentGroup === grp;
      return `
        <button
          type="button"
          class="cat-dropdown-item ${colorClass} ${isActive ? 'active' : ''}"
          data-select-group="${escapeHtml(grp)}"
        >
          <span class="cat-item-left">
            <span class="cat-dot"></span>
            <span>${escapeHtml(grp)}</span>
          </span>
          <strong class="cat-pill-count num">${count}</strong>
        </button>
      `;
    })
    .join('');

  const ungroupedItemHtml =
    ungroupedCount > 0
      ? `
        <button
          type="button"
          class="cat-dropdown-item ${currentGroup === '__none__' ? 'active' : ''}"
          data-select-group="__none__"
        >
          <span class="cat-item-left">
            <span class="cat-dot"></span>
            <span>Chưa gắn Group</span>
          </span>
          <strong class="cat-pill-count num">${ungroupedCount}</strong>
        </button>
      `
      : '';

  dropdownEl.innerHTML = `
    <button
      type="button"
      class="cat-dropdown-trigger ${triggerColorClass}"
      data-toggle-group-dropdown="true"
      aria-expanded="${isOpen ? 'true' : 'false'}"
      title="Lọc kênh theo Group (Nhóm kênh)"
    >
      <span class="cat-dot"></span>
      <span class="cat-trigger-text">${escapeHtml(triggerLabel)}</span>
      <strong class="cat-pill-count num">${activeCount}</strong>
      <span class="cat-chevron" aria-hidden="true">▾</span>
    </button>
    <div class="cat-dropdown-menu" role="listbox" aria-label="Danh sách Group kênh">
      <div class="cat-dropdown-header">Lọc theo Group (Nhóm kênh)</div>
      ${allItemHtml}
      ${groupItemsHtml}
      ${ungroupedItemHtml}
    </div>
  `;
}

function renderSidebarFolderTree() {
  const treeEl = document.getElementById('sidebar-folder-tree');
  if (!treeEl) return;

  if (state.channels.length === 0) {
    treeEl.innerHTML = '';
    return;
  }

  const groupMap = new Map();
  const ungroupedChannels = [];
  for (const ch of state.channels) {
    const g = String(ch.group || '').trim();
    if (g) {
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g).push(ch);
    } else {
      ungroupedChannels.push(ch);
    }
  }

  const currentGroup = state.filters.ytGroup || 'all';
  const isYtTab = state.activeTab === 'youtube';
  const activeDeepId = state.activeChannelDeepId;

  const buildGroupBranch = (groupKey, groupLabel, channelsList) => {
    const isGroupActive = isYtTab && !activeDeepId && currentGroup === groupKey;
    const hasActiveChild = isYtTab && channelsList.some((c) => c.id === activeDeepId);
    const channelsHtml = channelsList
      .map((ch) => {
        const isChActive = isYtTab && activeDeepId === ch.id;
        return `
          <button
            type="button"
            class="sidebar-tree-channel ${isChActive ? 'active' : ''}"
            data-open-channel-deep="${escapeHtml(ch.id)}"
            title="Quản lý sâu kênh ${escapeHtml(ch.name)}"
          >
            <span class="tree-ch-icon">📺</span>
            <span class="tree-ch-name">${escapeHtml(ch.name)}</span>
          </button>
        `;
      })
      .join('');

    return `
      <div class="sidebar-tree-group ${isGroupActive || hasActiveChild ? 'expanded' : ''}">
        <button
          type="button"
          class="sidebar-tree-folder ${isGroupActive ? 'active' : ''}"
          data-open-group-folder="${escapeHtml(groupKey)}"
          title="Mở thư mục nhóm ${escapeHtml(groupLabel)}"
        >
          <span class="tree-folder-icon">📁</span>
          <span class="tree-folder-name">${escapeHtml(groupLabel)}</span>
          <span class="tree-folder-count num">${channelsList.length}</span>
        </button>
        <div class="sidebar-tree-children">
          ${channelsHtml}
        </div>
      </div>
    `;
  };

  const branchesHtml = [
    `<button
      type="button"
      class="sidebar-tree-folder sidebar-tree-all ${isYtTab && !activeDeepId && currentGroup === 'all' ? 'active' : ''}"
      data-open-group-folder="all"
    >
      <span class="tree-folder-icon">📂</span>
      <span class="tree-folder-name">Tất cả Kênh</span>
      <span class="tree-folder-count num">${state.channels.length}</span>
    </button>`,
    ...Array.from(groupMap.entries()).map(([grp, list]) => buildGroupBranch(grp, grp, list)),
    ...(ungroupedChannels.length > 0
      ? [buildGroupBranch('__none__', 'Chưa gắn Group', ungroupedChannels)]
      : []),
  ].join('');

  treeEl.innerHTML = branchesHtml;
}

function renderSingleChannelDeepView(ch, boardEl) {
  const chVideos = state.videos.filter((v) => v.channelId === ch.id);
  const fallbackTop = Array.isArray(ch.topVideos) ? ch.topVideos : [];
  const seenKeys = new Set(chVideos.map((v) => v.youtubeVideoId || v.title));
  const allChannelVideos = [
    ...chVideos.map((v) => ({
      ...v,
      views: Number(v.currentViews ?? v.views) || 0,
    })),
    ...fallbackTop
      .filter((tv) => !seenKeys.has(tv.youtubeVideoId || tv.title))
      .map((tv) => ({
        ...tv,
        views: Number(tv.views ?? tv.currentViews) || 0,
      })),
  ];

  const sumVideoViews = allChannelVideos.reduce((s, v) => s + v.views, 0);
  const chTotalViews = Math.max(Number(ch.totalViews) || 0, sumVideoViews);
  const videoCount = Math.max(Number(ch.totalVideos) || 0, allChannelVideos.length);
  const avgViewsPerVideo =
    allChannelVideos.length > 0
      ? Math.max(Math.round(sumVideoViews / allChannelVideos.length), 1)
      : Math.max(Math.round(chTotalViews / Math.max(videoCount, 1)), 1);

  const earliestVideoDate =
    ch.firstVideoDate ||
    allChannelVideos
      .map((v) => v.publishedAt)
      .filter(Boolean)
      .sort()[0] ||
    '';
  const managerMailValue = ch.managerEmail || ch.manager || '';
  const chCategory = (ch.category || 'Giải trí & Nội dung số').trim();
  const catColorClass = getCategoryColorClass(chCategory);
  const chGroup = (ch.group || '').trim();
  const groupColorClass = chGroup ? getCategoryColorClass(chGroup) : '';

  const sortMode = state.deepChannelVideoSort || 'views';
  const sortedVideos = [...allChannelVideos]
    .map((v) => {
      const outlierMultiplier = Number((v.views / Math.max(avgViewsPerVideo, 1)).toFixed(1));
      return { ...v, outlierMultiplier };
    })
    .sort((a, b) => {
      if (sortMode === 'date') {
        return String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')) || b.views - a.views;
      }
      if (sortMode === 'outlier') {
        return b.outlierMultiplier - a.outlierMultiplier || b.views - a.views;
      }
      return b.views - a.views;
    });

  const videosListHtml =
    sortedVideos.length > 0
      ? sortedVideos
          .map((v, idx) => {
            const vUrl = v.youtubeVideoId
              ? `https://www.youtube.com/watch?v=${encodeURIComponent(v.youtubeVideoId)}`
              : ch.channelUrl || '#';
            const isHot = v.outlierMultiplier >= 1.5;
            const outlierBadge =
              v.outlierMultiplier >= 1.2
                ? `<span class="outlier-badge ${isHot ? 'outlier-hot' : ''} num">${isHot ? '🔥 ' : ''}x${v.outlierMultiplier} TB kênh</span>`
                : '';
            const vDate = v.publishedAt
              ? `<span class="top-video-date num">${escapeHtml(v.publishedAt)}</span>`
              : '';
            return `
              <div class="top-video-item burst-video-row top-video-rank-${idx < 3 ? idx + 1 : 'other'}">
                <span class="top-video-rank num">#${idx + 1}</span>
                <div class="burst-video-main">
                  <a href="${escapeHtml(vUrl)}" target="_blank" rel="noopener" class="top-video-title" title="${escapeHtml(v.title)}">
                    ${escapeHtml(v.title)} ↗
                  </a>
                </div>
                ${vDate}
                ${outlierBadge}
                <span class="top-video-views num">${formatNumber(v.views)} views</span>
                <button
                  type="button"
                  class="btn btn-secondary btn-xs btn-save-key"
                  data-save-burst-title="${escapeHtml(v.title)}"
                  data-save-burst-url="${escapeHtml(vUrl)}"
                  data-save-burst-channel="${escapeHtml(ch.name)}"
                  data-save-burst-views="${escapeHtml(String(v.views))}"
                  data-save-burst-outlier="${escapeHtml(String(v.outlierMultiplier))}"
                  title="Lưu chủ đề (Key) video này sang Nơi lưu nội dung"
                >+ Lưu Key</button>
              </div>
            `;
          })
          .join('')
      : `<div class="channel-top-videos-empty">Chưa có danh sách video — bấm nút <strong>Đồng bộ</strong> để quét toàn bộ video của kênh này.</div>`;

  boardEl.innerHTML = `
    <div class="deep-channel-workspace">
      <div class="deep-channel-top-bar">
        <button type="button" class="btn btn-secondary btn-sm" data-close-channel-deep="true">
          ← Quay lại Thư mục Nhóm
        </button>
        <div class="deep-channel-title-cluster">
          <span class="deep-folder-badge">📺 QUẢN LÝ SÂU KÊNH RIÊNG LẺ</span>
          <h2 class="deep-channel-heading">${escapeHtml(ch.name)}</h2>
          ${
            ch.channelUrl
              ? `<a href="${escapeHtml(ch.channelUrl)}" target="_blank" rel="noopener" class="channel-handle-link">${escapeHtml(ch.handle || 'Mở YouTube')} ↗</a>`
              : `<span class="channel-handle-muted">${escapeHtml(ch.handle || '')}</span>`
          }
        </div>
        <div class="channel-inline-actions">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            data-sync-channel-id="${escapeHtml(ch.id)}"
          >🔄 Đồng bộ quét lại kênh</button>
          <button
            type="button"
            class="btn btn-danger-outline btn-sm"
            data-delete-channel-id="${escapeHtml(ch.id)}"
            data-delete-channel-name="${escapeHtml(ch.name)}"
          >🗑 Xóa kênh</button>
        </div>
      </div>

      <!-- 4 THẺ CHỈ SỐ CHUYÊN SÂU CỦA RIÊNG KÊNH NÀY -->
      <div class="deep-kpi-grid num">
        <div class="deep-kpi-card">
          <span class="deep-kpi-label">SUBSCRIBERS</span>
          <strong class="deep-kpi-val">${formatNumber(ch.subscribers || 0)}</strong>
          <span class="deep-kpi-sub">Người đăng ký thực tế</span>
        </div>
        <div class="deep-kpi-card deep-kpi-gold">
          <span class="deep-kpi-label">TỔNG LƯỢT XEM (VIEWS)</span>
          <strong class="deep-kpi-val">${formatNumber(chTotalViews)}</strong>
          <span class="deep-kpi-sub">Toàn kênh YouTube</span>
        </div>
        <div class="deep-kpi-card">
          <span class="deep-kpi-label">TỔNG SỐ VIDEO</span>
          <strong class="deep-kpi-val">${formatNumber(videoCount)}</strong>
          <span class="deep-kpi-sub">Đã quét chi tiết ${formatNumber(allChannelVideos.length)} video</span>
        </div>
        <div class="deep-kpi-card">
          <span class="deep-kpi-label">TRUNG BÌNH / VIDEO</span>
          <strong class="deep-kpi-val">${formatNumber(avgViewsPerVideo)}</strong>
          <span class="deep-kpi-sub">Views trung bình mỗi video</span>
        </div>
      </div>

      <!-- HỒ SƠ CẤU HÌNH & GHI CHÚ QUẢN TRỊ SÂU CỦA KÊNH -->
      <div class="deep-config-card">
        <h3 class="insights-card-title" style="margin-bottom:10px;">⚙️ Hồ sơ phân nhóm, BKT, Nhân sự &amp; Ghi chú chiến lược kênh</h3>
        <div class="channel-single-line num" style="flex-wrap:wrap;gap:8px;margin-bottom:10px;">
          <label class="inline-group-pill ${groupColorClass}">
            <span class="inline-group-label">Thư mục Group:</span>
            <input
              type="text"
              list="yt-groups-datalist"
              class="inline-group-input"
              data-channel-group="${escapeHtml(ch.id)}"
              value="${escapeHtml(chGroup)}"
              placeholder="Chọn / nhập Group..."
            />
          </label>

          <select
            class="bkt-pill-select bkt-status-${escapeHtml(ch.status || 'monetized')}"
            data-channel-bkt-select="${escapeHtml(ch.id)}"
          >
            ${Object.entries(CHANNEL_STATUS_META)
              .map(
                ([k, info]) =>
                  `<option value="${k}" ${ch.status === k ? 'selected' : ''}>● ${info.label}</option>`
              )
              .join('')}
          </select>

          <span class="niche-chip ${catColorClass}">
            <span class="cat-dot"></span>
            <span>Ngách: ${escapeHtml(chCategory)}</span>
          </span>

          <label class="inline-meta-field">
            <span class="inline-meta-label">Ngày đầu đăng video:</span>
            <input
              type="date"
              class="inline-meta-input num"
              data-channel-first-date="${escapeHtml(ch.id)}"
              value="${escapeHtml(earliestVideoDate)}"
            />
          </label>

          <label class="inline-meta-field inline-meta-mail" style="flex:1;min-width:200px;">
            <span class="inline-meta-label">Quản lý:</span>
            <input
              type="text"
              class="inline-meta-input"
              style="width:100%;"
              data-channel-manager-mail="${escapeHtml(ch.id)}"
              value="${escapeHtml(managerMailValue)}"
              placeholder="Tên / Gmail..."
            />
          </label>

          ${renderChannelGaPill(ch, true)}
        </div>

        <label class="deep-note-field">
          <span class="deep-note-label">📝 Ghi chú sâu về Kênh (Định hướng Key, Lịch đăng, Lưu ý BKT / Gậy, Tài khoản...):</span>
          <textarea
            class="input-control deep-note-textarea"
            rows="2"
            data-channel-status-note="${escapeHtml(ch.id)}"
            placeholder="Nhập ghi chú quản lý sâu cho kênh này (tự động lưu khi nhập xong)..."
          >${escapeHtml(ch.statusNote || '')}</textarea>
        </label>
      </div>

      <!-- DANH SÁCH TOÀN BỘ VIDEO ĐÃ QUÉT CỦA KÊNH -->
      <div class="insights-card">
        <div class="insights-card-header">
          <div>
            <h3 class="insights-card-title">🎬 Danh sách toàn bộ Video của kênh "${escapeHtml(ch.name)}" (${formatNumber(sortedVideos.length)} video)</h3>
            <p class="insights-card-sub">So sánh hiệu suất từng video với mức trung bình kênh (${formatNumber(avgViewsPerVideo)} views/video)</p>
          </div>
          <div class="insights-mode-tabs">
            <button type="button" class="insights-tab-btn ${sortMode === 'views' ? 'active' : ''}" data-set-deep-video-sort="views">Views cao nhất</button>
            <button type="button" class="insights-tab-btn ${sortMode === 'outlier' ? 'active' : ''}" data-set-deep-video-sort="outlier">Độ nổ (xTB kênh)</button>
            <button type="button" class="insights-tab-btn ${sortMode === 'date' ? 'active' : ''}" data-set-deep-video-sort="date">Mới đăng nhất</button>
          </div>
        </div>
        <div class="channel-top-videos-list">
          ${videosListHtml}
        </div>
      </div>
    </div>
  `;
}

function renderChannelGaPill(ch, isDeep = false) {
  const isUnlocked = state.unlockedGaChannels && state.unlockedGaChannels.has(ch.id);
  const gaValue = String(ch.adsenseAccount || '').trim();
  const extraStyle = isDeep ? 'style="flex:1;min-width:220px;"' : '';

  if (isUnlocked) {
    return `
      <div class="inline-meta-field inline-meta-ga unlocked" ${extraStyle} title="Gà kết nối (Google AdSense / Mail GA) — Tự động lưu khi nhập xong">
        <span class="inline-meta-label">Gà kết nối:</span>
        <input
          type="text"
          class="inline-meta-input ga-input-unlocked"
          data-channel-ga="${escapeHtml(ch.id)}"
          value="${escapeHtml(gaValue)}"
          placeholder="Tên / Mail Gà..."
        />
        <button
          type="button"
          class="ga-eye-btn unlocked"
          data-lock-ga-id="${escapeHtml(ch.id)}"
          title="Ẩn lại Gà kết nối"
        >🙈 Ẩn</button>
      </div>
    `;
  }

  return `
    <div
      class="inline-meta-field inline-meta-ga locked"
      ${extraStyle}
      data-unlock-ga-id="${escapeHtml(ch.id)}"
      title="Thông tin Gà kết nối đang được ẩn — Bấm Xem và nhập mật khẩu để mở"
    >
      <span class="inline-meta-label">Gà kết nối:</span>
      <span class="ga-masked-dots" aria-label="Đang ẩn bảo mật">••••••••</span>
      <button
        type="button"
        class="ga-eye-btn"
        data-unlock-ga-id="${escapeHtml(ch.id)}"
        title="Nhập mật khẩu để xem / sửa Gà kết nối"
      >🔒 Xem</button>
    </div>
  `;
}

function renderYoutubeChannelsBoard() {
  const boardEl = document.getElementById('yt-channels-board');
  const cmdBarEl = document.getElementById('yt-command-bar');
  if (!boardEl) return;

  renderSidebarFolderTree();

  // Nếu đang mở chế độ Quản lý sâu 1 kênh riêng lẻ
  if (state.activeChannelDeepId) {
    const targetCh = state.channels.find((c) => c.id === state.activeChannelDeepId);
    if (targetCh) {
      if (cmdBarEl) cmdBarEl.hidden = true;
      renderSingleChannelDeepView(targetCh, boardEl);
      return;
    }
    state.activeChannelDeepId = null;
  }

  if (cmdBarEl) cmdBarEl.hidden = false;

  const q = (state.filters.ytSearch || '').toLowerCase().trim();
  const channelFilter = state.filters.ytChannel || 'all';
  const categoryFilter = state.filters.ytCategory || 'all';
  const groupFilter = state.filters.ytGroup || 'all';
  const managerFilter = state.filters.ytManager || 'all';

  const filteredChannels = state.channels.filter((ch) => {
    if (channelFilter !== 'all' && ch.id !== channelFilter) return false;
    const chCat = (ch.category || 'Giải trí & Nội dung số').trim();
    if (categoryFilter !== 'all' && chCat !== categoryFilter) return false;
    const chGroup = (ch.group || '').trim();
    if (groupFilter === '__none__' && chGroup !== '') return false;
    if (groupFilter !== 'all' && groupFilter !== '__none__' && chGroup !== groupFilter) return false;
    const chMgr = (ch.managerEmail || ch.manager || '').trim();
    if (managerFilter === '__none__' && chMgr !== '') return false;
    if (managerFilter !== 'all' && managerFilter !== '__none__' && chMgr !== managerFilter) return false;
    if (!q) return true;
    return (
      (ch.name || '').toLowerCase().includes(q) ||
      (ch.handle || '').toLowerCase().includes(q) ||
      chCat.toLowerCase().includes(q) ||
      chGroup.toLowerCase().includes(q) ||
      (ch.manager || '').toLowerCase().includes(q) ||
      (ch.managerEmail || '').toLowerCase().includes(q) ||
      (ch.statusNote || '').toLowerCase().includes(q)
    );
  });

  if (filteredChannels.length === 0) {
    boardEl.innerHTML = `<p class="panel-desc" style="padding:18px;">Chưa có kênh YouTube nào trong thư mục này. Bấm chọn "📁 Tất cả" trên thanh thư mục phía trên để xem toàn bộ kênh.</p>`;
    return;
  }

  const folderTitle =
    groupFilter === 'all'
      ? `📁 Thư mục: Tất cả Kênh (${filteredChannels.length} kênh)`
      : groupFilter === '__none__'
      ? `📁 Thư mục: Chưa gắn Group (${filteredChannels.length} kênh)`
      : `📁 Thư mục Nhóm: ${groupFilter} (${filteredChannels.length} kênh)`;

  const headerHtml = `
    <div class="channel-row-header">
      <div>${escapeHtml(folderTitle)} — Bấm nút <strong>"🔍 Quản lý sâu"</strong> hoặc bấm vào Tên Kênh để mở hồ sơ &amp; toàn bộ video của riêng kênh đó</div>
    </div>
  `;

  const rowsHtml = filteredChannels
    .map((ch) => {
      const chVideos = state.videos.filter((v) => v.channelId === ch.id);
      const sumVideoViews = chVideos.reduce((s, v) => s + (Number(v.currentViews) || 0), 0);
      const chTotalViews = Math.max(Number(ch.totalViews) || 0, sumVideoViews);
      const videoCount = Math.max(Number(ch.totalVideos) || 0, chVideos.length);
      const top3Videos = (
        chVideos.length > 0
          ? [...chVideos].sort(
              (a, b) => (Number(b.currentViews ?? b.views) || 0) - (Number(a.currentViews ?? a.views) || 0)
            )
          : Array.isArray(ch.topVideos)
          ? [...ch.topVideos].sort(
              (a, b) => (Number(b.views ?? b.currentViews) || 0) - (Number(a.views ?? a.currentViews) || 0)
            )
          : []
      ).slice(0, 3);
      const earliestVideoDate =
        ch.firstVideoDate ||
        chVideos
          .map((v) => v.publishedAt)
          .filter(Boolean)
          .sort()[0] ||
        '';
      const managerMailValue = ch.managerEmail || ch.manager || '';
      const chCategory = (ch.category || 'Giải trí & Nội dung số').trim();
      const catColorClass = getCategoryColorClass(chCategory);
      const chGroup = (ch.group || '').trim();
      const groupColorClass = chGroup ? getCategoryColorClass(chGroup) : '';

      return `
        <article class="channel-row" data-channel-row-id="${escapeHtml(ch.id)}">
          <div class="channel-col-identity">
            <!-- Dòng 1 duy nhất: Tên Kênh + @Handle + Quản lý sâu/Đồng bộ/Xóa + Group + BKT + Ngách + SUB + VIEWS + VIDEO + Ngày đầu + Quản lý + Gà kết nối -->
            <div class="channel-single-line num">
              <button
                type="button"
                class="channel-name-btn"
                data-open-channel-deep="${escapeHtml(ch.id)}"
                title="Bấm để mở thư mục Quản lý sâu kênh ${escapeHtml(ch.name)}"
              >
                <strong class="channel-name-text">${escapeHtml(ch.name)}</strong>
              </button>
              ${
                ch.channelUrl
                  ? `<a href="${escapeHtml(ch.channelUrl)}" target="_blank" rel="noopener" class="channel-handle-link">${escapeHtml(
                      ch.handle || 'Mở kênh'
                    )} ↗</a>`
                  : `<span class="channel-handle-muted">${escapeHtml(ch.handle)}</span>`
              }

              <div class="channel-inline-actions">
                <button
                  type="button"
                  class="btn btn-primary btn-xs"
                  data-open-channel-deep="${escapeHtml(ch.id)}"
                  title="Đi vào thư mục chi tiết của riêng kênh này để quản lý sâu hơn"
                >🔍 Quản lý sâu</button>
                <button
                  type="button"
                  class="btn btn-secondary btn-xs"
                  data-sync-channel-id="${escapeHtml(ch.id)}"
                  title="Tự động quét loạt video của kênh, cập nhật số Sub/Views và liệt kê Top 3 video nhiều view nhất"
                >Đồng bộ</button>
                <button
                  type="button"
                  class="btn btn-danger-outline btn-xs"
                  data-delete-channel-id="${escapeHtml(ch.id)}"
                  data-delete-channel-name="${escapeHtml(ch.name)}"
                  title="Xóa kênh này khỏi hệ thống"
                >Xóa</button>
              </div>

              <label class="inline-group-pill ${groupColorClass}" title="Nhập hoặc chọn Group cho kênh này">
                <span class="inline-group-label">Group:</span>
                <input
                  type="text"
                  list="yt-groups-datalist"
                  class="inline-group-input"
                  data-channel-group="${escapeHtml(ch.id)}"
                  value="${escapeHtml(chGroup)}"
                  placeholder="Chọn Group..."
                />
              </label>

              <select
                class="bkt-pill-select bkt-status-${escapeHtml(ch.status || 'monetized')}"
                data-channel-bkt-select="${escapeHtml(ch.id)}"
                aria-label="Chọn trạng thái BKT của kênh"
              >
                ${Object.entries(CHANNEL_STATUS_META)
                  .map(
                    ([k, info]) =>
                      `<option value="${k}" ${ch.status === k ? 'selected' : ''}>● ${info.label}</option>`
                  )
                  .join('')}
              </select>

              <button
                type="button"
                class="niche-chip ${catColorClass}"
                data-filter-category="${escapeHtml(chCategory)}"
                title="Bấm để lọc các kênh thuộc danh mục: ${escapeHtml(chCategory)}"
              >
                <span class="cat-dot"></span>
                <span>${escapeHtml(chCategory)}</span>
              </button>

              <div class="hero-stat-pill hero-stat-subs">
                <strong class="hero-stat-num">${formatNumber(ch.subscribers || 0)}</strong>
                <span class="hero-stat-label">SUB</span>
              </div>

              <div class="hero-stat-pill hero-stat-views">
                <strong class="hero-stat-num">${formatNumber(chTotalViews)}</strong>
                <span class="hero-stat-label">TỔNG VIEWS</span>
              </div>

              <div class="hero-stat-pill hero-stat-videos">
                <strong class="hero-stat-num">${formatNumber(videoCount)}</strong>
                <span class="hero-stat-label">VIDEO</span>
              </div>

              <label class="inline-meta-field" title="Ngày đầu đăng video">
                <span class="inline-meta-label">Ngày đầu:</span>
                <input
                  type="date"
                  class="inline-meta-input num"
                  data-channel-first-date="${escapeHtml(ch.id)}"
                  value="${escapeHtml(earliestVideoDate)}"
                />
              </label>

              <label class="inline-meta-field inline-meta-mail" title="Người / Mail quản lý kênh">
                <span class="inline-meta-label">Quản lý:</span>
                <input
                  type="text"
                  class="inline-meta-input"
                  data-channel-manager-mail="${escapeHtml(ch.id)}"
                  value="${escapeHtml(managerMailValue)}"
                  placeholder="Tên / Gmail..."
                />
              </label>

              ${renderChannelGaPill(ch, false)}
            </div>

            <!-- Top 3 Video Có Lượng View Cao Nhất (Kiểu cũ: dọc từng dòng rõ ràng) -->
            <div class="channel-top-videos-box">
              <div class="channel-top-videos-header">
                <span class="top-videos-badge">🏆 TOP 3 VIDEO NHIỀU VIEW NHẤT</span>
                <span class="top-videos-sub">Đã quét ${formatNumber(chVideos.length || top3Videos.length)} video trên kênh</span>
              </div>
              ${
                top3Videos.length > 0
                  ? `<div class="channel-top-videos-list">
                      ${top3Videos
                        .map((v, idx) => {
                          const vViews = Number(v.currentViews ?? v.views) || 0;
                          const vUrl = v.youtubeVideoId
                            ? `https://www.youtube.com/watch?v=${encodeURIComponent(v.youtubeVideoId)}`
                            : ch.channelUrl || '#';
                          const vDate = v.publishedAt ? `<span class="top-video-date num">${escapeHtml(v.publishedAt)}</span>` : '';
                          return `
                            <div class="top-video-item top-video-rank-${idx + 1}">
                              <span class="top-video-rank num">#${idx + 1}</span>
                              <a href="${escapeHtml(vUrl)}" target="_blank" rel="noopener" class="top-video-title" title="${escapeHtml(v.title)}">
                                ${escapeHtml(v.title)} ↗
                              </a>
                              ${vDate}
                              <span class="top-video-views num">${formatNumber(vViews)} views</span>
                            </div>
                          `;
                        })
                        .join('')}
                    </div>`
                  : `<div class="channel-top-videos-empty">Chưa có danh sách video — bấm nút <strong>Đồng bộ</strong> để quét loạt video của kênh và lấy Top 3 video cao view nhất.</div>`
              }
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  boardEl.innerHTML = headerHtml + rowsHtml;
}

function renderYoutubeInsightsHub() {
  const hubEl = document.getElementById('yt-insights-hub');
  if (!hubEl) return;

  if (state.channels.length === 0) {
    hubEl.innerHTML = `
      <div class="insights-card" style="padding:24px;text-align:center;">
        <h3 class="insights-card-title">Chưa có kênh YouTube nào trong hệ thống</h3>
        <p class="insights-card-sub" style="margin:8px 0 14px;">Hãy mở Thư mục Kênh YouTube để dán link kênh đầu tiên vào hệ thống.</p>
        <button type="button" class="btn btn-primary" data-goto-tab="youtube">+ Thêm Kênh YouTube mới</button>
      </div>
    `;
    return;
  }

  // 1. Tính toán Thống kê tổng hợp theo Nhãn (Group, Ngách, Quản lý) + danh sách kênh con trong mỗi thư mục
  const buildBreakdown = (getKeyFn) => {
    const map = new Map();
    for (const ch of state.channels) {
      const { label, filterKey } = getKeyFn(ch);
      const chVideos = state.videos.filter((v) => v.channelId === ch.id);
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
        channels: [],
      };
      prev.channelCount += 1;
      if (isMonetized) prev.monetizedCount += 1;
      prev.totalSubscribers += Number(ch.subscribers) || 0;
      prev.totalViews += chViews;
      prev.totalVideos += chVideoCount;
      prev.channels.push({
        id: ch.id,
        name: ch.name,
        handle: ch.handle || '',
        views: chViews,
        subscribers: Number(ch.subscribers) || 0,
      });
      map.set(filterKey, prev);
    }
    return [...map.values()].sort((a, b) => b.totalViews - a.totalViews || b.channelCount - a.channelCount);
  };

  const groupFolders = buildBreakdown((ch) => {
    const g = String(ch.group || '').trim();
    return g ? { label: g, filterKey: g } : { label: 'Chưa gắn Group', filterKey: '__none__' };
  });

  const labelMode = state.insightsLabelMode || 'group';
  const labelRows =
    labelMode === 'category'
      ? buildBreakdown((ch) => {
          const c = String(ch.category || 'Giải trí & Nội dung số').trim();
          return { label: c, filterKey: c };
        })
      : labelMode === 'manager'
      ? buildBreakdown((ch) => {
          const m = String(ch.managerEmail || ch.manager || '').trim();
          return m ? { label: m, filterKey: m } : { label: 'Chưa phân công', filterKey: '__none__' };
        })
      : groupFolders;

  const grandTotalViews = Math.max(
    groupFolders.reduce((s, r) => s + r.totalViews, 0),
    1
  );
  const grandTotalSubs = groupFolders.reduce((s, r) => s + r.totalSubscribers, 0);
  const grandTotalVideos = groupFolders.reduce((s, r) => s + r.totalVideos, 0);
  const grandMonetized = groupFolders.reduce((s, r) => s + r.monetizedCount, 0);

  const activeFilterValue =
    labelMode === 'category'
      ? state.filters.ytCategory
      : labelMode === 'manager'
      ? state.filters.ytManager
      : state.filters.ytGroup;

  const hasAnyActiveFilter =
    (state.filters.ytGroup && state.filters.ytGroup !== 'all') ||
    (state.filters.ytCategory && state.filters.ytCategory !== 'all') ||
    (state.filters.ytManager && state.filters.ytManager !== 'all') ||
    (state.filters.ytChannel && state.filters.ytChannel !== 'all') ||
    Boolean((state.filters.ytSearch || '').trim());

  const labelRowsHtml = labelRows
    .map((row) => {
      const sharePct = Math.round((row.totalViews / grandTotalViews) * 100);
      const isSelected = activeFilterValue === row.filterKey && activeFilterValue !== 'all';
      const colorClass =
        row.filterKey === '__none__' ? '' : getCategoryColorClass(row.label);
      return `
        <button
          type="button"
          class="label-stat-row ${isSelected ? 'active' : ''}"
          data-filter-label-mode="${escapeHtml(labelMode)}"
          data-filter-label-key="${escapeHtml(row.filterKey)}"
          title="Bấm để lọc nhanh theo nhãn: ${escapeHtml(row.label)}"
        >
          <div class="label-stat-main">
            <span class="niche-chip ${colorClass} label-stat-chip">
              <span class="cat-dot"></span>
              <span>${escapeHtml(row.label)}</span>
            </span>
            <span class="label-stat-meta num">${row.channelCount} kênh · ${row.monetizedCount} BKT</span>
          </div>
          <div class="label-stat-metrics num">
            <span class="label-stat-pill"><strong>${formatNumber(row.totalSubscribers)}</strong> SUB</span>
            <span class="label-stat-pill"><strong>${formatNumber(row.totalVideos)}</strong> VIDEO</span>
            <span class="label-stat-pill label-stat-pill-views">
              <strong>${formatNumber(row.totalViews)}</strong> VIEWS
              <small>(${sharePct}%)</small>
            </span>
          </div>
          <div class="label-stat-bar-track" aria-hidden="true">
            <div class="label-stat-bar-fill" style="width:${Math.max(sharePct, 3)}%"></div>
          </div>
        </button>
      `;
    })
    .join('');

  // 2. Bảng tổng hợp "Video Nổ View" của cả dàn kênh
  const channelMap = new Map(state.channels.map((c) => [c.id, c]));
  const channelAvgMap = new Map();
  for (const ch of state.channels) {
    const vids = state.videos.filter((v) => v.channelId === ch.id);
    if (vids.length > 0) {
      const sumV = vids.reduce((s, v) => s + (Number(v.currentViews) || 0), 0);
      channelAvgMap.set(ch.id, Math.max(Math.round(sumV / vids.length), 1));
    } else {
      const totalV = Number(ch.totalViews) || 0;
      const countV = Math.max(Number(ch.totalVideos) || 1, 1);
      channelAvgMap.set(ch.id, Math.max(Math.round(totalV / countV), 1));
    }
  }

  const rawVideosPool = [...state.videos];
  const seenVideoKeys = new Set(rawVideosPool.map((v) => `${v.channelId}:${v.youtubeVideoId || v.title}`));
  for (const ch of state.channels) {
    for (const tv of ch.topVideos || []) {
      const k = `${ch.id}:${tv.youtubeVideoId || tv.title}`;
      if (!seenVideoKeys.has(k)) {
        seenVideoKeys.add(k);
        rawVideosPool.push({
          ...tv,
          channelId: ch.id,
          currentViews: Number(tv.views ?? tv.currentViews) || 0,
        });
      }
    }
  }

  const q = (state.filters.ytSearch || '').toLowerCase().trim();
  const filteredVideos = rawVideosPool
    .map((v) => {
      const ch = channelMap.get(v.channelId);
      if (!ch) return null;
      const chCat = (ch.category || 'Giải trí & Nội dung số').trim();
      const chGroup = (ch.group || '').trim();
      const chMgr = (ch.managerEmail || ch.manager || '').trim();

      if (state.filters.ytChannel !== 'all' && ch.id !== state.filters.ytChannel) return null;
      if (state.filters.ytCategory !== 'all' && chCat !== state.filters.ytCategory) return null;
      if (state.filters.ytGroup === '__none__' && chGroup !== '') return null;
      if (
        state.filters.ytGroup !== 'all' &&
        state.filters.ytGroup !== '__none__' &&
        chGroup !== state.filters.ytGroup
      )
        return null;
      if (state.filters.ytManager === '__none__' && chMgr !== '') return null;
      if (
        state.filters.ytManager !== 'all' &&
        state.filters.ytManager !== '__none__' &&
        chMgr !== state.filters.ytManager
      )
        return null;
      if (q) {
        const hit =
          (v.title || '').toLowerCase().includes(q) ||
          (ch.name || '').toLowerCase().includes(q) ||
          (ch.handle || '').toLowerCase().includes(q) ||
          chGroup.toLowerCase().includes(q);
        if (!hit) return null;
      }

      const views = Number(v.currentViews ?? v.views) || 0;
      const avgViews = channelAvgMap.get(ch.id) || Math.max(views, 1);
      const outlierMultiplier = Number((views / Math.max(avgViews, 1)).toFixed(1));
      return {
        youtubeVideoId: v.youtubeVideoId || '',
        title: v.title || 'Video YouTube',
        views,
        publishedAt: v.publishedAt || '',
        channelId: ch.id,
        channelName: ch.name || 'Kênh YouTube',
        channelHandle: ch.handle || '',
        channelUrl: ch.channelUrl || '',
        group: chGroup,
        category: chCat,
        outlierMultiplier,
      };
    })
    .filter(Boolean);

  const sortMode = state.insightsVideoSort || 'views';
  filteredVideos.sort((a, b) =>
    sortMode === 'outlier'
      ? b.outlierMultiplier - a.outlierMultiplier || b.views - a.views
      : b.views - a.views || b.outlierMultiplier - a.outlierMultiplier
  );

  const topOutlierVideo = [...filteredVideos].sort(
    (a, b) => b.outlierMultiplier - a.outlierMultiplier || b.views - a.views
  )[0];

  const displayLimit = state.insightsShowAllVideos ? 30 : 10;
  const topBurstVideos = filteredVideos.slice(0, displayLimit);

  const burstVideosHtml =
    topBurstVideos.length > 0
      ? topBurstVideos
          .map((v, idx) => {
            const vUrl = v.youtubeVideoId
              ? `https://www.youtube.com/watch?v=${encodeURIComponent(v.youtubeVideoId)}`
              : v.channelUrl || '#';
            const isHotOutlier = v.outlierMultiplier >= 1.5;
            const outlierBadge =
              v.outlierMultiplier >= 1.2
                ? `<span class="outlier-badge ${isHotOutlier ? 'outlier-hot' : ''} num" title="Video này có lượng view cao gấp ${v.outlierMultiplier} lần mức trung bình của kênh ${escapeHtml(v.channelName)}">${isHotOutlier ? '🔥 ' : ''}x${v.outlierMultiplier} TB kênh</span>`
                : '';
            const groupTag = v.group
              ? `<span class="burst-channel-group">${escapeHtml(v.group)}</span>`
              : '';
            const dateTag = v.publishedAt
              ? `<span class="top-video-date num">${escapeHtml(v.publishedAt)}</span>`
              : '';

            return `
              <div class="top-video-item burst-video-row top-video-rank-${idx < 3 ? idx + 1 : 'other'}">
                <span class="top-video-rank num">#${idx + 1}</span>
                <div class="burst-video-main">
                  <a href="${escapeHtml(vUrl)}" target="_blank" rel="noopener" class="top-video-title" title="${escapeHtml(v.title)}">
                    ${escapeHtml(v.title)} ↗
                  </a>
                  <div class="burst-video-sub">
                    <button type="button" class="burst-channel-badge burst-channel-btn" data-open-channel-deep="${escapeHtml(v.channelId)}" title="Bấm để mở Quản lý sâu kênh ${escapeHtml(v.channelName)}">📺 ${escapeHtml(v.channelName)}</button>
                    ${groupTag}
                    ${dateTag}
                  </div>
                </div>
                ${outlierBadge}
                <span class="top-video-views num">${formatNumber(v.views)} views</span>
                <button
                  type="button"
                  class="btn btn-secondary btn-xs btn-save-key"
                  data-save-burst-title="${escapeHtml(v.title)}"
                  data-save-burst-url="${escapeHtml(vUrl)}"
                  data-save-burst-channel="${escapeHtml(v.channelName)}"
                  data-save-burst-views="${escapeHtml(String(v.views))}"
                  data-save-burst-outlier="${escapeHtml(String(v.outlierMultiplier))}"
                  title="Lưu chủ đề (Key) video nổ view này sang Nơi lưu nội dung để làm video ăn theo"
                >+ Lưu Key</button>
              </div>
            `;
          })
          .join('')
      : `<div class="channel-top-videos-empty">Chưa có video nào khớp bộ lọc — bấm <strong>Đồng bộ</strong> trên kênh để quét danh sách video.</div>`;

  hubEl.innerHTML = `
    <!-- PHẦN 1: TÓM TẮT PHÂN TÍCH TOÀN HỆ THỐNG (EXECUTIVE OVERVIEW) -->
    <div class="home-exec-grid num">
      <div class="deep-kpi-card">
        <span class="deep-kpi-label">HỆ THỐNG KÊNH &amp; NHÓM</span>
        <strong class="deep-kpi-val">${formatNumber(state.channels.length)} kênh</strong>
        <span class="deep-kpi-sub">${grandMonetized} kênh Đã BKT · ${groupFolders.length} thư mục Nhóm</span>
      </div>
      <div class="deep-kpi-card deep-kpi-gold">
        <span class="deep-kpi-label">TỔNG LƯỢT XEM THỰC TẾ</span>
        <strong class="deep-kpi-val">${formatNumber(grandTotalViews)}</strong>
        <span class="deep-kpi-sub">TB ${formatNumber(Math.round(grandTotalViews / Math.max(state.channels.length, 1)))} views / kênh</span>
      </div>
      <div class="deep-kpi-card">
        <span class="deep-kpi-label">TỔNG SUB &amp; KHO VIDEO</span>
        <strong class="deep-kpi-val">${formatNumber(grandTotalSubs)} sub</strong>
        <span class="deep-kpi-sub">Đã quét ${formatNumber(grandTotalVideos)} video trên toàn dàn kênh</span>
      </div>
      <div class="deep-kpi-card">
        <span class="deep-kpi-label">KEY VIDEO NỔ MẠNH NHẤT</span>
        <strong class="deep-kpi-val" style="font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(topOutlierVideo ? topOutlierVideo.title : '')}">
          ${topOutlierVideo ? `🔥 x${topOutlierVideo.outlierMultiplier} TB kênh (${formatNumber(topOutlierVideo.views)} views)` : 'Chưa có dữ liệu'}
        </strong>
        <span class="deep-kpi-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${topOutlierVideo ? `${escapeHtml(topOutlierVideo.channelName)}: ${escapeHtml(topOutlierVideo.title)}` : 'Bấm Đồng bộ để quét'}
        </span>
      </div>
    </div>

    <!-- PHẦN 2: BẢNG THỐNG KÊ THEO NHÃN & BẢNG VIDEO NỔ VIEW CẢ DÀN KÊNH -->
    <div class="insights-hub-bar">
      <div class="insights-hub-title-group">
        <span class="insights-hub-badge">⚡ PHÂN TÍCH NHÃN &amp; BẢNG XẾP HẠNG VIDEO NỔ VIEW CẢ DÀN KÊNH</span>
        ${
          hasAnyActiveFilter
            ? `
              <button type="button" class="btn btn-danger-outline btn-xs" data-clear-all-yt-filters="true">✕ Bỏ lọc (Xem tất cả ${state.channels.length} kênh)</button>
              <button type="button" class="btn btn-secondary btn-xs" data-goto-tab="youtube">Mở thư mục Nhãn đang lọc →</button>
            `
            : `<span class="insights-hub-hint">Bấm vào từng Nhãn bên trái để lọc nhanh video · Bấm "+ Lưu Key" bên phải để lưu chủ đề ăn khách</span>`
        }
      </div>
    </div>

    <div class="insights-hub-grid">
      <!-- CỘT 1: THỐNG KÊ TỔNG HỢP THEO NHÃN -->
      <section class="insights-card">
        <div class="insights-card-header">
          <div>
            <h3 class="insights-card-title">📊 Thống kê tổng hợp theo Nhãn</h3>
            <p class="insights-card-sub">Cộng gộp Kênh, BKT, Sub &amp; Tổng Views theo từng nhóm</p>
          </div>
          <div class="insights-mode-tabs" role="tablist">
            <button type="button" class="insights-tab-btn ${labelMode === 'group' ? 'active' : ''}" data-set-label-mode="group">Theo Group</button>
            <button type="button" class="insights-tab-btn ${labelMode === 'category' ? 'active' : ''}" data-set-label-mode="category">Theo Ngách</button>
            <button type="button" class="insights-tab-btn ${labelMode === 'manager' ? 'active' : ''}" data-set-label-mode="manager">Theo Quản lý</button>
          </div>
        </div>
        <div class="label-stats-list">
          ${labelRowsHtml}
        </div>
      </section>

      <!-- CỘT 2: BẢNG TỔNG HỢP VIDEO NỔ VIEW CỦA CẢ DÀN KÊNH -->
      <section class="insights-card">
        <div class="insights-card-header">
          <div>
            <h3 class="insights-card-title">🔥 Bảng tổng hợp "Video Nổ View" cả dàn kênh</h3>
            <p class="insights-card-sub">Đã gom ${formatNumber(filteredVideos.length)} video từ ${formatNumber(state.channels.length)} kênh</p>
          </div>
          <div class="insights-mode-tabs" role="tablist">
            <button type="button" class="insights-tab-btn ${sortMode === 'views' ? 'active' : ''}" data-set-video-sort="views">Views cao nhất</button>
            <button type="button" class="insights-tab-btn ${sortMode === 'outlier' ? 'active' : ''}" data-set-video-sort="outlier">Độ nổ (xTB kênh)</button>
          </div>
        </div>
        <div class="channel-top-videos-list burst-videos-list">
          ${burstVideosHtml}
        </div>
        ${
          filteredVideos.length > 10
            ? `<div class="insights-card-footer">
                <button type="button" class="btn btn-ghost btn-xs" data-toggle-show-all-burst="true">
                  ${state.insightsShowAllVideos ? '▲ Thu gọn về Top 10' : `▼ Xem toàn bộ ${Math.min(filteredVideos.length, 30)} video`}
                </button>
              </div>`
            : ''
        }
      </section>
    </div>
  `;
}

function renderYoutubeTab() {
  renderGroupDropdown();
  renderCategoryDropdown();
  renderYoutubeInsightsHub();
  renderYoutubeChannelsBoard();
}

function parseStudioTextInBrowser(rawText = '') {
  const text = String(rawText || '').replace(/\r/g, '\n');
  const parseCompact = (raw = '') => {
    const s = String(raw || '').trim().replace(/^\+/, '');
    if (!s) return 0;
    const m = s.match(/^([\d.,]+)\s*(N|Tr|T|K|M|B)\b/i);
    if (m) {
      const val = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      if (Number.isNaN(val)) return 0;
      const u = m[2].toUpperCase();
      if (u === 'N' || u === 'K') return Math.round(val * 1000);
      if (u === 'TR' || u === 'M') return Math.round(val * 1000000);
      if (u === 'T' || u === 'B') return Math.round(val * 1000000000);
    }
    const digits = s.replace(/[^\d]/g, '');
    return digits ? Number(digits) : 0;
  };

  const out = {};
  const exactViews =
    text.match(/đã có\s+([\d.,]+)\s+lượt xem/i) ||
    text.match(/got\s+([\d.,]+)\s+views/i);
  if (exactViews) {
    out.totalViews = parseCompact(exactViews[1]);
  } else {
    const lblViews =
      text.match(/Lượt xem\s*\n+\s*([\d.,]+(?:\s*(?:N|Tr|K|M))?)/i) ||
      text.match(/Views\s*\n+\s*([\d.,]+(?:\s*(?:K|M|B))?)/i);
    if (lblViews) out.totalViews = parseCompact(lblViews[1]);
  }

  const watchMatch =
    text.match(/Thời gian xem\s*\(giờ\)\s*\n+\s*([\d.,]+(?:\s*(?:N|Tr|K|M))?)/i) ||
    text.match(/Watch time\s*\(hours\)\s*\n+\s*([\d.,]+(?:\s*(?:K|M|B))?)/i);
  if (watchMatch) out.watchHours = parseCompact(watchMatch[1]);

  const rtMatch =
    text.match(/(?:Thời gian thực|48 giờ qua)[\s\S]{0,120}?([\d.,]+(?:\s*(?:N|Tr|K|M))?)\s*lượt xem/i) ||
    text.match(/([\d.,]+)\s*lượt xem\s*\n+\s*(?:Trong 48 giờ|48 giờ qua)/i) ||
    text.match(/(?:Realtime|Last 48 hours)[\s\S]{0,120}?([\d.,]+)\s*views/i);
  if (rtMatch) out.realtimeViews48h = parseCompact(rtMatch[1]);

  const ctrMatch =
    text.match(/(?:Tỷ lệ nhấp|click-through rate|CTR)[^\n]*\n+\s*([\d.,]+)\s*%/i) ||
    text.match(/([\d.,]+)\s*%\s*\n+\s*(?:Tỷ lệ nhấp|Impressions click-through rate)/i);
  if (ctrMatch) {
    const c = parseFloat(ctrMatch[1].replace(',', '.'));
    if (!Number.isNaN(c)) out.ctrPercent = c;
  }

  const avdMatch = text.match(
    /(?:Thời lượng xem trung bình|Average view duration)[^\n]*\n+\s*(\d{1,2}:\d{2}(?::\d{2})?)/i
  );
  if (avdMatch) out.avgViewDuration = avdMatch[1];

  const revMatch = text.match(
    /(?:Doanh thu ước tính|Estimated revenue)[^\n]*\n+\s*([$₫€£]?[\d.,]+\s*(?:US\$|\$|₫|đ|VNĐ)?)/i
  );
  if (revMatch) out.estimatedRevenue = revMatch[1].trim();

  return out;
}

// =============================================================================
// ĐIỀU HƯỚNG TAB & SỰ KIỆN TƯƠNG TÁC
// =============================================================================
function switchTab(tabName) {
  if (!TAB_TITLES[tabName]) return;
  state.activeTab = tabName;

  document.querySelectorAll('.nav-btn, .m-nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${tabName}`);
  });

  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-subtitle');
  if (titleEl) titleEl.textContent = TAB_TITLES[tabName].title;
  if (subEl) subEl.textContent = TAB_TITLES[tabName].subtitle;

  renderSidebarFolderTree();
}

function setupEventListeners() {
  document.getElementById('side-nav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (btn) {
      if (btn.dataset.tab === 'youtube' && state.activeChannelDeepId) {
        state.activeChannelDeepId = null;
        renderYoutubeTab();
      }
      switchTab(btn.dataset.tab);
    }
  });

  document.getElementById('mobile-bottom-nav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (btn) {
      if (btn.dataset.tab === 'youtube' && state.activeChannelDeepId) {
        state.activeChannelDeepId = null;
        renderYoutubeTab();
      }
      switchTab(btn.dataset.tab);
    }
  });

  document.body.addEventListener('click', async (e) => {
    const dropdownEl = document.getElementById('yt-category-dropdown');
    const groupDropdownEl = document.getElementById('yt-group-dropdown');

    // Bấm nút mở/đóng ô cửa sổ trỏ xuống lọc Group
    const toggleGroupBtn = e.target.closest('[data-toggle-group-dropdown]');
    if (toggleGroupBtn && groupDropdownEl) {
      const nextOpen = !groupDropdownEl.classList.contains('open');
      groupDropdownEl.classList.toggle('open', nextOpen);
      if (dropdownEl) dropdownEl.classList.remove('open');
      toggleGroupBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
      return;
    }

    // Chọn 1 Group trong ô cửa sổ trỏ xuống
    const selectGroupBtn = e.target.closest('[data-select-group]');
    if (selectGroupBtn) {
      const targetGroup = selectGroupBtn.dataset.selectGroup || 'all';
      state.filters.ytGroup = targetGroup;
      state.activeChannelDeepId = null;
      if (groupDropdownEl) groupDropdownEl.classList.remove('open');
      renderYoutubeTab();
      return;
    }

    // Bấm nút mở/đóng ô cửa sổ trỏ xuống lọc danh mục
    const toggleCatBtn = e.target.closest('[data-toggle-cat-dropdown]');
    if (toggleCatBtn && dropdownEl) {
      const nextOpen = !dropdownEl.classList.contains('open');
      dropdownEl.classList.toggle('open', nextOpen);
      if (groupDropdownEl) groupDropdownEl.classList.remove('open');
      toggleCatBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
      return;
    }

    // Chọn 1 danh mục trong ô cửa sổ trỏ xuống
    const selectCatBtn = e.target.closest('[data-select-category]');
    if (selectCatBtn) {
      const targetCat = selectCatBtn.dataset.selectCategory || 'all';
      state.filters.ytCategory = targetCat;
      state.activeChannelDeepId = null;
      if (dropdownEl) dropdownEl.classList.remove('open');
      renderYoutubeTab();
      return;
    }

    // Đóng các ô cửa sổ trỏ xuống khi bấm ra ngoài
    if (dropdownEl && dropdownEl.classList.contains('open') && !e.target.closest('#yt-category-dropdown')) {
      dropdownEl.classList.remove('open');
    }
    if (groupDropdownEl && groupDropdownEl.classList.contains('open') && !e.target.closest('#yt-group-dropdown')) {
      groupDropdownEl.classList.remove('open');
    }

    const gotoTabBtn = e.target.closest('[data-goto-tab]');
    if (gotoTabBtn) {
      const targetTab = gotoTabBtn.dataset.gotoTab;
      if (targetTab === 'youtube') {
        state.activeChannelDeepId = null;
        renderYoutubeTab();
      }
      switchTab(targetTab);
      return;
    }

    // Mở Thư mục con (Nhóm Kênh) từ Trang chủ hoặc từ thanh Breadcrumb
    const openGroupFolderBtn = e.target.closest('[data-open-group-folder]');
    if (openGroupFolderBtn) {
      const targetGroup = openGroupFolderBtn.dataset.openGroupFolder || 'all';
      state.filters.ytGroup = targetGroup;
      state.filters.ytCategory = 'all';
      state.filters.ytManager = 'all';
      state.filters.ytChannel = 'all';
      state.activeChannelDeepId = null;
      renderYoutubeTab();
      switchTab('youtube');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Mở không gian Quản lý sâu của 1 Kênh riêng lẻ
    const openChannelDeepBtn = e.target.closest('[data-open-channel-deep]');
    if (openChannelDeepBtn) {
      const chId = openChannelDeepBtn.dataset.openChannelDeep;
      if (chId) {
        state.activeChannelDeepId = chId;
        renderYoutubeTab();
        switchTab('youtube');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    // Đóng chế độ Quản lý sâu Kênh riêng lẻ -> Quay về Thư mục Nhóm Kênh
    const closeChannelDeepBtn = e.target.closest('[data-close-channel-deep]');
    if (closeChannelDeepBtn) {
      state.activeChannelDeepId = null;
      renderYoutubeTab();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Đổi cách sắp xếp danh sách video trong chế độ Quản lý sâu 1 kênh
    const setDeepVideoSortBtn = e.target.closest('[data-set-deep-video-sort]');
    if (setDeepVideoSortBtn) {
      state.deepChannelVideoSort = setDeepVideoSortBtn.dataset.setDeepVideoSort || 'views';
      renderYoutubeTab();
      return;
    }

    // Bấm nút "🔒 Xem" trên ô Gà kết nối -> Mở hộp thoại nhập mật khẩu
    const unlockGaBtn = e.target.closest('[data-unlock-ga-id]');
    if (unlockGaBtn) {
      const chId = unlockGaBtn.dataset.unlockGaId;
      const ch = state.channels.find((c) => c.id === chId);
      const gaModal = document.getElementById('ga-unlock-modal');
      if (ch && gaModal) {
        const chIdInput = document.getElementById('ga-unlock-channel-id');
        if (chIdInput) chIdInput.value = ch.id;
        const descEl = document.getElementById('ga-unlock-modal-desc');
        if (descEl) {
          descEl.textContent = `Thông tin Gà kết nối của kênh "${ch.name}" đang được ẩn bảo mật. Vui lòng nhập mật khẩu để xem hoặc chỉnh sửa.`;
        }
        const passInput = document.getElementById('input-ga-unlock-password');
        if (passInput) passInput.value = '';
        const errEl = document.getElementById('ga-unlock-error');
        if (errEl) errEl.hidden = true;
        gaModal.hidden = false;
        setTimeout(() => {
          passInput?.focus();
        }, 50);
      }
      return;
    }

    // Bấm nút "🙈 Ẩn" trên ô Gà kết nối -> Ẩn lại ngay lập tức
    const lockGaBtn = e.target.closest('[data-lock-ga-id]');
    if (lockGaBtn) {
      const chId = lockGaBtn.dataset.lockGaId;
      if (chId && state.unlockedGaChannels) {
        state.unlockedGaChannels.delete(chId);
        renderYoutubeTab();
      }
      return;
    }

    // Bấm vào nhãn danh mục trên kênh để lọc nhanh
    const catFilterBtn = e.target.closest('[data-filter-category]');
    if (catFilterBtn) {
      const targetCat = catFilterBtn.dataset.filterCategory || 'all';
      state.filters.ytCategory =
        state.filters.ytCategory === targetCat && targetCat !== 'all' ? 'all' : targetCat;
      state.activeChannelDeepId = null;
      if (dropdownEl) dropdownEl.classList.remove('open');
      renderYoutubeTab();
      return;
    }

    // Chuyển tab chiều thống kê Nhãn (Theo Group | Theo Ngách | Theo Quản lý)
    const setLabelModeBtn = e.target.closest('[data-set-label-mode]');
    if (setLabelModeBtn) {
      state.insightsLabelMode = setLabelModeBtn.dataset.setLabelMode || 'group';
      renderYoutubeInsightsHub();
      return;
    }

    // Chuyển chế độ sắp xếp Bảng Video Nổ View (Views cao nhất | Độ nổ xTB kênh)
    const setVideoSortBtn = e.target.closest('[data-set-video-sort]');
    if (setVideoSortBtn) {
      state.insightsVideoSort = setVideoSortBtn.dataset.setVideoSort || 'views';
      renderYoutubeInsightsHub();
      return;
    }

    // Xem thêm / Thu gọn danh sách Video Nổ View
    const toggleBurstBtn = e.target.closest('[data-toggle-show-all-burst]');
    if (toggleBurstBtn) {
      state.insightsShowAllVideos = !state.insightsShowAllVideos;
      renderYoutubeInsightsHub();
      return;
    }

    // Thu gọn / Mở rộng toàn bộ khu vực Thống kê Nhãn & Video Nổ View
    const toggleCollapseBtn = e.target.closest('[data-toggle-insights-collapse]');
    if (toggleCollapseBtn) {
      state.insightsCollapsed = !state.insightsCollapsed;
      renderYoutubeInsightsHub();
      return;
    }

    // Bấm vào 1 hàng Nhãn (Group / Ngách / Quản lý) trong bảng thống kê để mở thư mục tương ứng
    const filterLabelBtn = e.target.closest('[data-filter-label-key]');
    if (filterLabelBtn) {
      const mode = filterLabelBtn.dataset.filterLabelMode || 'group';
      const key = filterLabelBtn.dataset.filterLabelKey || 'all';
      state.activeChannelDeepId = null;
      if (mode === 'category') {
        state.filters.ytCategory = state.filters.ytCategory === key ? 'all' : key;
      } else if (mode === 'manager') {
        state.filters.ytManager = state.filters.ytManager === key ? 'all' : key;
      } else {
        state.filters.ytGroup = state.filters.ytGroup === key ? 'all' : key;
      }
      renderYoutubeTab();
      switchTab('youtube');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Bấm nút "✕ Bỏ lọc" để xóa tất cả bộ lọc kênh YouTube
    const clearAllFiltersBtn = e.target.closest('[data-clear-all-yt-filters]');
    if (clearAllFiltersBtn) {
      state.filters.ytGroup = 'all';
      state.filters.ytCategory = 'all';
      state.filters.ytManager = 'all';
      state.filters.ytChannel = 'all';
      state.filters.ytSearch = '';
      state.activeChannelDeepId = null;
      const searchEl = document.getElementById('yt-search');
      if (searchEl) searchEl.value = '';
      const chSelectEl = document.getElementById('yt-channel-filter');
      if (chSelectEl) chSelectEl.value = 'all';
      renderYoutubeTab();
      return;
    }

    // Bấm nút "+ Lưu Key" trên Bảng Video Nổ View để lưu chủ đề ăn khách sang Nơi lưu nội dung
    const saveBurstBtn = e.target.closest('[data-save-burst-title]');
    if (saveBurstBtn) {
      const title = saveBurstBtn.dataset.saveBurstTitle || 'Video Nổ View';
      const url = saveBurstBtn.dataset.saveBurstUrl || '';
      const channelName = saveBurstBtn.dataset.saveBurstChannel || '';
      const views = Number(saveBurstBtn.dataset.saveBurstViews) || 0;
      const outlier = saveBurstBtn.dataset.saveBurstOutlier || '1';
      const origText = saveBurstBtn.textContent;
      saveBurstBtn.disabled = true;
      saveBurstBtn.textContent = 'Đang lưu...';
      try {
        const created = await apiRequest('/api/contents', {
          method: 'POST',
          body: JSON.stringify({
            title: `[Key Nổ View] ${title}`,
            type: 'outline',
            author: channelName || 'StudioFlow',
            assetUrl: url,
            tags: `Key nổ view, ${channelName}, x${outlier} TB kênh`,
            status: 'approved',
            body: `🔥 KEY VIDEO NỔ VIEW TRÊN DÀN KÊNH\n- Tiêu đề gốc: ${title}\n- Kênh: ${channelName}\n- Lượt xem thực tế: ${formatNumber(views)} views (Độ nổ: gấp x${outlier} lần trung bình kênh)\n- Link video gốc: ${url}\n\n💡 Gợi ý triển khai:\n1. Phân tích Hook 30s đầu và cấu trúc tiêu đề/thumbnail của video này.\n2. Nhân bản chủ đề (Clone Key) hoặc cắt Shorts cho các kênh cùng ngách.`,
          }),
        });
        state.selectedContentId = created.id;
        await loadOverview();
        saveBurstBtn.textContent = '✓ Đã lưu Key';
        showBanner(`Đã lưu Key "${title}" vào Nơi lưu nội dung!`);
      } catch (err) {
        showBanner(err.message, true);
        saveBurstBtn.disabled = false;
        saveBurstBtn.textContent = origText;
      }
      return;
    }

    // Mở hộp thoại Truy cập sâu YouTube Studio cho kênh
    const openStudioDeepBtn = e.target.closest('[data-open-studio-deep]');
    if (openStudioDeepBtn) {
      const chId = openStudioDeepBtn.dataset.openStudioDeep;
      const ch = state.channels.find((c) => c.id === chId);
      const modal = document.getElementById('studio-deep-modal');
      if (ch && modal) {
        document.getElementById('studio-deep-channel-id').value = ch.id;
        document.getElementById('studio-deep-channel-name').textContent = `${ch.name} (${ch.handle})`;
        document.getElementById('input-studio-raw-text').value = '';
        document.getElementById('deep-input-views').value = ch.totalViews || '';
        document.getElementById('deep-input-watch-hours').value = ch.watchHours || '';
        document.getElementById('deep-input-realtime-48h').value = ch.realtimeViews48h || '';
        document.getElementById('deep-input-ctr').value = ch.ctrPercent || '';
        document.getElementById('deep-input-avd').value = ch.avgViewDuration || '';
        document.getElementById('deep-input-revenue').value = ch.estimatedRevenue || '';

        const bookmarkletEl = document.getElementById('bookmarklet-studio-sync');
        if (bookmarkletEl) {
          const origin = window.location.origin;
          const token = getStoredAuthToken();
          const bmCode = `javascript:(function(){const t=document.body.innerText;fetch('${origin}/api/youtube/studio-ingest',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':'${token}'},body:JSON.stringify({channelId:'${ch.id}',rawStudioText:t})}).then(r=>r.json()).then(d=>{if(d.error)alert(d.error);else alert('Đã hút chỉ số YouTube Studio về StudioFlow cho kênh: '+d.name);}).catch(e=>alert('Lỗi kết nối: '+e.message));})();`;
          bookmarkletEl.setAttribute('href', bmCode);
        }

        modal.hidden = false;
        setTimeout(() => {
          document.getElementById('input-studio-raw-text')?.focus();
        }, 60);
      }
      return;
    }

    // Đồng bộ lại thông tin kênh & video từ YouTube
    const syncChBtn = e.target.closest('[data-sync-channel-id]');
    if (syncChBtn) {
      const chId = syncChBtn.dataset.syncChannelId;
      const origText = syncChBtn.textContent;
      syncChBtn.disabled = true;
      syncChBtn.textContent = 'Đang quét...';
      try {
        const res = await apiRequest(`/api/youtube/channels/${encodeURIComponent(chId)}/sync`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        await loadOverview();
        const scannedCount = res.scannedVideosCount || (res.topVideos ? res.topVideos.length : 0);
        const topCount = Array.isArray(res.topVideos) ? res.topVideos.length : 0;
        showBanner(
          `Đã quét ${scannedCount} video của kênh "${res.channel.name}" & liệt kê Top ${topCount} video nhiều view nhất!`
        );
      } catch (err) {
        showBanner(err.message, true);
      } finally {
        syncChBtn.disabled = false;
        syncChBtn.textContent = origText;
      }
      return;
    }

    // Xóa kênh YouTube khỏi hệ thống
    const deleteChBtn = e.target.closest('[data-delete-channel-id]');
    if (deleteChBtn) {
      const chId = deleteChBtn.dataset.deleteChannelId;
      deleteChBtn.disabled = true;
      try {
        const res = await apiRequest(`/api/youtube/channels/${encodeURIComponent(chId)}`, {
          method: 'DELETE',
        });
        if (state.filters.ytChannel === chId) {
          state.filters.ytChannel = 'all';
        }
        if (state.activeChannelDeepId === chId) {
          state.activeChannelDeepId = null;
        }
        await loadOverview();
        showBanner(`Đã xóa kênh "${res.deletedChannelName || chId}" khỏi hệ thống.`);
      } catch (err) {
        showBanner(err.message, true);
        deleteChBtn.disabled = false;
      }
      return;
    }

    // Đẩy / Đồng bộ thủ công 1 nội dung lên Notion
    const syncNotionBtn = e.target.closest('[data-sync-notion-id]');
    if (syncNotionBtn) {
      const contentId = syncNotionBtn.dataset.syncNotionId;
      const origText = syncNotionBtn.textContent;
      syncNotionBtn.disabled = true;
      syncNotionBtn.textContent = 'Đang đẩy Notion...';
      try {
        await apiRequest(`/api/contents/${encodeURIComponent(contentId)}/sync-notion`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        await loadOverview();
        showBanner('Đã tự động tạo / cập nhật bài viết lên trang Notion thành công!');
      } catch (err) {
        showBanner(err.message, true);
      } finally {
        syncNotionBtn.disabled = false;
        syncNotionBtn.textContent = origText;
      }
      return;
    }

    // Xóa nội dung lưu trữ
    const deleteContentBtn = e.target.closest('[data-delete-content-id]');
    if (deleteContentBtn) {
      const contentId = deleteContentBtn.dataset.deleteContentId;
      deleteContentBtn.disabled = true;
      try {
        const res = await apiRequest(`/api/contents/${encodeURIComponent(contentId)}`, {
          method: 'DELETE',
        });
        state.selectedContentId = null;
        await loadOverview();
        showBanner(`Đã xóa nội dung "${res.deletedTitle || contentId}".`);
      } catch (err) {
        showBanner(err.message, true);
        deleteContentBtn.disabled = false;
      }
      return;
    }

    // Chọn nội dung trong Content Vault
    const selectContentCard = e.target.closest('[data-select-content]');
    if (selectContentCard) {
      state.selectedContentId = selectContentCard.dataset.selectContent;
      renderContentsTab();
      return;
    }
  });

  // Thay đổi trực tiếp trạng thái BKT, Group, Ngày đầu đăng video, Giờ xem Studio, hoặc Người / Mail quản lý kênh
  document.body.addEventListener('change', async (e) => {
    const bktSelect = e.target.closest('[data-channel-bkt-select]');
    if (bktSelect) {
      const chId = bktSelect.dataset.channelBktSelect;
      const nextStatus = bktSelect.value;
      const nextMonetization =
        nextStatus === 'monetized'
          ? 'enabled'
          : nextStatus === 'demonetized'
          ? 'disabled'
          : 'pending';
      try {
        const updated = await apiRequest(`/api/youtube/channels/${encodeURIComponent(chId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: nextStatus,
            monetization: nextMonetization,
          }),
        });
        await loadOverview();
        showBanner(`Đã cập nhật trạng thái kênh "${updated.name}"!`);
      } catch (err) {
        showBanner(err.message, true);
      }
      return;
    }

    const groupInput = e.target.closest('[data-channel-group]');
    if (groupInput) {
      const chId = groupInput.dataset.channelGroup;
      const val = groupInput.value.trim();
      try {
        const updated = await apiRequest(`/api/youtube/channels/${encodeURIComponent(chId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            group: val,
          }),
        });
        await loadOverview();
        showBanner(
          val
            ? `Đã gán kênh "${updated.name}" vào Group "${val}"!`
            : `Đã gỡ Group của kênh "${updated.name}".`
        );
      } catch (err) {
        showBanner(err.message, true);
      }
      return;
    }

    const firstDateInput = e.target.closest('[data-channel-first-date]');
    if (firstDateInput) {
      const chId = firstDateInput.dataset.channelFirstDate;
      try {
        const updated = await apiRequest(`/api/youtube/channels/${encodeURIComponent(chId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            firstVideoDate: firstDateInput.value,
          }),
        });
        await loadOverview();
        showBanner(`Đã lưu ngày đầu đăng video của kênh "${updated.name}"!`);
      } catch (err) {
        showBanner(err.message, true);
      }
      return;
    }

    const watchHoursInput = e.target.closest('[data-channel-watch-hours]');
    if (watchHoursInput) {
      const chId = watchHoursInput.dataset.channelWatchHours;
      const watchHours = Number(watchHoursInput.value) || 0;
      try {
        const updated = await apiRequest(`/api/youtube/channels/${encodeURIComponent(chId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            watchHours,
          }),
        });
        await loadOverview();
        showBanner(`Đã lưu Giờ xem Studio (${formatNumber(watchHours)}h) cho kênh "${updated.name}"!`);
      } catch (err) {
        showBanner(err.message, true);
      }
      return;
    }

    const managerMailInput = e.target.closest('[data-channel-manager-mail]');
    if (managerMailInput) {
      const chId = managerMailInput.dataset.channelManagerMail;
      const val = managerMailInput.value.trim();
      try {
        const updated = await apiRequest(`/api/youtube/channels/${encodeURIComponent(chId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            managerEmail: val,
            manager: val,
          }),
        });
        await loadOverview();
        showBanner(`Đã lưu Người / Mail quản lý cho kênh "${updated.name}"!`);
      } catch (err) {
        showBanner(err.message, true);
      }
      return;
    }

    const statusNoteInput = e.target.closest('[data-channel-status-note]');
    if (statusNoteInput) {
      const chId = statusNoteInput.dataset.channelStatusNote;
      const val = statusNoteInput.value.trim();
      try {
        const updated = await apiRequest(`/api/youtube/channels/${encodeURIComponent(chId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            statusNote: val,
          }),
        });
        await loadOverview();
        showBanner(`Đã lưu ghi chú quản lý sâu cho kênh "${updated.name}"!`);
      } catch (err) {
        showBanner(err.message, true);
      }
      return;
    }

    const gaInput = e.target.closest('[data-channel-ga]');
    if (gaInput) {
      const chId = gaInput.dataset.channelGa;
      const val = gaInput.value.trim();
      try {
        const updated = await apiRequest(`/api/youtube/channels/${encodeURIComponent(chId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            adsenseAccount: val,
          }),
        });
        await loadOverview();
        showBanner(`Đã lưu thông tin Gà kết nối cho kênh "${updated.name}"!`);
      } catch (err) {
        showBanner(err.message, true);
      }
    }
  });

  // Chuyển đổi chế độ hiển thị: Bản Web <-> Bản App điện thoại
  const wrapper = document.getElementById('platform-wrapper');
  const btnWeb = document.getElementById('btn-view-web');
  const btnApp = document.getElementById('btn-view-app');

  btnWeb?.addEventListener('click', () => {
    wrapper.classList.remove('mode-app');
    wrapper.classList.add('mode-web');
    btnWeb.classList.add('active');
    btnApp.classList.remove('active');
  });

  btnApp?.addEventListener('click', () => {
    wrapper.classList.remove('mode-web');
    wrapper.classList.add('mode-app');
    btnApp.classList.add('active');
    btnWeb.classList.remove('active');
  });

  // Đồng bộ & Auto Reset chỉ số lượt xem (Tự động 1 tiếng / lần hoặc bấm thủ công)
  let isHourlySyncRunning = false;
  async function triggerDailySync(customDate, { isAutoHourly = false } = {}) {
    if (isHourlySyncRunning) return;
    isHourlySyncRunning = true;
    const textEl = document.getElementById('hourly-sync-text');
    if (textEl) textEl.textContent = '🔄 Đang cập nhật...';
    try {
      const date = customDate || getTodayStr();
      if (isAutoHourly && state.unlockedGaChannels) {
        // Tự động khóa ẩn lại thông tin Gà kết nối sau mỗi chu kỳ 1 tiếng
        state.unlockedGaChannels.clear();
      }
      const res = await apiRequest('/api/youtube/sync-daily', {
        method: 'POST',
        body: JSON.stringify({ date }),
      });
      await loadOverview();
      showBanner(
        isAutoHourly
          ? `⏱️ Đã tự động reset & cập nhật chỉ số định kỳ 1 tiếng/lần (${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})!`
          : `Đã đồng bộ & cập nhật chỉ số mới nhất cho toàn bộ dàn kênh!`
      );
    } catch (err) {
      showBanner(err.message, true);
      updateHourlySyncBadge();
    } finally {
      isHourlySyncRunning = false;
    }
  }

  document.getElementById('btn-yt-sync-all')?.addEventListener('click', () => triggerDailySync(getTodayStr()));
  document.getElementById('btn-hourly-auto-sync')?.addEventListener('click', () => triggerDailySync(getTodayStr()));

  // Bộ đếm tự động reset & cập nhật 1 tiếng 1 lần (60 phút)
  setInterval(() => {
    if (!state.summary) return;
    const lastSyncIso = state.summary?.meta?.lastDailySyncAt;
    const lastSyncMs = lastSyncIso ? new Date(lastSyncIso).getTime() : Date.now();
    const elapsedMs = Date.now() - (Number.isFinite(lastSyncMs) ? lastSyncMs : Date.now());
    if (elapsedMs >= 60 * 60 * 1000) {
      triggerDailySync(getTodayStr(), { isAutoHourly: true });
    } else {
      updateHourlySyncBadge();
    }
  }, 20 * 1000);

  // Mở/đóng Form Nội dung, Form Cấu hình Notion, Hộp thoại Mật khẩu Web & Hộp thoại Studio sâu
  const contentForm = document.getElementById('form-create-content');
  const notionConfigForm = document.getElementById('form-notion-config');
  const passwordModal = document.getElementById('password-settings-modal');
  const studioDeepModal = document.getElementById('studio-deep-modal');
  const gaUnlockModal = document.getElementById('ga-unlock-modal');

  document.getElementById('btn-close-studio-deep')?.addEventListener('click', () => {
    if (studioDeepModal) studioDeepModal.hidden = true;
  });

  document.getElementById('btn-close-ga-modal')?.addEventListener('click', () => {
    if (gaUnlockModal) gaUnlockModal.hidden = true;
  });
  document.getElementById('btn-cancel-ga-modal')?.addEventListener('click', () => {
    if (gaUnlockModal) gaUnlockModal.hidden = true;
  });

  document.getElementById('input-studio-raw-text')?.addEventListener('input', (e) => {
    const parsed = parseStudioTextInBrowser(e.target.value);
    if (parsed.totalViews !== undefined) {
      document.getElementById('deep-input-views').value = parsed.totalViews;
    }
    if (parsed.watchHours !== undefined) {
      document.getElementById('deep-input-watch-hours').value = parsed.watchHours;
    }
    if (parsed.realtimeViews48h !== undefined) {
      document.getElementById('deep-input-realtime-48h').value = parsed.realtimeViews48h;
    }
    if (parsed.ctrPercent !== undefined) {
      document.getElementById('deep-input-ctr').value = parsed.ctrPercent;
    }
    if (parsed.avgViewDuration !== undefined) {
      document.getElementById('deep-input-avd').value = parsed.avgViewDuration;
    }
    if (parsed.estimatedRevenue !== undefined) {
      document.getElementById('deep-input-revenue').value = parsed.estimatedRevenue;
    }
  });

  document.getElementById('btn-toggle-content-form')?.addEventListener('click', () => {
    if (contentForm) contentForm.hidden = !contentForm.hidden;
  });
  document.getElementById('btn-cancel-content')?.addEventListener('click', () => {
    if (contentForm) contentForm.hidden = true;
  });
  document.getElementById('btn-toggle-notion-config')?.addEventListener('click', () => {
    if (notionConfigForm) notionConfigForm.hidden = !notionConfigForm.hidden;
  });
  document.getElementById('btn-cancel-notion-config')?.addEventListener('click', () => {
    if (notionConfigForm) notionConfigForm.hidden = true;
  });

  const sidebarSettingsWrap = document.getElementById('sidebar-settings-wrap');
  const sidebarSettingsMenu = document.getElementById('sidebar-settings-menu');
  const sidebarSettingsToggle = document.getElementById('btn-sidebar-settings-toggle');

  function closeSidebarSettingsMenu() {
    if (sidebarSettingsMenu) sidebarSettingsMenu.hidden = true;
    sidebarSettingsWrap?.classList.remove('open');
    sidebarSettingsToggle?.setAttribute('aria-expanded', 'false');
  }

  sidebarSettingsToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!sidebarSettingsMenu) return;
    const willOpen = sidebarSettingsMenu.hidden;
    sidebarSettingsMenu.hidden = !willOpen;
    sidebarSettingsWrap?.classList.toggle('open', willOpen);
    sidebarSettingsToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (sidebarSettingsMenu && !sidebarSettingsMenu.hidden && !e.target.closest('#sidebar-settings-wrap')) {
      closeSidebarSettingsMenu();
    }
  });

  document.getElementById('btn-password-settings')?.addEventListener('click', () => {
    closeSidebarSettingsMenu();
    if (passwordModal) {
      updatePasswordUiState();
      passwordModal.hidden = false;
      setTimeout(() => {
        document.getElementById('input-new-password')?.focus();
      }, 60);
    }
  });

  document.getElementById('btn-close-password-modal')?.addEventListener('click', () => {
    if (passwordModal) passwordModal.hidden = true;
  });

  function lockAndLogout() {
    closeSidebarSettingsMenu();
    setStoredAuthToken('');
    document.cookie = 'studioflow_auth=; Path=/; Max-Age=0';
    if (state.unlockedGaChannels) state.unlockedGaChannels.clear();
    if (passwordModal) passwordModal.hidden = true;
    if (gaUnlockModal) gaUnlockModal.hidden = true;
    showAuthLockOverlay(true);
  }

  document.getElementById('btn-lock-now')?.addEventListener('click', lockAndLogout);
  document.getElementById('btn-logout-header')?.addEventListener('click', lockAndLogout);

  document.getElementById('btn-disable-password')?.addEventListener('click', async () => {
    try {
      const form = document.getElementById('form-password-settings');
      const currentPassword = form?.querySelector('[name="currentPassword"]')?.value || '';
      await apiRequest('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          disableLock: true,
        }),
      });
      setStoredAuthToken('');
      state.passwordEnabled = false;
      updatePasswordUiState();
      if (passwordModal) passwordModal.hidden = true;
      showBanner('Đã tắt khóa mật khẩu Web.');
    } catch (err) {
      showBanner(err.message, true);
    }
  });

  // Bộ lọc tìm kiếm
  document.getElementById('content-search')?.addEventListener('input', (e) => {
    state.filters.contentSearch = e.target.value;
    renderContentsTab();
  });
  document.getElementById('content-type-filter')?.addEventListener('change', (e) => {
    state.filters.contentType = e.target.value;
    renderContentsTab();
  });
  document.getElementById('yt-search')?.addEventListener('input', (e) => {
    state.filters.ytSearch = e.target.value;
    renderYoutubeTab();
  });
  document.getElementById('yt-channel-filter')?.addEventListener('change', (e) => {
    state.filters.ytChannel = e.target.value;
    renderYoutubeTab();
  });
  document.getElementById('yt-category-filter')?.addEventListener('change', (e) => {
    state.filters.ytCategory = e.target.value;
    renderYoutubeTab();
  });

  // Xử lý tất cả các Form Submit
  document.body.addEventListener('submit', async (e) => {
    const form = e.target;

    if (form.id === 'form-ga-unlock') {
      e.preventDefault();
      const errEl = document.getElementById('ga-unlock-error');
      if (errEl) errEl.hidden = true;
      try {
        const fd = new FormData(form);
        const password = fd.get('password') || '';
        const targetChId = fd.get('channelId') || '';
        const unlockAll = document.getElementById('checkbox-ga-unlock-all')?.checked;
        await apiRequest('/api/auth/verify-ga', {
          method: 'POST',
          body: JSON.stringify({ password }),
        });
        if (!state.unlockedGaChannels) state.unlockedGaChannels = new Set();
        if (unlockAll) {
          for (const ch of state.channels) {
            state.unlockedGaChannels.add(ch.id);
          }
        } else if (targetChId) {
          state.unlockedGaChannels.add(targetChId);
        }
        form.reset();
        if (gaUnlockModal) gaUnlockModal.hidden = true;
        renderYoutubeTab();
        setTimeout(() => {
          if (targetChId) {
            const gaInputEl = document.querySelector(`[data-channel-ga="${CSS.escape(targetChId)}"]`);
            gaInputEl?.focus();
          }
        }, 50);
        showBanner('Đã mở khóa hiển thị thông tin Gà kết nối!');
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message;
          errEl.hidden = false;
        } else {
          showBanner(err.message, true);
        }
      }
      return;
    }

    if (form.id === 'form-studio-deep') {
      e.preventDefault();
      try {
        const fd = new FormData(form);
        const payload = Object.fromEntries(fd.entries());
        const res = await apiRequest('/api/youtube/studio-ingest', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (studioDeepModal) studioDeepModal.hidden = true;
        await loadOverview();
        showBanner(`Đã cập nhật chỉ số sâu từ YouTube Studio cho kênh "${res.name}"!`);
      } catch (err) {
        showBanner(err.message, true);
      }
      return;
    }

    if (form.id === 'form-auth-login') {
      e.preventDefault();
      const errEl = document.getElementById('auth-login-error');
      if (errEl) errEl.hidden = true;
      try {
        const fd = new FormData(form);
        const password = fd.get('password') || '';
        const res = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ password }),
        });
        setStoredAuthToken(res.token || '');
        form.reset();
        showAuthLockOverlay(false);
        await loadOverview();
        showBanner('Đã mở khóa truy cập thành công!');
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message;
          errEl.hidden = false;
        } else {
          showBanner(err.message, true);
        }
      }
      return;
    }

    if (form.id === 'form-password-settings') {
      e.preventDefault();
      try {
        const fd = new FormData(form);
        const payload = Object.fromEntries(fd.entries());
        const res = await apiRequest('/api/auth/password', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setStoredAuthToken(res.token || '');
        state.passwordEnabled = Boolean(res.passwordEnabled);
        updatePasswordUiState();
        form.reset();
        if (passwordModal) passwordModal.hidden = true;
        showBanner('Đã cài đặt mật khẩu khóa bảo mật Web thành công!');
      } catch (err) {
        showBanner(err.message, true);
      }
      return;
    }

    if (form.id === 'form-notion-config') {
      e.preventDefault();
      try {
        const fd = new FormData(form);
        const payload = Object.fromEntries(fd.entries());
        payload.autoSync = form.querySelector('[name="autoSync"]')?.checked ?? true;
        await apiRequest('/api/settings/notion', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        form.hidden = true;
        await loadOverview();
        showBanner('Đã lưu cấu hình kết nối Notion tự động!');
      } catch (err) {
        showBanner(err.message, true);
      }
      return;
    }

    if (form.id === 'form-create-content') {
      e.preventDefault();
      try {
        const fd = new FormData(form);
        const payload = Object.fromEntries(fd.entries());
        const created = await apiRequest('/api/contents', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        state.selectedContentId = created.id;
        form.reset();
        form.hidden = true;
        await loadOverview();
        if (created.notionSynced) {
          showBanner('Đã lưu nội dung lên Web & Tự động tạo bài viết trên Notion!');
        } else if (created.notionSyncError) {
          showBanner(`Đã lưu trên Web (Lỗi đồng bộ Notion: ${created.notionSyncError})`, true);
        } else {
          showBanner('Đã lưu nội dung mới vào Kho lưu trữ');
        }
      } catch (err) {
        showBanner(err.message, true);
      }
      return;
    }

    if (form.id === 'form-edit-content') {
      e.preventDefault();
      try {
        const contentId = form.dataset.contentId;
        const fd = new FormData(form);
        const payload = Object.fromEntries(fd.entries());
        const updated = await apiRequest(`/api/contents/${encodeURIComponent(contentId)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        await loadOverview();
        if (updated.notionSynced) {
          showBanner('Đã lưu cập nhật nội dung trên Web & Tự động cập nhật bài Notion!');
        } else if (updated.notionSyncError) {
          showBanner(`Đã lưu trên Web (Lỗi cập nhật Notion: ${updated.notionSyncError})`, true);
        } else {
          showBanner('Đã lưu cập nhật nội dung');
        }
      } catch (err) {
        showBanner(err.message, true);
      }
      return;
    }

    if (form.id === 'form-create-channel') {
      e.preventDefault();
      const submitBtn = document.getElementById('btn-submit-channel');
      const origText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang chạy dữ liệu...';
      }
      try {
        const fd = new FormData(form);
        const payload = Object.fromEntries(fd.entries());
        const created = await apiRequest('/api/youtube/channels', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        form.reset();
        state.filters.ytChannel = 'all';
        await loadOverview();
        const scannedCount = created.scannedVideosCount || created.importedVideosCount || 0;
        const topCount = Array.isArray(created.topVideos) ? created.topVideos.length : 0;
        showBanner(
          `Đã quét kênh "${created.name}" (${created.handle} · ${scannedCount} video) & liệt kê Top ${topCount} video nhiều view nhất!`
        );
      } catch (err) {
        showBanner(err.message, true);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = origText;
        }
      }
      return;
    }

    if (form.matches('[data-update-channel-id]')) {
      e.preventDefault();
      try {
        const channelId = form.dataset.updateChannelId;
        const fd = new FormData(form);
        const payload = Object.fromEntries(fd.entries());
        payload.subscribers = Number(payload.subscribers) || 0;
        payload.strikeCount = Number(payload.strikeCount) || 0;
        const updated = await apiRequest(`/api/youtube/channels/${encodeURIComponent(channelId)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        await loadOverview();
        showBanner(`Đã lưu tình trạng kênh "${updated.name}"!`);
      } catch (err) {
        showBanner(err.message, true);
      }
      return;
    }
  });
}

// Đăng ký Service Worker cho Mobile App (PWA) & dọn cache cũ tránh lỗi hiển thị CSS
if ('caches' in window) {
  caches.keys().then((keys) => {
    keys.forEach((k) => caches.delete(k));
  }).catch(() => {});
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js?v=20', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch(() => {});
  });
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

document.getElementById('btn-install-pwa')?.addEventListener('click', async () => {
  const menuEl = document.getElementById('sidebar-settings-menu');
  if (menuEl) menuEl.hidden = true;
  document.getElementById('sidebar-settings-wrap')?.classList.remove('open');
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  } else {
    showBanner('Ứng dụng đã được cài đặt hoặc anh có thể chọn "Cài đặt ứng dụng / Thêm vào màn hình chính" trên trình duyệt!');
  }
});

setupEventListeners();
loadOverview().catch((err) => showBanner(err.message, true));
