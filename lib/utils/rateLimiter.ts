// ─── Rate Limiter & Retry Utility ─────────────────────────────────────────────
// Generic fetch wrapper with exponential backoff for 429 / 5xx errors.
// Drop-in replacement for fetch() in any API call.

interface RetryOptions {
    maxRetries?: number
    baseDelayMs?: number
    maxDelayMs?: number
    retryOn5xx?: boolean
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxRetries: 3,
    baseDelayMs: 300,
    maxDelayMs: 5000,
    retryOn5xx: true,
}

/**
 * Fetch with automatic retry on rate-limit (429) and server errors (5xx).
 * Reads Retry-After header when present; otherwise uses exponential backoff.
 */
export async function fetchWithRetry(
    url: string | URL,
    init?: RequestInit,
    options?: RetryOptions
): Promise<Response> {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            const response = await fetch(url, init)

            // Success or client error (except 429) → return immediately
            if (response.ok || (response.status < 500 && response.status !== 429)) {
                return response
            }

            // 429 Rate Limited
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After')
                const delayMs = retryAfter
                    ? parseInt(retryAfter, 10) * 1000 || opts.baseDelayMs
                    : calculateBackoff(attempt, opts.baseDelayMs, opts.maxDelayMs)

                console.warn(
                    `⚠️ Rate limited (429) on ${typeof url === 'string' ? url.split('?')[0] : url.toString().split('?')[0]}. ` +
                    `Retry ${attempt + 1}/${opts.maxRetries} in ${delayMs}ms`
                )

                if (attempt < opts.maxRetries) {
                    await sleep(delayMs)
                    continue
                }
                return response // exhausted retries, return the 429
            }

            // 5xx Server Error
            if (response.status >= 500 && opts.retryOn5xx) {
                const delayMs = calculateBackoff(attempt, opts.baseDelayMs, opts.maxDelayMs)
                console.warn(
                    `⚠️ Server error (${response.status}) on ${typeof url === 'string' ? url.split('?')[0] : url.toString().split('?')[0]}. ` +
                    `Retry ${attempt + 1}/${opts.maxRetries} in ${delayMs}ms`
                )

                if (attempt < opts.maxRetries) {
                    await sleep(delayMs)
                    continue
                }
                return response
            }

            return response
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err))

            if (attempt < opts.maxRetries) {
                const delayMs = calculateBackoff(attempt, opts.baseDelayMs, opts.maxDelayMs)
                console.warn(
                    `⚠️ Network error: ${lastError.message}. Retry ${attempt + 1}/${opts.maxRetries} in ${delayMs}ms`
                )
                await sleep(delayMs)
            }
        }
    }

    throw lastError ?? new Error('fetchWithRetry: all retries exhausted')
}

/**
 * Wraps an async callback-style function with retry logic.
 * Use for Finnhub SDK calls that don't use fetch() directly.
 */
export async function callWithRetry<T>(
    fn: () => Promise<T>,
    options?: RetryOptions
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn()
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err))
            const msg = lastError.message.toLowerCase()

            // Don't retry auth errors or bad requests
            if (msg.includes('401') || msg.includes('403') || msg.includes('invalid')) {
                throw lastError
            }

            if (attempt < opts.maxRetries) {
                const delayMs = calculateBackoff(attempt, opts.baseDelayMs, opts.maxDelayMs)
                console.warn(`⚠️ Call failed: ${lastError.message}. Retry ${attempt + 1}/${opts.maxRetries} in ${delayMs}ms`)
                await sleep(delayMs)
            }
        }
    }

    throw lastError ?? new Error('callWithRetry: all retries exhausted')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calculateBackoff(attempt: number, baseMs: number, maxMs: number): number {
    // Exponential backoff with jitter: base * 2^attempt + random(0..base)
    const exponential = baseMs * Math.pow(2, attempt)
    const jitter = Math.random() * baseMs
    return Math.min(exponential + jitter, maxMs)
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}
