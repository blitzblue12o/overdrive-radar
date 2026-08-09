import { ExperienceShell } from "@/components/experience/ExperienceShell";
import { eventDiscoveryConfig } from "@/lib/config/experiences";

export default function EventDiscoveryPage() {
  return <ExperienceShell config={eventDiscoveryConfig} />;
}
