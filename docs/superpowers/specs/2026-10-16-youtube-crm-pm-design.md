# Thiết kế Hệ thống CRM (Sales), Quản lý Dự án, Kho Nội Dung & Quản lý YouTube (Web & App)

## 1. Mục đích & Bối cảnh
Xây dựng hệ thống **StudioFlow** hoạt động trên cả **Web** và **Mobile App (PWA)** giúp cá nhân hoặc đội ngũ sản xuất YouTube quản lý xuyên suốt từ khâu **Sales / Nhận hợp đồng quảng cáo (CRM)** → **Triển khai dự án sản xuất (Project Management)** → **Lưu trữ kịch bản & tài nguyên (Content Vault)** → **Theo dõi hiệu quả Video YouTube với chỉ số lượt xem cập nhật hằng ngày (YouTube Daily Analytics)**.

## 2. Mục tiêu (Goals) & Phi mục tiêu (Non-Goals)
### Mục tiêu:
- **CRM (Sales)**: Quản lý danh sách khách hàng/nhãn hàng, giá trị hợp đồng (VNĐ), trạng thái phễu bán hàng (`Lead mới` → `Đang tư vấn` → `Đàm phán` → `Đã chốt` / `Đã hủy`), tổng hợp doanh thu và chuyển đổi 1 chạm từ Deal sang Dự án.
- **Project Management**: Quản lý dự án theo 5 bước sản xuất YouTube (`Lên ý tưởng`, `Viết kịch bản`, `Quay dựng`, `Duyệt nội dung`, `Đã xuất bản`), quản lý checklist công việc (Tasks), người phụ trách và hạn chót.
- **Nơi lưu nội dung (Content Vault)**: Lưu trữ kịch bản video đầy đủ (soạn thảo và đọc trực tiếp), dàn ý, từ khóa SEO, link Drive/Footage/Thumbnail, tìm kiếm và lọc theo dự án hoặc loại nội dung.
- **Quản lý YouTube & Cập nhật chỉ số lượt xem hằng ngày**:
  - Quản lý danh sách kênh và video YouTube.
  - Lưu lịch sử chỉ số theo từng ngày (`YYYY-MM-DD`): Tổng lượt xem (`views`), Lượt xem tăng trong ngày (`dailyViewsDelta`), Lượt thích (`likes`), Bình luận (`comments`).
  - Hỗ trợ cập nhật chỉ số hằng ngày tự động (cron/scheduler + nút "Cập nhật chỉ số hôm nay" cho toàn bộ video hoặc nhập/đồng bộ từng video) và vẽ biểu đồ xu hướng lượt xem hằng ngày.
- **Có Web và có App**:
  - Giao diện Web rộng rãi cho máy tính.
  - Giao diện App di động (Mobile App) với Bottom Tab Bar, PWA cài đặt được (`manifest.webmanifest`, `sw.js`) và công tắc chuyển đổi chế độ hiển thị **Giao diện Web / Giao diện App Điện Thoại** ngay trên thanh công cụ để người dùng trải nghiệm và kiểm tra cả 2 nền tảng tức thì.

### Phi mục tiêu (Non-Goals):
- Không lưu trữ file video dung lượng hàng chục GB trực tiếp trong cơ sở dữ liệu (hệ thống lưu toàn văn kịch bản/nội dung chữ và quản lý đường dẫn/metadata tới kho lưu trữ file media gốc).

## 3. Kiến trúc Kỹ thuật
- **Backend & Domain Engine**: Node.js (ES Modules), kiến trúc Deep Module (`src/domain/studioStore.js`) đóng gói toàn bộ quy tắc nghiệp vụ của 4 phân hệ và cơ chế tính toán chỉ số lượt xem hằng ngày, lưu trữ bền vững trên đĩa (`data/studio-db.json`) với cơ chế ghi nguyên tử.
- **REST API & Daily Scheduler (`src/server.js`)**:
  - Cung cấp các endpoint chuẩn REST cho Dashboard, CRM Deals, Projects & Tasks, Content Vault, YouTube Videos & Daily Metrics.
  - Tích hợp bộ lập lịch tự động kiểm tra và cập nhật chỉ số lượt xem hằng ngày + hỗ trợ đồng bộ qua YouTube Data API v3 (khi cấu hình `YOUTUBE_API_KEY`) hoặc bộ mô phỏng tăng trưởng thực tế.
- **Frontend Web & Mobile App (`public/`)**:
  - HTML5 + CSS3 chuẩn `impeccable` Operate Mode + Vanilla JavaScript модуle hóa, không phụ thuộc bundler phức tạp, tải tức thì, hỗ trợ đầy đủ PWA (`manifest.webmanifest`, `sw.js`).
