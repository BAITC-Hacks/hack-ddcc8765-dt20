import { Check, ArrowUpRight, ShieldCheck, Info } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { HelpContent } from "./help-content";
import { LEVELS, type FieldKey, type Score } from "@/lib/contracts";

export function ScorePanel({
  score,
  confirmed,
  dirty,
  editable,
  onImprove,
}: {
  score: Score;
  confirmed: Score | null;
  dirty: boolean;
  editable: boolean;
  onImprove: (field: FieldKey) => void;
}) {
  const missing = score.groups
    .flatMap((group) => group.missing)
    .sort((a, b) => b.points - a.points);
  const delta = confirmed ? score.total - confirmed.total : 0;
  return (
    <aside className="score-column" aria-label="Рейтинг готовности">
      <div className="score-card">
        <div className="eyebrow">
          ГОТОВНОСТЬ ЗАДАЧИ
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <button
                className="icon-button score-help"
                aria-label="Как считается готовность задачи"
                title="Как считается готовность задачи"
              >
                <Info size={17} aria-hidden />
              </button>
            </Dialog.Trigger>
            <HelpContent />
          </Dialog.Root>
        </div>
        <div
          className="score-dial"
          style={{ "--score": `${score.total}%` } as React.CSSProperties}
        >
          <div>
            <strong data-testid="score-total">{score.total}</strong>
            <span>из 100 баллов</span>
          </div>
        </div>
        <span className={`level-badge ${score.level}`}>
          {LEVELS[score.level].label}
        </span>
        <p className="score-caption">
          {dirty
            ? "Предварительная оценка. Баллы закрепятся после подтверждения."
            : "Сведения подтверждены вами. Рейтинг карточки сохранён."}
        </p>
        {confirmed && dirty && (
          <div className="confirmed-score">
            Подтверждено: <b>{confirmed.total}</b>
            {delta !== 0 && (
              <span className={delta > 0 ? "positive" : "negative"}>
                {delta > 0 ? "+" : ""}
                {delta} после проверки
              </span>
            )}
          </div>
        )}
        <div className="score-breakdown">
          {score.groups.map((group) => (
            <div className="score-row" key={group.id}>
              <div>
                <span>{group.label}</span>
                <strong>
                  {group.earned}
                  <em>/{group.max}</em>
                </strong>
              </div>
              <progress
                value={group.earned}
                max={group.max}
                aria-label={`${group.label}: ${group.earned} из ${group.max}`}
              />
            </div>
          ))}
        </div>
        <details className="rating-rules">
          <summary>Как устроен рейтинг</summary>
          <p>
            Баллы начисляются за заполненные и подтверждённые поля. Оценка
            показывает полноту сведений, а не экспертизу бизнеса.
          </p>
          <ul>
            {Object.values(LEVELS).map((level) => (
              <li key={level.short}>
                <b>{level.range}</b> {level.short}
              </li>
            ))}
          </ul>
        </details>
      </div>
      {editable &&
        (missing.length > 0 ? (
          <div className="improvement-card">
            <div className="eyebrow">СЛЕДУЮЩИЙ ШАГ</div>
            <h3>Сделайте задачу понятнее</h3>
            {missing.slice(0, 3).map((item) => (
              <button
                key={item.field}
                onClick={() => onImprove(item.field)}
                className="improvement"
              >
                <span>
                  {item.label}
                  <small>+{item.points} баллов</small>
                </span>
                <ArrowUpRight size={18} aria-hidden />
              </button>
            ))}
          </div>
        ) : (
          <div className="complete-tip">
            <Check size={20} />
            <div>
              <b>Все сведения на месте</b>
              <p>Проверьте карточку и подтвердите её.</p>
            </div>
          </div>
        ))}
      <div className="fairness-note">
        <ShieldCheck size={20} />
        <p>
          Даже с низким рейтингом задачу можно опубликовать. Команды смогут
          откликаться.
        </p>
      </div>
    </aside>
  );
}
