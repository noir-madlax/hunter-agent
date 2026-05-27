import { ProjectChatWorkspace } from "@/components/project-chat-workspace";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const [{ new: newMode }, projects] = await Promise.all([
    searchParams,
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

  if (newMode === "1") {
    const initialProjects = JSON.parse(JSON.stringify(projects));
    return <ProjectChatWorkspace initialProjects={initialProjects} initialNewProjectMode />;
  }

  if (projects[0]) {
    redirect(`/projects/${projects[0].id}`);
  }

  return <ProjectChatWorkspace />;
}
