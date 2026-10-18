import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent } from "undici";
import ipaddr from "ipaddr.js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;

const MAX_HOPS = 12;
const MAX_URL_LENGTH = 2048;
const MAX_HTML_BYTES = 64 * 1024;
const TOTAL_BUDGET_MS = 16_000;
const PER_HOP_TIMEOUT_MS = 3_400;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const BLOCKING_CODES = new Set([401, 403, 407, 429, 451]);
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type Hop = { url: string; status: number; nextUrl?: string; method?: "HTTP" | "HTML" };
type Result = {
  ok: boolean;
  inputUrl: string;
  finalUrl?: string;
  candidateUrl?: string;
  hops: Hop[];
  status?: number;
  elapsedMs: number;
  error?: string;
  note?: string;
};
type ProgressEvent = { type: "progress"; percent: number; message: string; stage: string };
type HopEvent = { type: "hop"; hop: Hop };
type ResultEvent = { type: "result"; result: Result };
type StreamEvent = ProgressEvent | HopEvent | ResultEvent;
type Emit = (event: StreamEvent) => void;

function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

async function assertPublicHost(hostname: string): Promise<void> {
  const cleanHost = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!cleanHost || cleanHost === "localhost" || cleanHost.endsWith(".localhost") || cleanHost.endsWith(".local") || cleanHost.endsWith(".internal")) {
    throw new Error("Tên miền nội bộ hoặc địa chỉ cục bộ không được phép.");
  }
  if (isIP(cleanHost)) {
    if (!isPublicAddress(cleanHost)) throw new Error("Địa chỉ IP riêng hoặc nội bộ không được phép.");
    return;
  }
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(cleanHost, { all: true, verbatim: true });
  } catch {
    throw new Error("Không tìm thấy địa chỉ máy chủ của tên miền này.");
  }
  if (!addresses.length || addresses.some((record) => !isPublicAddress(record.address))) {
    throw new Error("Tên miền phân giải tới địa chỉ mạng riêng hoặc không công khai; đã chặn vì lý do an toàn.");
  }
}

function safeLookup(hostname: string, options: unknown, callback: (...args: unknown[]) => void) {
  lookup(hostname, { all: true, verbatim: true }).then((addresses) => {
    if (!addresses.length || addresses.some((record) => !isPublicAddress(record.address))) {
      callback(new Error("DNS lookup blocked"));
      return;
    }
    const wantsAll = Boolean(options && typeof options === "object" && "all" in options && (options as { all?: boolean }).all);
    if (wantsAll) {
      callback(null, addresses);
      return;
    }
    const first = addresses[0];
    callback(null, first.address, first.family);
  }).catch((error: unknown) => callback(error));
}

function normalizeInput(raw: unknown): URL {
  if (typeof raw !== "string" || !raw.trim() || raw.length > MAX_URL_LENGTH) {
    throw new Error("Hãy nhập một URL hợp lệ, tối đa 2.048 ký tự.");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("Link chưa đúng định dạng. Hãy nhập URL đầy đủ bắt đầu bằng https:// hoặc http://.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Chỉ hỗ trợ URL bắt đầu bằng http:// hoặc https://.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL có thông tin đăng nhập nhúng bên trong không được chấp nhận.");
  }
  parsed.hash = parsed.hash || "";
  return parsed;
}

async function readLimitedText(body: ReadableStream<Uint8Array> | null, limit: number): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const remaining = limit - total;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      total += chunk.byteLength;
      text += decoder.decode(chunk, { stream: value.byteLength <= remaining });
      if (value.byteLength > remaining) break;
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return text;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\\\//g, "/")
    .trim();
}

