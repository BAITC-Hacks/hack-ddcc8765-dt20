import type { Score, Task } from "./contracts";
import type { Proposal, Team } from "./collaboration-contracts";
import type { CatalogFilters, PublishedTask } from "./catalog";
import { dataMode, gateway } from "./gateway";
import { collaborationGateway, fixturesEnabled } from "./collaboration-gateway";

// Preserve participant 3's adapter contract using the shared storage and rules.
export const collaborationMode =
  dataMode === "api" ? "api" : fixturesEnabled ? "fixtures" : "local";
export const modeLabel =
  collaborationMode === "api"
    ? "Общий сервер"
    : fixturesEnabled
      ? "Демонстрационные данные"
      : "Локальные данные · только этот браузер";
export type ProposalInput = Pick<
  Proposal,
  "teamId" | "idea" | "plan" | "deadline" | "prototypeUrl"
>;
export type ResultInput = Pick<Proposal, "resultDescription" | "resultUrl">;
export interface CollaborationAdapter {
  catalog(filters?: CatalogFilters): Promise<PublishedTask[]>;
  publicTask(id: string): Promise<PublishedTask>;
  teams(): Promise<Team[]>;
  businessTasks(): Promise<Task[]>;
  businessProposals(taskId?: string): Promise<Proposal[]>;
  ownProposals(teamId: string): Promise<Proposal[]>;
  submitProposal(taskId: string, input: ProposalInput): Promise<Proposal>;
  decide(id: string, status: "accepted" | "rejected"): Promise<Proposal>;
  submitResult(id: string, input: ResultInput): Promise<Proposal>;
  confirmStage(id: string): Promise<Proposal>;
}
export const collaboration: CollaborationAdapter = {
  catalog: collaborationGateway.catalog,
  publicTask: collaborationGateway.task,
  teams: collaborationGateway.teams,
  async businessTasks() {
    if (fixturesEnabled) await collaborationGateway.catalog();
    return gateway.list();
  },
  businessProposals: collaborationGateway.proposals,
  ownProposals: collaborationGateway.teamProposals,
  submitProposal: collaborationGateway.propose,
  decide: collaborationGateway.decide,
  submitResult(id, input) {
    return collaborationGateway.result(
      id,
      input.resultDescription ?? "",
      input.resultUrl,
    );
  },
  confirmStage: collaborationGateway.confirmStage,
};
export { resetDemoData } from "./collaboration-gateway";
export function safeWebUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export type ReadinessLevel = Score["level"];
