# UAS Driver Insider: basic private login

Start with `npm run dev`. Both `dev` and `start` run the authentication gateway;
do not expose `vinext dev/start` directly. The gateway protects the app, data files
and development assets. Only the logo and sign-in page are anonymous.

Local credentials are in ignored `.env.local`: `AUTH_USERNAME` and
`AUTH_PASSWORD_HASH` (scrypt salt:hash, not plaintext). Do not commit this file.
The local account is Pol. Use the password supplied separately.

Sessions use random server-side tokens and HttpOnly/SameSite cookies, expire
after eight hours and are invalidated on logout or server restart. Ten incorrect
attempts block login for 15 minutes. This basic single-account version does not
provide invitations, password recovery or individual user permissions.

For hosting, set AUTH_USERNAME and AUTH_PASSWORD_HASH as private environment
variables and APP_ORIGIN to the exact HTTPS origin (no trailing slash).
Use `npm run build` and `npm start`, expose only PORT and one instance.
Production cookies require HTTPS. Never publish the public folder independently
as a static site: requests must always pass through the gateway.

Render deployment is not configured or completed by this login change.
