const state = {
  summary: null,
  currentUser: null,
  users: [],
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
  expandedAppChannels: new Set(),
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
  groups: [],
  showCreateGroupBox: false,
  draftNewGroupName: '',
  draftSelectedGroupChannelIds: new Set(),
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
  users: {
    title: 'Trang Quản Lý User Gmail & Cấp Quyền Tách Riêng',
    subtitle: 'Quản lý danh sách thành viên đăng nhập bằng Gmail, cấu hình Không gian làm việc tách riêng và phân quyền theo Group / Kênh',
  },
  brand: {
    title: 'Bộ Nhận Diện Thương Hiệu & Thông Tin Thương Mại',
    subtitle: 'Hệ thống nhận diện Mệnh Kim Tương Lai (Futuristic Enterprise Edition), thông số bản quyền và cấu hình thương mại',
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
const SAVED_GMAILS_KEY = 'studioflow_saved_gmails_v1';
const LAST_GMAIL_KEY = 'studioflow_last_gmail_v1';

function getSavedGmails() {
  try {
    const raw = localStorage.getItem(SAVED_GMAILS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((g) => String(g || '').trim().toLowerCase()).filter((g) => g && g.includes('@'))
      : [];
  } catch {
    return [];
  }
}

function rememberGmailLogin(email = '') {
  try {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean || clean === 'admin' || !clean.includes('@')) return;
    localStorage.setItem(LAST_GMAIL_KEY, clean);
    const list = getSavedGmails().filter((g) => g !== clean);
    list.unshift(clean);
    localStorage.setItem(SAVED_GMAILS_KEY, JSON.stringify(list.slice(0, 6)));
  } catch {}
}

function renderSavedGmailsBox(forceOpen = false) {
  const boxEl = document.getElementById('auth-saved-gmails-box');
  if (!boxEl) return;
  const saved = getSavedGmails();
  if (!forceOpen || saved.length === 0) {
    boxEl.hidden = true;
    boxEl.innerHTML = '';
    return;
  }
  boxEl.hidden = false;
  boxEl.innerHTML = `
    <div class="google-chooser-head">Choose a Google account</div>
    <div class="saved-gmails-chips">
      ${saved
        .map((email) => {
          const initial = (email[0] || 'G').toUpperCase();
          return `
            <button type="button" class="saved-gmail-chip" data-pick-saved-gmail="${escapeHtml(email)}">
              <span class="saved-gmail-avatar">${escapeHtml(initial)}</span>
              <span class="saved-gmail-text">${escapeHtml(email)}</span>
            </button>
          `;
        })
        .join('')}
    </div>
  `;
}

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

function switchAuthOverlayTab(tabName = 'login') {
  const isAdminTab = tabName === 'admin';
  const userInp = document.getElementById('input-auth-username');
  const passStep = document.getElementById('auth-password-step');
  const passInp = document.getElementById('input-auth-login-pass');
  const submitBtn = document.getElementById('btn-auth-login-submit');
  const errEl = document.getElementById('auth-login-error');
  if (errEl) errEl.hidden = true;

  renderSavedGmailsBox(false);

  if (isAdminTab) {
    if (userInp) {
      userInp.value = 'admin';
      userInp.placeholder = 'Enter your email';
    }
    if (passStep) passStep.hidden = false;
    if (passInp) passInp.placeholder = 'Enter Admin password...';
    if (submitBtn) submitBtn.textContent = 'Continue as Admin';
    setTimeout(() => passInp?.focus(), 40);
  } else {
    if (userInp) {
      if (userInp.value.trim().toLowerCase() === 'admin') {
        userInp.value = '';
      }
      userInp.placeholder = 'Enter your email';
    }
    if (passStep) passStep.hidden = true;
    if (passInp) passInp.value = '';
    if (submitBtn) submitBtn.textContent = 'Continue with email';
    setTimeout(() => userInp?.focus(), 40);
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
    switchAuthOverlayTab('login');
  }
}

function isAdminUser() {
  return !state.currentUser || state.currentUser.role === 'admin';
}

function renderCurrentUserSidebarPill() {
  const user = state.currentUser || {
    name: 'Admin',
    email: 'admin',
    role: 'admin',
    scopeMode: 'all',
  };
  const isAdmin = user.role === 'admin';
  const avatarEl = document.getElementById('sidebar-user-avatar');
  const nameEl = document.getElementById('sidebar-user-name');
  const scopeEl = document.getElementById('sidebar-user-scope');
  const pillEl = document.getElementById('sidebar-current-user-pill');

  const initial = String(user.name || user.email || 'A')
    .trim()
    .charAt(0)
    .toUpperCase();
  if (avatarEl) {
    avatarEl.textContent = initial || 'U';
    avatarEl.classList.toggle('is-member', !isAdmin);
  }
  if (nameEl) {
    nameEl.textContent = isAdmin ? 'Admin' : user.name || user.email;
  }
  if (scopeEl) {
    if (isAdmin) {
      scopeEl.textContent = '👑 Toàn quyền Admin';
    } else if (user.scopeMode === 'all') {
      scopeEl.textContent = `🌐 ${user.email}`;
    } else if (user.scopeMode === 'assigned') {
      scopeEl.textContent = `📂 Kênh được giao`;
    } else {
      scopeEl.textContent = `🔒 Không gian riêng`;
    }
  }
  if (pillEl) {
    pillEl.title = isAdmin
      ? 'Tài khoản Quản trị viên (Admin Toàn quyền)'
      : `Tài khoản Gmail: ${user.email} — Chế độ: ${
          user.scopeMode === 'isolated'
            ? 'Không gian làm việc tách riêng'
            : user.scopeMode === 'assigned'
            ? 'Chỉ xem Group/Kênh được Admin giao'
            : 'Toàn hệ thống'
        }`;
  }

  const navUsersBtn = document.getElementById('nav-btn-users');
  const mobileUsersBtn = document.getElementById('m-nav-btn-users');
  const navUsersCount = document.getElementById('nav-count-users');
  const mgrBtn = document.getElementById('btn-open-users-manager');
  const settingsMgrBtn = document.getElementById('btn-settings-users-manager');
  const pendingBadge = document.getElementById('badge-pending-users');
  const pwdBtn = document.getElementById('btn-password-settings');

  if (navUsersBtn) navUsersBtn.hidden = !isAdmin;
  if (mobileUsersBtn) mobileUsersBtn.hidden = !isAdmin;
  if (mgrBtn) mgrBtn.hidden = !isAdmin;
  if (settingsMgrBtn) settingsMgrBtn.hidden = !isAdmin;
  if (pwdBtn) pwdBtn.hidden = !isAdmin;

  const totalUsersCount = (state.users || []).length;
  const pendingCount = (state.users || []).filter((u) => u.status === 'pending').length;
  if (navUsersCount) {
    navUsersCount.textContent = String(totalUsersCount);
  }
  if (pendingBadge) {
    pendingBadge.textContent = String(pendingCount);
    pendingBadge.hidden = !isAdmin || pendingCount === 0;
  }

  if (!isAdmin && state.activeTab === 'users') {
    switchTab('insights');
  }
}

function renderUsersManagerModal() {
  const listEl = document.getElementById('users-manager-list');
  if (!listEl) return;

  const users = Array.isArray(state.users) ? state.users : [];
  const pendingCount = users.filter((u) => u.status === 'pending').length;
  const approvedCount = users.filter((u) => u.status === 'approved').length;
  const suspendedCount = users.filter((u) => u.status === 'suspended').length;

  const allGroups = Array.from(
    new Set([
      ...(state.groups || []),
      ...(state.channels || []).map((c) => String(c.group || '').trim()).filter(Boolean),
    ])
  );
  const allChannels = state.channels || [];

  if (users.length === 0) {
    listEl.innerHTML = `
      <div class="users-empty-box">
        <div style="font-size:1.8rem;margin-bottom:6px;">📧</div>
        <strong>Chưa có thành viên Gmail nào đăng ký</strong>
        <p>Thành viên có thể tự bấm <b>"📝 Đăng ký Gmail mới"</b> ở màn hình đăng nhập hoặc Admin có thể tạo trực tiếp ở thanh bên trên.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = `
    <div class="users-summary-strip">
      <span class="users-stat-chip">Tổng User Gmail: <strong>${users.length}</strong></span>
      <span class="users-stat-chip is-pending">⏳ Chờ duyệt: <strong>${pendingCount}</strong></span>
      <span class="users-stat-chip is-approved">✅ Đã cấp quyền: <strong>${approvedCount}</strong></span>
      ${
        suspendedCount > 0
          ? `<span class="users-stat-chip is-suspended">⛔ Tạm khóa: <strong>${suspendedCount}</strong></span>`
          : ''
      }
    </div>
    <div class="users-cards-stack">
      ${users
        .map((u) => {
          const isPending = u.status === 'pending';
          const isApproved = u.status === 'approved';
          const statusBadge = isPending
            ? '<span class="user-status-badge status-pending">⏳ Chờ Admin duyệt</span>'
            : isApproved
            ? '<span class="user-status-badge status-approved">✅ Đã cấp quyền</span>'
            : '<span class="user-status-badge status-suspended">⛔ Đã tạm khóa</span>';

          const perms = u.permissions || {};
          const allowedGroupsSet = new Set(u.allowedGroups || []);
          const allowedChSet = new Set(u.allowedChannelIds || []);
          const createdDate = u.createdAt
            ? new Date(u.createdAt).toLocaleDateString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })
            : '';

          return `
            <div class="user-mgr-card ${isPending ? 'is-pending-card' : ''}">
              <div class="user-mgr-card-top">
                <div class="user-mgr-identity">
                  <span class="user-mgr-avatar">${escapeHtml(
                    String(u.name || u.email || 'G')
                      .trim()
                      .charAt(0)
                      .toUpperCase()
                  )}</span>
                  <div>
                    <div class="user-mgr-title-row">
                      <strong>${escapeHtml(u.name || u.email)}</strong>
                      <span class="user-mgr-email-chip">✉️ ${escapeHtml(u.email)}</span>
                      ${statusBadge}
                    </div>
                    <div class="user-mgr-sub-row">
                      <span>Đăng ký: ${escapeHtml(createdDate)}</span>
                      ${
                        u.note
                          ? `<span class="user-mgr-note">💬 Ghi chú: "${escapeHtml(u.note)}"</span>`
                          : ''
                      }
                    </div>
                  </div>
                </div>
                <div class="user-mgr-quick-actions">
                  ${
                    !isApproved
                      ? `<button type="button" class="btn btn-primary btn-sm" data-approve-user-id="${escapeHtml(
                          u.id
                        )}">✅ Duyệt & Cấp quyền ngay</button>`
                      : `<button type="button" class="btn btn-secondary btn-sm" data-suspend-user-id="${escapeHtml(
                          u.id
                        )}">⏸️ Tạm khóa</button>`
                  }
                  <button type="button" class="btn btn-ghost btn-sm user-delete-btn" data-delete-user-id="${escapeHtml(
                    u.id
                  )}" title="Xóa tài khoản Gmail này">🗑️ Xóa</button>
                </div>
              </div>

              <form class="user-perm-form" data-user-perm-form="${escapeHtml(u.id)}">
                <div class="user-perm-grid">
                  <label class="field">
                    <span>1. Chế độ Không gian làm việc (Tách riêng / Phân quyền)</span>
                    <select name="scopeMode" class="select-control">
                      <option value="isolated" ${
                        u.scopeMode === 'isolated' ? 'selected' : ''
                      }>🔒 Sử dụng Tách riêng (Không gian độc lập riêng + Kênh được giao)</option>
                      <option value="assigned" ${
                        u.scopeMode === 'assigned' ? 'selected' : ''
                      }>📂 Chỉ xem các Group / Kênh được Admin tích chọn bên dưới</option>
                      <option value="all" ${
                        u.scopeMode === 'all' ? 'selected' : ''
                      }>🌐 Xem toàn bộ kênh & nội dung hệ thống</option>
                    </select>
                  </label>

                  <label class="field">
                    <span>Đặt lại mật khẩu mới cho Gmail này (Để trống nếu giữ nguyên)</span>
                    <input type="text" name="newPassword" class="input-control" placeholder="Nhập mật khẩu mới nếu cần đổi..." />
                  </label>
                </div>

                <div class="user-perm-section-label">2. Quyền hạn thao tác trong Không gian của User:</div>
                <div class="user-perm-checks-row">
                  <label class="user-perm-check">
                    <input type="checkbox" name="canCreateChannel" ${
                      perms.canCreateChannel !== false ? 'checked' : ''
                    } />
                    <span>➕ Thêm kênh & Tạo Group riêng</span>
                  </label>
                  <label class="user-perm-check">
                    <input type="checkbox" name="canEditChannel" ${
                      perms.canEditChannel !== false ? 'checked' : ''
                    } />
                    <span>✏️ Sửa thông tin kênh</span>
                  </label>
                  <label class="user-perm-check">
                    <input type="checkbox" name="canViewRevenue" ${
                      perms.canViewRevenue !== false ? 'checked' : ''
                    } />
                    <span>💰 Xem Doanh thu 12 tháng</span>
                  </label>
                  <label class="user-perm-check">
                    <input type="checkbox" name="canEditRevenue" ${
                      perms.canEditRevenue !== false ? 'checked' : ''
                    } />
                    <span>📝 Nhập/sửa Doanh thu</span>
                  </label>
                  <label class="user-perm-check">
                    <input type="checkbox" name="canUseVault" ${
                      perms.canUseVault !== false ? 'checked' : ''
                    } />
                    <span>📁 Dùng Kho nội dung riêng</span>
                  </label>
                  <label class="user-perm-check">
                    <input type="checkbox" name="canDeleteChannel" ${
                      perms.canDeleteChannel ? 'checked' : ''
                    } />
                    <span>🗑️ Được phép xóa kênh</span>
                  </label>
                </div>

                ${
                  allGroups.length > 0
                    ? `
                  <div class="user-perm-section-label">3. Cấp quyền xem thêm Group của Hệ thống (Tùy chọn):</div>
                  <div class="user-assign-pills">
                    ${allGroups
                      .map(
                        (gName) => `
                      <label class="user-assign-pill">
                        <input type="checkbox" name="allowedGroups" value="${escapeHtml(gName)}" ${
                          allowedGroupsSet.has(gName) ? 'checked' : ''
                        } />
                        <span>📂 ${escapeHtml(gName)}</span>
                      </label>
                    `
                      )
                      .join('')}
                  </div>
                `
                    : ''
                }

                ${
                  allChannels.length > 0
                    ? `
                  <div class="user-perm-section-label">4. Hoặc cấp quyền đích danh từng Kênh YouTube cụ thể (Tùy chọn):</div>
                  <div class="user-assign-pills">
                    ${allChannels
                      .map(
                        (ch) => `
                      <label class="user-assign-pill">
                        <input type="checkbox" name="allowedChannelIds" value="${escapeHtml(ch.id)}" ${
                          allowedChSet.has(ch.id) ? 'checked' : ''
                        } />
                        <span>📺 ${escapeHtml(ch.name)} (${escapeHtml(ch.handle || '')})</span>
                      </label>
                    `
                      )
                      .join('')}
                  </div>
                `
                    : ''
                }

                <div class="user-perm-footer">
                  <button type="submit" class="btn btn-primary btn-sm">
                    💾 Lưu phân quyền cho ${escapeHtml(u.name || u.email)}
                  </button>
                </div>
              </form>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

