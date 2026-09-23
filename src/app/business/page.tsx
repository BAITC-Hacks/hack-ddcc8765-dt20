"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Task } from "@/lib/contracts";
import type { Proposal, Team } from "@/lib/collaboration-contracts";
import { collaboration, collaborationMode, resetDemoData, safeWebUrl } from "@/lib/collaboration-client";
import { CatalogShell, Notice, TeamProfile } from "@/components/catalog/catalog-ui";
import styles from "@/components/catalog/catalog.module.css";

const statusLabel = { pending: "На рассмотрении", accepted: "Принят", rejected: "Отклонён" };

function ProposalCard({
  proposal, team, busy, onDecide, onConfirm,
}: {
  proposal: Proposal;
  team: Team | undefined;
  busy: boolean;
  onDecide: (id: string, status: "accepted" | "rejected") => void;
  onConfirm: (id: string) => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const prototype = safeWebUrl(proposal.prototypeUrl);
  const result = safeWebUrl(proposal.resultUrl);
  const hasResult = !!(proposal.resultDescription?.trim() || result);
  return <article className={styles.proposal}>
    <div className={styles.rowEnd}>
      <h3>{team?.name ?? "Команда недоступна"}</h3>
      <span className={`${styles.badge} ${proposal.status === "accepted" ? styles.ready : proposal.status === "rejected" ? styles.draft : ""}`}>{statusLabel[proposal.status]}</span>
    </div>
    {team && <div className={styles.proposalSection}><TeamProfile team={team} /></div>}
    <div className={styles.proposalSection}><b>Идея</b><p>{proposal.idea}</p></div>
    <div className={styles.proposalSection}><b>План</b><p>{proposal.plan}</p></div>
    <div className={styles.proposalSection}><b>Срок</b><p>{proposal.deadline}</p></div>
    {prototype && <div className={styles.proposalSection}><b>Прототип</b><p><a href={prototype} target="_blank" rel="noopener noreferrer">Открыть ссылку команды</a></p></div>}
    <div className={`${styles.row} ${styles.proposalSection}`}>
      <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy || !!proposal.stageConfirmedAt || proposal.status === "accepted"} onClick={() => onDecide(proposal.id, "accepted")}>Принять</button>
      <button type="button" className={`${styles.button} ${styles.danger}`} disabled={busy || !!proposal.stageConfirmedAt || proposal.status === "rejected"} onClick={() => onDecide(proposal.id, "rejected")}>Отклонить</button>
      {busy && <span role="status">Сохраняем…</span>}
    </div>
    {proposal.status === "accepted" && <div className={styles.proposalSection}>
      <h3>Результат этапа</h3>
      {proposal.resultDescription && <p>{proposal.resultDescription}</p>}
      {result && <p><a href={result} target="_blank" rel="noopener noreferrer">Открыть предъявленный результат</a></p>}
      {!hasResult && <p className={styles.muted}>Команда ещё не предъявила результат.</p>}
      {proposal.stageConfirmedAt
        ? <Notice kind="success">Этап подтверждён {new Date(proposal.stageConfirmedAt).toLocaleString("ru-RU")}. XP команды обновлён источником данных.</Notice>
        : hasResult && <>
          <label className={styles.check}><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />Я проверил предъявленный результат и подтверждаю завершение этапа</label>
          <button type="button" className={`${styles.button} ${styles.primary}`} disabled={!acknowledged || busy} onClick={() => onConfirm(proposal.id)}>Подтвердить этап</button>
        </>}
    </div>}
  </article>;
}

