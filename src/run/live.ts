/**
 * Every run's stream, shared: a generation started from any client (the iOS app, the preview,
 * `npm run ask`) is mirrored to whoever watches GET /lang/sports/live. A watcher that joins mid-run
 * first gets the events that run has sent so far, so it shows the same screen as the client.
 */

export type LiveFrom = "app" | "web" | "cli";

export interface LiveRun {
  readonly run: string;
  readonly prompt: string;
  readonly from: LiveFrom;
  /** The preview tab that started it, so that tab can skip its own run. */
  readonly client?: string | undefined;
  readonly startedAt: string;
  readonly followUp?: { readonly document: string; readonly baseRevision: number };
}

/** One message on the live feed: a run starting, one of its SSE events, or its end. */
export type LiveMessage =
  | { readonly kind: "start"; readonly run: LiveRun }
  | { readonly kind: "event"; readonly run: string; readonly event: string; readonly data: unknown }
  | { readonly kind: "end"; readonly run: string };

type Listener = (message: LiveMessage) => void;

/** A run's events are kept for late watchers only while it runs; this caps a runaway stream. */
const MAX_BUFFERED = 2_000;

export class LiveHub {
  private readonly listeners = new Set<Listener>();
  private readonly active = new Map<string, LiveMessage[]>();

  start(run: LiveRun): { send: (event: string, data: unknown) => void; end: () => void } {
    this.active.set(run.run, []);
    this.emit({ kind: "start", run });
    return {
      send: (event, data) => this.emit({ kind: "event", run: run.run, event, data }),
      end: () => { this.emit({ kind: "end", run: run.run }); this.active.delete(run.run); },
    };
  }

  /** Replays the runs in progress, then follows every new message until the returned stop is called. */
  subscribe(listener: Listener): () => void {
    for (const buffered of this.active.values()) for (const message of buffered) listener(message);
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(message: LiveMessage): void {
    const run = message.kind === "start" ? message.run.run : message.run;
    const buffered = this.active.get(run);
    if (buffered && buffered.length < MAX_BUFFERED) buffered.push(message);
    for (const listener of this.listeners) listener(message);
  }
}

/** Where a request came from, by its user agent: URLSession says CFNetwork, Node's fetch says node. */
export function liveFrom(userAgent: string | undefined): LiveFrom {
  if (!userAgent || /^node\b/i.test(userAgent)) return "cli";
  return /CFNetwork|Darwin/.test(userAgent) ? "app" : "web";
}
