import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent } from "undici";
import ipaddr from "ipaddr.js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 10;

const MAX_HOPS = 10;
const MAX_URL_LENGTH = 2048;
const TOTAL_BUDGET_MS = 7600;
const PER_HOP_TIMEOUT_MS = 2200;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
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
    throw new Error("Link không đúng định dạng. Hãy nhập URL đầy đủ, bắt đầu bằng https:// hoặc http://.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Chỉ hỗ trợ URL bắt đầu bằng http:// hoặc https://.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL có thông tin đăng nhập nhúng bên trong không được chấp nhận.");
  }
  return parsed;
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const body = await request.json().catch(() => null) as { url?: unknown } | null;
    let current = normalizeInput(body?.url);
    const inputUrl = current.toString();
    const hops: Array<{ url: string; status: number; nextUrl?: string }> = [];
    const deadline = started + TOTAL_BUDGET_MS;

    for (let step = 0; step < MAX_HOPS; step++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Đã hết thời gian phân tích. Link có thể quá chậm hoặc có quá nhiều bước.");
      await assertPublicHost(current.hostname);

      const dispatcher = new Agent({ connect: { lookup: safeLookup as never } });
      let response: Response;
      try {
        response = await fetch(current.toString(), {
          method: "GET",
          redirect: "manual",
          cache: "no-store",
          signal: AbortSignal.timeout(Math.max(300, Math.min(PER_HOP_TIMEOUT_MS, remaining))),
          headers: {
            "user-agent": "LuaVang-LinkResolver/1.0 (+URL redirect inspection)",
            "accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "range": "bytes=0-0",
          },
          // Node's fetch accepts an Undici dispatcher; this keeps DNS validation on the connection path.
          dispatcher,
        } as RequestInit & { dispatcher: Agent });
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new Error("Máy chủ phản hồi quá chậm hoặc vượt giới hạn thời gian.");
        }
        throw new Error("Không thể truy cập máy chủ của link này. Link có thể hết hạn hoặc chặn công cụ tự động.");
      } finally {
        void dispatcher.close();
      }

      const location = response.headers.get("location");
      if (REDIRECT_CODES.has(response.status) && location) {
        let next: URL;
        try { next = new URL(location, current); }
        catch { throw new Error("Máy chủ trả về địa chỉ chuyển hướng không hợp lệ."); }
        if (next.protocol !== "http:" && next.protocol !== "https:") {
          throw new Error("Link chuyển hướng sang giao thức không được hỗ trợ.");
        }
        if (next.username || next.password) throw new Error("Link chuyển hướng chứa thông tin đăng nhập và đã bị chặn.");
        hops.push({ url: current.toString(), status: response.status, nextUrl: next.toString() });
        await response.body?.cancel().catch(() => undefined);
        current = next;
        continue;
      }

      hops.push({ url: current.toString(), status: response.status });
      await response.body?.cancel().catch(() => undefined);
      return NextResponse.json({
        ok: true,
        inputUrl,
        finalUrl: current.toString(),
        hops,
        status: response.status,
        elapsedMs: Date.now() - started,
        note: "Đã theo dõi chuyển hướng HTTP/HTTPS công khai; kết quả không xác nhận độ an toàn của URL.",
      }, { headers: { "Cache-Control": "no-store" } });
    }

    throw new Error(`Link có nhiều hơn ${MAX_HOPS} bước chuyển hướng; đã dừng để bảo vệ máy chủ.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.";
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
