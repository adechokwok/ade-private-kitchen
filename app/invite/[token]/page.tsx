import Home from "../../page";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Home initialInviteToken={token} />;
}
