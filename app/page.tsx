import results from "@/data/results.json";
import Desk from "./components/Desk";
import type { Lead } from "@/lib/types";

export default function Page() {
  return <Desk initialLeads={(results as { leads: Lead[] }).leads} initialRunDate={(results as { run_date: string }).run_date} />;
}
