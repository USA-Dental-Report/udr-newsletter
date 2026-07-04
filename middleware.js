export const config = {
  matcher: '/((?!_next).*)',
};

export default function middleware(req) {
  // The Cloudflare email worker posts here directly and can't present the
  // site's Basic Auth credentials — it authenticates with its own shared
  // secret instead, checked inside api/inbox.js.
  const { pathname } = new URL(req.url);
  if (pathname === '/api/inbox' && req.method === 'POST') {
    return;
  }

  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;

  // If credentials aren't configured, don't lock everyone out.
  if (!user || !pass) {
    return;
  }

  const authHeader = req.headers.get('authorization');

  if (authHeader) {
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = atob(encoded);
      const sepIndex = decoded.indexOf(':');
      const reqUser = decoded.slice(0, sepIndex);
      const reqPass = decoded.slice(sepIndex + 1);
      if (reqUser === user && reqPass === pass) {
        return;
      }
    }
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="USA Dental Report Newsletter", charset="UTF-8"',
    },
  });
}
