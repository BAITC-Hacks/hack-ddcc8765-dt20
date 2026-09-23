import * as Dialog from "@radix-ui/react-dialog";
import { X, CheckCircle2, Building2 } from "lucide-react";
import { FIELD_SECTIONS } from "@/lib/fields";
import { LEVELS, type TaskContent, type Score } from "@/lib/contracts";

export function TaskPreview({
  open,
  onOpenChange,
  content,
  industry,
  score,
  published,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  content: TaskContent;
  industry: string;
  score: Score;
  published: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="preview-dialog">
          <div className="preview-top">
            <span className="eyebrow">КАРТОЧКА ЗАДАЧИ</span>
            <Dialog.Close
              className="icon-button"
              aria-label="Закрыть предпросмотр"
            >
              <X size={21} />
            </Dialog.Close>
          </div>
          <div className="preview-tags">
            <span className="tag">
              <Building2 size={14} />
              {industry}
            </span>
            <span className={`level-badge ${score.level}`}>
              {score.total}/100 · {LEVELS[score.level].short}
            </span>
          </div>
          <Dialog.Title>
            {content.title || "Название пока не указано"}
          </Dialog.Title>
          <Dialog.Description className="preview-description">
            {published
              ? "Последняя подтверждённая опубликованная версия."
              : "Предпросмотр текущих сведений. Перед публикацией проверьте и подтвердите карточку."}
          </Dialog.Description>
          {published && (
            <div className="verified">
              <CheckCircle2 size={17} />
              Сведения подтверждены представителем бизнеса
            </div>
          )}
          {FIELD_SECTIONS.map((section) => (
            <section key={section.id} className="preview-section">
              <h3>{section.title}</h3>
              <dl>
                {section.fields
                  .filter((field) => field.key !== "title")
                  .map((field) => (
                    <div key={field.key}>
                      <dt>{field.label}</dt>
                      <dd
                        className={
                          !content[field.key] ? "not-provided" : undefined
                        }
                      >
                        {content[field.key] || "Не указано"}
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          ))}
          <Dialog.Close className="button secondary">
            Вернуться к задаче
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
