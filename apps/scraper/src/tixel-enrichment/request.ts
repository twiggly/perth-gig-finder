export const TIXEL_MAX_HTML_BYTES = 2 * 1024 * 1024;
export const TIXEL_REQUEST_TIMEOUT_MS = 15_000;

const REQUEST_HEADERS = {
  accept: "text/html,application/xhtml+xml",
  "user-agent": "Gig Radar event link enricher (+https://gigradar.com.au/)"
};

export type TixelFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export type TixelHtmlResult =
  | { html: string; status: "ok"; url: string }
  | { status: "missing" };

interface FetchTixelHtmlOptions {
  fetchImpl?: TixelFetch;
  maxBytes?: number;
  retryDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  timeoutMs?: number;
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function readResponseTextWithinLimit(
  response: Response,
  maxBytes: number
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("Tixel response exceeded the configured size limit");
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    receivedBytes += value.byteLength;

    if (receivedBytes > maxBytes) {
      await reader.cancel();
      throw new Error("Tixel response exceeded the configured size limit");
    }

    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

export async function fetchTixelHtml(
  url: string,
  options: FetchTixelHtmlOptions = {}
): Promise<TixelHtmlResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? TIXEL_MAX_HTML_BYTES;
  const retryDelayMs = options.retryDelayMs ?? 500;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? TIXEL_REQUEST_TIMEOUT_MS;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;

    try {
      response = await fetchImpl(url, {
        headers: REQUEST_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (attempt === 0) {
        await sleep(retryDelayMs);
        continue;
      }

      throw error;
    }

    if (response.status === 404 || response.status === 410) {
      return { status: "missing" };
    }

    if (response.status === 429 || response.status >= 500) {
      await response.body?.cancel();

      if (attempt === 0) {
        await sleep(retryDelayMs);
        continue;
      }
    }

    if (!response.ok) {
      throw new Error(`Tixel request failed with status ${response.status}`);
    }

    const contentType = response.headers.get("content-type");

    if (contentType && !contentType.toLowerCase().includes("text/html")) {
      throw new Error("Tixel response was not HTML");
    }

    return {
      html: await readResponseTextWithinLimit(response, maxBytes),
      status: "ok",
      url: response.url || url
    };
  }

  throw new Error("Tixel request failed after retrying");
}
