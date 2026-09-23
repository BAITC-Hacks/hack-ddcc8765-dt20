"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { PublishedTask } from "@/lib/catalog";
import type { Proposal, Team } from "@/lib/collaboration-contracts";
import { collaboration, collaborationMode, safeWebUrl } from "@/lib/collaboration-client";
import { CatalogShell, Notice, ScoreDetails, TaskFields, TeamProfile } from "@/components/catalog/catalog-ui";
import styles from "@/components/catalog/catalog.module.css";

const statusLabel = { pending: "На рассмотрении", accepted: "Принят", rejected: "Отклонён" };
function validateUrl(value: string): string | null | undefined {
  if (!value.trim()) return null;
  return safeWebUrl(value.trim()) ?? undefined;
}

function ResultForm({ proposal, onSaved }: { proposal: Proposal; onSaved: () => void }) {
  const [description, setDescription] = useState(proposal.resultDescription ?? "");
  const [url, setUrl] = useState(proposal.resultUrl ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    const resultUrl = validateUrl(url);
    if (resultUrl === undefined) { setError("Укажите ссылку с протоколом http:// или https://."); return; }
    if (!description.trim() && !resultUrl) { setError("Добавьте описание результата или ссылку."); return; }
    locked.current = true; setBusy(true); setError("");
    try {
      await collaboration.submitResult(proposal.id, { resultDescription: description.trim() || null, resultUrl });
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось передать результат."); }
    finally { locked.current = false; setBusy(false); }
  }
  return <form onSubmit={submit} className={styles.form}>
    <div className={styles.field}><label htmlFor={`result-${proposal.id}`}>Описание результата этапа</label>
      <textarea id={`result-${proposal.id}`} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
    <div className={styles.field}><label htmlFor={`result-url-${proposal.id}`}>Ссылка на результат (необязательно)</label>
      <input id={`result-url-${proposal.id}`} value={url} onChange={(event) => setUrl(event.target.value)} type="url" placeholder="https://example.com/prototype" /></div>
    {error && <p role="alert" className={styles.fieldError}>{error}</p>}
    <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy}>{busy ? "Передаём…" : "Передать результат бизнесу"}</button>
  </form>;
}

