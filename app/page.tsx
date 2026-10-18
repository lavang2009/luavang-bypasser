"use client";

import { useState } from "react";
import type { FormEvent } from "react";

type Hop = {
  url: string;
  status: number;
  nextUrl?: string;
};

type ResolveResult = {
  ok: boolean;
  inputUrl?: string;
  finalUrl?: string;
  hops?: Hop[];
  status?: number;
  elapsedMs?: number;
  error?: string;
};

function getHostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function getStatusLabel(status: number): string {
  if (status >= 200 && status < 300) return "Thành công";
  if (status >= 300 && status < 400) return "Chuyển hướng";
  if (status >= 400) return "Máy chủ trả lỗi";
  return "Phản hồi";
}

function ArrowUpRight({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 17 17 7M8 7h9v9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkSymbol() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 13.5a4.5 4.5 0 0 0 6.36 0l2.1-2.1a4.5 4.5 0 0 0-6.36-6.36l-1.2 1.2" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
      <path d="M14 10.5a4.5 4.5 0 0 0-6.36 0l-2.1 2.1a4.5 4.5 0 0 0 6.36 6.36l1.2-1.2" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
    </svg>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setCopied(false);
    setResult(null);

    try {
      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = (await response.json()) as ResolveResult;
      if (!response.ok && data.ok !== false) {
        setResult({ ok: false, error: "Máy chủ chưa thể xử lý yêu cầu này. Vui lòng thử lại." });
      } else {
        setResult(data);
      }
    } catch {
      setResult({ ok: false, error: "Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại." });
    } finally {
      setBusy(false);
    }
  }

  async function copyFinalUrl() {
    if (!result?.finalUrl) return;
    try {
      await navigator.clipboard.writeText(result.finalUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const hops = result?.hops ?? [];
  const finalHostname = result?.finalUrl ? getHostname(result.finalUrl) : "";

  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="LÙ A VANG — về đầu trang">
          <span className="wordmark-mark">LV</span>
          <span className="wordmark-text">LÙ A VANG<span className="wordmark-divider">/</span><span className="wordmark-product">LINK TOOL</span></span>
        </a>
        <a className="header-link" href="#how-it-works">Cách hoạt động <span aria-hidden="true">↓</span></a>
      </header>

      <div className="main-wrap" id="top">
        <section className="intro-grid" aria-labelledby="page-title">
          <div className="intro-copy">
            <p className="overline"><span className="overline-rule" /> CÔNG CỤ URL MIỄN PHÍ</p>
            <h1 id="page-title">Đi đến đúng<br />địa chỉ <span>đích.</span></h1>
            <p className="intro-description">
              Kiểm tra một liên kết trước khi mở. Xem đường dẫn đi qua đâu,
              máy chủ phản hồi thế nào và URL cuối cùng là gì.
            </p>
            <div className="intro-details">
              <div className="detail-line"><span className="detail-number">01</span><span>Theo dõi chuyển hướng HTTP/HTTPS</span></div>
              <div className="detail-line"><span className="detail-number">02</span><span>Xem từng bước và mã phản hồi</span></div>
              <div className="detail-line"><span className="detail-number">03</span><span>Sao chép đường dẫn đích khi cần</span></div>
            </div>
          </div>

          <section className="resolver" aria-labelledby="resolver-title">
            <div className="resolver-header">
              <div className="resolver-heading-icon"><LinkSymbol /></div>
              <div>
                <h2 id="resolver-title">Phân tích liên kết</h2>
                <p>Dán URL đầy đủ để bắt đầu.</p>
              </div>
              <span className="status-label"><span className="status-indicator" /> SẴN SÀNG</span>
            </div>

            <form className="resolver-form" onSubmit={handleSubmit}>
              <label htmlFor="url-input">ĐƯỜNG DẪN CẦN KIỂM TRA</label>
              <div className={`url-entry ${busy ? "url-entry-busy" : ""}`}>
                <span className="url-entry-symbol" aria-hidden="true">↳</span>
                <input
                  id="url-input"
                  name="url"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://example.com/your-link"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  maxLength={2048}
                  required
                  disabled={busy}
                  aria-describedby="url-hint"
                />
                {url && !busy && <button type="button" className="clear-input" onClick={() => { setUrl(""); setResult(null); }} aria-label="Xóa đường dẫn">×</button>}
              </div>
              <button type="submit" className="submit-button" disabled={busy || !url.trim()}>
                {busy ? <><span className="button-spinner" /> Đang phân tích…</> : <>Tìm địa chỉ đích <ArrowUpRight size={17} /></>}
              </button>
              <p className="input-hint" id="url-hint"><span aria-hidden="true">i</span> Chỉ hỗ trợ link HTTP/HTTPS công khai. Không cần đăng nhập.</p>
            </form>

            {busy && (
              <div className="working-state" role="status" aria-live="polite">
                <div className="working-bar"><span /></div>
                <p>Đang lần theo các bước chuyển hướng…</p>
              </div>
            )}

            {result && !result.ok && (
              <div className="error-result" role="alert">
                <span className="error-mark">!</span>
                <div><strong>Chưa thể tìm được địa chỉ đích</strong><p>{result.error || "Liên kết này chưa thể xử lý."}</p></div>
              </div>
            )}

            {result?.ok && result.finalUrl && (
              <section className="result-area" aria-live="polite" aria-label="Kết quả phân tích">
                <div className="result-title-row">
                  <div><p className="result-eyebrow">KẾT QUẢ</p><h3>Đã hoàn tất phân tích</h3></div>
                  <span className="complete-label"><span /> XONG</span>
                </div>
                <div className="destination-box">
                  <div className="destination-topline"><span>URL ĐÍCH</span><span className="destination-host">{finalHostname}</span></div>
                  <a className="destination-url" href={result.finalUrl} target="_blank" rel="noopener noreferrer">{result.finalUrl}<ArrowUpRight size={15} /></a>
                  <button type="button" className="copy-action" onClick={copyFinalUrl}>{copied ? "Đã sao chép ✓" : "Sao chép URL"}</button>
                </div>
                <div className="result-metrics">
                  <div><span>Số bước</span><strong>{hops.length}</strong></div>
                  <div><span>Mã phản hồi cuối</span><strong>{result.status ?? "—"}</strong></div>
                  <div><span>Thời gian</span><strong>{typeof result.elapsedMs === "number" ? `${(result.elapsedMs / 1000).toFixed(2)} giây` : "—"}</strong></div>
                </div>
                {hops.length > 0 && (
                  <div className="redirect-list">
                    <div className="redirect-list-header"><h4>Đường đi của liên kết</h4><span>{hops.length} bước</span></div>
                    {hops.map((hop, index) => (
                      <div className="redirect-step" key={`${hop.url}-${index}`}>
                        <span className={`step-index ${index === hops.length - 1 ? "step-index-last" : ""}`}>{String(index + 1).padStart(2, "0")}</span>
                        <div className="step-details">
                          <strong>{getHostname(hop.url)}</strong>
                          <span className="step-url">{hop.url}</span>
                          {hop.nextUrl && <span className="step-next">Chuyển đến: {getHostname(hop.nextUrl)}</span>}
                        </div>
                        <span className={`response-code ${hop.status >= 400 ? "response-code-error" : ""}`} title={getStatusLabel(hop.status)}>{hop.status}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="result-caution">Lưu ý: tìm được URL đích không có nghĩa là trang đó an toàn.</p>
              </section>
            )}
          </section>
        </section>

        <div className="privacy-strip" aria-label="Thông tin xử lý">
          <div><span className="privacy-symbol">01</span><span><strong>Không lưu lịch sử link</strong><small>Đường dẫn không được lưu vào cơ sở dữ liệu.</small></span></div>
          <span className="privacy-separator" aria-hidden="true" />
          <div><span className="privacy-symbol">02</span><span><strong>Bạn chủ động mở kết quả</strong><small>Trang đích không tự mở sau khi phân tích.</small></span></div>
          <span className="privacy-separator" aria-hidden="true" />
          <div><span className="privacy-symbol">03</span><span><strong>Có giới hạn bảo vệ</strong><small>Chặn địa chỉ nội bộ và giới hạn số bước.</small></span></div>
        </div>

        <section className="how-section" id="how-it-works">
          <div className="how-heading">
            <p className="overline"><span className="overline-rule" /> CÁCH HOẠT ĐỘNG</p>
            <h2>Rõ ràng từ đầu đến cuối.</h2>
            <p>Công cụ đọc phản hồi chuyển hướng công khai của máy chủ, sau đó trình bày kết quả để bạn tự quyết định bước tiếp theo.</p>
          </div>
          <div className="how-steps">
            <article><span className="how-number">01</span><h3>Dán liên kết</h3><p>Nhập URL rút gọn hoặc URL có thể chuyển hướng, bao gồm giao thức http:// hoặc https://.</p></article>
            <article><span className="how-number">02</span><h3>Kiểm tra đường đi</h3><p>Hệ thống lần theo các mã chuyển hướng HTTP phổ biến và ghi lại mã phản hồi ở mỗi bước.</p></article>
            <article><span className="how-number">03</span><h3>Kiểm tra kết quả</h3><p>Xem URL đích, sao chép để dùng khi cần. Luôn tự đánh giá trang đích trước khi cung cấp dữ liệu.</p></article>
          </div>
          <div className="limits-note"><span className="limits-icon">i</span><p><strong>Giới hạn cần biết.</strong> Một số dịch vụ yêu cầu JavaScript riêng, CAPTCHA, đăng nhập hoặc token có thể không phân tích được. Công cụ không vượt cơ chế xác minh hay quyền truy cập và không thể bảo đảm hoạt động với mọi website.</p></div>
        </section>
      </div>

      <footer className="site-footer">
        <a className="footer-wordmark" href="#top"><span className="footer-mark">LV</span><span>LÙ A VANG</span></a>
        <span className="footer-caption">LINK RESOLVER <span aria-hidden="true">/</span> © {new Date().getFullYear()}</span>
        <a className="footer-back" href="#top">Về đầu trang ↑</a>
      </footer>
    </main>
  );
}
