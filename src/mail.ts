const ALLOWED_HTML_TAGS = new Set(['a', 'blockquote', 'br', 'code', 'div', 'em', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'ul']);

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  return /^(https?:\/\/|mailto:|\/)/i.test(trimmed) && !/[\u0000-\u001F\u007F\s"'<>`]/.test(trimmed);
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeHtml(html: string): string {
  if (!html.trim()) {
    return '';
  }

  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(\/?)([a-z0-9-]+)([^>]*)>/gi, (_match, slash, rawTag, rawAttrs) => {
      const tag = String(rawTag).toLowerCase();
      if (!ALLOWED_HTML_TAGS.has(tag)) {
        return '';
      }

      if (slash) {
        return `</${tag}>`;
      }

      if (tag !== 'a') {
        return `<${tag}>`;
      }

      const hrefMatch = String(rawAttrs).match(/\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = hrefMatch?.[2] || hrefMatch?.[3] || hrefMatch?.[4] || '';
      if (!href || !isSafeHref(href)) {
        return '<a>';
      }
      return `<a href="${escapeHtmlAttribute(href)}" rel="noopener noreferrer nofollow" target="_blank">`;
    })
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

export function buildPreviewText(text: string, maxLength = 140): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function normalizeInboundText(text?: string, html?: string): string {
  const normalizedText = (text || '').trim();
  if (normalizedText) {
    return normalizedText;
  }
  return stripHtmlToText(html || '');
}


export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
