import Link from "next/link";
import { redirect } from "next/navigation";
import { getChefSession, isChefConfigured } from "../../chef-auth";

export const dynamic = "force-dynamic";

function safeReturnTo(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/chef";
}

export default async function ChefLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);
  if (await getChefSession()) redirect(returnTo);
  const configured = isChefConfigured();

  return (
    <main className="chef-login-page">
      <section className="chef-login-card">
        <Link className="chef-login-brand" href="/"><span>德</span><strong>阿德小厨房</strong></Link>
        <p className="chef-login-eyebrow">PRIVATE CHEF CONSOLE</p>
        <h1>主厨回来啦</h1>
        <p>菜单、订单和今晚要买的菜，都安安稳稳放在你的 NAS 里。</p>
        {!configured ? (
          <div className="chef-login-alert"><strong>还差一步初始化</strong><span>请先在 Docker 环境变量中设置至少 10 位的 CHEF_PASSWORD，然后重新启动容器。</span></div>
        ) : (
          <form action="/api/auth/login" method="post">
            <input type="hidden" name="returnTo" value={returnTo} />
            <label htmlFor="password">主厨密码</label>
            <input id="password" name="password" type="password" autoComplete="current-password" minLength={10} maxLength={256} required autoFocus />
            {params.error && <span className="chef-login-error">{params.error === "locked" ? "尝试次数有点多，请 15 分钟后再试。" : "密码不对，再慢慢想一下。"}</span>}
            <button type="submit">进入主厨工作台</button>
          </form>
        )}
        <Link className="chef-login-back" href="/">← 返回朋友点菜页</Link>
      </section>
    </main>
  );
}
