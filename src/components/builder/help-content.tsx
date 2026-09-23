import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { LEVELS } from "@/lib/contracts";
import { calculateScore } from "@/lib/scoring";
import { emptyContent } from "@/lib/contracts";

export function HelpContent() {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="preview-dialog help-dialog">
        <div className="preview-top">
          <Dialog.Title>Как считается готовность задачи</Dialog.Title>
          <Dialog.Close className="icon-button" aria-label="Закрыть помощь">
            <X size={20} />
          </Dialog.Close>
        </div>
        <Dialog.Description>
          Рейтинг показывает полноту описания. Решение о подтверждении и
          публикации принимаете вы.
        </Dialog.Description>
        <section className="help-section">
          <h3>За что начисляются баллы</h3>
          <p>
            Всего — 100 баллов. Название не добавляет баллов, но необходимо для
            подтверждения. Пустые поля и ответы вроде «не знаю» не учитываются.
          </p>
          <dl className="help-weights">
            {calculateScore(emptyContent()).groups.map((group) => (
              <div key={group.id}>
                <dt>{group.label}</dt>
                <dd>до {group.max}</dd>
              </div>
            ))}
          </dl>
          <p>
            Во время редактирования оценка предварительная. После подтверждения
            рейтинг закрепляется, а опубликованная карточка обновляется.
          </p>
          <ul>
            {Object.values(LEVELS).map((level) => (
              <li key={level.short}>
                <b>{level.range}</b> — {level.label}
              </li>
            ))}
          </ul>
        </section>
        <Dialog.Close className="button primary">Понятно</Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
