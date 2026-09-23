"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { collaborationGateway } from "@/lib/collaboration-gateway";
import {
  EmptyState,
  LoadState,
  PlatformShell,
  TeamSummary,
  useResource,
  useTeamSelection,
} from "./shared";
import { ProposalCard } from "./proposal-card";

export function StudentPage() {
  const profiles = useResource(() => collaborationGateway.teams());
  const [teamId, setTeamId] = useTeamSelection(profiles.data ?? []);
  const resource = useResource(async () => {
    const [proposals, tasks] = await Promise.all([
      teamId ? collaborationGateway.teamProposals(teamId) : Promise.resolve([]),
      collaborationGateway.catalog(),
    ]);
    return { teamId, proposals, tasks };
  }, [teamId]);
  const team = profiles.data?.find((t) => t.id === teamId);
  const proposals =
    resource.data?.teamId === teamId ? resource.data.proposals : [];
  const refresh = () => {
    profiles.reload();
    resource.reload();
  };
  return (
    <PlatformShell>
      <section className="platform-hero">
        <div>
          <span className="eyebrow">КАБИНЕТ СТУДЕНЧЕСКОЙ КОМАНДЫ</span>
          <h1>Идеи становятся опытом</h1>
          <p>
            Следите за откликами, отправляйте результаты этапов и получайте
            баллы за подтверждённый прогресс.
          </p>
        </div>
        <Link href="/catalog" className="button primary">
          Выбрать задачу
          <ArrowRight size={17} />
        </Link>
      </section>
      <div className="student-profile panel">
        <label>
          Демокоманда
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {!profiles.data?.length && <option value="">Нет команд</option>}
            {profiles.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {team && <TeamSummary team={team} />}
        <p className="muted">
          +10 XP за каждый этап, который проверил и подтвердил бизнес. Отправка
          отклика сама по себе баллов не даёт.
        </p>
      </div>
      <LoadState {...profiles} retry={profiles.reload} />
      <LoadState {...resource} retry={resource.reload} />
      <div className="section-heading">
        <h2>Мои отклики</h2>
        <button className="button text-button" onClick={refresh}>
          Обновить
        </button>
      </div>
      <div className="proposal-grid">
        {proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            role="student"
            proposal={proposal}
            team={team}
            title={
              resource.data?.tasks.find((t) => t.id === proposal.taskId)
                ?.confirmedContent.title || "Задача"
            }
            onChange={refresh}
          />
        ))}
      </div>
      {!resource.loading &&
        !resource.error &&
        !profiles.error &&
        !proposals.length && (
          <EmptyState title="У этой команды пока нет откликов">
            <p>
              Откройте каталог и расскажите бизнесу, как вы можете решить его
              задачу.
            </p>
            <Link className="button secondary" href="/catalog">
              Посмотреть задачи
            </Link>
          </EmptyState>
        )}
    </PlatformShell>
  );
}
