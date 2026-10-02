import type { MeResponse } from "@shared/contracts";
import { resolveAiProviderName } from "@/lib/ai/provider";
import { appUrl, capturedTextRetentionHours } from "@/lib/config";
import { db } from "@/lib/db";
import { rulesFromProfile } from "@/lib/drafts/service";
import { can } from "@/lib/permissions";

/** Everything the extension needs after sign-in, limited to the user's own memberships. */
export async function buildMeResponse(userId: string): Promise<MeResponse | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      disabledAt: true,
      memberships: {
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          workspace: {
            select: {
              id: true,
              name: true,
              brandProfiles: { where: { archivedAt: null }, orderBy: { createdAt: "asc" } },
            },
          },
        },
      },
    },
  });
  if (!user || user.disabledAt) return null;

  return {
    user: { id: user.id, email: user.email, name: user.name },
    workspaces: user.memberships.map(({ role, workspace }) => ({
      id: workspace.id,
      name: workspace.name,
      role,
      canGenerate: can(role, "draft.generate"),
      brandProfiles: workspace.brandProfiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        brandName: profile.brandName,
        tone: profile.tone,
        rules: rulesFromProfile(profile),
      })),
    })),
    aiProvider: resolveAiProviderName(),
    capturedTextRetentionHours: capturedTextRetentionHours(),
    dashboardUrl: appUrl(),
  };
}
