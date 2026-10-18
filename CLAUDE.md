# CLAUDE.md — ACB9x StudioFlow (YouTube Channel Management & Content Vault)

Tài liệu bàn giao ngữ cảnh (Handoff Context) để Claude / Claude Code tiếp tục phát triển dự án ngay lập tức mà không mất mạch công việc.

---

## 1. Thông tin Dự án & Hạ tầng Triển khai

- **Tên dự án**: **ACB9x / StudioFlow** — Hệ thống Quản lý Kênh YouTube, Thống kê Nhãn/TopView, Doanh thu 12 tháng & Kho Nội dung (PWA Web + Mobile App).
- **Thư mục mã nguồn trên máy (Local Workspace)**:
  `C:\Users\Acb\.gemini\antigravity\scratch\youtube-crm-pm`
- **Chạy Server Local**:
  ```bash
  node src/server.js
  # Chạy tại: http://localhost:3456
  ```
- **Chạy Kiểm thử (26 Unit & API Tests)**:
  ```bash
  npm test
  ```
- **GitHub Repository (Auto-Deploy lên Render.com)**:
  - Remote: `https://github.com/nguyenthigiangpisv630-png/studioflow-youtube.git` (nhánh `main`)
  - Tên miền chính thức (Production): **`https://tiphomart.io.vn`** (Cổng Admin: **`https://tiphomart.io.vn/admin`**)
  - Mỗi khi sửa code xong, chỉ cần `git add . && git commit -m "vXX: ..." && git push origin main` là Render tự động cập nhật lên `tiphomart.io.vn`.

---

## 2. Cấu trúc File Quan trọng

- [`src/server.js`](src/server.js):
  - HTTP Server thuần Node.js (không phụ thuộc framework ngoài), phục vụ cả REST API (`/api/*`),靜tĩnh (`public/*`), và đường dẫn `/admin`.
  - Tích hợp bảo mật: HTTP Security Headers (`CSP`, `HSTS`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`), chống dò mật khẩu Brute-Force (`HTTP 429` sau 8 lần sai/10 phút), giới hạn payload 2MB (`HTTP 413`).
- [`src/domain/studioStore.js`](src/domain/studioStore.js):
  - Trái tim lưu trữ & xử lý nghiệp vụ (lưu JSON bền vững tại `data/studio-db.json`).
  - Quản lý: Kênh YouTube (`channels`), Video & lịch sử view theo ngày (`videos`), Kho nội dung (`contents`), Dự án (`projects`), CRM (`deals`), Nhóm kênh (`customGroups`), và Phân quyền User (`users`).
- [`src/domain/youtubeFetcher.js`](src/domain/youtubeFetcher.js):
  - Tự động quét thông tin kênh YouTube từ `@Handle` hoặc URL kênh (Sub, tổng Views, tổng Video, ngày đăng video đầu tiên, và danh sách video thực tế).
- [`public/index.html`](public/index.html), [`public/app.js`](public/app.js), [`public/styles.css`](public/styles.css), [`public/sw.js`](public/sw.js):
  - Giao diện Single-Page Application (Vanilla JS ES Modules + CSS tùy biến giao diện Mệnh Kim Hoàng Kim).
  - **Lưu ý quan trọng khi sửa Frontend**: Luôn tăng số phiên bản `?v=XX` trong `public/index.html` (`styles.css?v=XX`, `app.js?v=XX`, `icon.svg?v=XX`), `public/app.js` (`/sw.js?v=XX`) và `CACHE_NAME` trong `public/sw.js` để trình duyệt và Mobile App (PWA) xóa cache cũ ngay lập tức.

---

## 3. Các Tính năng & Quy tắc Nghiệp vụ Hiện tại (Đã hoàn thiện đến `v60`)

1. **Tài khoản Admin & Phân quyền Thành viên (Multi-tenant / Isolated Workspace)**:
   - **Username mặc định của Admin**: **`timhanhphuc`** (vào qua link `/admin` hoặc gõ `timhanhphuc` ở màn hình đăng nhập ngoài).
   - **Đăng ký & Đăng nhập Thành viên (`/`)**:
     - Cho phép đăng ký và đăng nhập bằng **Username** (bắt buộc **trên 3 chữ cái**, tức từ 4 chữ cái trở lên, không bắt buộc đuôi `@gmail.com`).
     - Tài khoản mới đăng ký luôn ở trạng thái `pending` (**Chờ Admin chấp nhận**). Chỉ khi Admin bấm **"✅ Duyệt & Cấp quyền"** trong tab **Quản lý User** thì thành viên mới đăng nhập được (`HTTP 403` nếu chưa duyệt).
     - Không có nút logo Google (`Continue with Google`) trên màn hình đăng nhập.
2. **Bảo mật "Gà kết nối" (Google AdSense) trên từng kênh**:
   - Mặc định ẩn thành `Gà: ••••` kèm 2 nút **`🔒 Xem`** và **`🔑 Pass`**.
   - Bấm vào mở hộp thoại `#ga-unlock-modal` gồm 3 tab:
     - **`🔓 Mở khóa`**: Nhập mật khẩu Gà kết nối để hiện và chỉnh sửa thông tin AdSense.
     - **`🔑 Set Pass`**: Đặt mới hoặc đổi mật khẩu Gà kết nối riêng.
     - **`🔄 Lấy lại Pass`**: Khi quên mật khẩu Gà kết nối, xác minh bằng **Mật khẩu đăng nhập Web** hoặc **Username tài khoản** (ví dụ `timhanhphuc`) để đặt lại mật khẩu Gà mới ngay lập tức.
3. **Bố cục Kênh YouTube trên PC Web (`v58`–`v59`)**:
   - Trên PC Web (`@media (min-width: 769px)`), toàn bộ thông tin của 1 kênh nằm trên **1 hàng ngang duy nhất** theo thứ tự thông minh từ trái sang phải:
     `Tên kênh` ➔ `@Handle ↗` ➔ `SUB` ➔ `TỔNG VIEWS` ➔ `VIDEO` ➔ `Trạng thái BKT` ➔ `Ngách` ➔ `Group` ➔ `Quản lý` ➔ `Gà: •••• [🔒 Xem] [🔑 Pass]` ➔ `📅 Ngày đầu` ➔ `Đồng bộ | Xóa` (căn phải).
   - Trên Mobile / App (`@media (max-width: 768px)` hoặc chế độ `.mode-app`), giữ nguyên chế độ thu gọn Accordion và lưới thông minh (Smart Grid).
