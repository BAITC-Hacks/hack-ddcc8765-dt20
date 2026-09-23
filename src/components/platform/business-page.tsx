"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, MessageSquare, Plus } from "lucide-react";
import { collaborationGateway } from "@/lib/collaboration-gateway";
import { gateway } from "@/lib/gateway";
import { hasUnconfirmedChanges } from "@/lib/task-state";
import {
  EmptyState,
  LoadState,
  PlatformShell,
  Readiness,
  SeedDemo,
  STATUS_LABELS,
  useResource,
} from "./shared";
import { ProposalCard } from "./proposal-card";

export function BusinessPage() {
  const resource = useResource(async () => {
    const [tasks, proposals, teams] = await Promise.all([
      gateway.list(),
      collaborationGateway.proposals(),
      collaborationGateway.teams(),
    ]);
    return { tasks, proposals, teams };
  });
  const [taskId, setTaskId] = useState("");
  const [status, setStatus] = useState("");
  const { tasks = [], proposals = [], teams = [] } = resource.data ?? {};
  const filtered = proposals.filter(
    (p) => (!taskId || p.taskId === taskId) && (!status || p.status === status),
  );
  return (
    <PlatformShell>
      <section className="platform-hero">
        <div>
          <span className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО БИЗНЕСА</span>
          <h1>От задачи к результату</h1>
          <p>
            Сравнивайте идеи и опыт команд. Вы можете выбрать одну, несколько
            или ни одной команды.
          </p>
        </div>
        <Link href="/tasks/new" className="button primary">
          <Plus size={18} />
          Новая задача
        </Link>
      </section>
      <div className="stats-strip">
        <div>
          <strong>{tasks.length}</strong>
          <span>ваших задач</span>
        </div>
        <div>
          <strong>
            {proposals.filter((p) => p.status === "pending").length}
          </strong>
          <span>ожидают решения</span>
        </div>
        <div>
          <strong>
            {proposals.filter((p) => p.status === "accepted").length}
          </strong>
          <span>выбранных откликов</span>
        </div>
        <div>
          <strong>{proposals.filter((p) => p.stageConfirmedAt).length}</strong>
          <span>подтверждённых этапов</span>
        </div>
      </div>
      <LoadState {...resource} retry={resource.reload} />
      <section className="business-tasks">
        <div className="section-heading">
          <h2>Мои задачи</h2>
          <button className="button text-button" onClick={resource.reload}>
            Обновить
          </button>
        </div>
        <div className="business-task-grid">
          {tasks.map((task) => (
            <article key={task.id} className="panel business-task">
              <div className="card-topline">
                <span className="tag">
                  {task.publishedAt ? "Опубликована" : "Черновик"}
                </span>
                <span className="muted">{task.industry}</span>
              </div>
              <h3>
                {task.draft.title ||
                  task.rawText.slice(0, 70) ||
                  "Новая задача"}
              </h3>
              {task.confirmedScore ? (
                <Readiness score={task.confirmedScore} />
              ) : (
                <span className="muted">Ожидает подтверждения</span>
              )}
              {task.publishedAt && hasUnconfirmedChanges(task) && (
                <p className="small-note">
                  В каталоге — последняя подтверждённая версия. Правки ещё не
                  подтверждены.
                </p>
              )}
              <div className="task-actions">
                <Link href={`/tasks/${task.id}/edit`} className="inline-link">
                  Редактировать
                  <ArrowUpRight size={15} />
                </Link>
                {task.publishedAt && (
                  <Link href={`/tasks/${task.id}`} className="inline-link">
                    В каталоге
                  </Link>
                )}
                <button
                  className="button text-button compact"
                  onClick={() => {
                    setTaskId(task.id);
                    setStatus("");
                    document
                      .getElementById("proposals")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <MessageSquare size={15} />
                  Отклики:{" "}
                  {proposals.filter((p) => p.taskId === task.id).length}
                </button>
              </div>
            </article>
          ))}
        </div>
        {!resource.loading && !resource.error && !tasks.length && (
          <EmptyState title="Первая задача — начало сотрудничества">
            <Link className="button primary" href="/tasks/new">
              Создать задачу
            </Link>
          </EmptyState>
        )}
      </section>
      <section id="proposals" className="proposals-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">РЕШЕНИЕ ЗА ВАМИ</span>
            <h2>Предложения команд</h2>
          </div>
          <span className="muted">Показано: {filtered.length}</span>
        </div>
        <div className="catalog-toolbar">
          <label>
            Задача
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">Все мои задачи</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.draft.title ||
                    task.rawText.slice(0, 60) ||
                    "Новая задача"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Решение
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Все отклики</option>
              {Object.entries(STATUS_LABELS).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {(taskId || status) && (
            <button
              className="button text-button"
              onClick={() => {
                setTaskId("");
                setStatus("");
              }}
            >
              Сбросить фильтры
            </button>
          )}
        </div>
        <div className="proposal-grid">
          {filtered.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              role="business"
              proposal={proposal}
              team={teams.find((t) => t.id === proposal.teamId)}
              title={
                tasks.find((t) => t.id === proposal.taskId)?.confirmedContent
                  ?.title || "Задача"
              }
              onChange={resource.reload}
            />
          ))}
        </div>
        {!resource.loading && !resource.error && !filtered.length && (
          <EmptyState title="Здесь пока нет откликов">
            <p>
              {taskId || status
                ? "Измените фильтры, чтобы увидеть другие предложения."
                : "Опубликуйте задачу и предложите командам найти её в каталоге."}
            </p>
          </EmptyState>
        )}
      </section>
      <SeedDemo onDone={resource.reload} allowReset />
    </PlatformShell>
  );
}
