import { ExperienceShell } from "@/components/experience/ExperienceShell";
import { overdriveConfig } from "@/lib/config/experiences";

export default function OverdrivePage() {
  return <ExperienceShell config={overdriveConfig} />;
}
