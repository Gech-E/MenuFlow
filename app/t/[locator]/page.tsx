import { GuestMenu } from "../../components/guest-menu";
export default async function TableMenu({
  params,
}: {
  params: Promise<{ locator: string }>;
}) {
  const { locator } = await params;
  return <GuestMenu locator={locator} />;
}
