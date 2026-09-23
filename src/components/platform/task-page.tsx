"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Send } from "lucide-react";
import { collaborationGateway } from "@/lib/collaboration-gateway";
import { FIELD_SECTIONS } from "@/lib/fields";
import type { Team } from "@/lib/collaboration-contracts";
import { ProposalCard } from "./proposal-card";
import {
  EmptyState,
  LoadState,
  PlatformShell,
  Readiness,
  TeamSummary,
  useAction,
  useResource,
  useTeamSelection,
} from "./shared";

function ProposalForm({
  taskId,
  teams,
  teamId,
  setTeamId,
  onSubmitted,
}: {
  taskId: string;
  teams: Team[];
  teamId: string;
  setTeamId: (id: string) => void;
  onSubmitted: () => void;
}) {
  const [idea, setIdea] = useState("");
  const [plan, setPlan] = useState("");
  const [deadline, setDeadline] = useState("");
  const [url, setUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const action = useAction();
  const team = teams.find((t) => t.id === teamId);
  if (submitted)
    return (
      <section className="panel proposal-success" role="status">
        <CheckCircle2 size={34} />
        <h2>Предложение отправлено</h2>
        <p>
          Бизнес увидит его в своём кабинете и примет решение. Статус доступен в
          кабинете команды.
        </p>
        <Link className="button primary" href="/student">
          Мои отклики
        </Link>
        <button
          className="button text-button"
          onClick={() => {
            setSubmitted(false);
            setIdea("");
            setPlan("");
            setDeadline("");
            setUrl("");
          }}
        >
          Отправить ещё предложение
        </button>
      </section>
    );
  return (
    <section id="proposal" className="panel proposal-form">
      <span className="eyebrow">ВАША ИНИЦИАТИВА</span>
      <h2>Предложите решение</h2>
      <p>
        Бизнес выбирает исполнителей вручную. Можно предложить несколько
        вариантов решения.
      </p>
      {!teams.length ? (
        <EmptyState title="Профилей команд пока нет">
          <p>Добавьте демокоманды в базу, затем обновите страницу.</p>
        </EmptyState>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await collaborationGateway.propose(taskId, {
                teamId,
                idea,
                plan,
                deadline,
                prototypeUrl: url.trim() || null,
              });
              setSubmitted(true);
              onSubmitted();
            });
          }}
        >
          <fieldset disabled={action.busy}>
            <label>
              Команда
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                {teams.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name} · {t.xp} XP
                  </option>
                ))}
              </select>
            </label>
            {team && <TeamSummary team={team} />}
            <label>
              Идея решения
              <textarea
                required
                maxLength={4000}
                rows={3}
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Что вы предлагаете и как это поможет бизнесу?"
              />
            </label>
            <label>
              План выполнения
              <textarea
                required
                maxLength={8000}
                rows={4}
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                placeholder="Основные шаги и способ проверки результата"
              />
            </label>
            <label>
              Срок
              <input
                required
                maxLength={1000}
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                placeholder="Например: прототип за 7 дней"
              />
            </label>
            <label>
              Ссылка на прототип <small>необязательно</small>
              <input
                type="url"
                maxLength={2000}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
            {action.error && (
              <p className="field-error" role="alert">
                {action.error}
              </p>
            )}
            <button className="button primary" type="submit">
              <Send size={17} />
              {action.busy ? "Отправляем…" : "Отправить предложение"}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
export function TaskPage({ id }: { id: string }) {
  const resource = useResource(async () => {
    const [task, teams] = await Promise.all([
      collaborationGateway.task(id),
      collaborationGateway.teams(),
    ]);
    return { task, teams };
  }, [id]);
  const task = resource.data?.task;
  const teams = resource.data?.teams ?? [];
  const [teamId, setTeamId] = useTeamSelection(teams);
  const own = useResource(
    () =>
      teamId ? collaborationGateway.teamProposals(teamId) : Promise.resolve([]),
    [teamId, id],
  );
  const proposals = (own.data ?? []).filter(
    (p) => p.taskId === id && p.teamId === teamId,
  );
  return (
    <PlatformShell>
      <Link href="/catalog" className="inline-link">
        <ArrowLeft size={16} />
        Все задачи
      </Link>
      <LoadState {...resource} retry={resource.reload} />
      {task && (
        <>
          <div className="detail-heading">
            <div className="tag-row">
              <span className="tag">{task.confirmedIndustry}</span>
              <Readiness score={task.confirmedScore} />
            </div>
            <h1>{task.confirmedContent.title}</h1>
            <p>
              Опубликованная версия подтверждена бизнесом. Отклик доступен при
              любом рейтинге.
            </p>
            <a href="#proposal" className="button primary">
              Предложить решение
              <Send size={16} />
            </a>
          </div>
          <div className="detail-grid">
            <div className="detail-sections">
              {FIELD_SECTIONS.map((section) => (
                <section key={section.id} className="panel">
                  <h2>{section.title}</h2>
                  <dl className="task-fields">
                    {section.fields
                      .filter((f) => f.key !== "title")
                      .map((field) => (
                        <div key={field.key}>
                          <dt>{field.label}</dt>
                          <dd
                            className={
                              !task.confirmedContent[field.key] ? "muted" : ""
                            }
                          >
                            {task.confirmedContent[field.key] ||
                              "Не уточнено — можно обсудить с бизнесом"}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </section>
              ))}
              <section aria-labelledby="own-proposals-title">
                <h2 id="own-proposals-title">Мои отклики по этой задаче</h2>
                <label>
                  Показать отклики команды
                  <select
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    disabled={!teams.length}
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} · {team.xp} XP
                      </option>
                    ))}
                  </select>
                </label>
                <LoadState {...own} retry={own.reload} />
                {proposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    team={teams.find((team) => team.id === proposal.teamId)}
                    title={task.confirmedContent.title}
                    role="student"
                    onChange={() => {
                      own.reload();
                      resource.reload();
                    }}
                  />
                ))}
                {!own.loading && !own.error && !proposals.length && (
                  <p className="muted">
                    У выбранной команды пока нет откликов на эту задачу.
                  </p>
                )}
              </section>
            </div>
            <aside className="detail-aside">
              <section className="panel readiness-summary">
                <h2>Почему {task.confirmedScore.total} баллов?</h2>
                <p>Баллы за подтверждённые сведения</p>
                {task.confirmedScore.groups.map((group) => (
                  <div className="readiness-group" key={group.id}>
                    <div>
                      <span>{group.label}</span>
                      <b>
                        {group.earned}/{group.max}
                      </b>
                    </div>
                    <progress
                      value={group.earned}
                      max={group.max}
                      aria-label={group.label}
                    />
                    {group.missing.length > 0 && (
                      <small>
                        {group.missing.map((m) => m.label).join(" · ")}
                      </small>
                    )}
                  </div>
                ))}
              </section>
              <ProposalForm
                key={id}
                taskId={id}
                teams={teams}
                teamId={teamId}
                setTeamId={setTeamId}
                onSubmitted={own.reload}
              />
            </aside>
          </div>
        </>
      )}
      {!task && !resource.loading && (
        <EmptyState title="Карточка недоступна">
          <p>Она ещё не опубликована, удалена или отсутствует в этом режиме.</p>
          <Link className="button secondary" href="/catalog">
            Перейти в каталог
          </Link>
        </EmptyState>
      )}
    </PlatformShell>
  );
}
