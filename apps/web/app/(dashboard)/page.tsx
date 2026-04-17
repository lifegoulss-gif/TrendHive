import { redirect } from "next/navigation";

export default function DashboardPage() {
  // Redirect to first org, or create one
  redirect("/dashboard/messages");
}
