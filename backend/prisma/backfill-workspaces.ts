import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const users = await prisma.user.findMany({
    include: { memberships: true },
  });

  console.log(`Checking ${users.length} users for personal workspaces...`);

  for (const user of users) {
    if (user.memberships.length === 0) {
      const workspaceName = user.name ? `${user.name}'s Workspace` : `${user.email}'s Workspace`;
      
      await prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: {
            name: workspaceName,
            members: {
              create: {
                userId: user.id,
                role: "owner",
              },
            },
          },
        });

        await tx.user.update({
          where: { id: user.id },
          data: { activeWorkspaceId: workspace.id },
        });

        // Update other entities
        await tx.connection.updateMany({
          where: { userId: user.id, workspaceId: null },
          data: { workspaceId: workspace.id },
        });
        await tx.zoomWorkflowSettings.updateMany({
          where: { userId: user.id, workspaceId: null },
          data: { workspaceId: workspace.id },
        });
        await tx.zoomSyncRule.updateMany({
          where: { userId: user.id, workspaceId: null },
          data: { workspaceId: workspace.id },
        });
        await tx.zoomSyncLog.updateMany({
          where: { userId: user.id, workspaceId: null },
          data: { workspaceId: workspace.id },
        });
        await tx.channelVideoCache.updateMany({
          where: { userId: user.id, workspaceId: null },
          data: { workspaceId: workspace.id },
        });
        await tx.quotaUsage.updateMany({
          where: { userId: user.id, workspaceId: null },
          data: { workspaceId: workspace.id },
        });
        await tx.zoomYoutubeMatchDismissal.updateMany({
          where: { userId: user.id, workspaceId: null },
          data: { workspaceId: workspace.id },
        });
      });
      
      console.log(`Created personal workspace for ${user.email}`);
    }
  }

  console.log("Backfill completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // No disconnect needed if script ends
  });
