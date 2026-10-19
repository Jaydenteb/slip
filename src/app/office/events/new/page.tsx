import { PageHeader } from "@/components/ui";
import { NewEventFlow } from "./new-event-flow";

export const metadata = { title: "New event" };

export default function NewEventPage() {
  return (
    <>
      <PageHeader
        title="New event"
        description="Describe it the way you'd write the note home. Slip works out the fees, deposit, due dates and who's going, then shows you what it understood."
      />
      <NewEventFlow />
    </>
  );
}