function extractAutomaticRedirect(html: string, current: URL): { url: URL; method: "HTML" } | null {
  const meta = html.match(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*?url\s*=\s*([^"']+)["'][^>]*>/i)
    ?? html.match(/<meta\b[^>]*content\s*=\s*["'][^"']*?url\s*=\s*([^"']+)["'][^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/i);
  const scriptPatterns = [
    /(?:window\s*\.\s*)?location\s*\.\s*(?:href|assign|replace)\s*(?:=|\()\s*["']([^"']+)["']/i,
    /(?:window\s*\.\s*)?location\s*=\s*["']([^"']+)["']/i,
    /top\s*\.\s*location\s*\.\s*href\s*=\s*["']([^"']+)["']/i,
  ];
  const candidate = meta?.[1]?.split(/["'\s>]/)[0]
    ?? scriptPatterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean);
  if (!candidate) return null;

  const cleaned = decodeHtmlAttribute(candidate);
  try {
    const next = new URL(cleaned, current);
    if (next.protocol !== "http:" && next.protocol !== "https:") return null;
    if (next.username || next.password || next.href === current.href) return null;
    return { url: next, method: "HTML" };
  } catch {
    return null;
  }
}

function looksLikeVerificationPage(html: string, headers: Headers): boolean {
  if (headers.get("cf-mitigated")?.toLowerCase() === "challenge") return true;
  return /captcha|turnstile|verify (?:that )?you are human|checking your browser|attention required|enable javascript and cookies|bot detection|automated requests/i.test(html.slice(0, 16_000));
}

function errorMessageForStatus(status: number, verification: boolean): string {
  if (verification) return `Website yêu cầu xác minh bằng CAPTCHA, JavaScript hoặc kiểm tra chống bot (HTTP ${status}). Công cụ dừng tại đây và không vượt cơ chế xác minh.`;
  if (status === 401) return "Website yêu cầu xác thực hoặc đăng nhập (HTTP 401). Không thể xác định đích bên trong nếu thiếu quyền truy cập.";
  if (status === 403) return "Website từ chối yêu cầu từ máy chủ phân tích (HTTP 403). Chưa thể xác nhận URL đích; đây không phải kết quả thành công.";
  if (status === 407) return "Máy chủ yêu cầu proxy (HTTP 407), nên không thể tiếp tục phân tích.";
  if (status === 429) return "Website giới hạn số lượt yêu cầu (HTTP 429). Hãy chờ rồi thử lại sau.";
  if (status === 451) return "Website không cho phép truy cập nội dung này tại thời điểm kiểm tra (HTTP 451).";
  if (status >= 500) return `Máy chủ website gặp lỗi HTTP ${status}. URL đích chưa được xác nhận hoàn chỉnh.`;
  return `Website trả về HTTP ${status}.`;
}

async function resolveUrl(input: URL, emit: Emit): Promise<Result> {
  const started = Date.now();
  const inputUrl = input.toString();
  const hops: Hop[] = [];
  const seen = new Set<string>();
  let current = new URL(input.href);
  let lastStatus: number | undefined;
  let currentWasValidatedPublic = false;
  const deadline = started + TOTAL_BUDGET_MS;
  const elapsed = () => Date.now() - started;
  const knownCandidate = () => currentWasValidatedPublic && current.href !== input.href ? current.toString() : undefined;
  const progress = (percent: number, message: string, stage: string) => emit({ type: "progress", percent, message, stage });
  const finishError = (error: string, candidateUrl?: string): Result => ({
    ok: false,
    inputUrl,
    candidateUrl,
    hops,
    status: lastStatus,
    elapsedMs: elapsed(),
    error,
  });

  progress(4, "Đã nhận URL. Bắt đầu kiểm tra cấu trúc liên kết.", "validate");
  for (let step = 0; step < MAX_HOPS; step += 1) {
    if (Date.now() >= deadline) return finishError("Đã hết thời gian phân tích. Máy chủ có thể quá chậm hoặc cần xử lý riêng.", knownCandidate());
    if (seen.has(current.href)) return finishError("Phát hiện vòng lặp chuyển hướng. Đã dừng để tránh lặp vô hạn.", current.href);
    seen.add(current.href);

    const base = Math.min(82, 10 + step * 6);
    progress(base, `Bước ${step + 1}: kiểm tra tên miền ${current.hostname}.`, "dns");
    try {
      await assertPublicHost(current.hostname);
      currentWasValidatedPublic = true;
    } catch (error) {
      currentWasValidatedPublic = false;
      return finishError(error instanceof Error ? error.message : "Tên miền không vượt qua kiểm tra an toàn.");
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) return finishError("Đã hết thời gian tổng của yêu cầu.", knownCandidate());
    progress(Math.min(88, base + 3), `Đang gửi yêu cầu GET đến ${current.hostname}.`, "request");

    const dispatcher = new Agent({ connect: { lookup: safeLookup as never } });
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(Math.max(450, Math.min(PER_HOP_TIMEOUT_MS, remaining))),
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
        dispatcher,
      } as RequestInit & { dispatcher: Agent });
    } catch (error) {
      await dispatcher.close().catch(() => undefined);
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") return finishError(`Máy chủ ${current.hostname} phản hồi quá chậm hoặc đã hết thời gian chờ.`, knownCandidate());
      return finishError(`Không thể kết nối tới ${current.hostname}. Máy chủ có thể chặn yêu cầu tự động hoặc liên kết đã hết hạn.`, knownCandidate());
    }

    lastStatus = response.status;
    const location = response.headers.get("location");
    if (REDIRECT_CODES.has(response.status) && location) {
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        await response.body?.cancel().catch(() => undefined);
        await dispatcher.close().catch(() => undefined);
        return finishError("Máy chủ trả về địa chỉ chuyển hướng không hợp lệ.");
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        await response.body?.cancel().catch(() => undefined);
        await dispatcher.close().catch(() => undefined);
        return finishError("Link chuyển hướng sang giao thức không được hỗ trợ.");
      }
      if (next.username || next.password) {
        await response.body?.cancel().catch(() => undefined);
        await dispatcher.close().catch(() => undefined);
        return finishError("Link chuyển hướng chứa thông tin đăng nhập và đã bị chặn.");
      }
      const hop: Hop = { url: current.toString(), status: response.status, nextUrl: next.toString(), method: "HTTP" };
      hops.push(hop);
      emit({ type: "hop", hop });
      await response.body?.cancel().catch(() => undefined);
      await dispatcher.close().catch(() => undefined);
      progress(Math.min(89, base + 5), `Đã phát hiện chuyển hướng HTTP ${response.status} → ${next.hostname}.`, "redirect");
      current = next;
      currentWasValidatedPublic = false;
      continue;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    let html = "";
    if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) {
      html = await readLimitedText(response.body, response.status >= 400 ? 16 * 1024 : MAX_HTML_BYTES);
    } else {
      await response.body?.cancel().catch(() => undefined);
    }

    const isVerification = looksLikeVerificationPage(html, response.headers);
    if (BLOCKING_CODES.has(response.status) || response.status >= 500 || isVerification) {
      const hop: Hop = { url: current.toString(), status: response.status };
      hops.push(hop);
      emit({ type: "hop", hop });
      await dispatcher.close().catch(() => undefined);
      return finishError(errorMessageForStatus(response.status, isVerification), knownCandidate());
    }

    const htmlRedirect = response.status >= 200 && response.status < 400
      ? extractAutomaticRedirect(html, current)
      : null;
    if (htmlRedirect) {
      const hop: Hop = { url: current.toString(), status: response.status, nextUrl: htmlRedirect.url.toString(), method: "HTML" };
      hops.push(hop);
      emit({ type: "hop", hop });
      await dispatcher.close().catch(() => undefined);
      progress(Math.min(89, base + 5), `Đã phát hiện chuyển hướng tự động trong HTML → ${htmlRedirect.url.hostname}.`, "html-redirect");
      current = htmlRedirect.url;
      currentWasValidatedPublic = false;
      continue;
    }

    const hop: Hop = { url: current.toString(), status: response.status };
    hops.push(hop);
    emit({ type: "hop", hop });
    await dispatcher.close().catch(() => undefined);

    const note = response.status >= 400
      ? `Đã xác định URL cuối nhưng trang trả mã HTTP ${response.status}; nội dung có thể không khả dụng.`
      : "Đã theo dõi chuyển hướng HTTP và các kiểu chuyển hướng tự động phổ biến trong HTML. Không thực thi JavaScript tùy ý và không vượt CAPTCHA, đăng nhập hoặc cơ chế chống bot.";
    progress(100, response.status >= 400 ? "Đã tìm URL cuối; máy chủ đích trả lỗi HTTP." : "Đã hoàn tất theo dõi chuyển hướng.", "complete");
    return {
      ok: true,
      inputUrl,
      finalUrl: current.toString(),
      hops,
      status: response.status,
      elapsedMs: elapsed(),
      note,
    };
  }
  return finishError(`Đã vượt giới hạn ${MAX_HOPS} bước chuyển hướng. Đã dừng để bảo vệ máy chủ.`);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { url?: unknown } | null;
  let input: URL;
  try {
    input = normalizeInput(body?.url);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "URL không hợp lệ.", hops: [] }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit: Emit = (event) => {
        try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { /* client disconnected */ }
      };
      void (async () => {
        const result = await resolveUrl(input, emit);
        emit({ type: "result", result });
      })().catch((error: unknown) => {
        emit({
          type: "result",
          result: {
            ok: false,
            inputUrl: input.toString(),
            hops: [],
            elapsedMs: 0,
            error: error instanceof Error ? error.message : "Có lỗi nội bộ khi phân tích liên kết.",
          },
        });
      }).finally(() => {
        try { controller.close(); } catch { /* client disconnected */ }
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}
