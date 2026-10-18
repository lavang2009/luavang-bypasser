# API Provider Audit — LÙ A VANG Link Resolver

Research date: 2026-10-18

## Important distinction

This project is a URL resolver. It can follow public HTTP redirects and recognize a limited set of static HTML redirects. It does **not** have a universal API key that reveals the final destination for every monetized short-link service.

Provider API keys are account credentials. This project does not ship with real provider keys, does not search for leaked credentials, and must not put private keys in browser code. Never add a secret under a `NEXT_PUBLIC_` variable.

## Findings

| Provider / feature | What was verified | How to obtain access | Does it bypass that provider's interstitial? |
|---|---|---|---|
| Link4M Developer API | The official Link4M homepage advertises Developer API tools including Quick Link, Mass Shrinker, Full Page Script and Developers API. Public landing-page content did not expose a complete API reference or a public generic resolver key. | Use the official Link4M site and your own account. Check the account dashboard for the official API instructions; if the endpoint/authentication docs are not visible, request them from Link4M support. Use only credentials issued to your account. | **Not verified.** Its public description advertises developer/link tools, not an API that bypasses its monetized flow. Do not assume the key can resolve protected links. |
| HTTP redirects (301/302/303/307/308) | Implemented in this project; no provider key required. | No key needed. | Works only while the destination exposes ordinary public redirects. |
| Static HTML meta refresh / static JavaScript URL | Limited extraction is implemented; no provider key required. | No key needed. | Does not execute arbitrary JavaScript, load browser-only state, or synthesize session tokens. |
| CAPTCHA / JavaScript challenge / anti-bot / login | The resolver detects common challenge indicators and reports the stop reason. | Use the destination provider's documented integration/API with authorization, or complete its verification in a normal browser. | This project intentionally does not automate evasion of a third-party CAPTCHA, anti-bot control, access restriction, or monetized verification flow. |
| Cloudflare Turnstile / Google reCAPTCHA | These are verification APIs to protect a site that you control. They are not API keys for solving another site's challenge. | Create a widget in the provider dashboard and validate tokens on your own server using the official Siteverify endpoint. | No. They verify users for your own site. |

## Link4M — safe setup path

1. Start from the official public site: <https://link4m.com/>. It advertises the Developer API feature.
2. Sign in or register through the official site. The registration page currently resolves to <https://my.link4m.com/auth/signup>.
3. Find the developer/API instructions available to your account. If no API credentials or reference are shown, contact Link4M support and ask for the current API documentation, the allowed use cases, authentication method, base URL, and rate limits.
4. Confirm whether the endpoint is for creating/managing links or for an authorized resolver use case. The public marketing page alone is insufficient to implement a working integration safely.
5. Do not paste the key into this repository, a client-side component, screenshots, or chat. Store it only as a server-side Vercel Environment Variable after an official endpoint and use case have been confirmed.

The current resolver code does not call Link4M's Developer API. Do not add a `LINK4M_API_KEY` variable and expect the resolver to start bypassing Link4M; without a documented, authorized endpoint, that would be a fake/nonfunctional configuration.

## Vercel secret handling (only after an official adapter exists)

1. Open Vercel → project → Settings → Environment Variables.
2. Add the provider's exact variable name as a server-only variable (for example, a provider-specific secret name documented by the official adapter). Do not prefix private keys with `NEXT_PUBLIC_`.
3. Select the environments where it is needed: Production, Preview, and/or Development.
4. Save, then redeploy so the server function receives the updated environment.
5. If a key was exposed in GitHub or client code, revoke/rotate it at the provider first; deleting the text from a later commit does not invalidate the leaked key.

## CAPTCHA APIs for a site you own

- Cloudflare Turnstile setup: <https://developers.cloudflare.com/turnstile/get-started/>
- Server-side token verification: <https://developers.cloudflare.com/turnstile/get-started/server-side-validation/>
- Google reCAPTCHA server-side verification: <https://developers.google.com/recaptcha/docs/verify>

These flows require a sitekey on the client and a secret on the server. The server must validate the returned token. They are for protecting forms/actions on domains you control, not for bypassing challenges on third-party websites.

## Current project capability matrix

- Supported without API key: public HTTP(S) redirect chains and some static HTML redirect patterns.
- Partial/unsupported: redirects that require runtime JavaScript, cookies/session, CAPTCHA, login, short-lived signed tokens, IP allow-listing, or bot challenges.
- Correct behavior on a challenge: report it as blocked/unverified rather than claim success.
- Security: keep URL-fetch protections and redirect limits enabled; accepting arbitrary URLs from the public internet can create SSRF and abuse risk.

## What is required to implement a legitimate provider adapter

Provide the **public API documentation only**, with secret values removed. The documentation must specify the endpoint, auth method, request/response schema, scope/permission required, rate limit, and the provider's authorization for this use case. Then the adapter can be implemented against that contract and tested with an account/key owned by the project operator; do not put the real secret into source code.
