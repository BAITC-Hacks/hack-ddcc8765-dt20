"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { dataMode } from "@/lib/gateway";
import { collaborationGateway } from "@/lib/collaboration-gateway";
import { LEVELS, type Score } from "@/lib/contracts";
import type { Proposal, Team } from "@/lib/collaboration-contracts";

export function PlatformShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <>
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <header className="app-header platform-header">
        <Link
          className="brand"
          href="/catalog"
          aria-label="SanaBrief — каталог"
        >
          <img src="/icon.svg" width="36" height="36" alt="" />
          <span>
            Sana<span className="brand-light">Brief</span>
          </span>
        </Link>
        <nav className="platform-nav" aria-label="Основная навигация">
          {[
            ["/catalog", "Каталог задач"],
            ["/student", "Кабинет команды"],
            ["/business", "Кабинет бизнеса"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <span className={`mode-pill ${dataMode}`}>
            <span />
            {dataMode === "local" ? "Локальное демо" : "Общее демо"}
          </span>
          <Link className="button primary compact" href="/tasks/new">
            <Plus size={16} />
            Создать задачу
          </Link>
        </div>
      </header>
      <main id="main" className="platform-main">
        {children}
      </main>
      <footer className="platform-footer">
        SanaBrief · AI Sana{" "}
        <span>
          {dataMode === "local"
            ? "Данные сохраняются в этом браузере. Для работы с разных устройств подключите общий сервер."
            : "Общий демостенд: роли переключаются свободно, без личных учётных записей."}
        </span>
      </footer>
    </>
  );
}

export function useResource<T>(
  loader: () => Promise<T>,
  deps: DependencyList = [],
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const currentLoader = useRef(loader);
  currentLoader.current = loader;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    currentLoader
      .current()
      .then(
        (value) => {
          if (active) setData(value);
        },
        (reason) => {
          if (active) setError(errorText(reason));
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [version, ...deps]);
  useEffect(() => {
    window.addEventListener("focus", reload);
    window.addEventListener("storage", reload);
    window.addEventListener("sana:tasks-changed", reload);
    return () => {
      window.removeEventListener("focus", reload);
      window.removeEventListener("storage", reload);
      window.removeEventListener("sana:tasks-changed", reload);
    };
  }, [reload]);
  return { data, loading, error, reload };
}
export function errorText(error: unknown) {
  if (error instanceof Error && error.name === "ZodError")
    return "Проверьте заполнение полей и ссылки: допускаются адреса https:// или http://.";
  return error instanceof Error
    ? error.message
    : "Не удалось выполнить действие. Повторите попытку.";
}
export function useAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(work: () => Promise<unknown>) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
      return true;
    } catch (reason) {
      setError(errorText(reason));
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
export function LoadState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  if (error)
    return (
      <div className="alert error" role="alert">
        <span>{error}</span>
        <button className="button secondary compact" onClick={retry}>
          <RefreshCw size={16} />
          Повторить
        </button>
      </div>
    );
  return loading ? (
    <p className="loading-line" role="status">
      <LoaderCircle size={18} className="spin" />
      Обновляем данные…
    </p>
  ) : null;
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="panel empty-state">
      <Sparkles size={28} />
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}
export function SeedDemo({ onDone }: { onDone: () => void }) {
  const action = useAction();
  const [done, setDone] = useState(false);
  return (
    <div className="demo-banner">
      <div>
        <strong>Готовый сценарий для знакомства</strong>
        <p>
          5 черновиков, 5 карточек разных уровней и 5 откликов. Примеры
          синтетические; ваши задачи сохранятся.
        </p>
        {done && (
          <p role="status">
            Примеры добавлены. Повторное добавление не меняет ваши правки.
          </p>
        )}
        {action.error && (
          <p className="field-error" role="alert">
            {action.error}
          </p>
        )}
      </div>
      <button
        className="button secondary"
        disabled={action.busy}
        onClick={() =>
          void action.run(async () => {
            await collaborationGateway.seedDemo();
            setDone(true);
            onDone();
          })
        }
      >
        {action.busy ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <Sparkles size={17} />
        )}
        {action.busy ? "Добавляем…" : "Добавить демопримеры"}
      </button>
    </div>
  );
}
export function Readiness({ score }: { score: Score }) {
  return (
    <span className={`level-badge ${score.level}`}>
      <b>{score.total}/100</b> · {LEVELS[score.level].label}
    </span>
  );
}
export const STATUS_LABELS: Record<Proposal["status"], string> = {
  pending: "Ожидает решения",
  accepted: "Команда выбрана",
  rejected: "Отклонено",
};
export function ProposalStatus({ proposal }: { proposal: Proposal }) {
  return (
    <span
      className={`proposal-status ${proposal.stageConfirmedAt ? "completed" : proposal.status}`}
    >
      {proposal.stageConfirmedAt
        ? "Этап подтверждён · +10 XP"
        : STATUS_LABELS[proposal.status]}
    </span>
  );
}
export function ExternalLink({
  href,
  children,
}: {
  href: string | null;
  children: ReactNode;
}) {
  if (!href || !/^https?:\/\//i.test(href)) return null;
  return (
    <a
      className="inline-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ArrowUpRight size={15} />
    </a>
  );
}
export function TeamSummary({ team }: { team: Team }) {
  return (
    <div className="team-summary">
      <div className="team-title">
        <span className="team-avatar">{team.name.slice(0, 2)}</span>
        <div>
          <h3>{team.name}</h3>
          <p>{team.interests.join(" · ")}</p>
        </div>
        <span className="xp-pill">{team.xp} XP</span>
      </div>
      <p className="team-skills">{team.skills.join(" · ")}</p>
      <div className="tag-row">
        {team.technologies.map((value) => (
          <span className="tag" key={value}>
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
export const TEAM_PREFERENCE = "sana-brief.selected-team";
export function rememberTeam(id: string) {
  try {
    window.localStorage.setItem(TEAM_PREFERENCE, id);
  } catch {
    /* Preference is optional; never block an actual save. */
  }
}
export function useTeamSelection(teams: Team[]) {
  const [selected, setSelected] = useState("");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(TEAM_PREFERENCE);
      if (saved) setSelected(saved);
    } catch {
      /* Use first team. */
    }
  }, []);
  const id = teams.some((team) => team.id === selected)
    ? selected
    : (teams[0]?.id ?? "");
  return [
    id,
    (value: string) => {
      setSelected(value);
      rememberTeam(value);
    },
  ] as const;
}
