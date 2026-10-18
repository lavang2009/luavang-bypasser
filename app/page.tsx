"use client";

import { useState } from "react";
import type { FormEvent } from "react";

type Hop = {
  url: string;
  status: number;
  nextUrl?: string;
  method?: "HTTP" | "HTML";
};

type ResolveResult = {
  ok: boolean;
  inputUrl?: string;
  finalUrl?: string;
  candidateUrl?: string;
  hops?: Hop[];
  status?: number;
  elapsedMs?: number;
  error?: string;
  note?: string;
};

type ProgressState = {
  percent: number;
  message: string;
  stage: string;
};

type StreamEvent =
  | { type: "progress"; percent: number; message: string; stage: string }
  | { type: "hop"; hop: Hop }
  | { type: "result"; result: ResolveResult };

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

function RedirectList({ hops, title = "Đường đi của liên kết" }: { hops: Hop[]; title?: string }) {
  if (!hops.length) return null;
  return (
    <div className="redirect-list">
      <div className="redirect-list-header"><h4>{title}</h4><span>{hops.length} bước</span></div>
      {hops.map((hop, index) => (
        <div className="redirect-step" key={`${hop.url}-${index}`}>
          <span className={`step-index ${index === hops.length - 1 ? "step-index-last" : ""}`}>{String(index + 1).padStart(2, "0")}</span>
          <div className="step-details">
            <strong>{getHostname(hop.url)}</strong>
            <span className="step-url">{hop.url}</span>
            {hop.nextUrl && <span className="step-next">{hop.method === "HTML" ? "Tự chuyển từ nội dung trang đến: " : "Chuyển đến: "}{getHostname(hop.nextUrl)}</span>}
          </div>
          <span className={`response-code ${hop.status >= 400 ? "response-code-error" : ""}`} title={getStatusLabel(hop.status)}>{hop.status}</span>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({ percent: 1, message: "Đang chuẩn bị…", stage: "idle" });
  const [liveHops, setLiveHops] = useState<Hop[]>([]);

  function applyStreamEvent(event: StreamEvent): void {
    if (event.type === "progress") {
      setProgress({ percent: event.percent, message: event.message, stage: event.stage });
      return;
    }
    if (event.type === "hop") {
      setLiveHops((previous) => {
        if (previous.some((hop) => hop.url === event.hop.url && hop.status === event.hop.status)) return previous;
        return [...previous, event.hop];
      });
      return;
    }
    setResult(event.result);
    setProgress({
      percent: event.result.ok ? 100 : 96,
      message: event.result.ok ? "Đã hoàn tất phân tích." : "Đã dừng phân tích; xem lý do bên dưới.",
      stage: event.result.ok ? "complete" : "stopped",
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setCopied(false);
    setResult(null);
    setLiveHops([]);
    setProgress({ percent: 2, message: "Đang khởi tạo yêu cầu…", stage: "start" });

    try {
      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson, application/json" },
        body: JSON.stringify({ url: url.trim() }),
        cache: "no-store",
      });

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("application/x-ndjson") || !response.body) {
        const data = await response.json().catch(() => null) as ResolveResult | null;
        if (data) setResult(data);
        else setResult({ ok: false, error: `Máy chủ trả phản hồi không hợp lệ (HTTP ${response.status}).`, hops: [] });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotResult = false;

      const processLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const event = JSON.parse(trimmed) as StreamEvent;
          if (event.type === "result") gotResult = true;
          applyStreamEvent(event);
        } catch {
          // Ignore malformed individual events; a missing final event is reported below.
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(processLine);
      }
      buffer += decoder.decode();
      if (buffer.trim()) processLine(buffer);
      reader.releaseLock();

      if (!gotResult) {
        setResult({ ok: false, error: "Kết nối kết thúc trước khi máy chủ gửi kết quả đầy đủ. Hãy thử lại.", hops: [] });
      }
    } catch {
      setResult({ ok: false, error: "Không kết nối được máy chủ phân tích. Hãy kiểm tra mạng rồi thử lại.", hops: [] });
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const hops = result?.hops ?? [];
  const finalHostname = result?.finalUrl ? getHostname(result.finalUrl) : "";
  const finalHttpError = Boolean(result?.status && result.status >= 400);

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
              <div className="detail-line"><span className="detail-number">02</span><span>Hiện tiến trình và từng mã phản hồi</span></div>
              <div className="detail-line"><span className="detail-number">03</span><span>Sao chép địa chỉ đích khi xác định được</span></div>
            </div>
          </div>

          <section className="resolver" aria-labelledby="resolver-title">
            <div className="resolver-header">
              <div className="resolver-heading-icon"><LinkSymbol /></div>
              <div>
                <h2 id="resolver-title">Phân tích liên kết</h2>
                <p>Dán URL đầy đủ để bắt đầu.</p>
              </div>
              <span className={`status-label ${busy ? "status-label-active" : ""}`}><span className="status-indicator" /> {busy ? "ĐANG CHẠY" : result && !result.ok ? "CẦN KIỂM TRA" : "SẴN SÀNG"}</span>
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
                {url && !busy && <button type="button" className="clear-input" onClick={() => { setUrl(""); setResult(null); setLiveHops([]); }} aria-label="Xóa đường dẫn">×</button>}
              </div>
              <button type="submit" className="submit-button" disabled={busy || !url.trim()}>
                {busy ? <><span className="button-spinner" /> Đang phân tích…</> : <>Tìm địa chỉ đích <ArrowUpRight size={17} /></>}
              </button>
              <p className="input-hint" id="url-hint"><span aria-hidden="true">i</span> Theo dõi chuyển hướng công khai. Website yêu cầu xác minh có thể dừng tại đó.</p>
            </form>

            {busy && (
              <div className="working-state" role="status" aria-live="polite">
                <div className="working-progress-heading"><span>{progress.message}</span><strong>{progress.percent}%</strong></div>
                <div className="working-bar"><span style={{ width: `${progress.percent}%` }} /></div>
                <p>Đã ghi nhận {liveHops.length} bước chuyển hướng. Tiến trình cập nhật theo phản hồi máy chủ.</p>
                {liveHops.length > 0 && <RedirectList hops={liveHops.slice(-4)} title="Các bước vừa ghi nhận" />}
              </div>
            )}

            {result && !result.ok && (
              <div className="error-result" role="alert">
                <span className="error-mark">!</span>
                <div className="error-result-copy">
                  <strong>Chưa xác nhận được địa chỉ đích</strong>
                  <p>{result.error || "Liên kết này chưa thể xử lý."}</p>
                  {result.candidateUrl && (
                    <div className="candidate-url">
                      <span>Địa chỉ cuối đã thấy, chưa xác minh</span>
                      <a href={result.candidateUrl} target="_blank" rel="noopener noreferrer">{result.candidateUrl} <ArrowUpRight size={13} /></a>
                      <button type="button" className="copy-action" onClick={() => copyUrl(result.candidateUrl!)}>{copied ? "Đã sao chép ✓" : "Sao chép địa chỉ đã thấy"}</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {result && !result.ok && hops.length > 0 && (
              <section className="partial-route" aria-label="Các bước đã kiểm tra">
                <RedirectList hops={hops} title="Đường đi trước khi dừng" />
                <p className="result-caution">Mã phản hồi lỗi không được coi là hoàn tất. Có thể mở link gốc trong trình duyệt của bạn để kiểm tra, nhưng hãy thận trọng với trang lạ.</p>
              </section>
            )}

            {result?.ok && result.finalUrl && (
              <section className="result-area" aria-live="polite" aria-label="Kết quả phân tích">
                <div className="result-title-row">
                  <div><p className="result-eyebrow">KẾT QUẢ</p><h3>{finalHttpError ? "Đã tìm URL, nhưng trang trả lỗi" : "Đã xác định địa chỉ đích"}</h3></div>
                  <span className={`complete-label ${finalHttpError ? "complete-label-warn" : ""}`}><span /> {finalHttpError ? `HTTP ${result.status}` : "ĐÃ XONG"}</span>
                </div>
                <div className={`destination-box ${finalHttpError ? "destination-box-warn" : ""}`}>
                  <div className="destination-topline"><span>{finalHttpError ? "URL CUỐI · PHẢN HỒI LỖI" : "URL ĐÍCH"}</span><span className="destination-host">{finalHostname}</span></div>
                  <a className="destination-url" href={result.finalUrl} target="_blank" rel="noopener noreferrer">{result.finalUrl}<ArrowUpRight size={15} /></a>
                  <button type="button" className="copy-action" onClick={() => copyUrl(result.finalUrl!)}>{copied ? "Đã sao chép ✓" : "Sao chép URL"}</button>
                </div>
                <div className="result-metrics">
                  <div><span>Số bước</span><strong>{hops.length}</strong></div>
                  <div><span>Mã phản hồi cuối</span><strong>{result.status ?? "—"}</strong></div>
                  <div><span>Thời gian</span><strong>{typeof result.elapsedMs === "number" ? `${(result.elapsedMs / 1000).toFixed(2)} giây` : "—"}</strong></div>
                </div>
                <RedirectList hops={hops} />
                <p className="result-caution">{result.note || "Tìm được URL không có nghĩa trang đó an toàn. Kiểm tra tên miền trước khi đăng nhập hoặc tải tệp."}</p>
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
            <p>Công cụ lần theo chuyển hướng HTTP, một số chuyển hướng tự động trong HTML và hiển thị tiến trình theo từng phản hồi máy chủ.</p>
          </div>
          <div className="how-steps">
            <article><span className="how-number">01</span><h3>Dán liên kết</h3><p>Nhập URL rút gọn hoặc URL có thể chuyển hướng, bao gồm giao thức http:// hoặc https://.</p></article>
            <article><span className="how-number">02</span><h3>Theo dõi trực tiếp</h3><p>Xem trạng thái kiểm tra tên miền, gửi yêu cầu, từng mã phản hồi và địa chỉ chuyển tiếp.</p></article>
            <article><span className="how-number">03</span><h3>Đọc kết quả thật</h3><p>Mã 403, 429 hoặc trang xác minh sẽ được đánh dấu là bị chặn, không báo nhầm là đã hoàn tất.</p></article>
          </div>
          <div className="limits-note"><span className="limits-icon">i</span><p><strong>Giới hạn cần biết.</strong> Không có một bộ phân tích chung nào bảo đảm vượt mọi website. Công cụ không thực thi JavaScript tùy ý, không giải CAPTCHA và không vượt đăng nhập, token hoặc cơ chế chống bot. Khi website chặn máy chủ phân tích, kết quả sẽ nói rõ lý do thay vì bịa URL đích.</p></div>
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
