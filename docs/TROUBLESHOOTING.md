# Khắc phục sự cố — LÙ A VANG Link Resolver

## HTTP 403 như link4m.org

`403 Forbidden` nghĩa là website không chấp nhận yêu cầu mà máy chủ phân tích gửi tới. Đây không phải lỗi CSS/giao diện và việc thay đổi phần trăm tiến trình, User-Agent hoặc thêm một API key không có tài liệu xác thực sẽ không tạo ra quyền truy cập.

1. Nhấn **Mở link gốc trong tab mới** trong giao diện.
2. Tiếp tục theo các hướng dẫn chính thức của website bằng trình duyệt của bạn, nếu bạn có quyền truy cập.
3. Sau khi website chuyển tới đích, sao chép URL hiển thị trên thanh địa chỉ và dán vào phần **Nếu bạn đã tới đích, dán URL tại đây**.
4. Kết quả nhập thủ công được đánh dấu **chưa được máy chủ xác minh**; công cụ không khẳng định URL đó là kết quả phân tích tự động.

Công cụ không tự động giải CAPTCHA, vượt đăng nhập, né kiểm tra chống bot hoặc thay thế token phiên của website bên thứ ba. Chỉ nhà cung cấp mới có thể cấp API/credential chính thức cho một tích hợp được phép.

## Một số mã thường gặp

- `401`: yêu cầu đăng nhập/xác thực.
- `403`: website từ chối yêu cầu của máy chủ phân tích.
- `429`: website đang giới hạn tần suất; chờ rồi thử lại một lần.
- `5xx`: máy chủ đích gặp lỗi hoặc chưa sẵn sàng.
- Không có chuyển hướng: URL có thể là một trang trung gian phụ thuộc JavaScript động, cookie hoặc thao tác người dùng; bộ phân tích không thực thi JavaScript tùy ý.

## Sau khi cập nhật mã nguồn

Chạy trên máy tính:

```bash
npm install
npm run lint
npm run typecheck
npm run build
```

Sau khi các bước kiểm tra qua, commit mã nguồn lên GitHub và redeploy trên Vercel. Không cần API key cho các chuyển hướng HTTP công khai. Đừng lưu khóa bí mật trong `NEXT_PUBLIC_*`, mã trình duyệt hoặc repository công khai.
