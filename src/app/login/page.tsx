import { getSafeRedirectPath } from "@/lib/session-auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const nextPath = getSafeRedirectPath(next);

  return (
    <main className="login-shell agent-ui">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="login-mark">H</div>
          <div>
            <div className="login-kicker">Hunter Agent</div>
            <h1 id="login-title">登录工作台</h1>
          </div>
        </div>

        <form className="login-form" action="/api/auth/login" method="post">
          <input type="hidden" name="next" value={nextPath} />

          <label>
            <span>用户名</span>
            <input name="username" autoComplete="username" autoFocus required />
          </label>

          <label>
            <span>密码</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>

          {error === "1" ? <p className="login-error">用户名或密码不正确。</p> : null}

          <button type="submit">登录</button>
        </form>
      </section>
    </main>
  );
}
