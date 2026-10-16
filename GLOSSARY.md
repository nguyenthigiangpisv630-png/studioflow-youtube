# Domain Glossary — StudioFlow (YouTube CRM, Project Management, Content Vault & Daily Analytics)

Tài liệu này định nghĩa các khái niệm cốt lõi (Domain Model) và các mô-đun sâu (Deep Modules) trong hệ thống.

## 1. CRM & Sales Domain
- **Deal (Hợp đồng / Cơ hội bán hàng)**: Một cơ hội hợp tác tài trợ (Sponsorship), booking quảng cáo hoặc dịch vụ sản xuất video YouTube với khách hàng/nhãn hàng.
  - Các giai đoạn (`stage`): `lead` (Khách tiềm năng), `contacted` (Đang tư vấn), `negotiation` (Đàm phán hợp đồng), `won` (Đã chốt), `lost` (Đã hủy).
- **Deal Conversion (Chuyển đổi hợp đồng sang dự án)**: Quy trình tự động khởi tạo một `Project` sản xuất video từ một `Deal` đã chốt (`won`), giữ nguyên liên kết `dealId` và ngân sách.

## 2. Project Management Domain
- **Project (Dự án sản xuất YouTube)**: Một chiến dịch hoặc dự án sản xuất video cụ thể, có thể gắn với một `Deal` của khách hàng hoặc dự án nội bộ của kênh.
  - Các giai đoạn (`status`): `ideation` (Lên ý tưởng), `scripting` (Viết kịch bản), `production` (Quay dựng), `review` (Duyệt nội dung), `published` (Đã xuất bản).
- **ProductionTask (Công việc sản xuất)**: Đầu việc cụ thể thuộc một `Project` (ví dụ: Viết kịch bản, Thiết kế Thumbnail, Quay B-roll, Dựng hậu kỳ), có người phụ trách (`assignee`), độ ưu tiên (`priority`) và trạng thái hoàn thành.

## 3. Content Vault Domain (Kho lưu trữ nội dung)
- **ContentItem (Đơn vị lưu trữ nội dung)**: Nơi lưu trữ tập trung kịch bản (`script`), dàn ý (`outline`), bộ từ khóa SEO (`seo`), tài nguyên quay dựng (`footage`), thiết kế (`thumbnail`), hoặc tài liệu nhãn hàng (`brand_brief`).
  - Mỗi `ContentItem` gắn với một `Project` (hoặc lưu trữ độc lập), hỗ trợ lưu nội dung văn bản đầy đủ, thẻ phân loại (`tags`), liên kết file gốc (`assetUrl`), và lịch sử cập nhật.

## 4. YouTube Management & Daily Views Engine Domain
- **YouTubeChannel (Kênh YouTube)**: Kênh YouTube được quản lý trong hệ thống (tên kênh, handle, số người đăng ký).
- **YouTubeVideo (Video YouTube)**: Video đã đăng hoặc đang theo dõi, liên kết với `YouTubeChannel`, `Project` và `ContentItem`.
- **DailyMetricSnapshot (Bản ghi chỉ số hằng ngày)**: Bản ghi chỉ số của một `YouTubeVideo` tại một ngày cụ thể (`date: YYYY-MM-DD`), bao gồm:
  - `views` (Tổng lượt xem lũy kế tính đến ngày đó)
  - `dailyViewsDelta` (Số lượt xem tăng thêm trong ngày hôm đó = `views(ngày T) - views(ngày T-1)`)
  - `likes` (Lượt thích)
  - `comments` (Bình luận)
- **DailyViewsSyncService (Bộ đồng bộ chỉ số hằng ngày)**: Module chịu trách nhiệm cập nhật chỉ số lượt xem hằng ngày cho từng video hoặc toàn bộ danh sách video (qua YouTube Data API v3 khi có API Key, hoặc cơ chế cập nhật/đồng bộ hằng ngày tự động), đảm bảo mỗi ngày (`YYYY-MM-DD`) có đúng một bản ghi chuẩn xác (idempotent upsert theo ngày) và tự động tính toán `dailyViewsDelta` cũng như tốc độ tăng trưởng.
