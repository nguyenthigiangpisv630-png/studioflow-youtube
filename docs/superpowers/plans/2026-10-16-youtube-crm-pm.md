# StudioFlow (YouTube CRM, Project Management, Content Vault & Daily Analytics) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng ứng dụng Web & Mobile App (PWA) hợp nhất quản lý CRM (Sales), Quản lý dự án sản xuất (Project Management), Kho lưu trữ nội dung (Content Vault) và Quản lý kênh/video YouTube với chỉ số lượt xem được cập nhật hằng ngày.

**Architecture:** Hệ thống gồm 3 lớp rõ ràng: (1) Deep Domain Module `StudioStore` quản lý dữ liệu bền vững và toàn bộ quy tắc nghiệp vụ của CRM, Dự án, Kho nội dung và Lịch sử chỉ số lượt xem YouTube hằng ngày; (2) HTTP REST API Server tích hợp bộ lập lịch tự động đồng bộ chỉ số lượt xem mỗi ngày; (3) Giao diện Web & Mobile App (PWA) chuẩn Operate Mode hỗ trợ chuyển đổi linh hoạt giữa chế độ Desktop Web và Mobile App.

**Tech Stack:** Node.js v24 (ES Modules, `node:http`, `node:test`, `node:fs`), HTML5, CSS3 (Custom Properties, Tabular Numerals, Responsive Layout), Vanilla JavaScript, PWA (`manifest.webmanifest`, Service Worker).

**Spec:** `docs/superpowers/specs/2026-10-16-youtube-crm-pm-design.md`

## Global Constraints

- Sử dụng Node.js >= 20 với ES Modules (`"type": "module"`), không phụ thuộc vào cơ sở dữ liệu cài đặt ngoài чтобы chạy ngay tức thì trên Windows.
- Mọi bản ghi chỉ số YouTube theo ngày (`YYYY-MM-DD`) phải đảm bảo tính duy nhất trên mỗi video trong một ngày (upsert theo ngày) và tự động tính chính xác `dailyViewsDelta = views(ngày T) - views(ngày T-1)`.
- Giao diện hỗ trợ đầy đủ cả **Web** và **Mobile App (PWA)**, có thanh điều hướng đáy trên thiết bị di động và nút chuyển đổi nhanh chế độ xem Web / App.
- Ngôn ngữ hiển thị: Tiếng Việt rõ ràng, chuẩn thuật ngữ nghiệp vụ Sales, Sản xuất nội dung và YouTube Studio.

## Review Focus

1. **Cập nhật lượt xem trùng ngày (`YYYY-MM-DD`) trên cùng một video:** Khi cập nhật chỉ số nhiều lần trong cùng một ngày, hệ thống phải ghi đè (upsert) bản ghi của ngày hôm đó thay vì tạo 2 dòng trùng ngày, đồng thời tính lại `dailyViewsDelta` so với ngày liền trước.
2. **Chuyển đổi Deal CRM sang Dự án (Deal-to-Project Conversion) trùng lặp hoặc Deal không tồn tại:** Nếu Deal không tồn tại phải báo lỗi rõ ràng; khi chuyển đổi phải tự động gán `dealId`, tên khách hàng và tạo sẵn các đầu việc (Tasks) mặc định của quy trình sản xuất YouTube.
3. **Liên kết dữ liệu giữa 4 phân hệ (CRM ↔ Dự án ↔ Kho nội dung ↔ Video YouTube):** Khi thêm nội dung vào Kho lưu trữ hoặc thêm Video YouTube gắn với Dự án, thông tin liên kết phải được phản ánh đầy đủ trong báo cáo tổng quan.
4. **Dữ liệu đầu vào rỗng hoặc thiếu trường bắt buộc qua REST API:** Các API `POST` khi thiếu tiêu đề/tên phải trả về HTTP `400 Bad Request` kèm thông báo tiếng Việt rõ ràng thay vì làm sập tiến trình server.
5. **Đồng bộ chỉ số lượt xem hằng ngày cho toàn bộ video (`syncAllVideosDailyMetrics`):** Khi chạy đồng bộ hằng ngày cho một ngày mới, tất cả các video đang hoạt động đều phải có bản ghi chỉ số của ngày đó và tổng lượt xem tăng trong ngày của toàn hệ thống được cộng dồn chính xác.

---

### Task 1: Khởi tạo dự án & Xây dựng Deep Module `StudioStore` (CRM, Project Management, Content Vault, YouTube Daily Metrics)

