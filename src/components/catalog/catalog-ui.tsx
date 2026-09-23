import Link from "next/link";
import { LEVELS, type Score, type TaskContent } from "@/lib/contracts";
import { FIELD_SECTIONS } from "@/lib/fields";
import type { PublishedTask } from "@/lib/catalog";
import type { Team } from "@/lib/collaboration-contracts";
import { modeLabel } from "@/lib/collaboration-client";
import styles from "./catalog.module.css";

export function CatalogShell({ children }: { children: React.ReactNode }) {
  return <div className={styles.page}>
    <a className="skip-link" href="#main">К содержанию</a>
    <header className={styles.header}>
      <Link className={styles.brand} href="/catalog">Sana<span>Brief</span></Link>
      <nav className={styles.nav} aria-label="Основная навигация">
        <Link href="/catalog">Каталог</Link>
        <Link href="/business">Бизнес</Link>
        <Link href="/tasks/new">Создать задачу</Link>
      </nav>
      <span className={styles.mode}>{modeLabel}</span>
    </header>
    <main id="main" className={styles.main}>{children}</main>
  </div>;
}

export function Notice({ children, kind = "info", retry }: { children: React.ReactNode; kind?: "info" | "error" | "success"; retry?: () => void }) {
  return <div role={kind === "error" ? "alert" : "status"} className={`${styles.notice} ${kind === "error" ? styles.error : kind === "success" ? styles.success : ""}`}>
    {children}{retry && <div><button type="button" onClick={retry} className={styles.button}>Повторить загрузку</button></div>}
  </div>;
}

export function TaskTile({ task }: { task: PublishedTask }) {
  const content = task.confirmedContent;
  return <article className={styles.card}>
    <div className={styles.badges}>
      <span className={styles.badge}>{task.confirmedIndustry || "Не указано"}</span>
      <span className={`${styles.badge} ${styles[task.confirmedScore.level]}`}>{LEVELS[task.confirmedScore.level].label}</span>
    </div>
    <h2>{content.title.trim() || "Без названия"}</h2>
    <p>{content.need.trim() || content.context.trim() || "Краткое содержание не указано."}</p>
    <div className={styles.cardFooter}>
      <div className={styles.score}>{task.confirmedScore.total}<small> / 100</small></div>
      <Link className={`${styles.button} ${styles.primary}`} href={`/tasks/${encodeURIComponent(task.id)}`}>Подробнее</Link>
    </div>
  </article>;
}

export function TaskFields({ content }: { content: TaskContent }) {
  return <dl>{FIELD_SECTIONS.flatMap((section) => section.fields).map((field) =>
    <div key={field.key} className={styles.detail}>
      <dt>{field.label}</dt>
      <dd className={content[field.key].trim() ? "" : styles.muted}>{content[field.key].trim() || "Не указано"}</dd>
    </div>)}</dl>;
}

export function ScoreDetails({ score }: { score: Score }) {
  return <div>
    <div className={styles.badges}>
      <strong className={styles.score}>{score.total}<small> / 100</small></strong>
      <span className={`${styles.badge} ${styles[score.level]}`}>{LEVELS[score.level].label} · {LEVELS[score.level].range}</span>
    </div>
    <p className={styles.intro}>Официальный рейтинг подтверждённой карточки.</p>
    {score.groups.map((group) => <div className={styles.group} key={group.id}>
      <div className={styles.groupTop}><span>{group.label}</span><strong>{group.earned}/{group.max}</strong></div>
      <progress value={group.earned} max={group.max} aria-label={`${group.label}: ${group.earned} из ${group.max}`} />
      {group.missing.length > 0 && <small>Не хватает: {group.missing.map((item) => item.label).join("; ")}</small>}
    </div>)}
  </div>;
}

export function TeamProfile({ team }: { team: Team }) {
  return <div className={styles.profile}>
    <strong>{team.name}</strong><small>{team.xp} XP за подтверждённые этапы</small>
    <p>Интересы: {team.interests.join(", ") || "не указаны"}</p>
    <p>Навыки: {team.skills.join(", ") || "не указаны"}</p>
    <p>Технологии: {team.technologies.join(", ") || "не указаны"}</p>
  </div>;
}