export default function PublicTaskPage() {
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<PublishedTask | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [teamId, setTeamId] = useState("");
  const [idea, setIdea] = useState("");
  const [plan, setPlan] = useState("");
  const [deadline, setDeadline] = useState("");
  const [prototypeUrl, setPrototypeUrl] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const locked = useRef(false);
  const selected = teams.find((team) => team.id === teamId);

  const reloadOwn = useCallback(async (selectedTeam: string) => {
    if (collaborationMode === "api" || !selectedTeam) return;
    setProposals((await collaboration.ownProposals(selectedTeam)).filter((item) => item.taskId === id));
  }, [id]);
  useEffect(() => {
    const reload = () => setRefresh((value) => value + 1);
    window.addEventListener("focus", reload);
    window.addEventListener("sana:tasks-changed", reload);
    return () => { window.removeEventListener("focus", reload); window.removeEventListener("sana:tasks-changed", reload); };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    void Promise.all([collaboration.publicTask(id), collaboration.teams()])
      .then(([published, available]) => {
        if (!active) return;
        setTask(published); setTeams(available);
        setTeamId((current) => current && available.some((team) => team.id === current) ? current : available[0]?.id ?? "");
      }).catch((cause) => { if (active) { setTask(null); setError(cause instanceof Error ? cause.message : "Не удалось открыть задачу."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, refresh]);
  useEffect(() => {
    let active = true;
    if (collaborationMode === "api" || !teamId) return;
    void collaboration.ownProposals(teamId).then((items) => { if (active) setProposals(items.filter((item) => item.taskId === id)); })
      .catch((cause) => { if (active) setSaveError(cause instanceof Error ? cause.message : "Не удалось прочитать отклики."); });
    return () => { active = false; };
  }, [id, teamId, refresh]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current || !task) return;
    const nextErrors: Record<string, string> = {};
    if (!teamId) nextErrors.teamId = "Выберите команду.";
    if (!idea.trim()) nextErrors.idea = "Опишите идею.";
    if (!plan.trim()) nextErrors.plan = "Опишите план.";
    if (!deadline.trim()) nextErrors.deadline = "Укажите срок.";
    const url = validateUrl(prototypeUrl);
    if (url === undefined) nextErrors.prototypeUrl = "Укажите ссылку с протоколом http:// или https://.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    locked.current = true; setBusy(true); setSaveError(""); setSuccess("");
    try {
      await collaboration.submitProposal(task.id, { teamId, idea: idea.trim(), plan: plan.trim(), deadline: deadline.trim(), prototypeUrl: url! });
      setSuccess("Отклик сохранён и отправлен бизнесу.");
      setIdea(""); setPlan(""); setDeadline(""); setPrototypeUrl("");
      await reloadOwn(teamId);
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : "Не удалось отправить отклик."); }
    finally { locked.current = false; setBusy(false); }
  }

  return <CatalogShell>
    <Link href="/catalog" className={styles.link}>← Вернуться в каталог</Link>
    {loading ? <Notice>Загружаем подтверждённую карточку…</Notice>
      : error || !task ? <Notice kind="error" retry={() => setRefresh((value) => value + 1)}>
          {error || "Задача недоступна или не опубликована."} <Link href="/catalog" className={styles.link}>Вернуться в каталог</Link>
        </Notice>
      : <>
        <p className={styles.eyebrow} style={{ marginTop: 25 }}>Опубликованная задача · {task.confirmedIndustry || "Отрасль не указана"}</p>
        <h1 className={styles.title}>{task.confirmedContent.title.trim() || "Без названия"}</h1>
        <p className={styles.intro}>Опубликована {new Date(task.publishedAt).toLocaleDateString("ru-RU")}. Здесь показана только подтверждённая бизнесом версия.</p>
        <div className={styles.split}>
          <div className={styles.stack}>
            <section className={styles.panel}><h2 className={styles.sectionTitle}>Условия задачи</h2><TaskFields content={task.confirmedContent} /></section>
            <section className={styles.panel}><h2 className={styles.sectionTitle}>Мои отклики команды</h2>
              {collaborationMode === "api" ? <Notice>Сервер пока не предоставляет команде чтение своих откликов и передачу результата с её правами. После отправки отклика сохраните номер ответа до подключения этого маршрута.</Notice>
                : proposals.length === 0 ? <p className={styles.muted}>У выбранной команды пока нет откликов на эту задачу.</p>
                : <div className={styles.list}>{proposals.map((proposal) => <article className={styles.proposal} key={proposal.id}>
                    <div className={styles.badges}><span className={styles.badge}>{statusLabel[proposal.status]}</span>{proposal.stageConfirmedAt && <span className={`${styles.badge} ${styles.ready}`}>Этап подтверждён</span>}</div>
                    <p>{proposal.idea}</p>
                    {proposal.status === "accepted" && !proposal.stageConfirmedAt && <div className={styles.proposalSection}><h3>Передать результат этапа</h3><ResultForm proposal={proposal} onSaved={() => setRefresh((value) => value + 1)} /></div>}
                  </article>)}</div>}
            </section>
          </div>
          <div className={styles.stack}>
            <section className={styles.panel}><h2 className={styles.sectionTitle}>Рейтинг готовности</h2><ScoreDetails score={task.confirmedScore} /></section>
            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>Откликнуться на задачу</h2>
              {teams.length === 0 ? <Notice kind="error" retry={() => setRefresh((value) => value + 1)}>Нет доступных команд. Попробуйте загрузить список снова.</Notice> : <form onSubmit={submit} className={styles.form} noValidate>
                <div className={styles.field}><label htmlFor="team">Команда</label><select id="team" value={teamId} onChange={(event) => setTeamId(event.target.value)} aria-invalid={!!fieldErrors.teamId}>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>{fieldErrors.teamId && <span className={styles.fieldError}>{fieldErrors.teamId}</span>}</div>
                {selected && <TeamProfile team={selected} />}
                <div className={styles.field}><label htmlFor="idea">Идея *</label><textarea id="idea" value={idea} onChange={(event) => setIdea(event.target.value)} aria-invalid={!!fieldErrors.idea} />{fieldErrors.idea && <span className={styles.fieldError}>{fieldErrors.idea}</span>}</div>
                <div className={styles.field}><label htmlFor="plan">План выполнения *</label><textarea id="plan" value={plan} onChange={(event) => setPlan(event.target.value)} aria-invalid={!!fieldErrors.plan} />{fieldErrors.plan && <span className={styles.fieldError}>{fieldErrors.plan}</span>}</div>
                <div className={styles.field}><label htmlFor="deadline">Срок *</label><input id="deadline" value={deadline} onChange={(event) => setDeadline(event.target.value)} aria-invalid={!!fieldErrors.deadline} />{fieldErrors.deadline && <span className={styles.fieldError}>{fieldErrors.deadline}</span>}</div>
                <div className={styles.field}><label htmlFor="prototype-url">Ссылка на прототип (необязательно)</label><input id="prototype-url" type="url" placeholder="https://example.com/prototype" value={prototypeUrl} onChange={(event) => setPrototypeUrl(event.target.value)} aria-invalid={!!fieldErrors.prototypeUrl} />{fieldErrors.prototypeUrl && <span className={styles.fieldError}>{fieldErrors.prototypeUrl}</span>}</div>
                {saveError && <Notice kind="error">{saveError} Введённый текст остался в форме.</Notice>}
                {success && <Notice kind="success">{success}</Notice>}
                <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy}>{busy ? "Отправляем…" : "Отправить отклик"}</button>
              </form>}
            </section>
          </div>
        </div>
      </>}
  </CatalogShell>;
}
