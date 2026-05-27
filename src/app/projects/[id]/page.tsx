import { ProjectChatWorkspace } from "@/components/project-chat-workspace";
import { getProjectWithRelations, serializeProject } from "@/lib/project-funnel";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const [{ id }, { new: newMode }] = await Promise.all([params, searchParams]);
  const [project, projects] = await Promise.all([
    getProjectWithRelations(id),
    prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        clientCompany: true,
        roleTitle: true,
        funnelStatus: true,
        longlistCount: true,
        screenedCount: true,
        shortlistCount: true,
        riskCount: true,
        updatedAt: true,
      },
    }),
  ]);

  if (!project) {
    redirect("/projects");
  }

  const initialProject = JSON.parse(JSON.stringify(serializeProject(project)));
  const initialProjects = JSON.parse(JSON.stringify(projects));

  return <ProjectChatWorkspace initialProjectId={id} initialProject={initialProject} initialProjects={initialProjects} initialNewProjectMode={newMode === "1"} />;
}
