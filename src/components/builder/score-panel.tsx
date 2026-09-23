import { Check, ArrowUpRight, ShieldCheck, Info } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { HelpContent } from "./help-content";
import { LEVELS, type FieldKey, type Score } from "@/lib/contracts";
import type { QualityReview } from "@/lib/quality-contracts";

export function ScorePanel({
  score,
  confirmed,
  dirty,
  editable,
  onImprove,
  qualityReview,
  onReview,
  reviewDisabled,
  localMode,
}: {
  score: Score;
  confirmed: Score | null;
  dirty: boolean;
  editable: boolean;
  onImprove: (field: FieldKey) => void;
  qualityReview: QualityReview | null;
  onReview: () => void;
  reviewDisabled: boolean;
  localMode: boolean;
}) {
  const verified = qualityReview?.source === "ai";
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
          style={{ "--score": `${verified ? score.total : 0}%` } as React.CSSProperties}
        >
          <div>
            <strong data-testid="score-total">{verified ? score.total : "—"}</strong>
            <span>из 100 баллов</span>
          </div>
        </div>
        <span className={`level-badge ${score.level}`}>
          {verified ? LEVELS[score.level].label : "Ожидает AI-проверки"}
        </span>
        <p className="score-caption">
          {!verified ? "Рейтинг появится после смысловой проверки ответов и карточки с ИИ." : dirty
            ? "Предварительная оценка. Баллы закрепятся после подтверждения."
            : "Сведения подтверждены вами. Рейтинг карточки сохранён."}
        </p>
        {verified && confirmed && dirty && (
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
                  {verified ? group.earned : "—"}
                  <em>/{group.max}</em>
                </strong>
              </div>
              <progress
                value={verified ? group.earned : 0}
                max={group.max}
                aria-label={`${group.label}: ${group.earned} из ${group.max}`}
              />
            </div>
          ))}
        </div>
        {editable && (
          <div className="quality-summary">
            <p>{qualityReview?.source === "ai"
              ? "ИИ проверил ответы и карточку. Баллы учитывают качество каждого ответа по единой шкале."
              : qualityReview ? "Резервная проверка по правилам. Смысловая оценка ИИ не выполнена."
              : "Смысловая проверка запускается автоматически после заполнения карточки."}</p>
            <button className="button secondary" onClick={onReview} disabled={reviewDisabled}>
              {localMode ? "Проверить качество" : "Проверить качество с ИИ"}
            </button>
          </div>
        )}
        <details className="rating-rules">
          <summary>Как устроен рейтинг</summary>
          <p>
            Баллы начисляются за заполненные и подтверждённые поля. Оценка
            учитывает содержательность ответа после проверки. ИИ не меняет веса показателей.
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
