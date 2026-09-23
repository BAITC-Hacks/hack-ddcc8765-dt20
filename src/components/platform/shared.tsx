"use client";

import { SiteHeader, SiteFooter } from "@/components/app-chrome";
import * as Dialog from "@radix-ui/react-dialog";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from "react";
import { ArrowUpRight, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { dataMode } from "@/lib/gateway";
import {
  collaborationGateway,
  resetDemoData,
  restoreDemoData,
  hasDemoBackup,
} from "@/lib/collaboration-gateway";
import { LEVELS, type Score } from "@/lib/contracts";
import type { Proposal, Team } from "@/lib/collaboration-contracts";

export function PlatformShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="platform-main">
        {children}
      </main>
      <SiteFooter />
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
export function SeedDemo({
  onDone,
  allowReset = false,
}: {
  onDone: () => void;
  allowReset?: boolean;
}) {
  const action = useAction();
  const [notice, setNotice] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const backup = useResource(
    async () => allowReset && hasDemoBackup(),
    [allowReset],
  );
  return (
    <div className="demo-banner">
      <div>
        <strong>Готовый сценарий для знакомства</strong>
        <p>
          5 черновиков, 5 карточек разных уровней и 5 откликов. Примеры
          синтетические; ваши задачи сохранятся.
        </p>
        {notice && <p role="status">{notice}</p>}
        {action.error && (
          <p className="field-error" role="alert">
            {action.error}
          </p>
        )}
      </div>
      <div className="demo-actions">
        {backup.data && (
          <button
            className="button secondary"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await restoreDemoData();
                setNotice(
                  "Последний сброс отменён. Демопримеры, их результаты и XP восстановлены.",
                );
                onDone();
              })
            }
          >
            Отменить последний сброс
          </button>
        )}
        <button
          className="button secondary"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              await collaborationGateway.seedDemo();
              setNotice(
                "Примеры добавлены. Повторное добавление не меняет ваши правки.",
              );
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
        {allowReset && dataMode === "local" && (
          <Dialog.Root
            open={resetOpen}
            onOpenChange={(open) => {
              if (!action.busy) setResetOpen(open);
            }}
          >
            <Dialog.Trigger asChild>
              <button className="button text-button" disabled={action.busy}>
                Сбросить демопримеры
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="drafts-dialog">
                <Dialog.Title>Восстановить демопримеры?</Dialog.Title>
                <Dialog.Description>
                  Ваши изменения в примерах, их отклики и XP будут сброшены.
                  Созданные вами задачи и отклики сохранятся. Перед сбросом
                  будет создана резервная копия.
                </Dialog.Description>
                <div className="proposal-decisions">
                  <Dialog.Close asChild>
                    <button className="button secondary" disabled={action.busy}>
                      Отмена
                    </button>
                  </Dialog.Close>
                  <button
                    className="button primary"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        await resetDemoData();
                        setNotice(
                          "Демопримеры восстановлены. Ваши задачи и отклики сохранены.",
                        );
                        onDone();
                        setResetOpen(false);
                      })
                    }
                  >
                    {action.busy ? "Восстанавливаем…" : "Восстановить примеры"}
                  </button>
                </div>
                {action.error && (
                  <p className="field-error" role="alert">
                    {action.error}
                  </p>
                )}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </div>
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
