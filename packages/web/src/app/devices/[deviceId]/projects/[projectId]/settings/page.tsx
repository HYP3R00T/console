import { ProjectPage } from "@/components/projects/project-page";
import { ScopedSettings } from "@/components/settings/scoped-settings";
export default function Settings() {
  return (
    <div className="flex flex-col gap-8">
      <ProjectPage settings />
      <ScopedSettings scope="project" />
    </div>
  );
}
