# Server-Sent Events (SSE) Streaming

## Table of Contents

- When to use SSE
- SSE response construction
- Event formatting
- Client-side consumption
- Connection lifecycle
- Error handling and reconnection

---

## When to Use SSE

Beacon uses SSE for one purpose: streaming AI agent progress logs to the
dashboard in real-time. SSE is chosen over WebSocket because:

- Communication is one-directional (server → client)
- SSE has built-in reconnection and event ID tracking
- Works with standard HTTP (no upgrade handshake)
- Simpler implementation for both server and client
- Works through all proxies and load balancers without special configuration

---

## SSE Response Construction

An SSE response is a standard `Response` with specific headers and a
`ReadableStream` body that stays open:

```typescript
export function sseResponse(
  stream: ReadableStream<Uint8Array>
): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
```

The `X-Accel-Buffering: no` header is important — without it, nginx (and
some other reverse proxies) will buffer the entire response before sending
it to the client, defeating the purpose of streaming.

---

## Creating an SSE Stream

Use a `ReadableStream` with a controller to push events:

```typescript
// src/server/api/ai-logs.ts

route('GET', '/ai/logs/:taskId', async (event, db, config, params) => {
  const { taskId } = params;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Helper to send an SSE event
      function send(eventType: string, data: unknown): void {
        const payload =
          `event: ${eventType}\n` +
          `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      // Send existing logs first (catch-up)
      const existingLogs = db.getAILogs(taskId);
      for (const log of existingLogs) {
        send(log.level, { message: log.message, metadata: log.metadata, timestamp: log.created_at });
      }

      // Subscribe to new logs
      const unsubscribe = aiLogEmitter.subscribe(taskId, (log) => {
        send(log.level, { message: log.message, metadata: log.metadata, timestamp: log.created_at });

        // Close stream when task is complete or errored
        if (log.level === 'complete' || log.level === 'error') {
          controller.close();
          unsubscribe();
        }
      });

      // Clean up on client disconnect
      event.request.signal.addEventListener('abort', () => {
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return sseResponse(stream);
});
```

### Event Emitter for AI Logs

The AI agent process writes logs to the database and also emits them to
any connected SSE clients:

```typescript
// src/server/ai/log-emitter.ts

type LogCallback = (log: AILogEntry) => void;

class AILogEmitter {
  private listeners = new Map<string, Set<LogCallback>>();

  subscribe(taskId: string, callback: LogCallback): () => void {
    if (!this.listeners.has(taskId)) {
      this.listeners.set(taskId, new Set());
    }
    this.listeners.get(taskId)!.add(callback);

    return () => {
      this.listeners.get(taskId)?.delete(callback);
      if (this.listeners.get(taskId)?.size === 0) {
        this.listeners.delete(taskId);
      }
    };
  }

  emit(taskId: string, log: AILogEntry): void {
    this.listeners.get(taskId)?.forEach(cb => cb(log));
  }
}

export const aiLogEmitter = new AILogEmitter();
```

---

## SSE Event Format

SSE has a specific text format. Each event consists of field lines followed
by a blank line:

```
event: progress
data: {"phase":"analyzing","message":"Reading component structure..."}

event: blocked
data: {"question":"The form has two submit buttons — should I fix the primary or secondary?"}

event: complete
data: {"branch":"beacon/fix-14-login-button","files_changed":3}

```

Rules:
- Each field is `fieldname: value\n`
- Events are separated by `\n\n` (blank line)
- The `data` field can span multiple lines: each line needs `data: ` prefix
- The `event` field names the event type (used in `addEventListener` on the client)
- The `id` field (optional) sets the last event ID for reconnection

For Beacon, keep it simple: single-line JSON in the `data` field, event type
matching the log level.

### Beacon SSE Event Types

| Event | Meaning | Data Shape |
|-------|---------|------------|
| `progress` | Agent is working | `{ phase, message, timestamp }` |
| `blocked` | Agent needs input | `{ question, timestamp }` |
| `complete` | Agent finished | `{ branch, files_changed, tests_added, timestamp }` |
| `error` | Agent failed | `{ message, timestamp }` |
| `heartbeat` | Connection alive | `{}` |

---

## Client-Side Consumption

The dashboard connects to the SSE endpoint using the native `EventSource` API:

```typescript
// Dashboard client code
function connectToAILogs(taskId: string) {
  const source = new EventSource(`/__beacon/api/ai/logs/${taskId}`);

  source.addEventListener('progress', (e) => {
    const data = JSON.parse(e.data);
    // Update UI with progress
  });

  source.addEventListener('blocked', (e) => {
    const data = JSON.parse(e.data);
    // Show blocked question UI
  });

  source.addEventListener('complete', (e) => {
    const data = JSON.parse(e.data);
    // Show completion UI
    source.close();
  });

  source.addEventListener('error', (e) => {
    const data = JSON.parse(e.data);
    // Show error UI
    source.close();
  });

  // EventSource auto-reconnects on network errors
  // The onerror handler fires on reconnection attempts
  source.onerror = () => {
    // EventSource will auto-retry with exponential backoff
    // No manual reconnection needed
  };

  return source; // Return so caller can close it when navigating away
}
```

### Heartbeat

If the AI agent is running but hasn't produced output in a while, send
periodic heartbeats to keep the connection alive and let the client know
the stream is still active:

```typescript
// In the stream setup
const heartbeatInterval = setInterval(() => {
  send('heartbeat', {});
}, 15000); // Every 15 seconds

// Clean up
event.request.signal.addEventListener('abort', () => {
  clearInterval(heartbeatInterval);
  // ... other cleanup
});
```

---

## Connection Lifecycle

```
Client opens EventSource
  ↓
Server sends catch-up events (existing logs from DB)
  ↓
Server subscribes to live log emitter
  ↓
Live events stream as they happen
  ↓
On complete/error: server closes stream
On client disconnect: server cleans up subscription
On network error: EventSource auto-reconnects, server sends catch-up again
```

The catch-up step is important — if the dashboard is opened while the AI
agent is already working, the client immediately receives all existing logs
and then continues with live updates. No gaps.

---

## Error Handling

### Client Disconnects

The `event.request.signal` fires an `abort` event when the client closes
the connection. Always listen for this and clean up subscriptions and
intervals. Failing to clean up means memory leaks as subscriptions
accumulate.

### Stream Already Closed

If you try to enqueue or close a controller that's already closed, it throws.
Wrap these calls:

```typescript
function safeSend(controller: ReadableStreamDefaultController, data: Uint8Array): boolean {
  try {
    controller.enqueue(data);
    return true;
  } catch {
    return false; // Stream was closed
  }
}

function safeClose(controller: ReadableStreamDefaultController): void {
  try {
    controller.close();
  } catch {
    // Already closed
  }
}
```

### No Active AI Process

If the client requests logs for a task that isn't currently running AI,
send the existing logs from the database and then close the stream
immediately. Don't leave the connection open waiting for events that
will never come.
