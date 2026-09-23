import { BusinessBuilder } from "@/components/builder/business-builder";
export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BusinessBuilder key={id} initialId={id} />;
}