**Files:**
- Create: `package.json`
- Create: `src/domain/studioStore.js`
- Test: `tests/studioStore.test.js`

**Interfaces:**
- Produces:
  - `class StudioStore` trong `src/domain/studioStore.js`:
    - `constructor({ filePath, seedIfEmpty = true })`
    - `getDashboardSummary(referenceDate?: string)`
    - `listDeals(filter?: { stage?: string, search?: string })`
    - `createDeal(input: { clientName: string, company?: string, contactEmail?: string, contactPhone?: string, value: number, stage?: string, owner?: string, notes?: string, expectedCloseDate?: string })`
    - `updateDeal(id: string, patch: object)`
    - `convertDealToProject(dealId: string, options?: { channelId?: string, dueDate?: string })`
    - `listProjects(filter?: { status?: string, search?: string })`
    - `createProject(input: { title: string, status?: string, priority?: string, owner?: string, dueDate?: string, dealId?: string, channelId?: string, description?: string })`
    - `updateProject(id: string, patch: object)`
    - `addTaskToProject(projectId: string, taskInput: { title: string, assignee?: string, stage?: string, dueDate?: string })`
    - `toggleProjectTask(projectId: string, taskId: string)`
    - `listContentItems(filter?: { type?: string, projectId?: string, search?: string })`
    - `createContentItem(input: { title: string, type: string, projectId?: string, body: string, assetUrl?: string, tags?: string[], status?: string, author?: string })`
    - `updateContentItem(id: string, patch: object)`
    - `listChannels()`
    - `listVideos(filter?: { channelId?: string, projectId?: string, search?: string })`
    - `createVideo(input: { title: string, youtubeVideoId: string, channelId: string, projectId?: string, contentId?: string, publishedAt?: string, initialViews?: number, initialLikes?: number, initialComments?: number, metricDate?: string })`
    - `recordVideoDailyMetrics(videoId: string, snapshot: { date: string, views: number, likes?: number, comments?: number, watchTimeHours?: number, source?: string })`
    - `syncAllVideosDailyMetrics(options?: { date?: string, fetcher?: (video) => Promise<{ views: number, likes: number, comments: number }> })`

- [x] **Step 1: Write the failing test in `tests/studioStore.test.js`**
- [x] **Step 2: Run `node --test tests/studioStore.test.js` to verify it fails**
- [x] **Step 3: Implement `StudioStore` in `src/domain/studioStore.js`**
- [x] **Step 4: Run `node --test tests/studioStore.test.js` to verify all tests pass**

---

### Task 2: Xây dựng HTTP REST API Server & Bộ đồng bộ chỉ số YouTube hằng ngày

**Files:**
- Create: `src/server.js`
- Test: `tests/api.test.js`

**Interfaces:**
- Consumes: `StudioStore` từ `src/domain/studioStore.js`
- Produces:
  - `createAppServer({ store, port })` trong `src/server.js` phục vụ tĩnh `public/` và các API:
    - `GET /api/overview`
    - `GET /api/deals`, `POST /api/deals`, `PATCH /api/deals/:id`, `POST /api/deals/:id/convert`
    - `GET /api/projects`, `POST /api/projects`, `PATCH /api/projects/:id`, `POST /api/projects/:id/tasks`, `PATCH /api/projects/:id/tasks/:taskId/toggle`
    - `GET /api/contents`, `POST /api/contents`, `PATCH /api/contents/:id`
    - `GET /api/youtube/videos`, `POST /api/youtube/videos`, `POST /api/youtube/videos/:id/metrics`, `POST /api/youtube/sync-daily`

- [ ] **Step 1: Write the failing API tests in `tests/api.test.js`**
- [ ] **Step 2: Run `node --test tests/api.test.js` to verify it fails**
- [ ] **Step 3: Implement `createAppServer` in `src/server.js`**
- [ ] **Step 4: Run `node --test` to verify all unit and API tests pass**

---

### Task 3: Xây dựng Giao diện Web & Mobile App (PWA) chuẩn `impeccable` Operate Mode

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`
- Create: `public/manifest.webmanifest`
- Create: `public/sw.js`
- Create: `DESIGN.md`

- [ ] **Step 1: Tạo giao diện HTML/CSS/JS tích hợp cả chế độ Web Desktop và chế độ Mobile App (PWA) kèm trình xem kịch bản, bảng Kanban/Danh sách dự án, Pipeline CRM và Biểu đồ lượt xem YouTube hằng ngày**
- [ ] **Step 2: Kiểm tra trực tiếp bằng тест E2E/HTTP và khởi chạy server thực tế**
