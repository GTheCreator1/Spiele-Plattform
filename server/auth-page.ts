export type AuthMode = 'login' | 'register' | 'recover'
export type Challenge = { state: string; challenge: string }

const titles: Record<AuthMode, string> = {
  login: 'Anmelden',
  register: 'Konto erstellen',
  recover: 'Passwort wiederherstellen',
}

const escape = (text: string) => text.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!)

function page(title: string, content: string, status = 200, cookie?: string, formReturnOrigin?: string) {
  const formAction = formReturnOrigin ? `'self' ${formReturnOrigin}` : "'self'"
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; base-uri 'none'; frame-ancestors 'none'`,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
  })
  if (cookie) headers.set('Set-Cookie', cookie)
  return new Response(`<!doctype html><html lang="de"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title} · Stichrunde</title>
    <style>
      *{box-sizing:border-box} :root{color-scheme:dark;font:17px system-ui;color:#f7f4f7;background:#0d0f17}
      body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:18px}
      main{background:#151823;border:1px solid #303341;border-radius:20px;padding:clamp(18px,5vw,36px);width:min(100%,480px)}
      header{color:#ffa491;font-weight:800} h1{margin:.7rem 0 1rem;letter-spacing:-.04em;line-height:1.09}
      form,label{display:grid;gap:.55rem} form{gap:.95rem} input,button,.next{min-height:46px;border-radius:9px;padding:.55rem .8rem;font:inherit}
      input{min-width:0;width:100%;background:#10121b;border:1px solid #45485a;color:inherit}
      button,.next{display:grid;place-items:center;background:#ff836f;color:#25151b;border:0;font-weight:750;cursor:pointer;text-decoration:none}
      button:hover,.next:hover{background:#ffa28f} :focus-visible{outline:2px solid #ffa28f;outline-offset:3px}
      p{color:#c0bdce;line-height:1.5} [role=alert]{color:#ffafa1} a{color:#ffa491} nav{display:flex;flex-wrap:wrap;gap:.9rem;margin-top:1.15rem}
      li{margin-block:.4rem} code{overflow-wrap:anywhere;color:#f9ead8} small{color:#b5b2c3}
    </style></head><body><main><header>♠ Stichrunde</header><h1>${title}</h1>${content}</main></body></html>`, { status, headers })
}

export function authPage(mode: AuthMode, parameters: Challenge, back: string, inviteCode: boolean, error?: { detail: string; status: number }) {
  const query = new URLSearchParams({ state: parameters.state, challenge: parameters.challenge }).toString()
  const passwordHint = mode === 'login' ? '' : '<small>Mindestens 12 Zeichen.</small>'
  return page(titles[mode], `
    ${error ? `<p role="alert">${escape(error.detail)}</p>` : ''}
    <form method="post" action="/auth/${mode}">
      <input type="hidden" name="state" value="${parameters.state}">
      <input type="hidden" name="challenge" value="${parameters.challenge}">
      <label>Benutzername<input name="username" required minlength="3" maxlength="24" autocomplete="username" autocapitalize="none"></label>
      ${mode === 'recover' ? '<label>Recovery-Code<input name="code" required maxlength="48" autocomplete="off" autocapitalize="none"></label>' : ''}
      <label>${mode === 'recover' ? 'Neues Passwort' : 'Passwort'}<input name="password" required type="password" maxlength="128" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}">${passwordHint}</label>
      ${mode === 'login' ? '' : '<label>Passwort wiederholen<input name="confirm" required type="password" maxlength="128" autocomplete="new-password"></label>'}
      ${mode === 'register' && inviteCode ? '<label>Einladungscode<input name="invite" required maxlength="128" autocomplete="off" autocapitalize="none"></label>' : ''}
      <button type="submit">${titles[mode]}</button>
    </form>
    <nav aria-label="Konto">
      ${(Object.keys(titles) as AuthMode[]).filter((item) => item !== mode).map((item) => `<a href="/auth/${item}?${query}">${titles[item]}</a>`).join('')}
      <a href="${escape(back)}">Zur Spielauswahl</a>
    </nav>`, error?.status, undefined, new URL(back).origin)
}

export function recoveryPage(codes: string[], next: string, cookie: string) {
  return page('Recovery-Codes sichern', `
    <p>Speichere diese drei einmaligen Codes an einem sicheren Ort. Du kannst mit einem Code dein Passwort zurücksetzen.</p>
    <ul>${codes.map((code) => `<li><code>${code.match(/.{1,4}/g)!.join('-')}</code></li>`).join('')}</ul>
    <p>Wenn du Passwort und alle Codes verlierst, bleibt der Zugriff nur mit einer noch aktiven Sitzung möglich.</p>
    <a class="next" href="${escape(next)}">Weiter zur Plattform</a>`, 200, cookie)
}

export function expiredAuthPage(back: string) {
  return page('Anmeldung erneut öffnen', `<p>Starte die Anmeldung über die Plattform.</p><a class="next" href="${escape(back)}">Zur Plattform</a>`, 400)
}