async function openUsersManagerModal() {
  switchTab('users');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  try {
    const res = await apiRequest('/api/users');
    state.users = Array.isArray(res.users) ? res.users : [];
  } catch (err) {
    showBanner(err.message, true);
    return;
  }
  renderCurrentUserSidebarPill();
  renderUsersManagerModal();
}

function updatePasswordUiState() {
  const btn = document.getElementById('btn-password-settings');
  const logoutBtn = document.getElementById('btn-logout-header');
  const currentField = document.getElementById('field-current-password');
  const lockNowBtn = document.getElementById('btn-lock-now');

  const enabled = Boolean(state.passwordEnabled);
  if (btn) {
    btn.innerHTML = enabled ? '<span>🔒</span><span>Đổi mật khẩu</span>' : '<span>🔓</span><span>Đặt mật khẩu Web</span>';
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

function getCustomGroupsStorageKey() {
  const uid = state.currentUser?.id || state.currentUser?.email || 'admin';
  return `studioflow_custom_groups_v1:${uid}`;
}

function getLocalCustomGroups() {
  try {
    const raw = localStorage.getItem(getCustomGroupsStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((g) => String(g || '').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function saveLocalCustomGroup(groupName = '') {
  const clean = String(groupName || '').trim();
  if (!clean) return;
  try {
    const current = getLocalCustomGroups();
    const exists = current.some((g) => g.toLowerCase() === clean.toLowerCase());
    if (!exists) {
      current.push(clean);
      localStorage.setItem(getCustomGroupsStorageKey(), JSON.stringify(current));
    }
  } catch {}
  if (!Array.isArray(state.groups)) state.groups = [];
  if (!state.groups.some((g) => String(g || '').trim().toLowerCase() === clean.toLowerCase())) {
    state.groups.push(clean);
  }
}

function removeLocalCustomGroup(groupName = '') {
  const clean = String(groupName || '').trim();
  if (!clean) return;
  try {
    const current = getLocalCustomGroups().filter(
      (g) => g.toLowerCase() !== clean.toLowerCase()
    );
    localStorage.setItem(getCustomGroupsStorageKey(), JSON.stringify(current));
  } catch {}
  if (Array.isArray(state.groups)) {
    state.groups = state.groups.filter(
      (g) => String(g || '').trim().toLowerCase() !== clean.toLowerCase()
    );
  }
}

async function loadOverview() {
  const authStatus = await apiRequest('/api/auth/status');
  state.passwordEnabled = Boolean(authStatus.passwordEnabled);
  state.currentUser = authStatus.user || null;
  updatePasswordUiState();

  if (authStatus.passwordEnabled && !authStatus.authenticated) {
    showAuthLockOverlay(true);
    return;
  }
  showAuthLockOverlay(false);

  const data = await apiRequest('/api/overview');
  state.summary = data.summary;
  state.currentUser = data.currentUser || state.currentUser;
  state.users = Array.isArray(data.users) ? data.users : [];
  state.channels = data.channels || [];

  const serverGroups = Array.isArray(data.groups)
    ? data.groups
    : Array.isArray(data.summary?.meta?.customGroups)
    ? data.summary.meta.customGroups
    : [];
  const localGroups = getLocalCustomGroups();
  const serverLowerSet = new Set(serverGroups.map((g) => String(g || '').trim().toLowerCase()));
  const mergedGroups = [];
  const mergedSeen = new Set();

  for (const g of [...serverGroups, ...localGroups]) {
    const clean = String(g || '').trim();
    if (!clean) continue;
    const lower = clean.toLowerCase();
    if (!mergedSeen.has(lower)) {
      mergedSeen.add(lower);
      mergedGroups.push(clean);
    }
  }
  state.groups = mergedGroups;

  // Đồng bộ hai chiều: lưu các Group từ server vào localStorage và khôi phục lên server nếu container vừa khởi động lại
  for (const sg of serverGroups) {
    saveLocalCustomGroup(sg);
  }
  for (const lg of localGroups) {
    const clean = String(lg || '').trim();
    if (clean && !serverLowerSet.has(clean.toLowerCase())) {
      apiRequest('/api/youtube/groups', {
        method: 'POST',
        body: JSON.stringify({ name: clean }),
      }).catch(() => {});
    }
  }

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

  renderCurrentUserSidebarPill();
  renderAll();

  // Tự động kiểm tra & cập nhật chỉ số video theo ngày (nếu bước sang ngày mới theo lịch Google)
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const lastSyncDate = state.summary?.meta?.lastDailySyncDate || '';
  if (
    state.channels.length > 0 &&
    lastSyncDate !== todayIso &&
    state.autoDailySyncedDate !== todayIso
  ) {
    state.autoDailySyncedDate = todayIso;
    apiRequest('/api/youtube/sync-daily', {
      method: 'POST',
      body: JSON.stringify({ date: todayIso }),
    })
      .then(() => loadOverview())
      .catch(() => {});
  }
}

function renderAll() {
  renderTopMetrics();
  renderSelectOptions();
  renderContentsTab();
  renderYoutubeTab();
  renderUsersManagerModal();
  renderBrandIdentityTab();
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

function getAllGroupNames() {
  const fromLocal = getLocalCustomGroups();
  const fromStore = Array.isArray(state.groups) ? state.groups : [];
  const fromMeta = Array.isArray(state.summary?.meta?.customGroups) ? state.summary.meta.customGroups : [];
  const fromChannels = state.channels.map((ch) => String(ch.group || '').trim()).filter(Boolean);
  const seen = new Set();
  const result = [];
  for (const raw of [...fromStore, ...fromMeta, ...fromLocal, ...fromChannels]) {
    const clean = String(raw || '').trim();
    if (!clean) continue;
    const lower = clean.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(clean);
    }
  }
  return result;
}

function renderGroupDropdown() {
  const dropdownEl = document.getElementById('yt-group-dropdown');
  const datalistEl = document.getElementById('yt-groups-datalist');

  const groupCounts = new Map();
  for (const grp of getAllGroupNames()) {
    groupCounts.set(grp, 0);
  }
  let ungroupedCount = 0;
  state.channels.forEach((ch) => {
    const grp = String(ch.group || '').trim();
    if (grp) {
      const existingKey =
        Array.from(groupCounts.keys()).find((k) => k.toLowerCase() === grp.toLowerCase()) || grp;
      groupCounts.set(existingKey, (groupCounts.get(existingKey) || 0) + 1);
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
      <div style="padding:8px 10px;border-top:1px solid #e2e8f0;display:flex;gap:6px;align-items:center;margin-top:4px;">
        <input
          type="text"
          id="input-dropdown-new-group"
          class="input-control"
          style="padding:5px 8px;font-size:0.75rem;flex:1;min-width:120px;"
          placeholder="+ Tạo Group mới..."
        />
        <button
          type="button"
          class="btn btn-primary btn-xs"
          data-create-group-from-dropdown="true"
        >Lưu</button>
      </div>
    </div>
  `;
}

function renderSidebarFolderTree() {
  const treeEl = document.getElementById('sidebar-folder-tree');
  if (!treeEl) return;

  const allGroups = getAllGroupNames();
  if (state.channels.length === 0 && allGroups.length === 0) {
    treeEl.innerHTML = '';
    return;
  }

  const groupMap = new Map();
  for (const grp of allGroups) {
    groupMap.set(grp, []);
  }
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

function formatRevenueAmount(num) {
  const val = Number(num) || 0;
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: Number.isInteger(val) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(val);
}

function getChannelMonthlyRevenueMap(ch) {
  const raw = ch?.monthlyRevenue && typeof ch.monthlyRevenue === 'object' ? ch.monthlyRevenue : {};
  const map = {};
  for (let m = 1; m <= 12; m += 1) {
    const val = Number(raw[String(m)] ?? raw[m]) || 0;
    map[String(m)] = val >= 0 ? Math.round(val * 100) / 100 : 0;
  }
  return map;
}

function sumChannelMonthlyRevenue(monthlyMap = {}) {
  let total = 0;
  for (let m = 1; m <= 12; m += 1) {
    total += Number(monthlyMap[String(m)]) || 0;
  }
  return Math.round(total * 100) / 100;
}

function renderSingleChannelDeepView(ch, boardEl) {
  const chVideos = state.videos.filter((v) => v.channelId === ch.id);
  const fallbackTop = Array.isArray(ch.topVideos) ? ch.topVideos : [];
  const seenKeys = new Set(chVideos.map((v) => v.youtubeVideoId || v.title));
  const allChannelVideos = [
    ...chVideos.map((v) => ({
      ...v,
      views: Number(v.currentViews ?? v.views) || 0,
      dailyDelta: Number(v.dailyViewsDelta) || 0,
    })),
    ...fallbackTop
      .filter((tv) => !seenKeys.has(tv.youtubeVideoId || tv.title))
      .map((tv) => ({
        ...tv,
        views: Number(tv.views ?? tv.currentViews) || 0,
        dailyDelta: Number(tv.dailyViewsDelta) || 0,
      })),
  ];

  // Nếu kênh trên YouTube có nhiều video hơn số video đã nạp chi tiết, tự động quét ngầm toàn bộ video 1 lần
  if (!state.autoSyncedDeepChannels) state.autoSyncedDeepChannels = new Set();
  const expectedTotalVideos = Number(ch.totalVideos) || 0;
  if (
    !state.autoSyncedDeepChannels.has(ch.id) &&
    (allChannelVideos.length === 0 || (expectedTotalVideos > allChannelVideos.length))
  ) {
    state.autoSyncedDeepChannels.add(ch.id);
    apiRequest(`/api/youtube/channels/${encodeURIComponent(ch.id)}/sync`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
      .then(() => loadOverview())
      .catch(() => {});
  }

  const sumVideoViews = allChannelVideos.reduce((s, v) => s + v.views, 0);
  const chTotalViews = Math.max(Number(ch.totalViews) || 0, sumVideoViews);
  const videoCount = Math.max(expectedTotalVideos, allChannelVideos.length);
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

  // Dữ liệu Bảng Doanh Thu Tháng 1 -> Tháng 12
  const monthlyMap = getChannelMonthlyRevenueMap(ch);
  const totalYearlyRevenue = sumChannelMonthlyRevenue(monthlyMap);
  const activeRevMonths = Object.values(monthlyMap).filter((v) => Number(v) > 0).length;
  const avgMonthlyRevenue =
    activeRevMonths > 0 ? Math.round((totalYearlyRevenue / activeRevMonths) * 100) / 100 : 0;

  let monthlyCellsHtml = '';
  for (let m = 1; m <= 12; m += 1) {
    const val = monthlyMap[String(m)];
    monthlyCellsHtml += `
      <label class="monthly-rev-cell ${val > 0 ? 'has-rev' : ''}">
        <span class="monthly-rev-label">Tháng ${m}</span>
        <input
          type="number"
          step="any"
          min="0"
          class="monthly-rev-input num"
          data-channel-rev-id="${escapeHtml(ch.id)}"
          data-rev-month="${m}"
          value="${val > 0 ? val : ''}"
          placeholder="0"
        />
      </label>
    `;
  }

  const sortMode = state.deepChannelVideoSort || 'views';
  const videoSearchQuery = (state.deepChannelVideoSearch || '').toLowerCase().trim();
  const filteredDeepVideos = allChannelVideos.filter((v) => {
    if (!videoSearchQuery) return true;
    return (
      (v.title || '').toLowerCase().includes(videoSearchQuery) ||
      (v.youtubeVideoId || '').toLowerCase().includes(videoSearchQuery) ||
      (v.publishedAt || '').toLowerCase().includes(videoSearchQuery)
    );
  });

  const sortedVideos = [...filteredDeepVideos]
    .map((v) => {
      const outlierMultiplier = Number((v.views / Math.max(avgViewsPerVideo, 1)).toFixed(1));
      return { ...v, outlierMultiplier };
    })
    .sort((a, b) => {
      if (sortMode === 'date') {
        return String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')) || b.views - a.views;
      }
      if (sortMode === 'oldest') {
        return String(a.publishedAt || '9999').localeCompare(String(b.publishedAt || '9999')) || b.views - a.views;
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
                : `<span class="outlier-badge num">x${v.outlierMultiplier} TB kênh</span>`;
            const vDate = v.publishedAt
              ? `<span class="top-video-date num">📅 ${escapeHtml(v.publishedAt)}</span>`
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
      : `<div class="channel-top-videos-empty">Chưa có video khớp điều kiện lọc — bấm nút <strong>Đồng bộ quét lại kênh</strong> để quét toàn bộ video của kênh này.</div>`;

  boardEl.innerHTML = `
    <div class="deep-channel-workspace">
      <div class="deep-channel-top-bar">
        <div class="deep-channel-title-cluster">
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

      <!-- 5 THẺ CHỈ SỐ CHUYÊN SÂU CỦA RIÊNG KÊNH NÀY -->
      <div class="deep-kpi-grid deep-kpi-grid-5 num">
        <div class="deep-kpi-card kpi-theme-violet">
          <span class="deep-kpi-label">👥 SUBSCRIBERS</span>
          <strong class="deep-kpi-val">${formatNumber(ch.subscribers || 0)}</strong>
          <span class="deep-kpi-sub">Người đăng ký thực tế</span>
        </div>
        <div class="deep-kpi-card kpi-theme-cyan">
          <span class="deep-kpi-label">👁️ TỔNG LƯỢT XEM (VIEWS)</span>
          <strong class="deep-kpi-val">${formatNumber(chTotalViews)}</strong>
          <span class="deep-kpi-sub">Toàn kênh YouTube</span>
        </div>
        <div class="deep-kpi-card kpi-theme-blue">
          <span class="deep-kpi-label">🎬 TỔNG SỐ VIDEO</span>
          <strong class="deep-kpi-val">${formatNumber(videoCount)}</strong>
          <span class="deep-kpi-sub">Đã liệt kê ${formatNumber(allChannelVideos.length)} video</span>
        </div>
        <div class="deep-kpi-card kpi-theme-flame">
          <span class="deep-kpi-label">🔥 TRUNG BÌNH / VIDEO</span>
          <strong class="deep-kpi-val">${formatNumber(avgViewsPerVideo)}</strong>
          <span class="deep-kpi-sub">Views trung bình mỗi video</span>
        </div>
        <div class="deep-kpi-card kpi-theme-emerald">
          <span class="deep-kpi-label">💰 TỔNG DOANH THU (T1–T12)</span>
          <strong class="deep-kpi-val" id="deep-kpi-rev-${escapeHtml(ch.id)}">${formatRevenueAmount(totalYearlyRevenue)}</strong>
          <span class="deep-kpi-sub" id="deep-kpi-rev-sub-${escapeHtml(ch.id)}">Đã nhập ${activeRevMonths}/12 tháng</span>
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
              style="${calcAutoInputChStyle(chGroup, 16, 6)}"
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

      <!-- BẢNG DOANH THU TỪ THÁNG 1 ĐẾN THÁNG 12 (NHẬP & CỘNG TỔNG TỰ ĐỘNG) -->
      <div class="insights-card monthly-revenue-card">
        <div class="insights-card-header">
          <div>
            <h3 class="insights-card-title">💰 Bảng Doanh Thu Kênh Từ Tháng 1 Đến Tháng 12 — "${escapeHtml(ch.name)}"</h3>
            <p class="insights-card-sub">Nhập doanh thu từng tháng (Tháng 1 → Tháng 12) — hệ thống tự động cộng tổng ngay khi nhập và lưu lại</p>
          </div>
          <div class="monthly-rev-header-actions num">
            <div class="monthly-rev-total-pill">
              <span>Tổng cộng (T1–T12):</span>
              <strong id="deep-revenue-total-${escapeHtml(ch.id)}">${formatRevenueAmount(totalYearlyRevenue)}</strong>
            </div>
            <button
              type="button"
              class="btn btn-primary btn-xs"
              data-save-monthly-revenue="${escapeHtml(ch.id)}"
            >💾 Lưu doanh thu</button>
          </div>
        </div>

        <div class="monthly-revenue-grid" data-monthly-rev-grid="${escapeHtml(ch.id)}">
          ${monthlyCellsHtml}
        </div>

        <div class="monthly-rev-summary-bar num">
          <div class="monthly-rev-summary-left">
            <span>📊 Trạng thái:</span>
            <strong id="deep-revenue-months-count-${escapeHtml(ch.id)}">Đã có doanh thu ${activeRevMonths}/12 tháng · Trung bình: ${formatRevenueAmount(avgMonthlyRevenue)} / tháng</strong>
          </div>
          <div class="monthly-rev-summary-right">
            <span>∑ TỔNG DOANH THU CẢ NĂM (THÁNG 1 → THÁNG 12):</span>
            <strong class="monthly-rev-grand-total" id="deep-revenue-footer-sum-${escapeHtml(ch.id)}">${formatRevenueAmount(totalYearlyRevenue)}</strong>
          </div>
        </div>
      </div>

      <!-- DANH SÁCH TOÀN BỘ VIDEO ĐÃ QUÉT CỦA KÊNH -->
      <div class="insights-card">
        <div class="insights-card-header">
          <div>
            <h3 class="insights-card-title">🎬 Danh sách toàn bộ Video của kênh "${escapeHtml(ch.name)}" (${formatNumber(sortedVideos.length)} / ${formatNumber(allChannelVideos.length)} video)</h3>
            <p class="insights-card-sub">Liệt kê toàn bộ video trên kênh · Trung bình kênh: <strong>${formatNumber(avgViewsPerVideo)} views/video</strong> · Tổng lượt xem video: <strong>${formatNumber(sumVideoViews)} views</strong></p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <input
              type="search"
              id="input-deep-video-search"
              class="input-control quick-search-input"
              style="padding:4px 10px;font-size:0.76rem;width:210px;"
              placeholder="🔍 Tìm trong ${allChannelVideos.length} video..."
              value="${escapeHtml(state.deepChannelVideoSearch || '')}"
            />
            <div class="insights-mode-tabs">
              <button type="button" class="insights-tab-btn ${sortMode === 'views' ? 'active' : ''}" data-set-deep-video-sort="views">Views cao nhất</button>
              <button type="button" class="insights-tab-btn ${sortMode === 'outlier' ? 'active' : ''}" data-set-deep-video-sort="outlier">Độ nổ (xTB kênh)</button>
              <button type="button" class="insights-tab-btn ${sortMode === 'date' ? 'active' : ''}" data-set-deep-video-sort="date">Mới đăng nhất</button>
              <button type="button" class="insights-tab-btn ${sortMode === 'oldest' ? 'active' : ''}" data-set-deep-video-sort="oldest">Cũ nhất</button>
            </div>
          </div>
        </div>
        <div class="channel-top-videos-list deep-all-videos-list">
          ${videosListHtml}
        </div>
      </div>
    </div>
  `;
}

function calcAutoInputChStyle(text = '', minCh = 15, extraCh = 6) {
  const raw = String(text || '').trim();
  const len = raw.length;
  const chWidth = Math.max(minCh, Math.ceil(len * 1.22) + extraCh);
  return `width:${chWidth}ch;min-width:${minCh}ch;`;
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
          style="${calcAutoInputChStyle(gaValue, 16, 4)}"
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
    if (
      groupFilter !== 'all' &&
      groupFilter !== '__none__' &&
      chGroup.toLowerCase() !== groupFilter.toLowerCase()
    )
      return false;
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

  const folderTitle =
    groupFilter === 'all'
      ? `📁 Thư mục: Tất cả Kênh (${filteredChannels.length} kênh)`
      : groupFilter === '__none__'
      ? `📁 Thư mục: Chưa gắn Group (${filteredChannels.length} kênh)`
      : `📁 Thư mục Nhóm: ${groupFilter} (${filteredChannels.length} kênh)`;

  const headerHtml = `
    <div class="channel-row-header" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <div>${escapeHtml(folderTitle)}</div>
      ${
        groupFilter !== 'all'
          ? `<button type="button" class="btn btn-secondary btn-xs" data-clear-all-yt-filters="true">📁 Xem tất cả kênh (${state.channels.length})</button>`
          : ''
      }
    </div>
  `;

  if (filteredChannels.length === 0) {
    boardEl.innerHTML =
      headerHtml +
      `<div class="panel-box" style="padding:18px;border-radius:12px;background:#ffffff;border:1px dashed #cbd5e1;">
        <p class="panel-desc" style="margin:0 0 8px;font-weight:700;color:#1e293b;">
          ${
            groupFilter !== 'all' && groupFilter !== '__none__'
              ? `✅ Thư mục Group "${escapeHtml(groupFilter)}" đã được lưu! Hiện chưa có kênh nào trong Group này.`
              : 'Chưa có kênh YouTube nào khớp bộ lọc hiện tại.'
          }
        </p>
        <p class="panel-desc" style="margin:0;">
          👉 Dán đường dẫn Kênh YouTube (URL) hoặc <code>@Handle</code> vào ô phía trên và bấm <strong>Lưu &amp; Tự chạy thông tin</strong> để thêm kênh thẳng vào thư mục này.
        </p>
      </div>`;
    return;
  }

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
      const isAppExpanded = Boolean(state.expandedAppChannels && state.expandedAppChannels.has(ch.id));

      return `
        <article class="channel-row ${isAppExpanded ? 'is-app-expanded' : ''}" data-channel-row-id="${escapeHtml(ch.id)}">
          <div class="channel-col-identity">
            <!-- Thanh liệt kê Tên kênh trên giao diện App / Điện thoại: Bấm vào sẽ trổ ra toàn bộ thông tin của kênh đó -->
            <button
              type="button"
              class="channel-app-accordion-btn"
              data-toggle-app-channel="${escapeHtml(ch.id)}"
              aria-expanded="${isAppExpanded ? 'true' : 'false'}"
              title="Bấm vào tên kênh để trổ ra / thu gọn toàn bộ thông tin kênh ${escapeHtml(ch.name)}"
            >
              <div class="channel-app-acc-left">
                <span class="channel-app-acc-dot bkt-status-${escapeHtml(ch.status || 'monetized')}"></span>
                <strong class="channel-app-acc-name">${escapeHtml(ch.name)}</strong>
                ${
                  chGroup
                    ? `<span class="niche-chip ${groupColorClass} channel-app-acc-group">${escapeHtml(chGroup)}</span>`
                    : ''
                }
              </div>
              <div class="channel-app-acc-right num">
                <span class="channel-app-acc-stat"><strong>${formatNumber(ch.subscribers || 0)}</strong> SUB</span>
                <span class="channel-app-acc-stat is-views"><strong>${formatNumber(chTotalViews)}</strong> VIEWS</span>
                <span class="channel-app-acc-chevron" data-app-ch-chevron="${escapeHtml(ch.id)}">${
                  isAppExpanded ? '▴ Thu gọn' : '▾ Chi tiết'
                }</span>
              </div>
            </button>

            <!-- Khối toàn bộ thông tin kênh (Trên Web luôn hiện; Trên App bấm vào tên kênh mới trổ ra) -->
            <div class="channel-app-expand-body">
              <!-- Thiết kế 2 hàng rõ ràng: Hàng 1 (Tên kênh, Group, Quản lý, Gà) & Hàng 2 (BKT, Ngách, SUB, VIEWS, VIDEO, Ngày đầu) -->
              <div class="channel-single-line channel-two-rows num">
                <div class="channel-line-row channel-line-row-1">
                  <button
                    type="button"
                    class="channel-name-btn"
                    data-open-channel-deep="${escapeHtml(ch.id)}"
                    title="Bấm để mở thư mục chi tiết kênh ${escapeHtml(ch.name)}"
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
                      class="btn btn-primary btn-xs btn-app-open-deep"
                      data-open-channel-deep="${escapeHtml(ch.id)}"
                      title="Mở Sổ Doanh Thu 12 Tháng & Danh sách toàn bộ video của kênh"
                    >📊 Doanh thu &amp; Video</button>
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
                      style="${calcAutoInputChStyle(chGroup, 16, 6)}"
                      data-channel-group="${escapeHtml(ch.id)}"
                      value="${escapeHtml(chGroup)}"
                      placeholder="Chọn Group..."
                    />
                  </label>

                  <label class="inline-meta-field inline-meta-mail" title="Người / Mail quản lý kênh">
                    <span class="inline-meta-label">Quản lý:</span>
                    <input
                      type="text"
                      class="inline-meta-input"
                      style="${calcAutoInputChStyle(managerMailValue, 15, 4)}"
                      data-channel-manager-mail="${escapeHtml(ch.id)}"
                      value="${escapeHtml(managerMailValue)}"
                      placeholder="Tên / Gmail..."
                    />
                  </label>

                  ${renderChannelGaPill(ch, false)}
                </div>

                <!-- HÀNG THỨ 2: Trạng thái BKT + Ngách + SUB + TỔNG VIEWS + VIDEO + Ngày đầu -->
                <div class="channel-line-row channel-line-row-2">
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

                  <label class="inline-meta-field inline-meta-date" title="Ngày đầu đăng video">
                    <span class="inline-meta-label">📅 Ngày đầu:</span>
                    <input
                      type="date"
                      class="inline-meta-input num"
                      data-channel-first-date="${escapeHtml(ch.id)}"
                      value="${escapeHtml(earliestVideoDate)}"
                    />
                  </label>
                </div>
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

  if (state.channels.length === 0 && getAllGroupNames().length === 0 && !state.showCreateGroupBox) {
    hubEl.innerHTML = `
      <div class="insights-card" style="padding:24px;text-align:center;">
        <h3 class="insights-card-title">Chưa có kênh YouTube nào trong hệ thống</h3>
        <p class="insights-card-sub" style="margin:8px 0 14px;">Hãy tạo thư mục Group hoặc mở Kênh YouTube để dán link kênh đầu tiên vào hệ thống.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary" data-toggle-create-group-box="true">+ Tạo Group mới</button>
          <button type="button" class="btn btn-secondary" data-goto-tab="youtube">+ Thêm Kênh YouTube mới</button>
        </div>
      </div>
    `;
    return;
  }

  // 0. Lịch Google thời gian thực (Tháng hiện tại theo lịch của Google)
  const googleNow = new Date();
  const googleMonth = googleNow.getMonth() + 1; // 1..12
  const googleYear = googleNow.getFullYear();
  const googleDateStr = googleNow.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const activeRevMonth = Number(state.homeRevenueMonth) || googleMonth;

  // 1. Tính toán Thống kê tổng hợp theo Nhãn (Group, Ngách, Quản lý) + Doanh thu Tháng này & Cả năm
  const buildBreakdown = (getKeyFn) => {
    const map = new Map();
    for (const ch of state.channels) {
      const { label, filterKey } = getKeyFn(ch);
      const chVideos = state.videos.filter((v) => v.channelId === ch.id);
      const sumVideoViews = chVideos.reduce((s, v) => s + (Number(v.currentViews) || 0), 0);
      const chViews = Math.max(Number(ch.totalViews) || 0, sumVideoViews);
      const chVideoCount = Math.max(Number(ch.totalVideos) || 0, chVideos.length);
      const isMonetized = ch.status === 'monetized' || ch.monetization === 'enabled';

      const monthlyMap = getChannelMonthlyRevenueMap(ch);
      const chGoogleMonthRev = Number(monthlyMap[String(googleMonth)]) || 0;
      const chSelectedMonthRev = Number(monthlyMap[String(activeRevMonth)]) || 0;
      const chYearlyRev = sumChannelMonthlyRevenue(monthlyMap);

      const prev = map.get(filterKey) || {
        label,
        filterKey,
        channelCount: 0,
        monetizedCount: 0,
        totalSubscribers: 0,
        totalViews: 0,
        totalVideos: 0,
        googleMonthRevenue: 0,
        selectedMonthRevenue: 0,
        totalYearlyRevenue: 0,
        channels: [],
      };
      prev.channelCount += 1;
      if (isMonetized) prev.monetizedCount += 1;
      prev.totalSubscribers += Number(ch.subscribers) || 0;
      prev.totalViews += chViews;
      prev.totalVideos += chVideoCount;
      prev.googleMonthRevenue = Math.round((prev.googleMonthRevenue + chGoogleMonthRev) * 100) / 100;
      prev.selectedMonthRevenue = Math.round((prev.selectedMonthRevenue + chSelectedMonthRev) * 100) / 100;
      prev.totalYearlyRevenue = Math.round((prev.totalYearlyRevenue + chYearlyRev) * 100) / 100;
      prev.channels.push({
        id: ch.id,
        name: ch.name,
        handle: ch.handle || '',
        views: chViews,
        subscribers: Number(ch.subscribers) || 0,
        googleMonthRevenue: chGoogleMonthRev,
        selectedMonthRevenue: chSelectedMonthRev,
        totalYearlyRevenue: chYearlyRev,
      });
      map.set(filterKey, prev);
    }
    return [...map.values()].sort((a, b) => b.totalViews - a.totalViews || b.channelCount - a.channelCount);
  };

  const groupFolders = buildBreakdown((ch) => {
    const g = String(ch.group || '').trim();
    return g ? { label: g, filterKey: g } : { label: 'Chưa gắn Group', filterKey: '__none__' };
  });
  const existingGroupKeys = new Set(groupFolders.map((g) => g.filterKey.toLowerCase()));
  for (const customGrp of getAllGroupNames()) {
    if (!existingGroupKeys.has(customGrp.toLowerCase())) {
      existingGroupKeys.add(customGrp.toLowerCase());
      groupFolders.push({
        label: customGrp,
        filterKey: customGrp,
        channelCount: 0,
        monetizedCount: 0,
        totalSubscribers: 0,
        totalViews: 0,
        totalVideos: 0,
        googleMonthRevenue: 0,
        selectedMonthRevenue: 0,
        totalYearlyRevenue: 0,
        channels: [],
      });
    }
  }

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
  const grandGoogleMonthRevenue =
    Math.round(groupFolders.reduce((s, r) => s + r.googleMonthRevenue, 0) * 100) / 100;
  const grandSelectedMonthRevenue =
    Math.round(groupFolders.reduce((s, r) => s + r.selectedMonthRevenue, 0) * 100) / 100;
  const grandTotalYearlyRevenue =
    Math.round(groupFolders.reduce((s, r) => s + r.totalYearlyRevenue, 0) * 100) / 100;

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
            <span class="label-stat-pill label-stat-pill-rev">
              💰 T${activeRevMonth}: <strong data-label-rev-month="${escapeHtml(`${labelMode}:${row.filterKey}`)}">${formatRevenueAmount(row.selectedMonthRevenue)}</strong>
            </span>
            <span class="label-stat-pill label-stat-pill-rev-total">
              ∑ Tiền: <strong data-label-rev-year="${escapeHtml(`${labelMode}:${row.filterKey}`)}">${formatRevenueAmount(row.totalYearlyRevenue)}</strong>
            </span>
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

  // Dữ liệu Bảng Tổng Kết Tiền Theo Nhóm & Theo Kênh (ngoài Trang chủ)
  const monthTabsHtml = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const isGoogleCurrent = m === googleMonth;
    const isSelected = m === activeRevMonth;
    return `
      <button
        type="button"
        class="home-rev-month-btn ${isSelected ? 'active' : ''} ${isGoogleCurrent ? 'is-google-month' : ''} num"
        data-select-home-rev-month="${m}"
        title="${isGoogleCurrent ? `Tháng hiện tại theo lịch Google (Tháng ${m}/${googleYear})` : `Xem tổng kết tiền Tháng ${m}/${googleYear}`}"
      >
        ${isGoogleCurrent ? '📅 ' : ''}T${m}${isGoogleCurrent ? ' (Tháng này)' : ''}
      </button>
    `;
  }).join('');

  const groupRevenueRowsHtml = groupFolders
    .map((grp) => {
      const colorClass = grp.filterKey === '__none__' ? '' : getCategoryColorClass(grp.label);
      return `
        <div class="home-rev-table-row">
          <div class="home-rev-row-left">
            <span class="niche-chip ${colorClass} label-stat-chip">
              <span class="cat-dot"></span>
              <span>${escapeHtml(grp.label)}</span>
            </span>
            <span class="home-rev-row-sub num">${grp.channelCount} kênh</span>
          </div>
          <div class="home-rev-row-right num">
            <div class="home-rev-col-cell">
              <span class="home-rev-col-label">Tiền Tháng ${activeRevMonth}</span>
              <strong class="home-rev-col-val" data-home-grp-month="${escapeHtml(grp.filterKey)}">${formatRevenueAmount(grp.selectedMonthRevenue)}</strong>
            </div>
            <div class="home-rev-col-cell home-rev-col-total">
              <span class="home-rev-col-label">Tổng tiền Nhóm (12T)</span>
              <strong class="home-rev-col-val home-rev-gold-num" data-home-grp-year="${escapeHtml(grp.filterKey)}">${formatRevenueAmount(grp.totalYearlyRevenue)}</strong>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  const channelRevenueRowsHtml = state.channels
    .map((ch) => {
      const monthlyMap = getChannelMonthlyRevenueMap(ch);
      const chMonthVal = Number(monthlyMap[String(activeRevMonth)]) || 0;
      const chYearVal = sumChannelMonthlyRevenue(monthlyMap);
      const chGroup = String(ch.group || '').trim() || 'Chưa gắn Group';
      const groupColorClass = ch.group ? getCategoryColorClass(chGroup) : '';
      return `
        <div class="home-rev-table-row">
          <div class="home-rev-row-left">
            <button
              type="button"
              class="home-rev-ch-link"
              data-open-channel-deep="${escapeHtml(ch.id)}"
              title="Bấm để mở Quản lý sâu & Bảng doanh thu 12 tháng của kênh ${escapeHtml(ch.name)}"
            >
              📺 ${escapeHtml(ch.name)}
            </button>
            <span class="niche-chip ${groupColorClass} home-rev-mini-group">${escapeHtml(chGroup)}</span>
          </div>
          <div class="home-rev-row-right num">
            <label class="home-rev-col-cell home-rev-input-wrap" title="Nhập nhanh doanh thu Tháng ${activeRevMonth} của kênh ${escapeHtml(ch.name)}">
              <span class="home-rev-col-label">Tiền Tháng ${activeRevMonth}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                class="home-ch-rev-input num"
                data-home-ch-rev-id="${escapeHtml(ch.id)}"
                data-home-ch-rev-month="${activeRevMonth}"
                value="${chMonthVal > 0 ? chMonthVal : ''}"
                placeholder="0"
              />
            </label>
            <div class="home-rev-col-cell home-rev-col-total">
              <span class="home-rev-col-label">Tổng tiền Kênh (12T)</span>
              <strong class="home-rev-col-val home-rev-gold-num" id="home-ch-year-rev-${escapeHtml(ch.id)}">${formatRevenueAmount(chYearVal)}</strong>
            </div>
          </div>
        </div>
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

  // Chỉ hiển thị những video đạt từ 10.000 views trở lên trên Bảng tổng hợp "Video Nổ View" cả dàn kênh
  const MIN_BURST_VIEWS = 10000;
  const burstVideosOver10k = filteredVideos.filter((v) => v.views >= MIN_BURST_VIEWS);

  const topOutlierVideo = [
    ...(burstVideosOver10k.length > 0 ? burstVideosOver10k : filteredVideos),
  ].sort((a, b) => b.outlierMultiplier - a.outlierMultiplier || b.views - a.views)[0];

  const displayLimit = state.insightsShowAllVideos ? 50 : 10;
  const topBurstVideos = burstVideosOver10k.slice(0, displayLimit);

  const lastSyncIso = state.summary?.meta?.lastDailySyncAt;
  const lastSyncTimeLabel = lastSyncIso
    ? new Date(lastSyncIso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : 'Hôm nay';

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
      : `<div class="channel-top-videos-empty">Chưa có video nào đạt trên <strong>10.000 views</strong> khớp bộ lọc — hệ thống đang tự động cập nhật theo ngày để lọc các video nổ ≥ 10K views.</div>`;

  hubEl.innerHTML = `
    <!-- PHẦN 1: TÓM TẮT PHÂN TÍCH & DOANH THU TOÀN HỆ THỐNG (EXECUTIVE OVERVIEW) -->
    <div class="home-exec-grid home-exec-grid-6 num">
      <div class="deep-kpi-card kpi-theme-blue">
        <span class="deep-kpi-label">📺 HỆ THỐNG KÊNH &amp; NHÓM</span>
        <strong class="deep-kpi-val">${formatNumber(state.channels.length)} kênh</strong>
        <span class="deep-kpi-sub">${grandMonetized} kênh Đã BKT · ${groupFolders.length} thư mục Nhóm</span>
      </div>
      <div class="deep-kpi-card kpi-theme-emerald">
        <span class="deep-kpi-label">💵 TIỀN THÁNG NÀY (LỊCH GOOGLE T${googleMonth})</span>
        <strong class="deep-kpi-val" id="home-kpi-google-month-rev">${formatRevenueAmount(grandGoogleMonthRevenue)}</strong>
        <span class="deep-kpi-sub">📅 Lịch Google: ${escapeHtml(googleDateStr)}</span>
      </div>
      <div class="deep-kpi-card kpi-theme-gold">
        <span class="deep-kpi-label">🏆 TỔNG TIỀN TOÀN BỘ (12 THÁNG)</span>
        <strong class="deep-kpi-val" id="home-kpi-grand-total-rev">${formatRevenueAmount(grandTotalYearlyRevenue)}</strong>
        <span class="deep-kpi-sub">Tổng tiền tất cả các kênh &amp; các nhóm</span>
      </div>
      <div class="deep-kpi-card kpi-theme-cyan">
        <span class="deep-kpi-label">👁️ TỔNG LƯỢT XEM THỰC TẾ</span>
        <strong class="deep-kpi-val">${formatNumber(grandTotalViews)}</strong>
        <span class="deep-kpi-sub">TB ${formatNumber(Math.round(grandTotalViews / Math.max(state.channels.length, 1)))} views / kênh</span>
      </div>
      <div class="deep-kpi-card kpi-theme-violet">
        <span class="deep-kpi-label">👥 TỔNG SUB &amp; KHO VIDEO</span>
        <strong class="deep-kpi-val">${formatNumber(grandTotalSubs)} sub</strong>
        <span class="deep-kpi-sub">Đã quét ${formatNumber(grandTotalVideos)} video trên toàn dàn kênh</span>
      </div>
      <div class="deep-kpi-card kpi-theme-flame">
        <span class="deep-kpi-label">🔥 KEY VIDEO NỔ MẠNH NHẤT</span>
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
            <p class="insights-card-sub">Cộng gộp Kênh, BKT, Tiền Tháng ${activeRevMonth}, Tổng Tiền, Sub &amp; Views theo từng nhóm</p>
          </div>
          <div class="insights-header-actions">
            <button
              type="button"
              class="btn btn-primary btn-xs btn-create-group-trigger"
              data-toggle-create-group-box="true"
              title="Tạo thư mục Group mới ngay tại đây"
            >${state.showCreateGroupBox ? '✕ Đóng' : '+ Tạo Group'}</button>
            <div class="insights-mode-tabs" role="tablist">
              <button type="button" class="insights-tab-btn ${labelMode === 'group' ? 'active' : ''}" data-set-label-mode="group">Theo Group</button>
              <button type="button" class="insights-tab-btn ${labelMode === 'category' ? 'active' : ''}" data-set-label-mode="category">Theo Ngách</button>
              <button type="button" class="insights-tab-btn ${labelMode === 'manager' ? 'active' : ''}" data-set-label-mode="manager">Theo Quản lý</button>
            </div>
          </div>
        </div>
        ${
          state.showCreateGroupBox
            ? `
              <form id="form-quick-create-group" class="quick-create-group-box">
                <div class="quick-create-group-top">
                  <input
                    type="text"
                    id="input-new-group-name"
                    name="groupName"
                    class="input-control quick-create-group-input"
                    value="${escapeHtml(state.draftNewGroupName || '')}"
                    placeholder="📁 Nhập tên Group mới (VD: KÊNH AI US, NHÓM PHIM, TEAM 1...)"
                    required
                  />
                  <button type="submit" class="btn btn-primary btn-sm" data-save-quick-group="true">✓ Lưu Group</button>
                  <button type="button" class="btn btn-ghost btn-sm" data-close-create-group-box="true">Hủy</button>
                </div>
                ${
                  state.channels.length > 0
                    ? `
                      <div class="quick-create-group-channels">
                        <span class="quick-create-group-hint">Chọn nhanh kênh đưa vào Group này (tùy chọn):</span>
                        <div class="quick-create-group-chips">
                          ${state.channels
                            .map((ch) => {
                              const isChecked =
                                state.draftSelectedGroupChannelIds &&
                                state.draftSelectedGroupChannelIds.has(ch.id);
                              return `
                                <label class="quick-group-ch-chip">
                                  <input type="checkbox" name="groupChannelIds" value="${escapeHtml(ch.id)}" ${
                                isChecked ? 'checked' : ''
                              } />
                                  <span>📺 ${escapeHtml(ch.name)}${
                                ch.group ? ` <small>(${escapeHtml(ch.group)})</small>` : ''
                              }</span>
                                </label>
                              `;
                            })
                            .join('')}
                        </div>
                      </div>
                    `
                    : ''
                }
              </form>
            `
            : ''
        }
        <div class="label-stats-list">
          ${labelRowsHtml}
        </div>
      </section>

      <!-- CỘT 2: BẢNG TỔNG HỢP VIDEO NỔ VIEW CỦA CẢ DÀN KÊNH (CHỈ HIỂN THỊ VIDEO TRÊN 10K VIEWS) -->
      <section class="insights-card">
        <div class="insights-card-header">
          <div>
            <h3 class="insights-card-title">🔥 Bảng tổng hợp "Video Nổ View" cả dàn kênh (Trên 10K Views)</h3>
            <p class="insights-card-sub">
              Chỉ hiển thị <strong>${formatNumber(burstVideosOver10k.length)} video trên 10.000 views</strong> (từ ${formatNumber(filteredVideos.length)} video của ${formatNumber(state.channels.length)} kênh) · 🔄 Auto update theo ngày (${escapeHtml(googleDateStr)} · ${escapeHtml(lastSyncTimeLabel)})
            </p>
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
          burstVideosOver10k.length > 10
            ? `<div class="insights-card-footer">
                <button type="button" class="btn btn-ghost btn-xs" data-toggle-show-all-burst="true">
                  ${state.insightsShowAllVideos ? '▲ Thu gọn về Top 10' : `▼ Xem toàn bộ ${burstVideosOver10k.length} video trên 10K views`}
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

  if (tabName === 'users') {
    renderUsersManagerModal();
    apiRequest('/api/users')
      .then((res) => {
        state.users = Array.isArray(res.users) ? res.users : [];
        renderCurrentUserSidebarPill();
        renderUsersManagerModal();
      })
      .catch(() => {});
  }

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

    // Mở tab Bộ Nhận Diện Thương Hiệu & Thông Tin Thương Mại từ thanh telemetry hoặc footer
    const openBrandBtn = e.target.closest('[data-open-brand-tab]');
    if (openBrandBtn) {
      switchTab('brand');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Sao chép mã màu HEX trong Bộ Quy Chuẩn Nhận Diện Thương Hiệu
    const copyHexBtn = e.target.closest('[data-copy-hex]');
    if (copyHexBtn) {
      const hex = copyHexBtn.dataset.copyHex || '#D4AF37';
      const name = copyHexBtn.dataset.copyName || 'Màu thương hiệu';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(hex).catch(() => {});
      }
      showBanner(`Đã sao chép mã màu ${name}: ${hex}`);
      return;
    }

    // Chuyển tab chiều thống kê Nhãn (Theo Group | Theo Ngách | Theo Quản lý)
    const setLabelModeBtn = e.target.closest('[data-set-label-mode]');
    if (setLabelModeBtn) {
      state.insightsLabelMode = setLabelModeBtn.dataset.setLabelMode || 'group';
      renderYoutubeInsightsHub();
      return;
    }

    // Chọn tháng xem doanh thu trên Trang chủ (mặc định là tháng hiện tại theo lịch Google)
    const selectHomeRevMonthBtn = e.target.closest('[data-select-home-rev-month]');
    if (selectHomeRevMonthBtn) {
      const m = Number(selectHomeRevMonthBtn.dataset.selectHomeRevMonth);
      if (m >= 1 && m <= 12) {
        state.homeRevenueMonth = m;
        renderYoutubeInsightsHub();
      }
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

    // Lưu bảng doanh thu 12 tháng khi bấm nút Lưu doanh thu
    const saveRevBtn = e.target.closest('[data-save-monthly-revenue]');
    if (saveRevBtn) {
      const chId = saveRevBtn.dataset.saveMonthlyRevenue;
      await saveChannelMonthlyRevenueFromDom(chId);
      return;
    }

    // Chọn nội dung trong Content Vault
    const selectContentCard = e.target.closest('[data-select-content]');
    if (selectContentCard) {
      state.selectedContentId = selectContentCard.dataset.selectContent;
      renderContentsTab();
      return;
    }

    // Tạo Group mới từ menu trỏ xuống trong tab Kênh YouTube
    const createFromDropdownBtn = e.target.closest('[data-create-group-from-dropdown]');
    if (createFromDropdownBtn) {
      const dropdownInput = document.getElementById('input-dropdown-new-group');
      const groupName = String(dropdownInput?.value || '').trim();
      if (!groupName) {
        showBanner('Vui lòng nhập tên Group cần tạo!', true);
        dropdownInput?.focus();
        return;
      }
      await submitQuickCreateGroup({
        name: groupName,
        channelIds: [],
        submitBtn: createFromDropdownBtn,
        selectAfterCreate: true,
      });
      return;
    }

    // Bấm nút "✓ Lưu Group" trực tiếp trong khung Tạo Group nhanh
    const saveQuickGroupBtn = e.target.closest('[data-save-quick-group]');
    if (saveQuickGroupBtn) {
      e.preventDefault();
      const quickGroupForm = document.getElementById('form-quick-create-group');
      const nameInput = document.getElementById('input-new-group-name');
      const groupName = String(nameInput?.value ?? state.draftNewGroupName ?? '').trim();
      const checkedBoxes = quickGroupForm
        ? quickGroupForm.querySelectorAll('input[name="groupChannelIds"]:checked')
        : [];
      const channelIds = Array.from(checkedBoxes).map((cb) => cb.value);
      await submitQuickCreateGroup({
        name: groupName,
        channelIds,
        submitBtn: saveQuickGroupBtn,
      });
      return;
    }

    // Bấm nút "+ Tạo Group" ngay trong khung Thống kê tổng hợp theo Nhãn
    const toggleCreateGroupBtn = e.target.closest('[data-toggle-create-group-box]');
    if (toggleCreateGroupBtn) {
      if (state.showCreateGroupBox) {
        const nameInput = document.getElementById('input-new-group-name');
        const pendingName = String(nameInput?.value ?? state.draftNewGroupName ?? '').trim();
        if (pendingName) {
          const quickGroupForm = document.getElementById('form-quick-create-group');
          const checkedBoxes = quickGroupForm
            ? quickGroupForm.querySelectorAll('input[name="groupChannelIds"]:checked')
            : [];
          const channelIds = Array.from(checkedBoxes).map((cb) => cb.value);
          await submitQuickCreateGroup({
            name: pendingName,
            channelIds,
          });
          return;
        }
      }
      state.showCreateGroupBox = !state.showCreateGroupBox;
      state.insightsLabelMode = 'group';
      renderYoutubeInsightsHub();
      if (state.showCreateGroupBox) {
        setTimeout(() => {
          document.getElementById('input-new-group-name')?.focus();
        }, 40);
      }
      return;
    }

    // Đóng khung Tạo Group nhanh
    const closeCreateGroupBtn = e.target.closest('[data-close-create-group-box]');
    if (closeCreateGroupBtn) {
      state.showCreateGroupBox = false;
      state.draftNewGroupName = '';
      if (state.draftSelectedGroupChannelIds) state.draftSelectedGroupChannelIds.clear();
      renderYoutubeInsightsHub();
      return;
    }

    // Bấm vào tên kênh trên giao diện App / Điện thoại để trổ ra / thu gọn toàn bộ thông tin kênh
    const toggleAppChannelBtn = e.target.closest('[data-toggle-app-channel]');
    if (toggleAppChannelBtn) {
      const chId = toggleAppChannelBtn.dataset.toggleAppChannel;
      if (!state.expandedAppChannels) state.expandedAppChannels = new Set();
      let nowExpanded = false;
      if (state.expandedAppChannels.has(chId)) {
        state.expandedAppChannels.delete(chId);
      } else {
        state.expandedAppChannels.add(chId);
        nowExpanded = true;
      }
      const rowEl = toggleAppChannelBtn.closest('.channel-row');
      if (rowEl) {
        rowEl.classList.toggle('is-app-expanded', nowExpanded);
      }
      toggleAppChannelBtn.setAttribute('aria-expanded', nowExpanded ? 'true' : 'false');
      const chevEl = toggleAppChannelBtn.querySelector('[data-app-ch-chevron]');
      if (chevEl) {
        chevEl.textContent = nowExpanded ? '▴ Thu gọn' : '▾ Chi tiết';
      }
      return;
    }

    // Bấm nút ẩn vào («) / nhảy ra (») cho thanh điều hướng bên trái
    const toggleSidebarBtn = e.target.closest('[data-toggle-sidebar]');
    if (toggleSidebarBtn) {
      const appShellEl = document.getElementById('app-shell') || document.querySelector('.app-shell');
      if (appShellEl) {
        const isCollapsed = appShellEl.classList.toggle('sidebar-collapsed');
        try {
          localStorage.setItem('studioflow_sidebar_collapsed', isCollapsed ? '1' : '0');
        } catch {}
      }
      return;
    }
  });

  async function submitQuickCreateGroup({
    name,
    channelIds = [],
    submitBtn = null,
    selectAfterCreate = false,
  } = {}) {
    const groupName = String(name || '').trim();
    if (!groupName) {
      showBanner('Vui lòng nhập tên Group cần tạo!', true);
      document.getElementById('input-new-group-name')?.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang lưu...';
    }

    // Lưu ngay lập tức vào bộ nhớ trình duyệt & state để hiển thị tức thì (0ms) và không bao giờ bị mất
    saveLocalCustomGroup(groupName);
    if (Array.isArray(channelIds) && channelIds.length > 0) {
      const idSet = new Set(channelIds.map(String));
      for (const ch of state.channels) {
        if (idSet.has(ch.id)) {
          ch.group = groupName;
        }
      }
    }
    state.showCreateGroupBox = false;
    state.draftNewGroupName = '';
    if (state.draftSelectedGroupChannelIds) state.draftSelectedGroupChannelIds.clear();
    state.insightsLabelMode = 'group';
    if (selectAfterCreate) {
      state.filters.ytGroup = groupName;
      state.activeChannelDeepId = null;
    }
    renderAll();

    try {
      const res = await apiRequest('/api/youtube/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: groupName,
          channelIds,
        }),
      });
      saveLocalCustomGroup(res.name || groupName);
      await loadOverview();
      showBanner(
        res.assignedCount > 0
          ? `Đã tạo Group "${res.name}" và gán ${res.assignedCount} kênh vào Group!`
          : `Đã tạo và lưu Group "${res.name || groupName}" thành công!`
      );
    } catch (err) {
      showBanner(err.message, true);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '✓ Lưu Group';
      }
    }
  }

  // Lưu Group mới ngay từ khung Thống kê tổng hợp theo Nhãn
  document.body.addEventListener('submit', async (e) => {
    const quickGroupForm = e.target.closest('#form-quick-create-group');
    if (!quickGroupForm) return;
    e.preventDefault();

    const nameInput = document.getElementById('input-new-group-name');
    const groupName = String(nameInput?.value ?? state.draftNewGroupName ?? '').trim();
    const checkedBoxes = quickGroupForm.querySelectorAll('input[name="groupChannelIds"]:checked');
    const channelIds = Array.from(checkedBoxes).map((cb) => cb.value);
    const submitBtn = quickGroupForm.querySelector('button[type="submit"]');

    await submitQuickCreateGroup({
      name: groupName,
      channelIds,
      submitBtn,
    });
  });

  function readChannelMonthlyRevenueFromDom(chId) {
    const grid = document.querySelector(`[data-monthly-rev-grid="${CSS.escape(chId)}"]`);
    const monthlyRevenue = {};
    let total = 0;
    let activeMonths = 0;
    for (let m = 1; m <= 12; m += 1) {
      const inputEl = grid?.querySelector(`[data-rev-month="${m}"]`);
      const rawVal = inputEl ? parseFloat(String(inputEl.value || '0').replace(/,/g, '')) : 0;
      const cleanVal = Number.isFinite(rawVal) && rawVal >= 0 ? Math.round(rawVal * 100) / 100 : 0;
      monthlyRevenue[String(m)] = cleanVal;
      total += cleanVal;
      if (cleanVal > 0) activeMonths += 1;
      inputEl?.closest('.monthly-rev-cell')?.classList.toggle('has-rev', cleanVal > 0);
    }
    total = Math.round(total * 100) / 100;
    const avg = activeMonths > 0 ? Math.round((total / activeMonths) * 100) / 100 : 0;

    const totalEl = document.getElementById(`deep-revenue-total-${chId}`);
    const footerSumEl = document.getElementById(`deep-revenue-footer-sum-${chId}`);
    const monthsCountEl = document.getElementById(`deep-revenue-months-count-${chId}`);
    const kpiRevEl = document.getElementById(`deep-kpi-rev-${chId}`);
    const kpiRevSubEl = document.getElementById(`deep-kpi-rev-sub-${chId}`);

    if (totalEl) totalEl.textContent = formatRevenueAmount(total);
    if (footerSumEl) footerSumEl.textContent = formatRevenueAmount(total);
    if (monthsCountEl) {
      monthsCountEl.textContent = `Đã có doanh thu ${activeMonths}/12 tháng · Trung bình: ${formatRevenueAmount(avg)} / tháng`;
    }
    if (kpiRevEl) kpiRevEl.textContent = formatRevenueAmount(total);
    if (kpiRevSubEl) kpiRevSubEl.textContent = `Đã nhập ${activeMonths}/12 tháng`;

    return { monthlyRevenue, total, activeMonths };
  }

  async function saveChannelMonthlyRevenueFromDom(chId) {
    const { monthlyRevenue, total } = readChannelMonthlyRevenueFromDom(chId);
    try {
      const updated = await apiRequest(`/api/youtube/channels/${encodeURIComponent(chId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ monthlyRevenue }),
      });
      const localCh = state.channels.find((c) => c.id === chId);
      if (localCh) {
        localCh.monthlyRevenue = updated.monthlyRevenue || monthlyRevenue;
        localCh.totalYearlyRevenue = updated.totalYearlyRevenue ?? total;
      }
      renderYoutubeInsightsHub();
      renderBrandIdentityTab();
      showBanner(`Đã lưu bảng doanh thu kênh "${updated.name}" — Tổng cộng 12 tháng: ${formatRevenueAmount(total)}!`);
    } catch (err) {
      showBanner(err.message, true);
    }
  }

  function recalculateHomePageRevenueLive() {
    const googleMonth = new Date().getMonth() + 1;
    const activeRevMonth = Number(state.homeRevenueMonth) || googleMonth;

    let grandGoogleMonthRev = 0;
    let grandSelectedMonthRev = 0;
    let grandTotalYearRev = 0;
    const groupTotals = new Map();

    for (const ch of state.channels) {
      const monthlyMap = getChannelMonthlyRevenueMap(ch);
      const chGoogleM = Number(monthlyMap[String(googleMonth)]) || 0;
      const chSelectedM = Number(monthlyMap[String(activeRevMonth)]) || 0;
      const chYear = sumChannelMonthlyRevenue(monthlyMap);
      ch.totalYearlyRevenue = chYear;

      grandGoogleMonthRev += chGoogleM;
      grandSelectedMonthRev += chSelectedM;
      grandTotalYearRev += chYear;

      const chYearEl = document.getElementById(`home-ch-year-rev-${ch.id}`);
      if (chYearEl) chYearEl.textContent = formatRevenueAmount(chYear);

      const grpKey = String(ch.group || '').trim() || '__none__';
      const prevGrp = groupTotals.get(grpKey) || { month: 0, year: 0 };
      prevGrp.month = Math.round((prevGrp.month + chSelectedM) * 100) / 100;
      prevGrp.year = Math.round((prevGrp.year + chYear) * 100) / 100;
      groupTotals.set(grpKey, prevGrp);
    }

    grandGoogleMonthRev = Math.round(grandGoogleMonthRev * 100) / 100;
    grandSelectedMonthRev = Math.round(grandSelectedMonthRev * 100) / 100;
    grandTotalYearRev = Math.round(grandTotalYearRev * 100) / 100;

    for (const [grpKey, vals] of groupTotals.entries()) {
      document.querySelectorAll(`[data-home-grp-month="${CSS.escape(grpKey)}"]`).forEach((el) => {
        el.textContent = formatRevenueAmount(vals.month);
      });
      document.querySelectorAll(`[data-home-grp-year="${CSS.escape(grpKey)}"]`).forEach((el) => {
        el.textContent = formatRevenueAmount(vals.year);
      });
      document.querySelectorAll(`[data-label-rev-month="group:${CSS.escape(grpKey)}"]`).forEach((el) => {
        el.textContent = formatRevenueAmount(vals.month);
      });
      document.querySelectorAll(`[data-label-rev-year="group:${CSS.escape(grpKey)}"]`).forEach((el) => {
        el.textContent = formatRevenueAmount(vals.year);
      });
    }

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setTxt('home-kpi-google-month-rev', formatRevenueAmount(grandGoogleMonthRev));
    setTxt('home-kpi-grand-total-rev', formatRevenueAmount(grandTotalYearRev));
    setTxt('home-strip-selected-month-rev', formatRevenueAmount(grandSelectedMonthRev));
    setTxt('home-strip-groups-year-rev', formatRevenueAmount(grandTotalYearRev));
    setTxt('home-strip-grand-total-rev', formatRevenueAmount(grandTotalYearRev));
    setTxt('home-strip-google-month-sub', formatRevenueAmount(grandGoogleMonthRev));
    setTxt('home-foot-grp-month', formatRevenueAmount(grandSelectedMonthRev));
    setTxt('home-foot-grp-year', formatRevenueAmount(grandTotalYearRev));
    setTxt('home-foot-ch-month', formatRevenueAmount(grandSelectedMonthRev));
    setTxt('home-foot-ch-year', formatRevenueAmount(grandTotalYearRev));

    const stripGroupsEl = document.getElementById('home-strip-groups-rev');
    if (stripGroupsEl) {
      stripGroupsEl.innerHTML = `${formatRevenueAmount(grandSelectedMonthRev)} <small>(Tháng ${activeRevMonth})</small>`;
    }
  }

  // Tự động cộng tổng ngay tức thì khi gõ vào bất kỳ ô Tháng 1 -> Tháng 12 nào & lọc tìm kiếm video trong kênh
  document.body.addEventListener('input', (e) => {
    const autoGroupInput = e.target.closest('.inline-group-input');
    if (autoGroupInput) {
      const len = String(autoGroupInput.value || '').trim().length;
      const chWidth = Math.max(16, Math.ceil(len * 1.22) + 6);
      autoGroupInput.style.width = `${chWidth}ch`;
      autoGroupInput.style.minWidth = '16ch';
    }

    const autoMetaInput = e.target.closest('[data-channel-manager-mail], [data-channel-ga]');
    if (autoMetaInput) {
      const len = String(autoMetaInput.value || '').trim().length;
      const chWidth = Math.max(15, Math.ceil(len * 1.22) + 4);
      autoMetaInput.style.width = `${chWidth}ch`;
      autoMetaInput.style.minWidth = '15ch';
    }

    const revInput = e.target.closest('[data-channel-rev-id]');
    if (revInput) {
      const chId = revInput.dataset.channelRevId;
      readChannelMonthlyRevenueFromDom(chId);
      return;
    }

    // Nhập nhanh tiền tháng ngay ngoài Trang chủ -> tự động cộng tổng tiền Tháng này, tiền Nhóm & tiền Toàn bộ tức thì
    const homeRevInput = e.target.closest('[data-home-ch-rev-id]');
    if (homeRevInput) {
      const chId = homeRevInput.dataset.homeChRevId;
      const month = Number(homeRevInput.dataset.homeChRevMonth) || new Date().getMonth() + 1;
      const rawVal = parseFloat(String(homeRevInput.value || '0').replace(/,/g, ''));
      const cleanVal = Number.isFinite(rawVal) && rawVal >= 0 ? Math.round(rawVal * 100) / 100 : 0;
      const localCh = state.channels.find((c) => c.id === chId);
      if (localCh) {
        const monthlyMap = getChannelMonthlyRevenueMap(localCh);
        monthlyMap[String(month)] = cleanVal;
        localCh.monthlyRevenue = monthlyMap;
        recalculateHomePageRevenueLive();
      }
      return;
    }

    if (e.target.id === 'input-auth-username') {
      const val = String(e.target.value || '').trim().toLowerCase();
      const passStep = document.getElementById('auth-password-step');
      const submitBtn = document.getElementById('btn-auth-login-submit');
      if (passStep) {
        passStep.hidden = val !== 'admin';
      }
      if (submitBtn) {
        submitBtn.textContent = val === 'admin' ? 'Continue as Admin' : 'Continue with email';
      }
      return;
    }

    if (e.target.id === 'input-new-group-name') {
      state.draftNewGroupName = e.target.value;
      return;
    }

    if (e.target.id === 'input-deep-video-search') {
      state.deepChannelVideoSearch = e.target.value;
      const pos = e.target.selectionStart || e.target.value.length;
      renderYoutubeTab();
      const nextInput = document.getElementById('input-deep-video-search');
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(pos, pos);
      }
    }
  });

  document.body.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && e.target.matches?.('[data-channel-group]')) {
      e.preventDefault();
      e.target.blur();
      return;
    }
    if (e.key === 'Enter' && e.target.id === 'input-dropdown-new-group') {
      e.preventDefault();
      const val = String(e.target.value || '').trim();
      if (val) {
        await submitQuickCreateGroup({
          name: val,
          channelIds: [],
          selectAfterCreate: true,
        });
      }
    }
  });

  // Thay đổi trực tiếp trạng thái BKT, Group, Ngày đầu đăng video, Giờ xem Studio, hoặc Người / Mail quản lý kênh
  document.body.addEventListener('change', async (e) => {
    if (e.target.matches?.('input[name="groupChannelIds"]')) {
      if (!state.draftSelectedGroupChannelIds) state.draftSelectedGroupChannelIds = new Set();
      if (e.target.checked) {
        state.draftSelectedGroupChannelIds.add(e.target.value);
      } else {
        state.draftSelectedGroupChannelIds.delete(e.target.value);
      }
      return;
    }

    // Lưu tự động khi sửa tiền tháng của kênh ngay ngoài Trang chủ
    const homeRevInput = e.target.closest('[data-home-ch-rev-id]');
    if (homeRevInput) {
      const chId = homeRevInput.dataset.homeChRevId;
      const month = Number(homeRevInput.dataset.homeChRevMonth) || new Date().getMonth() + 1;
      const localCh = state.channels.find((c) => c.id === chId);
      if (localCh) {
        const monthlyRevenue = getChannelMonthlyRevenueMap(localCh);
        try {
          const updated = await apiRequest(`/api/youtube/channels/${encodeURIComponent(chId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ monthlyRevenue }),
          });
          localCh.monthlyRevenue = updated.monthlyRevenue || monthlyRevenue;
          localCh.totalYearlyRevenue = updated.totalYearlyRevenue ?? sumChannelMonthlyRevenue(monthlyRevenue);
          recalculateHomePageRevenueLive();
          renderBrandIdentityTab();
          showBanner(
            `Đã lưu tiền Tháng ${month} của kênh "${updated.name}" — Tổng tiền kênh: ${formatRevenueAmount(localCh.totalYearlyRevenue)}!`
          );
        } catch (err) {
          showBanner(err.message, true);
        }
      }
      return;
    }
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
      if (val) {
        saveLocalCustomGroup(val);
      }
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
      return;
    }

    const revChangeInput = e.target.closest('[data-channel-rev-id]');
    if (revChangeInput) {
      const chId = revChangeInput.dataset.channelRevId;
      await saveChannelMonthlyRevenueFromDom(chId);
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

  document.addEventListener('click', async (e) => {
    if (sidebarSettingsMenu && !sidebarSettingsMenu.hidden && !e.target.closest('#sidebar-settings-wrap')) {
      closeSidebarSettingsMenu();
    }

    // Chuyển tab Đăng nhập Gmail <-> Admin <-> Đăng ký Gmail mới trên màn hình khóa
    const authTabBtn = e.target.closest('[data-auth-tab], [data-switch-auth-tab]');
    if (authTabBtn) {
      const targetTab = authTabBtn.dataset.authTab || authTabBtn.dataset.switchAuthTab || 'login';
      const errLogin = document.getElementById('auth-login-error');
      const errReg = document.getElementById('auth-register-error');
      if (errLogin) errLogin.hidden = true;
      if (errReg) errReg.hidden = true;
      switchAuthOverlayTab(targetTab);
      return;
    }

    // Nút "Continue with Google" trên màn hình đăng nhập
    const googleBtn = e.target.closest('#btn-continue-google');
    if (googleBtn) {
      const userInp = document.getElementById('input-auth-username');
      const passStep = document.getElementById('auth-password-step');
      const loginForm = document.getElementById('form-auth-login');
      const boxEl = document.getElementById('auth-saved-gmails-box');
      if (passStep) passStep.hidden = true;
      const currentVal = String(userInp?.value || '').trim();
      if (currentVal && currentVal.toLowerCase() !== 'admin') {
        loginForm?.requestSubmit();
        return;
      }
      const saved = getSavedGmails();
      if (saved.length > 0 && boxEl) {
        const willOpen = boxEl.hidden;
        renderSavedGmailsBox(willOpen);
        if (!willOpen) userInp?.focus();
        return;
      }
      if (userInp) {
        userInp.value = '';
        userInp.placeholder = 'Enter your Google Gmail (e.g. name@gmail.com)...';
        userInp.focus();
      }
      return;
    }

    // Link "Admin Access" trên màn hình đăng nhập
    const fillAdminBtn = e.target.closest('[data-fill-admin-login]');
    if (fillAdminBtn) {
      e.preventDefault();
      switchAuthOverlayTab('admin');
      return;
    }

    // Link "Isolated Gmail Workspace"
    const focusGmailBtn = e.target.closest('[data-focus-gmail-login]');
    if (focusGmailBtn) {
      e.preventDefault();
      switchAuthOverlayTab('login');
      return;
    }

    // Chọn nhanh 1 Gmail đã đăng nhập gần đây -> Đăng nhập 1 chạm ngay lập tức
    const pickSavedGmailBtn = e.target.closest('[data-pick-saved-gmail]');
    if (pickSavedGmailBtn) {
      const pickedEmail = pickSavedGmailBtn.dataset.pickSavedGmail || '';
      const userInp = document.getElementById('input-auth-username');
      const passStep = document.getElementById('auth-password-step');
      const passInp = document.getElementById('input-auth-login-pass');
      const loginForm = document.getElementById('form-auth-login');
      if (passStep) passStep.hidden = true;
      if (passInp) passInp.value = '';
      if (userInp) userInp.value = pickedEmail;
      renderSavedGmailsBox(false);
      loginForm?.requestSubmit();
      return;
    }

    // Admin duyệt nhanh tài khoản Gmail đăng ký
    const approveBtn = e.target.closest('[data-approve-user-id]');
    if (approveBtn) {
      const userId = approveBtn.dataset.approveUserId;
      approveBtn.disabled = true;
      approveBtn.textContent = 'Đang duyệt...';
      try {
        const res = await apiRequest(`/api/users/${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'approved' }),
        });
        const listRes = await apiRequest('/api/users');
        state.users = Array.isArray(listRes.users) ? listRes.users : [];
        renderCurrentUserSidebarPill();
        renderUsersManagerModal();
        showBanner(`✅ Đã duyệt & cấp quyền hoạt động cho tài khoản Gmail "${res.user?.email}"!`);
      } catch (err) {
        showBanner(err.message, true);
        approveBtn.disabled = false;
        approveBtn.textContent = '✅ Duyệt & Cấp quyền ngay';
      }
      return;
    }

    // Admin tạm khóa quyền tài khoản Gmail
    const suspendBtn = e.target.closest('[data-suspend-user-id]');
    if (suspendBtn) {
      const userId = suspendBtn.dataset.suspendUserId;
      suspendBtn.disabled = true;
      try {
        const res = await apiRequest(`/api/users/${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'suspended' }),
        });
        const listRes = await apiRequest('/api/users');
        state.users = Array.isArray(listRes.users) ? listRes.users : [];
        renderCurrentUserSidebarPill();
        renderUsersManagerModal();
        showBanner(`⏸️ Đã tạm khóa tài khoản Gmail "${res.user?.email}".`);
      } catch (err) {
        showBanner(err.message, true);
        suspendBtn.disabled = false;
      }
      return;
    }

    // Admin xóa tài khoản Gmail
    const deleteUserBtn = e.target.closest('[data-delete-user-id]');
    if (deleteUserBtn) {
      const userId = deleteUserBtn.dataset.deleteUserId;
      deleteUserBtn.disabled = true;
      try {
        const res = await apiRequest(`/api/users/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
        });
        const listRes = await apiRequest('/api/users');
        state.users = Array.isArray(listRes.users) ? listRes.users : [];
        renderCurrentUserSidebarPill();
        renderUsersManagerModal();
        showBanner(`🗑️ Đã xóa tài khoản Gmail "${res.deletedEmail || userId}".`);
      } catch (err) {
        showBanner(err.message, true);
        deleteUserBtn.disabled = false;
      }
      return;
    }
  });

  document.getElementById('btn-open-users-manager')?.addEventListener('click', () => {
    closeSidebarSettingsMenu();
    openUsersManagerModal();
  });
  document.getElementById('btn-settings-users-manager')?.addEventListener('click', () => {
    closeSidebarSettingsMenu();
    openUsersManagerModal();
  });
  document.getElementById('btn-refresh-users-page')?.addEventListener('click', async () => {
    await openUsersManagerModal();
    showBanner('Đã làm mới danh sách tài khoản Gmail!');
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
    state.currentUser = null;
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
      const okEl = document.getElementById('auth-login-success');
      const passStep = document.getElementById('auth-password-step');
      const passInp = document.getElementById('input-auth-login-pass');
      if (errEl) errEl.hidden = true;
      if (okEl) okEl.hidden = true;
      try {
        const fd = new FormData(form);
        const rawEmail = String(fd.get('email') || fd.get('username') || '').trim();
        const password = String(fd.get('password') || '');
        const isAdminId = rawEmail.toLowerCase() === 'admin';

        // Nếu gõ 'admin' mà ô mật khẩu đang ẩn -> mở ô mật khẩu Admin ra để nhập
        if (isAdminId && passStep && passStep.hidden && !password) {
          passStep.hidden = false;
          if (passInp) {
            passInp.placeholder = 'Enter Admin password...';
            passInp.focus();
          }
          return;
        }

        const isDirectGmail = Boolean(rawEmail && !isAdminId);
        const res = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: rawEmail,
            password,
            directGmailLogin: isDirectGmail,
          }),
        });
        setStoredAuthToken(res.token || '');
        state.currentUser = res.user || null;
        if (res.user?.email && res.user?.role !== 'admin') {
          rememberGmailLogin(res.user.email);
        } else if (rawEmail.includes('@')) {
          rememberGmailLogin(rawEmail);
        }
        state.selectedContentId = null;
        state.activeChannelDeepId = null;
        if (passInp) passInp.value = '';
        if (passStep) passStep.hidden = true;
        showAuthLockOverlay(false);
        await loadOverview();
        const roleLabel =
          res.user?.role === 'admin'
            ? 'Toàn quyền Admin'
            : `Gmail Tách riêng (${res.user?.email || rawEmail})`;
        showBanner(`Xin chào ${res.user?.name || 'Admin'} — Đã đăng nhập (${roleLabel})!`);
      } catch (err) {
        if (passStep && passStep.hidden) {
          passStep.hidden = false;
          setTimeout(() => passInp?.focus(), 40);
        }
        if (errEl) {
          errEl.textContent = err.message;
          errEl.hidden = false;
        } else {
          showBanner(err.message, true);
        }
      }
      return;
    }

    if (form.id === 'form-auth-register') {
      e.preventDefault();
      const errEl = document.getElementById('auth-register-error');
      const okEl = document.getElementById('auth-register-success');
      if (errEl) errEl.hidden = true;
      if (okEl) okEl.hidden = true;
      const submitBtn = form.querySelector('button[type="submit"]');
      const origText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang đăng ký & mở Không gian riêng...';
      }
      try {
        const fd = new FormData(form);
        const payload = {
          name: String(fd.get('name') || '').trim(),
          email: String(fd.get('email') || '').trim(),
          password: String(fd.get('password') || ''),
          note: String(fd.get('note') || '').trim(),
        };
        await apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const loginRes = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: payload.email,
            password: payload.password,
            name: payload.name,
            directGmailLogin: true,
          }),
        });
        form.reset();
        rememberGmailLogin(loginRes.user?.email || payload.email);
        setStoredAuthToken(loginRes.token || '');
        state.currentUser = loginRes.user || null;
        state.selectedContentId = null;
        state.activeChannelDeepId = null;
        showAuthLockOverlay(false);
        await loadOverview();
        showBanner(
          `✅ Đã đăng ký & đăng nhập Gmail "${loginRes.user?.email || payload.email}" (Không gian làm việc tách riêng)!`
        );
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message;
          errEl.hidden = false;
        } else {
          showBanner(err.message, true);
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = origText;
        }
      }
      return;
    }

    if (form.id === 'form-admin-create-user') {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      const origText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang tạo...';
      }
      try {
        const fd = new FormData(form);
        const payload = Object.fromEntries(fd.entries());
        const res = await apiRequest('/api/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        form.reset();
        const listRes = await apiRequest('/api/users');
        state.users = Array.isArray(listRes.users) ? listRes.users : [];
        renderCurrentUserSidebarPill();
        renderUsersManagerModal();
        showBanner(`✅ Đã tạo & cấp quyền ngay cho Gmail "${res.user?.email}"!`);
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

    if (form.matches('[data-user-perm-form]')) {
      e.preventDefault();
      const userId = form.dataset.userPermForm;
      const submitBtn = form.querySelector('button[type="submit"]');
      const origText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang lưu...';
      }
      try {
        const scopeMode = form.querySelector('[name="scopeMode"]')?.value || 'isolated';
        const newPassword = String(form.querySelector('[name="newPassword"]')?.value || '').trim();
        const permissions = {
          canCreateChannel: Boolean(form.querySelector('[name="canCreateChannel"]')?.checked),
          canEditChannel: Boolean(form.querySelector('[name="canEditChannel"]')?.checked),
          canDeleteChannel: Boolean(form.querySelector('[name="canDeleteChannel"]')?.checked),
          canViewRevenue: Boolean(form.querySelector('[name="canViewRevenue"]')?.checked),
          canEditRevenue: Boolean(form.querySelector('[name="canEditRevenue"]')?.checked),
          canUseVault: Boolean(form.querySelector('[name="canUseVault"]')?.checked),
        };
        const allowedGroups = Array.from(form.querySelectorAll('input[name="allowedGroups"]:checked')).map(
          (cb) => cb.value
        );
        const allowedChannelIds = Array.from(
          form.querySelectorAll('input[name="allowedChannelIds"]:checked')
        ).map((cb) => cb.value);

        const patchBody = {
          scopeMode,
          permissions,
          allowedGroups,
          allowedChannelIds,
        };
        if (newPassword) {
          patchBody.newPassword = newPassword;
        }

        const res = await apiRequest(`/api/users/${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          body: JSON.stringify(patchBody),
        });
        const listRes = await apiRequest('/api/users');
        state.users = Array.isArray(listRes.users) ? listRes.users : [];
        renderCurrentUserSidebarPill();
        renderUsersManagerModal();
        showBanner(`💾 Đã lưu cấu hình tách riêng & phân quyền cho "${res.user?.email}"!`);
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
        if (
          !payload.group &&
          state.filters.ytGroup &&
          state.filters.ytGroup !== 'all' &&
          state.filters.ytGroup !== '__none__'
        ) {
          payload.group = state.filters.ytGroup;
        }
        const created = await apiRequest('/api/youtube/channels', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        form.reset();
        state.filters.ytChannel = 'all';
        state.filters.ytCategory = 'all';
        state.filters.ytManager = 'all';
        state.filters.ytSearch = '';
        if (state.filters.ytGroup !== 'all' && state.filters.ytGroup !== (created.group || '')) {
          state.filters.ytGroup = created.group || 'all';
        }
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

    if (form.id === 'form-brand-profile') {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      const origText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang lưu cấu hình thương hiệu...';
      }
      try {
        const fd = new FormData(form);
        const payload = Object.fromEntries(fd.entries());
        const updated = await apiRequest('/api/brand', {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        if (state.summary && state.summary.meta) {
          state.summary.meta.brand = updated;
        }
        await loadOverview();
        showBanner(`✨ Đã cập nhật Bộ Nhận Diện Thương Hiệu & Thông Tin Thương Mại (${updated.brandName})!`);
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
  });
}

// =============================================================================
// TAB 4: BỘ NHẬN DIỆN THƯƠNG HIỆU & THÔNG TIN THƯƠNG MẠI (FUTURISTIC BRAND KIT)
// =============================================================================
function renderBrandIdentityTab() {
  const brand = state.summary?.meta?.brand || {
    brandName: 'StudioFlow',
    commercialTitle: 'STUDIOFLOW ENTERPRISE OS',
    tagline: 'Hệ Điều Hành Quản Trị Mạng Lưới Kênh YouTube & Tài Sản Số Thế Hệ Mới',
    companyName: 'TIPHOMART DIGITAL MEDIA CORP',
    domain: 'tiphomart.io.vn',
    hotline: '0900.888.999',
    email: 'contact@tiphomart.io.vn',
    address: 'Tổ hợp Công nghệ & Truyền thông Số StudioFlow Việt Nam',
    edition: 'Mệnh Kim Futuristic · Commercial v4.0',
    licenseCode: 'SF-ENT-2026-GOLD',
  };

  // Đồng bộ thương hiệu lên thanh điều hướng trái, thanh Telemetry đỉnh trang, màn hình khóa & chân trang
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('sidebar-brand-name', 'ACB9x');
  setText('top-brand-title', 'ACB9x');
  setText('top-brand-tagline', brand.tagline || '');
  setText('top-brand-domain', brand.domain || 'tiphomart.io.vn');
  setText('login-brand-title', 'ACB9x');
  setText('login-brand-sub', `${brand.companyName || 'TIPHOMART DIGITAL MEDIA CORP'} · ${brand.edition || 'Commercial Edition'}`);

  const totalChannels = state.channels.length;
  const monetizedChannels = state.channels.filter(
    (c) => c.monetization === 'enabled' || c.status === 'monetized'
  ).length;
  const totalSubs = state.channels.reduce((sum, c) => sum + (Number(c.subscribers) || 0), 0);
  const totalViews = state.summary?.youtube?.totalViews || 0;
  const totalVideos = state.videos.length;
  const totalRevenue =
    state.summary?.youtube?.totalNetworkRevenue ??
    state.channels.reduce((sum, c) => sum + (Number(c.totalYearlyRevenue) || 0), 0);

  // Chân trang thương mại (Commercial Footer)
  const footerEl = document.getElementById('commercial-footer');
  if (footerEl) {
    footerEl.innerHTML = `
      <div class="commercial-footer-inner">
        <div class="commercial-footer-brand">
          <div class="commercial-footer-emblem">
            <svg width="24" height="24" viewBox="0 0 64 64" fill="none">
              <polygon points="32,4 56,18 56,46 32,60 8,46 8,18" stroke="#D4AF37" stroke-width="3" fill="#0B0F19"/>
              <polygon points="26,20 44,32 26,44" fill="#D4AF37"/>
            </svg>
          </div>
          <div>
            <div class="commercial-footer-title">
              <strong>${escapeHtml(brand.commercialTitle)}</strong>
              <span class="commercial-footer-license">${escapeHtml(brand.licenseCode)}</span>
            </div>
            <div class="commercial-footer-sub">
              © ${new Date().getFullYear()} <strong>${escapeHtml(brand.companyName)}</strong> · ${escapeHtml(brand.address)}
            </div>
          </div>
        </div>
        <div class="commercial-footer-meta">
          <span class="commercial-footer-chip">🌐 ${escapeHtml(brand.domain)}</span>
          <span class="commercial-footer-chip">📞 ${escapeHtml(brand.hotline)}</span>
          <span class="commercial-footer-chip">✉️ ${escapeHtml(brand.email)}</span>
          <button type="button" class="commercial-footer-link" data-open-brand-tab="true">✨ Hồ sơ Thương hiệu</button>
        </div>
      </div>
    `;
  }

  const hubEl = document.getElementById('brand-identity-hub');
  if (!hubEl) return;

  const brandColors = [
    {
      name: 'Hoàng Kim Vương Giả (Imperial Cyber Gold)',
      role: 'Màu chủ đạo thương hiệu · Biểu tượng thịnh vượng & dòng tiền Mệnh Kim',
      hex: '#D4AF37',
      rgb: '212, 175, 55',
      previewBg: 'linear-gradient(135deg, #FBF0B9 0%, #D4AF37 50%, #9A7418 100%)',
      textColor: '#0B0F19',
    },
    {
      name: 'Hắc Kim Vũ Trụ (Obsidian Core)',
      role: 'Nền buồng lái tương lai · Tạo chiều sâu công nghệ & bảo vệ thị giác',
      hex: '#0B0F19',
      rgb: '11, 15, 25',
      previewBg: 'linear-gradient(135deg, #1E293B 0%, #0B0F19 100%)',
      textColor: '#F8FAFC',
    },
    {
      name: 'Bạch Kim Tinh Khiết (Platinum Titanium)',
      role: 'Bề mặt không gian làm việc · Tối ưu độ tương phản bảng số liệu',
      hex: '#F4F6FA',
      rgb: '244, 246, 250',
      previewBg: 'linear-gradient(135deg, #FFFFFF 0%, #E2E8F0 100%)',
      textColor: '#0F172A',
    },
    {
      name: 'Lục Bảo Tăng Trưởng (Emerald Telemetry)',
      role: 'Chỉ báo kênh Bật kiếm tiền (BKT), tăng trưởng +Views/ngày & doanh thu',
      hex: '#10B981',
      rgb: '16, 185, 129',
      previewBg: 'linear-gradient(135deg, #34D399 0%, #059669 100%)',
      textColor: '#064E3B',
    },
    {
      name: 'Lam Quang Tương Lai (Cyber Cyan)',
      role: 'Tín hiệu đồng bộ Auto 1h, Radar quét kênh & liên kết đám mây',
      hex: '#38BDF8',
      rgb: '56, 189, 248',
      previewBg: 'linear-gradient(135deg, #7DD3FC 0%, #0284C7 100%)',
      textColor: '#0C4A6E',
    },
  ];

  hubEl.innerHTML = `
    <!-- 1. HERO BANNER: BỘ NHẬN DIỆN TƯƠNG LAI & THÔNG SỐ MẠNG LƯỚI THƯƠNG MẠI -->
    <div class="brand-hero-banner">
      <div class="brand-hero-glow"></div>
      <div class="brand-hero-top">
        <div class="brand-hero-identity">
          <div class="brand-hero-emblem-box">
            <svg width="68" height="68" viewBox="0 0 64 64" fill="none">
              <defs>
                <linearGradient id="heroGoldGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#FBF0B9"/>
                  <stop offset="45%" stop-color="#D4AF37"/>
                  <stop offset="100%" stop-color="#9A7418"/>
                </linearGradient>
              </defs>
              <polygon points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5" stroke="url(#heroGoldGrad)" stroke-width="2.5" fill="rgba(11,15,25,0.9)"/>
              <polygon points="32,10 51,21 51,43 32,54 13,43 13,21" stroke="rgba(212,175,55,0.35)" stroke-width="1" stroke-dasharray="3 2" fill="none"/>
              <polygon points="26,20 45,32 26,44" fill="url(#heroGoldGrad)"/>
            </svg>
          </div>
          <div class="brand-hero-text">
            <div class="brand-hero-badges">
              <span class="brand-cyber-pill"><span class="brand-cyber-dot"></span> ${escapeHtml(brand.edition)}</span>
              <span class="brand-license-pill">MÃ BẢN QUYỀN: ${escapeHtml(brand.licenseCode)}</span>
              <span class="brand-domain-pill">🌐 ${escapeHtml(brand.domain)}</span>
            </div>
            <h1 class="brand-hero-title">${escapeHtml(brand.commercialTitle)}</h1>
            <p class="brand-hero-tagline">${escapeHtml(brand.tagline)}</p>
            <div class="brand-hero-company-row">
              <span>🏛️ Đơn vị sở hữu & vận hành: <strong>${escapeHtml(brand.companyName)}</strong></span>
              <span>📍 ${escapeHtml(brand.address)}</span>
            </div>
          </div>
        </div>
        <div class="brand-hero-contact-card">
          <div class="brand-contact-header">THÔNG TIN LIÊN HỆ THƯƠNG MẠI</div>
          <div class="brand-contact-row">
            <span>Tên thương hiệu:</span>
            <strong>${escapeHtml(brand.brandName)}</strong>
          </div>
          <div class="brand-contact-row">
            <span>Tên miền chính thức:</span>
            <strong>${escapeHtml(brand.domain)}</strong>
          </div>
          <div class="brand-contact-row">
            <span>Hotline Đối tác / Mua bản quyền:</span>
            <strong class="brand-gold-text">${escapeHtml(brand.hotline)}</strong>
          </div>
          <div class="brand-contact-row">
            <span>Email Doanh nghiệp:</span>
            <strong>${escapeHtml(brand.email)}</strong>
          </div>
        </div>
      </div>

      <!-- Dải chỉ số quy mô thương mại thời gian thực -->
      <div class="brand-hero-kpi-strip">
        <div class="brand-kpi-cell">
          <span class="brand-kpi-label">QUY MÔ HỆ THỐNG KÊNH</span>
          <strong class="brand-kpi-val num">${formatNumber(totalChannels)} kênh</strong>
          <span class="brand-kpi-sub">${formatNumber(monetizedChannels)} kênh đã Bật kiếm tiền (BKT)</span>
        </div>
        <div class="brand-kpi-cell">
          <span class="brand-kpi-label">TỔNG KHÁN GIẢ ĐĂNG KÝ</span>
          <strong class="brand-kpi-val num">${formatNumber(totalSubs)} subs</strong>
          <span class="brand-kpi-sub">Cập nhật tự động 1 tiếng/lần</span>
        </div>
        <div class="brand-kpi-cell">
          <span class="brand-kpi-label">TỔNG LƯỢT XEM TOÀN MẠNG</span>
          <strong class="brand-kpi-val num">${formatNumber(totalViews)} views</strong>
          <span class="brand-kpi-sub">${formatNumber(totalVideos)} video đang theo dõi radar</span>
        </div>
        <div class="brand-kpi-cell brand-kpi-cell-gold">
          <span class="brand-kpi-label">TỔNG DOANH THU LŨY KẾ 12 THÁNG</span>
          <strong class="brand-kpi-val num brand-gold-text">${formatNumber(totalRevenue)}</strong>
          <span class="brand-kpi-sub">Tổng hợp tự động từ sổ doanh thu các kênh</span>
        </div>
      </div>
    </div>

    <!-- 2. BỘ QUY CHUẨN NHẬN DIỆN THƯƠNG HIỆU (BRAND IDENTITY SYSTEM) -->
    <div class="brand-section-card">
      <div class="brand-section-head">
        <div>
          <span class="brand-section-eyebrow">01 · BRAND IDENTITY GUIDELINES</span>
          <h2 class="brand-section-title">Bộ Quy Chuẩn Nhận Diện Thương Hiệu — Mệnh Kim Futuristic</h2>
          <p class="brand-section-desc">Thiết kế theo triết lý <strong>Kim Tinh Quang (Gold & Platinum Prism)</strong> kết hợp giao diện buồng lái dữ liệu tương lai, mang lại uy tín cao cấp khi trình chiếu với đối tác, nhà đầu tư và khách hàng thương mại.</p>
        </div>
      </div>

      <!-- 3 Phiên bản Logo thương mại -->
      <div class="brand-logo-showcase-grid">
        <div class="brand-logo-card brand-logo-dark">
          <span class="brand-logo-card-tag">PHIÊN BẢN CHÍNH · OBSIDIAN CYBER GOLD</span>
          <div class="brand-logo-stage">
            <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
              <polygon points="32,4 56,18 56,46 32,60 8,46 8,18" stroke="#D4AF37" stroke-width="3" fill="#0B0F19"/>
              <polygon points="26,20 44,32 26,44" fill="#D4AF37"/>
            </svg>
            <div class="brand-logo-lockup-text">
              <strong style="color:#F8FAFC;font-size:1.25rem;letter-spacing:0.06em;">${escapeHtml(brand.brandName).toUpperCase()}</strong>
              <span style="color:#D4AF37;font-size:0.68rem;letter-spacing:0.16em;display:block;font-weight:700;">ENTERPRISE OS</span>
            </div>
          </div>
          <p class="brand-logo-caption">Sử dụng trên nền tối (Sidebar, Header Telemetry, Màn hình Khóa bảo mật & Slide thuyết trình).</p>
        </div>

        <div class="brand-logo-card brand-logo-light">
          <span class="brand-logo-card-tag">PHIÊN BẢN BẠCH KIM · PLATINUM LIGHT</span>
          <div class="brand-logo-stage">
            <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
              <polygon points="32,4 56,18 56,46 32,60 8,46 8,18" stroke="#9A7418" stroke-width="3" fill="#FFFDF7"/>
              <polygon points="26,20 44,32 26,44" fill="#B8860B"/>
            </svg>
            <div class="brand-logo-lockup-text">
              <strong style="color:#0F172A;font-size:1.25rem;letter-spacing:0.06em;">${escapeHtml(brand.brandName).toUpperCase()}</strong>
              <span style="color:#9A7418;font-size:0.68rem;letter-spacing:0.16em;display:block;font-weight:700;">COMMERCIAL EDITION</span>
            </div>
          </div>
          <p class="brand-logo-caption">Sử dụng trên báo cáo tài chính in ấn, hợp đồng thương mại, hóa đơn và nền sáng.</p>
        </div>

        <div class="brand-logo-card brand-logo-monogram">
          <span class="brand-logo-card-tag">BIỂU TƯỢNG ỨNG DỤNG · HEXAGON PRISM ICON</span>
          <div class="brand-logo-stage">
            <div class="brand-app-icon-preview">
              <svg width="46" height="46" viewBox="0 0 64 64" fill="none">
                <polygon points="32,4 56,18 56,46 32,60 8,46 8,18" stroke="#FBF0B9" stroke-width="3" fill="#0B0F19"/>
                <polygon points="26,20 44,32 26,44" fill="#D4AF37"/>
              </svg>
            </div>
            <div class="brand-logo-lockup-text">
              <strong style="color:#F8FAFC;font-size:1rem;">Biểu tượng Lục Giác Kim Cương</strong>
              <span style="color:#94A3B8;font-size:0.75rem;display:block;">Chuẩn PWA App Icon (512×512 SVG)</span>
            </div>
          </div>
          <p class="brand-logo-caption">Khối lục giác tượng trưng cho mạng lưới đa kênh vững chắc; nút Play vàng kim là động cơ tăng trưởng view & doanh thu.</p>
        </div>
      </div>

      <!-- Bảng màu chuẩn thương mại (Click để copy HEX) -->
      <div class="brand-subsection-title">BẢNG MÀU QUY CHUẨN MỆNH KIM TƯƠNG LAI (BẤM VÀO Ô MÀU ĐỂ SAO CHÉP MÃ HEX)</div>
      <div class="brand-color-grid">
        ${brandColors
          .map(
            (c) => `
            <button type="button" class="brand-color-swatch" data-copy-hex="${escapeHtml(c.hex)}" data-copy-name="${escapeHtml(c.name)}" title="Bấm để sao chép mã màu ${escapeHtml(c.hex)}">
              <div class="brand-color-preview" style="background:${c.previewBg};color:${c.textColor};">
                <span class="brand-color-hex-chip">${escapeHtml(c.hex)}</span>
              </div>
              <div class="brand-color-info">
                <strong>${escapeHtml(c.name)}</strong>
                <span class="brand-color-rgb">HEX: ${escapeHtml(c.hex)} · RGB(${escapeHtml(c.rgb)})</span>
                <p>${escapeHtml(c.role)}</p>
              </div>
            </button>
          `
          )
          .join('')}
      </div>
    </div>

    <!-- 3. HỒ SƠ NĂNG LỰC SẢN PHẨM & GIÁ TRỊ THƯƠNG MẠI HÓA (COMMERCIAL VALUE PROPOSITION) -->
    <div class="brand-section-card">
      <div class="brand-section-head">
        <div>
          <span class="brand-section-eyebrow">02 · COMMERCIAL PRODUCT ARCHITECTURE</span>
          <h2 class="brand-section-title">Thông Tin Hệ Thống & 4 Trụ Cột Thương Mại Hóa</h2>
          <p class="brand-section-desc">Kiến trúc phần mềm được đóng gói chuẩn doanh nghiệp (Enterprise-Ready), sẵn sàng vận hành cho các hệ thống Network YouTube, MCN, Agency truyền thông hoặc chuyển giao bản quyền thương mại.</p>
        </div>
      </div>

      <div class="brand-pillars-grid">
        <div class="brand-pillar-card">
          <div class="brand-pillar-num">01</div>
          <h3>Quản Trị Đa Kênh & Phân Tầng Thư Mục</h3>
          <p>Tự động quét chỉ số kênh từ đường dẫn hoặc <code>@handle</code>, phân nhóm theo <strong>Group / Ngách nội dung / Quản lý phụ trách</strong> và theo dõi tình trạng Bật kiếm tiền (BKT), cảnh báo gậy bản quyền trực quan.</p>
        </div>
        <div class="brand-pillar-card">
          <div class="brand-pillar-num">02</div>
          <h3>Sổ Doanh Thu 12 Tháng & Bảo Mật Gà Kết Nối</h3>
          <p>Mỗi kênh tích hợp bảng nhập doanh thu từ <strong>Tháng 1 đến Tháng 12</strong> tự động cộng tổng lũy kế cả năm, đi kèm lớp khóa mật khẩu riêng cho thông tin nhạy cảm <strong>Gà kết nối (AdSense/GA)</strong>.</p>
        </div>
        <div class="brand-pillar-card">
          <div class="brand-pillar-num">03</div>
          <h3>Radar Săn Video Nổ View (Outlier Engine)</h3>
          <p>Thuật toán đối chiếu lượt xem từng video với mức trung bình kênh để phát hiện sớm các chủ đề <strong>Nổ đề xuất (x2.0 đến x10+ TB kênh)</strong> và lưu thẳng vào Kho Nội Dung chỉ với 1 cú nhấp.</p>
        </div>
        <div class="brand-pillar-card">
          <div class="brand-pillar-num">04</div>
          <h3>Đồng Bộ Tự Động 1 Tiếng/Lần & Liên Kết Notion</h3>
          <p>Cơ chế Auto-Reset & cập nhật toàn mạng lưới mỗi 60 phút, liệt kê toàn bộ video dài + Shorts của từng kênh và mở trực tiếp trang quản trị Notion riêng biệt cho từng kênh.</p>
        </div>
      </div>
    </div>

    <!-- 4. TRUNG TÂM TÙY CHỈNH HỒ SƠ THƯƠNG HIỆU THƯƠNG MẠI (EDITABLE BRAND PROFILE) -->
    <div class="brand-section-card">
      <div class="brand-section-head">
        <div>
          <span class="brand-section-eyebrow">03 · COMMERCIAL CUSTOMIZATION & WHITE-LABEL</span>
          <h2 class="brand-section-title">Cấu Hình Thông Tin Thương Hiệu & Bản Quyền Thương Mại</h2>
          <p class="brand-section-desc">Anh có thể thay đổi Tên thương hiệu, Tên công ty, Tên miền, Hotline và Mã bản quyền ngay bên dưới để cá nhân hóa hoàn toàn hệ thống khi làm việc với khách hàng hoặc đối tác.</p>
        </div>
      </div>

      <form id="form-brand-profile" class="brand-config-form">
        <div class="brand-form-grid">
          <label class="brand-field">
            <span>Tên thương hiệu rút gọn (Hiển thị góc trái)</span>
            <input type="text" name="brandName" value="${escapeHtml(brand.brandName)}" required placeholder="VD: StudioFlow" />
          </label>
          <label class="brand-field">
            <span>Tên thương mại đầy đủ (Header & Hero Banner)</span>
            <input type="text" name="commercialTitle" value="${escapeHtml(brand.commercialTitle)}" required placeholder="VD: STUDIOFLOW ENTERPRISE OS" />
          </label>
          <label class="brand-field brand-field-wide">
            <span>Khẩu hiệu định vị thương hiệu (Tagline)</span>
            <input type="text" name="tagline" value="${escapeHtml(brand.tagline)}" placeholder="VD: Hệ Điều Hành Quản Trị Mạng Lưới Kênh YouTube & Tài Sản Số Thế Hệ Mới" />
          </label>
          <label class="brand-field">
            <span>Tên Công ty / Đơn vị sở hữu thương mại</span>
            <input type="text" name="companyName" value="${escapeHtml(brand.companyName)}" placeholder="VD: TIPHOMART DIGITAL MEDIA CORP" />
          </label>
          <label class="brand-field">
            <span>Tên miền chính thức (Domain)</span>
            <input type="text" name="domain" value="${escapeHtml(brand.domain)}" placeholder="VD: tiphomart.io.vn" />
          </label>
          <label class="brand-field">
            <span>Hotline Kinh doanh / Hỗ trợ đối tác</span>
            <input type="text" name="hotline" value="${escapeHtml(brand.hotline)}" placeholder="VD: 0900.888.999" />
          </label>
          <label class="brand-field">
            <span>Email Thương mại</span>
            <input type="text" name="email" value="${escapeHtml(brand.email)}" placeholder="VD: contact@tiphomart.io.vn" />
          </label>
          <label class="brand-field">
            <span>Phiên bản giao diện (Edition)</span>
            <input type="text" name="edition" value="${escapeHtml(brand.edition)}" placeholder="VD: Mệnh Kim Futuristic · Commercial v4.0" />
          </label>
          <label class="brand-field">
            <span>Mã chứng nhận bản quyền (License Code)</span>
            <input type="text" name="licenseCode" value="${escapeHtml(brand.licenseCode)}" placeholder="VD: SF-ENT-2026-GOLD" />
          </label>
          <label class="brand-field brand-field-wide">
            <span>Địa chỉ trụ sở / Tổ hợp vận hành</span>
            <input type="text" name="address" value="${escapeHtml(brand.address)}" placeholder="VD: Tổ hợp Công nghệ & Truyền thông Số StudioFlow Việt Nam" />
          </label>
        </div>
        <div class="brand-form-actions">
          <button type="submit" class="btn-gold">💾 Lưu & Áp dụng Bộ Nhận Diện Thương Hiệu</button>
        </div>
      </form>
    </div>
  `;
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
      .register('/sw.js?v=49', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch(() => {});
  });
}

try {
  if (localStorage.getItem('studioflow_sidebar_collapsed') === '1') {
    const appShellEl = document.getElementById('app-shell') || document.querySelector('.app-shell');
    appShellEl?.classList.add('sidebar-collapsed');
  }
} catch {}

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

// Tự động làm mới dữ liệu nền mỗi 5 phút để cập nhật danh sách video trên 10K views & chỉ số theo ngày
setInterval(() => {
  if (state.showCreateGroupBox) return;
  const activeTag = document.activeElement?.tagName;
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
  loadOverview().catch(() => {});
}, 5 * 60 * 1000);


