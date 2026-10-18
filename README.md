# LÙ A VANG — Link Resolver

Website tiếng Việt để theo dõi chuỗi chuyển hướng HTTP/HTTPS công khai và xem tiến trình theo thời gian thực. Giao diện sáng, tối giản, responsive cho điện thoại và máy tính.

## Công nghệ

- Next.js 16 App Router + React + TypeScript
- API Route chạy Node.js runtime và trả tiến trình theo NDJSON streaming
- `undici` cho yêu cầu HTTP và `ipaddr.js` để kiểm tra địa chỉ IP
- Không cần cơ sở dữ liệu hoặc API key cho chức năng cơ bản

## Yêu cầu

- Node.js 20.18.1 trở lên (khuyên dùng Node.js 22 LTS)
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
4. Để Node.js runtime mặc định; không bật Static Export vì dự án cần API Route.
5. Không cần thêm Environment Variables cho chức năng mặc định.

## API nhà cung cấp và CAPTCHA

Dự án không có khóa API chung để vượt mọi dịch vụ rút gọn link. Link4M quảng bá tính năng Developer API, nhưng trang giới thiệu công khai không cung cấp đủ đặc tả endpoint/xác thực để cấu hình một adapter resolver có thể kiểm chứng. Hãy lấy tài liệu và quyền truy cập trực tiếp từ tài khoản/đội hỗ trợ chính thức; không dùng khóa rò rỉ hoặc khóa chia sẻ trên mạng.

Công cụ không tự động né CAPTCHA, JavaScript challenge, đăng nhập hay kiểm tra chống bot của website bên thứ ba. Nó phải báo rằng liên kết chưa xác minh được. Các API CAPTCHA như Turnstile/reCAPTCHA có mục đích xác minh người dùng trên website do bạn quản lý, không phải giải CAPTCHA của website khác.

Xem hướng dẫn kiểm toán và cấu hình tại [`docs/API_PROVIDER_AUDIT.md`](docs/API_PROVIDER_AUDIT.md).

## Khả năng

- Theo dõi chuyển hướng HTTP 301, 302, 303, 307 và 308 bằng yêu cầu GET.
- Nhận diện một số chuyển hướng tự động phổ biến trong HTML như meta refresh và `window.location` với URL tĩnh.
- Tường thuật tiến trình và các bước khi đang chạy; hiển thị đúng lỗi HTTP thay vì báo hoàn tất giả.
- Khi dịch vụ chặn máy chủ phân tích, có nút mở link gốc trong trình duyệt để người dùng tự hoàn tất quy trình được website cho phép và ô ghi nhận URL do người dùng tự cung cấp. URL thủ công luôn được đánh dấu chưa xác minh bởi máy chủ.
- Tối đa 12 bước chuyển hướng, tối đa 64 KiB HTML được đọc ở mỗi bước và giới hạn tổng thời gian xử lý.
- Chỉ hỗ trợ `http://` và `https://`; kiểm tra hostname/DNS và chặn địa chỉ IP riêng hoặc nội bộ nhằm giảm nguy cơ SSRF.
- Không lưu lịch sử vào database; kết quả được trả trực tiếp cho trình duyệt.

## Giới hạn quan trọng

Không có công cụ chung nào có thể bảo đảm xử lý mọi website. Một số link phụ thuộc JavaScript động, token phiên, cookie trình duyệt, CAPTCHA, đăng nhập, giới hạn IP hoặc cơ chế chống bot sẽ được báo là không thể xác nhận, không được coi là đã hoàn tất. Công cụ không thực thi JavaScript tùy ý và không vượt cơ chế xác minh/quyền truy cập.

Tìm thấy URL đích không có nghĩa là website an toàn. Hãy kiểm tra tên miền trước khi đăng nhập hoặc tải tệp.

## Vận hành

Trước khi mở rộng cho lượng truy cập lớn, bổ sung rate limiting dùng kho lưu trữ dùng chung (ví dụ Redis) và giám sát lạm dụng. Giới hạn trong bộ nhớ của một instance không đủ làm rate limit cho nhiều instance Vercel. Kiểm tra bảo mật độc lập trước khi quảng bá rộng rãi.