export default function BusinessPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const actionLocks = useRef(new Set<string>());
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  useEffect(() => {
    const focused = () => reload();
    window.addEventListener("focus", focused);
    window.addEventListener("sana:tasks-changed", focused);
    window.addEventListener("sana:proposals-changed", focused);
    return () => {
      window.removeEventListener("focus", focused);
      window.removeEventListener("sana:tasks-changed", focused);
      window.removeEventListener("sana:proposals-changed", focused);
    };
  }, [reload]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    void Promise.all([collaboration.businessTasks(), collaboration.businessProposals(), collaboration.teams()])
      .then(([nextTasks, nextProposals, nextTeams]) => {
        if (!active) return;
        setTasks(nextTasks); setProposals(nextProposals); setTeams(nextTeams);
        setSelectedId((current) => current && nextTasks.some((task) => task.id === current) ? current : nextTasks[0]?.id ?? null);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Не удалось загрузить кабинет."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);
  async function mutate(id: string, work: () => Promise<Proposal>, success: string) {
    if (actionLocks.current.has(id)) return;
    actionLocks.current.add(id);
    setBusyIds((current) => [...current, id]); setActionError(""); setActionSuccess("");
    try {
      const saved = await work();
      setProposals((current) => current.map((proposal) => proposal.id === saved.id ? saved : proposal));
      setActionSuccess(success);
      try { setTeams(await collaboration.teams()); }
      catch (cause) { setActionError(`Решение сохранено, но XP не удалось обновить: ${cause instanceof Error ? cause.message : "ошибка загрузки"}`); }
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Не удалось сохранить решение."); }
    finally { actionLocks.current.delete(id); setBusyIds((current) => current.filter((item) => item !== id)); }
  }
  const visible = proposals.filter((proposal) => proposal.taskId === selectedId);
  const selected = tasks.find((task) => task.id === selectedId);
  return <CatalogShell>
    <p className={styles.eyebrow}>Рабочее пространство бизнеса</p>
    <h1 className={styles.title}>Задачи и предложения</h1>
    <p className={styles.intro}>Решение по каждой команде принимается отдельно. XP появляется только после подтверждения предъявленного результата.</p>
    <div className={styles.row} style={{ marginTop: 18 }}>
      <Link className={`${styles.button} ${styles.primary}`} href="/tasks/new">Создать задачу</Link>
      <Link className={styles.button} href="/catalog">Открыть каталог</Link>
      {collaborationMode === "fixtures" && <button type="button" className={styles.button} onClick={() => { try { resetDemoData(); reload(); } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Не удалось сбросить демоданные."); } }}>Сбросить демопримеры</button>}
    </div>
    {loading ? <Notice>Загружаем задачи и предложения…</Notice>
      : error ? <Notice kind="error" retry={reload}>{error}</Notice>
      : tasks.length === 0 ? <Notice>У текущего бизнеса пока нет задач. <Link className={styles.link} href="/tasks/new">Создать первую задачу</Link></Notice>
      : <>
        <div className={styles.summary}><span>Задач: <b>{tasks.length}</b></span><span>Откликов: <b>{proposals.length}</b></span><span>Подтверждённых этапов: <b>{proposals.filter((proposal) => proposal.stageConfirmedAt).length}</b></span></div>
        <div className={styles.split}>
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>Мои задачи</h2>
            <div className={styles.list}>{tasks.map((task) => <article className={styles.proposal} key={task.id}>
              <div className={styles.rowEnd}><h3>{task.confirmedContent?.title || task.draft.title || "Новая задача"}</h3><span className={styles.badge}>{task.publishedAt ? "Опубликована" : "Черновик"}</span></div>
              <p>{task.confirmedContent?.need || task.draft.need || "Краткое описание не указано."}</p>
              <p>Откликов: <b>{proposals.filter((proposal) => proposal.taskId === task.id).length}</b></p>
              <div className={styles.row} style={{ marginTop: 12 }}>
                <button type="button" className={`${styles.button} ${selectedId === task.id ? styles.primary : ""}`} onClick={() => setSelectedId(task.id)}>Показать предложения</button>
                <Link className={styles.button} href={`/tasks/${encodeURIComponent(task.id)}/edit`}>Редактировать</Link>
                {task.publishedAt && <Link className={styles.button} href={`/tasks/${encodeURIComponent(task.id)}`}>Публичная карточка</Link>}
              </div>
            </article>)}</div>
          </section>
          <section className={styles.stack} aria-live="polite">
            <div className={styles.panel}>
              <h2 className={styles.sectionTitle}>Предложения: {selected?.confirmedContent?.title || selected?.draft.title || "Задача"}</h2>
              {actionError && <Notice kind="error">{actionError} Проверьте состояние перед повтором.</Notice>}
              {actionSuccess && <Notice kind="success">{actionSuccess}</Notice>}
              {visible.length === 0 ? <p className={styles.muted}>На эту задачу пока нет откликов.</p>
                : <div className={styles.list}>{visible.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} team={teams.find((team) => team.id === proposal.teamId)} busy={busyIds.includes(proposal.id)} onDecide={(id, status) => void mutate(id, () => collaboration.decide(id, status), status === "accepted" ? "Команда принята." : "Предложение отклонено.")} onConfirm={(id) => void mutate(id, () => collaboration.confirmStage(id), "Этап подтверждён; XP загружен из источника данных.")} />)}</div>}
            </div>
          </section>
        </div>
      </>}
  </CatalogShell>;
}
