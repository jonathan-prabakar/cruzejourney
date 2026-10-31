/** Match the browser origin to the actual HTTP Host, not Next's internal bind address.
 * Host is browser-controlled by the destination URL; this is CSRF protection, not authentication.
 * Deployments must set trusted proxy/host configuration and their own authorization policies.
 */
export function isSameOrigin(request: Request): boolean {
  try {
    const target = new URL(request.url);
    const host = request.headers.get('host');
    if (host) {
      // Reject malformed authority values rather than letting URL.host silently normalize them.
      const authority = new URL(target.protocol + '//' + host);
      if (authority.host !== host || authority.username || authority.password || authority.pathname !== '/') return false;
      target.host = host;
    }
    return request.headers.get('origin') === target.origin;
  } catch { return false; }
}
