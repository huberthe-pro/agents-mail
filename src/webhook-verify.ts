/**
 * Webhook signature verification utility.
 *
 * Consumers use this to verify that webhook deliveries are authentic
 * and not replayed. Checks both HMAC signature and timestamp freshness.
 */

const DEFAULT_TOLERANCE_SECONDS = 300; // 5 minutes

/**
 * Verify a webhook delivery's authenticity and freshness.
 *
 * @param body - The raw request body string
 * @param signatureHex - The X-Webhook-Signature header value (hex-encoded HMAC-SHA256)
 * @param secret - The webhook secret (from webhook registration response)
 * @param timestampStr - The X-Webhook-Timestamp header value (Unix seconds)
 * @param toleranceSeconds - Maximum age in seconds (default 300)
 * @returns true if valid, false otherwise
 */
export async function verifyWebhookSignature(
  body: string,
  signatureHex: string,
  secret: string,
  timestampStr: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): Promise<boolean> {
  // Check timestamp freshness
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) return false;

  // Verify HMAC-SHA256 signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const expectedHex = Array.from(new Uint8Array(expected))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return signatureHex === expectedHex;
}
