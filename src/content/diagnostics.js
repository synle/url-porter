/** Local-only, bounded diagnostics shared by classic content scripts, extension pages, and the MV3 worker. */
(() => {
  if (globalThis.UrlPorterDiagnostics || !globalThis.chrome?.runtime?.id) return;

  /** Maximum retained observations; no arbitrary messages or page data are stored. */
  const MAX_RECORDS = 100;
  /** Bound pending writes so an error storm cannot allocate an unbounded promise chain. */
  const MAX_PENDING = 20;
  /** Per-context event budget per minute, without a timer or worker keepalive. */
  const MAX_PER_MINUTE = 60;
  /** Maximum inspected stack length and retained extension-owned locations. */
  const MAX_STACK = 8192;
  /** Maximum extension-owned locations per error. */
  const MAX_FRAMES = 8;
  /** Persisted diagnostics key, deliberately separate from settings and sync. */
  const STORAGE_KEY = "urlPorterDiagnostics";
  /** Internal message namespace. */
  const PREFIX = "UrlPorter.diagnostics.";
  /** This extension's origin, used for attribution without retaining its ID. */
  const ROOT = chrome.runtime.getURL("");
  /** Only packaged script paths and numeric positions may cross the storage boundary. */
  const FRAME =
    /^(?:background|chunks|content|pages|viewer)\/[a-zA-Z0-9_./-]+\.(?:m?js|jsx)(?::\d{1,7}){0,2}$/;
  /** Known operations; never accept labels derived from URLs, config, or error messages. */
  const OPERATIONS = [
    "redirect_rebuild",
    "bookmark_reconcile",
    "bookmark_read",
    "selection_viewer",
    "download",
    "tracked_patterns",
  ];
  /** Error names, not arbitrary rejection values or error messages. */
  const ERROR_NAMES = [
    "Error",
    "TypeError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "URIError",
    "EvalError",
    "DOMException",
  ];
  /** Queue tail for the background's sole read/modify/write owner. */
  let queue = Promise.resolve();
  /** Number of accepted writes waiting for storage. */
  let pending = 0;
  /** Whether this context owns storage rather than reporting to the worker. */
  let background = false;
  /** Rate window state, reset only when an observation arrives. */
  let windowStart = Date.now();
  /** Accepted events in the current rate window. */
  let windowCount = 0;
  /** Dropped reports since this worker started; exported without generating more reports. */
  let dropped = 0;
  /** Suppress repeated storage/transport warnings to avoid recursive diagnostics. */
  let warned = false;

  /**
   * Log transport/storage failure once without retaining raw exception data or recursively reporting it.
   * @returns {void}
   */
  function warnUnavailable() {
    if (warned) return;
    warned = true;
    console.warn("[URL Porter diagnostics] Recording unavailable; some evidence was not saved.");
  }

  /**
   * Extract only this extension's packaged locations, never the message or arbitrary stack lines.
   * @param {unknown} value - Stack or filename.
   * @returns {string[]} Safe file positions.
   */
  function locations(value) {
    if (typeof value !== "string") return [];
    return value
      .slice(0, MAX_STACK)
      .split(ROOT)
      .slice(1, MAX_FRAMES + 1)
      .map((part) => part.match(/^[a-zA-Z0-9_./:-]+/)?.[0])
      .filter(
        (part) =>
          typeof part === "string" &&
          part.length <= 180 &&
          !part.includes("..") &&
          FRAME.test(part),
      );
  }

  /**
   * Validate an observation at the writer boundary; reject unknown categories and unsafe fields.
   * @param {unknown} input - Untrusted message payload.
   * @returns {object|null} Allowlisted observation or null.
   */
  function sanitize(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    if (
      ![
        "error",
        "unhandled_rejection",
        "operation_started",
        "operation_completed",
        "worker_started",
        "browser_started",
        "extension_installed",
      ].includes(input.kind)
    )
      return null;
    if (input.operation !== undefined && !OPERATIONS.includes(input.operation)) return null;
    if (
      input.errorName !== undefined &&
      !ERROR_NAMES.includes(input.errorName) &&
      input.errorName !== "UnknownError"
    )
      return null;
    if (
      !Array.isArray(input.frames) ||
      input.frames.length > MAX_FRAMES ||
      !input.frames.every(
        (frame) =>
          typeof frame === "string" &&
          frame.length <= 180 &&
          !frame.includes("..") &&
          FRAME.test(frame),
      )
    )
      return null;
    return {
      kind: input.kind,
      ...(input.operation === undefined ? {} : { operation: input.operation }),
      ...(input.errorName === undefined ? {} : { errorName: input.errorName }),
      frames: input.frames,
    };
  }

  /**
   * Serialize storage operations and recover the queue after rejection; callers still receive the rejection.
   * @param {Function} task - Storage task.
   * @returns {Promise<unknown>} Task result.
   */
  function serialize(task) {
    const result = queue.then(task);
    queue = result.catch(warnUnavailable);
    return result;
  }

  /**
   * Revalidate stored records on read, keeping exports bounded even after manual storage edits.
   * @returns {Promise<object[]>} Sanitized retained records; rejects when storage cannot be read.
   */
  async function readRecords() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    if (!Array.isArray(data[STORAGE_KEY])) return [];
    return data[STORAGE_KEY].slice(-MAX_RECORDS).flatMap((record) => {
      const event = sanitize(record);
      if (
        !event ||
        !Number.isSafeInteger(record.timestamp) ||
        record.timestamp < 0 ||
        !["background", "extension_page", "content_script"].includes(record.context)
      )
        return [];
      return [
        {
          ...event,
          timestamp: record.timestamp,
          context: record.context,
          version: safeVersion(record.version),
        },
      ];
    });
  }

  /**
   * Keep version metadata numeric and bounded, including when reading modified storage.
   * @param {unknown} value - Browser or extension version.
   * @returns {string} Numeric version or unknown.
   */
  function safeVersion(value) {
    return typeof value === "string" && /^\d{1,4}(?:\.\d{1,5}){0,3}$/.test(value)
      ? value
      : "unknown";
  }

  /**
   * Admit an event without timers; bound both message traffic and pending storage work.
   * @returns {boolean} Whether the event fits the rate and queue budgets.
   */
  function admit() {
    const now = Date.now();
    if (now - windowStart >= 60000) {
      windowStart = now;
      windowCount = 0;
    }
    if (windowCount >= MAX_PER_MINUTE || pending >= MAX_PENDING) {
      dropped++;
      return false;
    }
    windowCount++;
    return true;
  }

  /**
   * Append through the single background writer. Errors reach the caller; no retry or telemetry is performed.
   * @param {object} event - Validated observation.
   * @param {string} context - Writer-derived execution context.
   * @returns {Promise<object>} Persistence acknowledgement.
   */
  function append(event, context) {
    if (!admit()) return Promise.resolve({ ok: false, error: "rate_limited" });
    pending++;
    const record = {
      ...event,
      context,
      timestamp: Date.now(),
      version: safeVersion(chrome.runtime.getManifest().version),
    };
    if (event.kind === "error" || event.kind === "unhandled_rejection")
      console.error("[URL Porter diagnostics] Extension JavaScript failure", record);
    return serialize(async () => {
      const records = await readRecords();
      await chrome.storage.local.set({
        [STORAGE_KEY]: [...records, record].slice(-MAX_RECORDS),
      });
      return { ok: true };
    }).finally(() => {
      pending--;
    });
  }

  /**
   * Report a safe observation; a failed write cannot cause an unhandled rejection loop.
   * @param {object} event - Observation with allowlisted fields.
   * @returns {Promise<object>} Best-effort acknowledgement.
   */
  async function report(event) {
    const safe = sanitize(event);
    if (!safe) return { ok: false, error: "invalid_event" };
    try {
      if (background) return await append(safe, "background");
      if (!admit()) return { ok: false, error: "rate_limited" };
      return await chrome.runtime.sendMessage({
        type: `${PREFIX}record`,
        event: safe,
      });
    } catch {
      warnUnavailable();
      return { ok: false, error: "recording_unavailable" };
    }
  }

  /**
   * Capture an explicitly handled extension failure without retaining its message or non-extension stack.
   * @param {unknown} error - Original exception or rejection value.
   * @param {string} operation - Known operation discriminator.
   * @returns {Promise<object>} Persistence acknowledgement.
   */
  function reportError(error, operation) {
    return report({
      kind: "error",
      operation,
      errorName: ERROR_NAMES.includes(error?.name) ? error.name : "UnknownError",
      frames: locations(error?.stack),
    });
  }

  /**
   * Record a bounded operation breadcrumb. An unfinished operation is not proof of a crash.
   * @param {"operation_started"|"operation_completed"} kind - Observation kind.
   * @param {string} operation - Known operation discriminator.
   * @returns {Promise<object>} Persistence acknowledgement.
   */
  function operation(kind, operation) {
    return report({ kind, operation, frames: [] });
  }

  /**
   * Install the sole storage owner and internal RPC handler synchronously in the worker.
   * @returns {void} Registers lifecycle listeners and queues a neutral worker-start observation.
   */
  function startBackground() {
    if (background) return;
    background = true;
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (typeof message?.type !== "string" || !message.type.startsWith(PREFIX)) return;
      if (sender.id !== chrome.runtime.id) {
        sendResponse({ ok: false, error: "unauthorized" });
        return;
      }
      const optionsPage = sender.url === `${ROOT}pages/options/options.html`;
      const extensionPage =
        typeof sender.url === "string" &&
        (sender.url.startsWith(`${ROOT}pages/`) || sender.url.startsWith(`${ROOT}viewer/`));
      let task;
      if (message.type === `${PREFIX}record`) {
        const event = sanitize(message.event);
        if (!event || !["error", "unhandled_rejection"].includes(event.kind)) {
          sendResponse({ ok: false, error: "invalid_event" });
          return;
        }
        task = append(event, extensionPage ? "extension_page" : "content_script");
      } else if (optionsPage && message.type === `${PREFIX}get`) {
        task = serialize(async () => ({
          ok: true,
          report: {
            schemaVersion: 1,
            exportedAt: Date.now(),
            environment: {
              extensionVersion: safeVersion(chrome.runtime.getManifest().version),
              chromiumVersion: safeVersion(
                navigator.userAgent.match(/(?:Chrome|Chromium)\/([\d.]+)/)?.[1],
              ),
              os: /Windows/.test(navigator.userAgent)
                ? "Windows"
                : /Mac OS/.test(navigator.userAgent)
                  ? "macOS"
                  : /Linux/.test(navigator.userAgent)
                    ? "Linux"
                    : "unknown",
            },
            droppedSinceWorkerStart: dropped,
            limitations:
              "JavaScript observations only. Worker starts and unfinished operations do not prove a crash. Native browser crashes, OOM, and other extensions require separate browser evidence. Latest events may be lost on abrupt termination.",
            records: await readRecords(),
          },
        }));
      } else if (optionsPage && message.type === `${PREFIX}clear`) {
        task = serialize(async () => {
          await chrome.storage.local.remove(STORAGE_KEY);
          dropped = 0;
          return { ok: true };
        });
      } else {
        sendResponse({ ok: false, error: "unauthorized_or_unknown_action" });
        return;
      }
      task
        .then(sendResponse)
        .catch(() => sendResponse({ ok: false, error: "storage_unavailable" }));
      return true;
    });
    chrome.runtime.onStartup.addListener(() => {
      void report({ kind: "browser_started", frames: [] });
    });
    chrome.runtime.onInstalled.addListener(() => {
      void report({ kind: "extension_installed", frames: [] });
    });
    void report({ kind: "worker_started", frames: [] });
  }

  /**
   * Capture extension-origin JavaScript errors only; page and other-extension errors are not attributable here.
   * @param {ErrorEvent} event - Global error event.
   * @returns {void}
   */
  function onError(event) {
    const position =
      Number.isSafeInteger(event.lineno) &&
      event.lineno > 0 &&
      Number.isSafeInteger(event.colno) &&
      event.colno >= 0
        ? `:${event.lineno}:${event.colno}`
        : "";
    const frames = [
      ...locations(typeof event.filename === "string" ? event.filename + position : ""),
      ...locations(event.error?.stack),
    ].slice(0, MAX_FRAMES);
    const extensionPage = globalThis.location?.href?.startsWith(ROOT);
    if (!background && !extensionPage && frames.length === 0) return;
    void report({
      kind: "error",
      errorName: ERROR_NAMES.includes(event.error?.name) ? event.error.name : "UnknownError",
      frames,
    });
  }

  /**
   * Record non-Error rejections in trusted contexts; require extension-owned frames in content scripts.
   * @param {PromiseRejectionEvent} event - Unhandled rejection event.
   * @returns {void}
   */
  function onRejection(event) {
    const frames = locations(event.reason?.stack);
    const extensionPage = globalThis.location?.href?.startsWith(ROOT);
    if (!background && !extensionPage && frames.length === 0) return;
    void report({
      kind: "unhandled_rejection",
      errorName: ERROR_NAMES.includes(event.reason?.name) ? event.reason.name : "UnknownError",
      frames,
    });
  }

  globalThis.UrlPorterDiagnostics = { reportError, operation, startBackground };
  globalThis.addEventListener("error", onError);
  globalThis.addEventListener("unhandledrejection", onRejection);
})();
