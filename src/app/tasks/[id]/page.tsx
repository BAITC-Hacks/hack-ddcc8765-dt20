import { TaskPage } from "@/components/platform/task-page";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TaskPage id={id} />;
}
