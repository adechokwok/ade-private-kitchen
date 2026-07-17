import { env } from "cloudflare:workers";
import Home from "../page";
import { requireChatGPTUser } from "../chatgpt-auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ChefPage() {
  const user = await requireChatGPTUser("/chef");
  const runtime = env as unknown as { CHEF_EMAIL?: string };
  const chefEmail = runtime.CHEF_EMAIL?.trim().toLowerCase() || "";

  if (!chefEmail || user.email.toLowerCase() !== chefEmail) {
    return (
      <main className="access-denied">
        <div><span>PRIVATE KITCHEN</span><h1>这里是阿德的主厨工作台</h1><p>你已经登录，但这个页面只向主厨本人开放。</p><Link href="/">返回朋友点菜页</Link></div>
      </main>
    );
  }

  return <Home initialMode="chef" chefUser={user.displayName} />;
}
