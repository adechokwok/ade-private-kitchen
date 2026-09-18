import { redirect } from "next/navigation";
import Home from "../page";
import { getChefSession } from "../chef-auth";

export const dynamic = "force-dynamic";

export default async function ChefPage() {
  if (!(await getChefSession())) redirect("/chef/login?returnTo=/chef");
  return <Home initialMode="chef" chefUser="阿德" />;
}
