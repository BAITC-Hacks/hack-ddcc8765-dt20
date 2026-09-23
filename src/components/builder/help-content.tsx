import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { LEVELS } from "@/lib/contracts";
import { calculateScore } from "@/lib/scoring";
import { emptyContent } from "@/lib/contracts";
import { dataMode } from "@/lib/gateway";

export function HelpContent({
  rating = false,
  onResetPosition,
}: {
  rating?: boolean;
  onResetPosition?: () => void;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="preview-dialog help-dialog">
        <div className="preview-top">
          <Dialog.Title>
            {rating ? "Как считается готовность задачи" : "Помощь SanaBrief"}
          </Dialog.Title>
          <Dialog.Close className="icon-button" aria-label="Закрыть помощь">
            <X size={20} />
          </Dialog.Close>
        </div>
        <Dialog.Description>
          {rating
            ? "Рейтинг показывает полноту описания. Решение о подтверждении и публикации принимаете вы."
            : "Подсказки по созданию задачи и работе с карточкой."}
        </Dialog.Description>
        {!rating && (
          <section className="help-section">
            <h3>Как составить задачу</h3>
            <ol>
              <li>Опишите текущую ситуацию и желаемое изменение.</li>
              <li>
                Ответьте на уточняющие вопросы. Неизвестные сведения можно
                пропустить.
              </li>
              <li>
                Проверьте карточку, добавьте название и подтвердите сведения.
              </li>
              <li>Опубликуйте задачу. Низкий рейтинг этому не мешает.</li>
            </ol>
          </section>
        )}
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
        {!rating && (
          <section className="help-section">
            <h3>Где мои задачи</h3>
            <p>
              Откройте «Мои задачи» вверху страницы, чтобы продолжить черновик.
            </p>
            <p>
              {dataMode === "local"
                ? "Сейчас включён деморежим: данные хранятся только в этом браузере, а вопросы составляются по шаблонам. Очистка данных браузера удалит эти черновики. Общий каталог и настоящая модель пока не подключены."
                : "В серверном режиме задачи сохраняются через подключённый API. Если сохранение не удалось, оставьте вкладку открытой и повторите его."}
            </p>
          </section>
        )}
        {onResetPosition && (
          <section className="help-section">
            <h3>Как переместить кнопку помощи</h3>
            <p>
              Зажмите круглую кнопку и перетащите мышью или пальцем. Положение
              запоминается. С клавиатуры: выделите кнопку клавишей Tab и
              перемещайте стрелками; Home вернёт её на место.
            </p>
            <button className="button secondary" onClick={onResetPosition}>
              Вернуть кнопку в левый нижний угол
            </button>
          </section>
        )}
        <Dialog.Close className="button primary">Понятно</Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
