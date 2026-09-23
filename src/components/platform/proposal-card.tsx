"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Trophy, X } from "lucide-react";
import { collaborationGateway } from "@/lib/collaboration-gateway";
import type { Proposal, Team } from "@/lib/collaboration-contracts";
import { ExternalLink, ProposalStatus, TeamSummary, useAction } from "./shared";

export function ProposalCard({
  proposal,
  team,
  title,
  role,
  onChange,
}: {
  proposal: Proposal;
  team: Team | undefined;
  title: string;
  role: "student" | "business";
  onChange: () => void;
}) {
  const action = useAction();
  const [acknowledged, setAcknowledged] = useState(false);
  const [notice, setNotice] = useState("");
  const [description, setDescription] = useState(
    proposal.resultDescription ?? "",
  );
  const [url, setUrl] = useState(proposal.resultUrl ?? "");
  const hasResult = Boolean(
    proposal.resultDescription?.trim() || proposal.resultUrl,
  );
  useEffect(() => {
    setAcknowledged(false);
  }, [proposal.resultDescription, proposal.resultUrl, proposal.status]);
  const change = (work: () => Promise<unknown>, message: string) =>
    void action.run(async () => {
      await work();
      setNotice(message);
      onChange();
    });
  return (
    <article className={`panel proposal-card ${proposal.status}`}>
      <div className="proposal-card-heading">
        <Link className="inline-link" href={`/tasks/${proposal.taskId}`}>
          {title}
        </Link>
        <ProposalStatus proposal={proposal} />
      </div>
      {team && <TeamSummary team={team} />}
      <div className="proposal-copy">
        <h3>Идея решения</h3>
        <p>{proposal.idea}</p>
        <h3>План</h3>
        <p>{proposal.plan}</p>
        <h3>Срок</h3>
        <p>{proposal.deadline}</p>
        <ExternalLink href={proposal.prototypeUrl}>
          Открыть прототип
        </ExternalLink>
      </div>
      {role === "business" && !proposal.stageConfirmedAt && (
        <div className="proposal-decisions">
          <button
            className="button primary"
            disabled={action.busy || proposal.status === "accepted"}
            onClick={() =>
              change(
                () => collaborationGateway.decide(proposal.id, "accepted"),
                "Команда выбрана. Другие отклики по-прежнему доступны.",
              )
            }
          >
            <Check size={17} />
            Выбрать команду
          </button>
          <button
            className="button secondary"
            disabled={action.busy || proposal.status === "rejected"}
            onClick={() =>
              change(
                () => collaborationGateway.decide(proposal.id, "rejected"),
                "Отклик отклонён.",
              )
            }
          >
            <X size={17} />
            Отклонить
          </button>
        </div>
      )}
      {proposal.status === "accepted" && (
        <section className="stage-block">
          <h3>
            <Trophy size={18} />
            Результат этапа
          </h3>
          {hasResult && (
            <div className="submitted-result">
              <p>{proposal.resultDescription}</p>
              <ExternalLink href={proposal.resultUrl}>
                Посмотреть результат
              </ExternalLink>
            </div>
          )}
          {proposal.stageConfirmedAt ? (
            <p className="stage-reward">
              Бизнес подтвердил результат. Команде начислено 10 XP.
            </p>
          ) : role === "student" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                change(async () => {
                  if (!description.trim() && !url.trim())
                    throw new Error(
                      "Добавьте описание результата или ссылку на него.",
                    );
                  await collaborationGateway.result(
                    proposal.id,
                    description.trim(),
                    url.trim() || null,
                  );
                }, "Результат отправлен бизнесу на подтверждение.");
              }}
            >
              <fieldset disabled={action.busy}>
                <label>
                  Что сделано
                  <textarea
                    maxLength={8000}
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Опишите готовую часть работы и как её проверить"
                  />
                </label>
                <label>
                  Ссылка на результат
                  <input
                    type="url"
                    maxLength={2000}
                    placeholder="https://…"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </label>
                <button className="button secondary" type="submit">
                  {action.busy ? "Сохраняем…" : "Отправить результат"}
                </button>
              </fieldset>
            </form>
          ) : hasResult ? (
            <div className="stage-confirm">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  disabled={action.busy}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                Я проверил результат и подтверждаю выполнение этапа
              </label>
              <button
                className="button primary"
                disabled={action.busy || !acknowledged}
                onClick={() =>
                  change(
                    () => collaborationGateway.confirmStage(proposal.id),
                    "Этап подтверждён. Команде начислено 10 XP.",
                  )
                }
              >
                <Trophy size={17} />
                Подтвердить этап · +10 XP
              </button>
            </div>
          ) : (
            <p className="muted">
              Команда ещё не предоставила результат. После отправки он появится
              здесь для вашей проверки.
            </p>
          )}
        </section>
      )}
      {notice && (
        <p className="action-notice" role="status">
          {notice}
        </p>
      )}
      {action.error && (
        <p className="field-error" role="alert">
          {action.error}
        </p>
      )}
    </article>
  );
}
