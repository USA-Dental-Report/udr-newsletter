export const config = {
  matcher: '/((?!_next).*)',
};

export default function middleware(req) {
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
