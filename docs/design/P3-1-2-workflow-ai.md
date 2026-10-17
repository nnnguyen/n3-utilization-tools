# P3-1: Workflow Builder & P3-2: AI Features

## 1. Overview
Giai đoạn 3 tập trung vào việc tăng cường khả năng tự động hóa và thông minh hóa quy trình làm việc sau khi cuộc họp Zoom kết thúc.

### Workflow Builder (P3-1)
Người dùng có thể định nghĩa các "Action" sẽ thực hiện tuần tự hoặc song song.
Ví dụ: `Zoom Completed -> Upload YouTube (Private) -> AI Summarize -> Send Email -> Backup OneDrive`.

### AI Features (P3-2)
- **AI Title**: Tự động tạo tiêu đề hấp dẫn dựa trên topic và nội dung cuộc họp.
- **AI Summary**: Tóm tắt các ý chính, hành động cần làm (Action Items).
- **AI Chapters**: Tự động chia chương cho video YouTube dựa trên transcript.

## 2. Technical Design

### Backend
- **AIService**: Interface chung để tích hợp các LLM (OpenAI, Anthropic).
- **WorkflowEngine**: Xử lý việc thực thi các node trong workflow. Lưu trạng thái execution vào database.
- **New Tables (Prisma)**:
    - `Workflow`: Lưu cấu hình các bước.
    - `WorkflowExecution`: Nhật ký thực thi của từng bản ghi Zoom.

### Frontend
- **Workflow Editor**: Giao diện visual (sử dụng React Flow hoặc tương đương) để kéo thả các bước.
- **AI Settings**: Cấu hình API Key (nếu dùng key riêng) hoặc chọn model.

## 3. Implementation Steps

### Phase 3.1: AI Core
1. Cấu hình biến môi trường `OPENAI_API_KEY` (xem hướng dẫn tại [docs/AI_SETUP.md](../AI_SETUP.md)).
2. Tạo `AIService` thực hiện prompt engineering cho Title và Summary.
3. Tích hợp AI vào luồng `ZoomService.handleRecordingCompleted`.

### Phase 3.2: Workflow Builder UI
1. Xây dựng trang quản lý Workflow.
2. Cho phép người dùng tùy chỉnh "If this then that" đơn giản trước khi chuyển sang dạng graph phức tạp.

## 4. Prompt Engineering Strategy
- **Title**: "Dựa vào chủ đề '{topic}' và transcript sau, hãy tạo một tiêu đề YouTube tối ưu (dưới 100 ký tự)..."
- **Summary**: "Hãy tóm tắt cuộc họp này thành 3 phần: Mục tiêu, Nội dung chính, và Các hành động tiếp theo..."
