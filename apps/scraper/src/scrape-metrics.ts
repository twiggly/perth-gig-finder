import type {
  SourceAdapter,
  SourceAdapterResult,
  SourceFetchContext
} from "./types";

export interface HostRequestMetrics {
  requestCount: number;
  errorCount: number;
  responseHeaderMs: number;
  statusCounts: Record<string, number>;
}

export interface SourceRequestMetrics {
  requestCount: number;
  errorCount: number;
  hosts: Record<string, HostRequestMetrics>;
}

export interface SourceRunMetrics {
  source: string;
  queueMs: number;
  fetchSlotWaitMs: number;
  fetchMs: number;
  persistenceMs: number;
  postProcessingMs: number;
  counters: Record<string, number>;
  requests: SourceRequestMetrics;
}

export class MeasuredSourceFetchError extends Error {
  constructor(
    message: string,
    readonly originalError: unknown,
    readonly fetchMs: number,
    readonly requests: SourceRequestMetrics,
    readonly counters: Record<string, number>
  ) {
    super(message);
    this.name = "MeasuredSourceFetchError";
  }
}

interface MutableHostRequestMetrics {
  requestCount: number;
  errorCount: number;
  responseHeaderMs: number;
  statusCounts: Map<string, number>;
}

function getRequestHostname(input: Parameters<typeof fetch>[0]): string {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  try {
    return new URL(rawUrl).hostname || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

function getStatusBucket(status: number): string {
  return status >= 100 && status <= 599
    ? `${Math.floor(status / 100)}xx`
    : "other";
}

export class RequestMetricsCollector {
  private readonly hosts = new Map<string, MutableHostRequestMetrics>();

  createFetch(fetchImpl: typeof fetch): typeof fetch {
    return (async (input, init) => {
      const hostname = getRequestHostname(input);
      const startedAtMs = Date.now();
      const hostMetrics = this.getHostMetrics(hostname);
      hostMetrics.requestCount += 1;

      try {
        const response = await fetchImpl(input, init);
        hostMetrics.responseHeaderMs += Date.now() - startedAtMs;
        const statusBucket = getStatusBucket(response.status);
        hostMetrics.statusCounts.set(
          statusBucket,
          (hostMetrics.statusCounts.get(statusBucket) ?? 0) + 1
        );

        if (!response.ok) {
          hostMetrics.errorCount += 1;
        }

        return response;
      } catch (error) {
        hostMetrics.responseHeaderMs += Date.now() - startedAtMs;
        hostMetrics.errorCount += 1;
        hostMetrics.statusCounts.set(
          "network-error",
          (hostMetrics.statusCounts.get("network-error") ?? 0) + 1
        );
        throw error;
      }
    }) as typeof fetch;
  }

  snapshot(): SourceRequestMetrics {
    const hosts = Object.fromEntries(
      [...this.hosts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([hostname, metrics]) => [
          hostname,
          {
            requestCount: metrics.requestCount,
            errorCount: metrics.errorCount,
            responseHeaderMs: metrics.responseHeaderMs,
            statusCounts: Object.fromEntries(
              [...metrics.statusCounts.entries()].sort(([left], [right]) =>
                left.localeCompare(right)
              )
            )
          }
        ])
    );

    return {
      requestCount: Object.values(hosts).reduce(
        (total, host) => total + host.requestCount,
        0
      ),
      errorCount: Object.values(hosts).reduce(
        (total, host) => total + host.errorCount,
        0
      ),
      hosts
    };
  }

  private getHostMetrics(hostname: string): MutableHostRequestMetrics {
    const existing = this.hosts.get(hostname);

    if (existing) {
      return existing;
    }

    const metrics: MutableHostRequestMetrics = {
      requestCount: 0,
      errorCount: 0,
      responseHeaderMs: 0,
      statusCounts: new Map()
    };
    this.hosts.set(hostname, metrics);
    return metrics;
  }
}

export async function fetchSourceListingsWithMetrics(input: {
  source: SourceAdapter;
  fetchImpl?: typeof fetch;
  context?: SourceFetchContext;
}): Promise<{
  result: SourceAdapterResult;
  fetchMs: number;
  requests: SourceRequestMetrics;
  counters: Record<string, number>;
}> {
  const collector = new RequestMetricsCollector();
  const measuredFetch = collector.createFetch(input.fetchImpl ?? fetch);
  const counters = new Map<string, number>();
  const context: SourceFetchContext = {
    loadSourceGigPayloads:
      input.context?.loadSourceGigPayloads ?? (async () => new Map()),
    recordMetric(name, value) {
      if (/^[a-z0-9_.-]+$/i.test(name) && Number.isFinite(value)) {
        counters.set(name, value);
        input.context?.recordMetric?.(name, value);
      }
    }
  };
  const startedAtMs = Date.now();

  try {
    const result = await input.source.fetchListings(
      measuredFetch,
      context
    );

    return {
      result,
      fetchMs: Date.now() - startedAtMs,
      requests: collector.snapshot(),
      counters: Object.fromEntries([...counters.entries()].sort())
    };
  } catch (error) {
    throw new MeasuredSourceFetchError(
      error instanceof Error ? error.message : "Unexpected source fetch failure",
      error,
      Date.now() - startedAtMs,
      collector.snapshot(),
      Object.fromEntries([...counters.entries()].sort())
    );
  }
}

export function formatSourceMetricsLogLine(metrics: SourceRunMetrics): string {
  return `[scrape-metrics] ${JSON.stringify(metrics)}`;
}
