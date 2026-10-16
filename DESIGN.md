# DESIGN.md — StudioFlow Visual System (Operate Mode)

## 1. Triết lý thiết kế (Operate Mode)
- **Mục tiêu**: Phục vụ điều hành công việc hằng ngày của đội ngũ Sales, Producer, Scriptwriter và Quản lý kênh YouTube.
- **Độ rõ ràng & Tốc độ quét thông tin**: Sử dụng bảng dữ liệu căn chỉnh chuẩn xác, `font-variant-numeric: tabular-nums` cho toàn bộ số liệu tiền tệ (VNĐ), số lượt xem (`views`) và tăng trưởng hằng ngày (`+Delta`).
- **Hỗ trợ song song Web & Mobile App**:
  - Chế độ **Web Desktop**: Thanh điều hướng cố định bên trái (`248px`), không gian làm việc rộng rãi, chia cột thông minh cho trình đọc/soạn thảo kịch bản và nhật ký lượt xem hằng ngày.
  - Chế độ **Mobile App (PWA)**: Khung hiển thị chuẩn ứng dụng di động với thanh điều hướng đáy 5 tab (`Bottom Navigation Bar`), thao tác một chạm, tích hợp nút chuyển đổi trực tiếp giữa **Web Desktop** và **Mobile App** trên thanh顶栏.

## 2. Bảng màu (Restrained Studio Slate)
- **Nền chính (Workspace Ground)**: `#F8FAFC` (Slate 50 ấm nhẹ, chống mỏi mắt khi làm việc lâu).
- **Bề mặt khối (Surface Primary)**: `#FFFFFF` với viền mảnh `1px solid #E2E8F0`.
- **Thanh điều hướng (Sidebar / App Bar)**: `#0F172A` (Slate 900) tạo điểm tựa thị giác vững chắc.
- **Chữ chính (Ink Primary)**: `#0F172A` (Độ tương phản > 15:1).
- **Chữ phụ (Ink Secondary)**: `#475569` (Độ tương phản > 7:1).
- **Màu nhấn & Trạng thái ngữ nghĩa**:
  - YouTube / Tăng trưởng nóng: `#DC2626` (Crimson 600)
  - Đã chốt (Won) / Đã xuất bản / Tăng trưởng dương: `#059669` (Emerald 600)
  - Đang sản xuất / Đàm phán: `#D97706` (Amber 600)
  - Kịch bản / Đang tư vấn: `#2563EB` (Blue 600)

## 3. Typography & Quy chuẩn hoàn thiện
- **Font chữ chính**: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`.
- **Font số liệu / Mã định danh**: `'JetBrains Mono', 'Fira Code', Consolas, monospace` kết hợp `tabular-nums`.
- **Hệ thống Icon**: Toàn bộ biểu tượng dùng SVG nét vẽ đồng nhất (`stroke-width="1.75"`), tuyệt đối không dùng emoji thay thế icon hệ thống.
