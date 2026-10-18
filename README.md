# LÙ A VANG — Link Resolver

Website tiếng Việt để kiểm tra chuỗi chuyển hướng HTTP/HTTPS công khai, xem URL đích, mã phản hồi và từng bước chuyển hướng. Giao diện sáng, tối giản, responsive cho điện thoại và máy tính.

## Công nghệ

- Next.js 16 App Router + React + TypeScript
- API Route dùng Node.js runtime
- `undici` cho yêu cầu HTTP và `ipaddr.js` để kiểm tra địa chỉ IP
- Không cần cơ sở dữ liệu hoặc API key cho chức năng cơ bản

## Yêu cầu

- Node.js 20.9 trở lên
- npm

## Chạy trên Windows

Mở CMD ở thư mục dự án rồi chạy:

```bat
npm install
npm run dev
```

Mở `http://localhost:3000`.

Kiểm tra trước khi deploy:

```bat
npm run lint
npm run typecheck
npm run build
```

## Deploy lên Vercel

1. Đẩy toàn bộ mã nguồn lên một repository GitHub.
2. Vào Vercel → Add New → Project và import repository.
3. Dùng Framework Preset `Next.js`, Build Command `npm run build`.
4. Không cần thêm Environment Variables cho chức năng mặc định.
5. Nhấn Deploy. Đây là ứng dụng Node.js/Next.js đầy đủ nên không bật Static Export.

## Cách hoạt động và giới hạn

- Theo dõi chuyển hướng HTTP 301, 302, 303, 307 và 308.
- Tối đa 10 bước chuyển hướng; có giới hạn thời gian xử lý mỗi yêu cầu.
- Chỉ hỗ trợ `http://` và `https://`, kiểm tra hostname trước khi kết nối và chặn IP riêng/nội bộ phổ biến.
- Không lưu lịch sử vào database; kết quả trả trực tiếp cho trình duyệt.
- Không thực thi JavaScript của website đích, không vượt đăng nhập, CAPTCHA, token, paywall hoặc bước xác minh tương tác. Không thể bảo đảm hoạt động với mọi dịch vụ.
- Tìm thấy URL đích không có nghĩa là website an toàn.

## Trước khi mở rộng cho lượng truy cập lớn

Nên bổ sung rate limiting dùng kho lưu trữ dùng chung (ví dụ Redis) và giám sát lạm dụng. Bộ giới hạn trong bộ nhớ của một instance không phải rate limit đầy đủ cho nhiều instance Vercel. Kiểm tra bảo mật độc lập trước khi quảng bá rộng rãi.
