"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Eye,
  FileText,
  FolderOpen,
  Lightbulb,
  LoaderCircle,
  Plus,
  Rocket,
  Save,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { INDUSTRIES, newTask, type Task } from "@/lib/contracts";
import { dataMode, draftInput, gateway } from "@/lib/gateway";
import { calculateScore, meaningful, validContact } from "@/lib/scoring";
import { hasUnconfirmedChanges } from "@/lib/task-state";
import { fallbackCard, fallbackQuestions } from "@/lib/assistance";
import { FIELD_LIMITS, FIELD_SECTIONS } from "@/lib/fields";
import { ScorePanel } from "./score-panel";
import { TaskPreview } from "./task-preview";

const steps = [
  { title: "Опишите задачу", subtitle: "Начнём с вашей идеи", icon: Lightbulb },
  { title: "Уточните детали", subtitle: "Ответьте на вопросы", icon: Sparkles },
  {
    title: "Проверьте карточку",
    subtitle: "Подтвердите и опубликуйте",
    icon: FileText,
  },
];
type SaveState = "saved" | "pending" | "saving" | "error";

export function BusinessBuilder({ initialId }: { initialId?: string }) {
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [acknowledged, setAcknowledged] = useState(false);
  const [preview, setPreview] = useState<"draft" | "published" | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Task[]>([]);
  const [fallbackAction, setFallbackAction] = useState<
    "questions" | "card" | null
  >(null);
  const initialization = useRef<Promise<Task> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const lastSaved = useRef("");
  const currentFingerprint = useRef("");
  const fingerprint = task ? JSON.stringify(draftInput(task)) : "";
  currentFingerprint.current = fingerprint;

  useEffect(() => {
    let cancelled = false;
    // Re-read existing tasks when the effect restarts (including Fast Refresh).
    // Only cache creation to avoid duplicate drafts in React Strict Mode.
    if (!initialId && !initialization.current)
      initialization.current = gateway.create(newTask(crypto.randomUUID()));
    const loading = initialId
      ? gateway.get(initialId)
      : initialization.current!;
    loading
      .then((value) => {
        if (cancelled) return;
        lastSaved.current = JSON.stringify(draftInput(value));
        // Preserve the in-progress draft during Fast Refresh, including unsaved text.
        setTask((current) => (current?.id === value.id ? current : value));
        if (!initialId) router.replace(`/tasks/${value.id}/edit`);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Не удалось открыть задачу.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [initialId, router]);

  function saveSnapshot(snapshot: Task) {
    const version = JSON.stringify(draftInput(snapshot));
    setSaveState("saving");
    const job = saveQueue.current
      .catch(() => undefined)
      .then(() => gateway.save(snapshot));
    saveQueue.current = job;
    return job
      .then((saved) => {
        lastSaved.current = version;
        if (currentFingerprint.current === version) setSaveState("saved");
        return saved;
      })
      .catch((cause) => {
        setSaveState("error");
        throw cause;
      });
  }

  useEffect(() => {
    if (!task || fingerprint === lastSaved.current) return;
    setSaveState("pending");
    saveTimer.current = setTimeout(() => {
      void saveSnapshot(task).catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось сохранить задачу.",
        ),
      );
    }, 650);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // The fingerprint contains every editable persisted property. Metadata-only changes do not save a draft again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saveState !== "saved") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  useEffect(() => {
    if (task)
      document
        .getElementById("workspace-title")
        ?.focus({ preventScroll: true });
  }, [task?.step]);

  function update(change: Partial<Task>) {
    setTask((current) => (current ? { ...current, ...change } : current));
    setAcknowledged(false);
    setNotice("");
  }
  async function flush(snapshot: Task) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    return saveSnapshot(snapshot);
  }
  async function action(label: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось выполнить действие. Попробуйте ещё раз.",
      );
    } finally {
      setBusy("");
    }
  }
  async function askQuestions() {
    if (!task) return;
    if (!meaningful(task.rawText)) {
      setError("Опишите вашу задачу хотя бы одним предложением.");
      return;
    }
    await action("Готовим вопросы", async () => {
      await flush(task);
      try {
        const response = await gateway.questions(task);
        setFallbackAction(null);
        update({
          questions: response.questions,
          source: response.source,
          step: 2,
        });
      } catch (cause) {
        setFallbackAction("questions");
        throw cause;
      }
    });
  }
  async function assembleCard() {
    if (!task) return;
    await action("Собираем карточку", async () => {
      await flush(task);
      try {
        const response = await gateway.card(task);
        setFallbackAction(null);
        update({ draft: response.content, source: response.source, step: 3 });
      } catch (cause) {
        setFallbackAction("card");
        throw cause;
      }
    });
  }
  function useFallback() {
    if (!task) return;
    if (fallbackAction === "questions")
      update({
        questions: fallbackQuestions(task.rawText, task.draft),
        step: 2,
        source: "fallback",
      });
    else update({ draft: fallbackCard(task), step: 3, source: "fallback" });
    setFallbackAction(null);
    setError("");
    setNotice(
      "Использованы шаблонные вопросы и ваши ответы. Новые факты не добавлены.",
    );
  }
  async function confirm() {
    if (!task) return;
    if (!meaningful(task.draft.title)) {
      setError("Добавьте название задачи перед подтверждением.");
      document.getElementById("field-title")?.focus();
      return;
    }
    if (!acknowledged) {
      setError("Подтвердите, что проверили сведения в карточке.");
      return;
    }
    await action("Подтверждаем", async () => {
      await flush(task);
      const saved = await gateway.confirm(task);
      setTask(saved);
      setAcknowledged(false);
      setNotice(
        saved.publishedAt
          ? "Изменения подтверждены. Опубликованная карточка и рейтинг обновлены."
          : "Карточка подтверждена. Теперь её можно опубликовать.",
      );
    });
  }
  async function publish() {
    if (!task) return;
    await action("Публикуем", async () => {
      await flush(task);
      const saved = await gateway.publish(task);
      setTask(saved);
      setNotice(
        dataMode === "local"
          ? "Публикация сохранена в деморежиме этого браузера."
          : "Задача опубликована в общем каталоге.",
      );
    });
  }
  async function navigate(path: string) {
    await action("Сохраняем", async () => {
      if (task) await flush(task);
      setDraftsOpen(false);
      router.push(path);
    });
  }
  async function showDrafts() {
    await action("Открываем задачи", async () => {
      if (task) await flush(task);
      setDrafts(await gateway.list());
      setDraftsOpen(true);
    });
  }

  const dirty = task ? hasUnconfirmedChanges(task) : true;
  const score =
    !dirty && task?.confirmedScore
      ? task.confirmedScore
      : calculateScore(task?.draft ?? newTask("preview").draft);
  const readOnly = Boolean(busy);
  const answered =
    task?.questions.filter((q) => task.answers[q.id]?.trim()).length ?? 0;

  return (
    <>
      <a href="#main" className="skip-link">
        Перейти к содержимому
      </a>
      <header className="app-header">
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            void navigate("/tasks/new");
          }}
          aria-label="SanaBrief — новая задача"
        >
          <img src="/icon.svg" alt="" width="36" height="36" />
          <span>
            Sana<span className="brand-light">Brief</span>
          </span>
        </a>
        <div className="header-divider" />
        <span className="header-context">Рабочее пространство бизнеса</span>
        <div className="header-actions">
          <span className={`mode-pill ${dataMode}`}>
            <span />
            {dataMode === "local" ? "Демо-режим" : "Серверный режим"}
          </span>
          <button
            className="button text-button"
            onClick={() => void showDrafts()}
            disabled={readOnly || !task}
          >
            <FolderOpen size={17} />
            Мои задачи
          </button>
          <span className="avatar" aria-label="Демопрофиль бизнеса">
            Б
          </span>
        </div>
      </header>
      <div className="app-shell">
        <nav className="sidebar" aria-label="Этапы создания задачи">
          <div className="sidebar-label">НОВАЯ ВОЗМОЖНОСТЬ</div>
          <h2>
            От идеи
            <br />к сотрудничеству.
          </h2>
          <p className="sidebar-intro">
            Понятная задача — первый шаг к сильному решению.
          </p>
          <ol className="steps">
            {steps.map((step, index) => {
              const number = index + 1;
              const active = task?.step === number;
              const completed = (task?.step ?? 1) > number;
              return (
                <li
                  key={step.title}
                  className={active ? "active" : completed ? "completed" : ""}
                >
                  <button
                    disabled={
                      readOnly ||
                      !task ||
                      (number === 2 && task.questions.length < 3) ||
                      (number === 3 && !Object.values(task.draft).some(Boolean))
                    }
                    onClick={() => update({ step: number as 1 | 2 | 3 })}
                    aria-current={active ? "step" : undefined}
                  >
                    <span className="step-number">
                      {completed ? <Check size={16} /> : `0${number}`}
                    </span>
                    <span>
                      <b>{step.title}</b>
                      <small>{step.subtitle}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="sidebar-tip">
            <ShieldCheck size={23} />
            <b>Решение остаётся за вами</b>
            <p>
              Вы проверяете сведения, публикуете задачу и выбираете команду.
            </p>
          </div>
          <div className="sidebar-footer">
            AI SANA <span>ПРАКТИЧЕСКИЙ ХАКАТОН</span>
          </div>
        </nav>
        <main id="main" className="workspace">
          <div className="workspace-top">
            <span className="breadcrumb">
              Бизнес <ChevronRight size={14} /> Конструктор задачи
            </span>
            <span className={`save-status ${saveState}`} role="status">
              {saveState === "saving" || saveState === "pending" ? (
                <LoaderCircle size={14} className="spin" />
              ) : saveState === "saved" ? (
                <Check size={14} />
              ) : (
                <CircleHelp size={14} />
              )}
              {saveState === "saved"
                ? dataMode === "local"
                  ? "Сохранено в браузере"
                  : "Сохранено"
                : saveState === "error"
                  ? "Не сохранено"
                  : "Сохраняем…"}
            </span>
          </div>
          {error && (
            <div className="alert error" role="alert">
              <div>
                <b>Не получилось завершить действие</b>
                <p>{error}</p>
                {fallbackAction && (
                  <button
                    className="button secondary"
                    onClick={useFallback}
                    disabled={readOnly}
                  >
                    Продолжить с шаблонными вопросами
                  </button>
                )}
                {saveState === "error" && task && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      void action("Сохраняем", async () => {
                        await flush(task);
                      })
                    }
                    disabled={readOnly}
                  >
                    Повторить сохранение
                  </button>
                )}
              </div>
              <button
                className="icon-button"
                aria-label="Закрыть сообщение об ошибке"
                onClick={() => setError("")}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <CheckCircle2 size={20} />
              <p>{notice}</p>
            </div>
          )}
          {!task ? (
            <div className="loading-panel">
              {error ? (
                <>
                  <h1>Задача недоступна</h1>
                  <a className="button primary" href="/tasks/new">
                    Создать новую задачу
                  </a>
                </>
              ) : (
                <>
                  <LoaderCircle className="spin" size={30} />
                  <p>Открываем конструктор…</p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">ШАГ 0{task.step} / 03</div>
                  <h1 id="workspace-title" tabIndex={-1}>
                    {task.step === 1
                      ? "С чего начнём?"
                      : task.step === 2
                        ? "Добавим важные детали"
                        : "Ваша задача обретает форму"}
                  </h1>
                  <p>
                    {task.step === 1
                      ? "Расскажите, что вы хотите улучшить в своём бизнесе."
                      : task.step === 2
                        ? "Ответы помогут студентам понять задачу и предложить решение."
                        : "Проверьте сведения, дополните пробелы и подготовьте карточку к публикации."}
                  </p>
                </div>
                <span className="draft-badge">
                  <FileText size={14} />
                  {task.publishedAt
                    ? dirty
                      ? "Есть правки"
                      : "Опубликована"
                    : "Черновик"}
                </span>
              </div>
              <div className="editor-grid">
                <div className="editor-main">
                  {task.step === 1 && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void askQuestions();
                      }}
                      className="panel description-panel"
                    >
                      <div className="panel-heading">
                        <span className="section-icon">
                          <Lightbulb size={20} />
                        </span>
                        <div>
                          <h2>Опишите вашу задачу</h2>
                          <p>
                            Достаточно нескольких предложений своими словами.
                          </p>
                        </div>
                      </div>
                      <label className="field-label" htmlFor="raw-text">
                        Что сейчас происходит и что хочется изменить?
                      </label>
                      <textarea
                        id="raw-text"
                        className="raw-input"
                        value={task.rawText}
                        onChange={(event) =>
                          update({ rawText: event.target.value })
                        }
                        maxLength={4000}
                        rows={8}
                        required
                        readOnly={readOnly}
                        placeholder="Например: у нас небольшая пекарня. Заказы приходят в мессенджер, и администратор вручную переносит их в таблицу. Хотим сократить время обработки и перестать терять заказы."
                      />
                      <div className="field-meta">
                        <span>Не включайте пароли и персональные данные.</span>
                        <span>{task.rawText.length}/4000</span>
                      </div>
                      <div className="examples">
                        <span>Попробовать на примере</span>
                        {[
                          {
                            label: "Заказы пекарни",
                            industry: "Торговля",
                            text: "У нас небольшая пекарня. Заказы приходят в мессенджер, администратор вручную переносит их в таблицу. Хотим сократить время обработки и перестать терять заказы.",
                          },
                          {
                            label: "Учебный центр",
                            industry: "Образование",
                            text: "Наш учебный центр получает много повторяющихся вопросов о курсах. Хотим помочь администратору быстрее отвечать на обращения.",
                          },
                        ].map((example) => (
                          <button
                            key={example.label}
                            type="button"
                            className="example-chip"
                            disabled={readOnly || Boolean(task.rawText.trim())}
                            onClick={() =>
                              update({
                                rawText: example.text,
                                industry: example.industry,
                              })
                            }
                          >
                            {example.label}
                            <ArrowUpRightIcon />
                          </button>
                        ))}
                      </div>
                      <div className="industry-field">
                        <label className="field-label" htmlFor="industry">
                          Сфера бизнеса
                        </label>
                        <select
                          id="industry"
                          value={task.industry}
                          disabled={readOnly}
                          onChange={(event) =>
                            update({ industry: event.target.value })
                          }
                        >
                          {INDUSTRIES.map((industry) => (
                            <option key={industry}>{industry}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-footer">
                        <span>
                          <Clock3 size={15} />
                          Около 5 минут на заполнение
                        </span>
                        <button
                          className="button primary"
                          disabled={readOnly || !task.rawText.trim()}
                          type="submit"
                        >
                          {busy ? (
                            <LoaderCircle size={17} className="spin" />
                          ) : (
                            <Sparkles size={17} />
                          )}
                          {busy || "Уточнить задачу"}
                          <ArrowRight size={17} />
                        </button>
                      </div>
                    </form>
                  )}
                  {task.step === 2 && (
                    <div className="panel questions-panel">
                      <div className="panel-heading">
                        <span className="section-icon">
                          <Sparkles size={20} />
                        </span>
                        <div>
                          <h2>Вопросы по вашей задаче</h2>
                          <p>
                            Можно оставить ответ пустым и уточнить его в
                            карточке.
                          </p>
                        </div>
                        <span className="counter">
                          {answered}/{task.questions.length}
                        </span>
                      </div>
                      <div className="source-note">
                        <InfoIcon />
                        {task.source === "ai"
                          ? "Вопросы подготовлены ИИ. Ответы и факты задаёте вы."
                          : "Шаблонные вопросы по вашему описанию. Это резервный режим без AI API."}
                      </div>
                      {task.questions.map((question, index) => (
                        <div key={question.id} className="question-field">
                          <label htmlFor={`answer-${question.id}`}>
                            <span className="question-index">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            {question.text}
                          </label>
                          {question.hint && (
                            <p id={`hint-${question.id}`}>{question.hint}</p>
                          )}
                          <textarea
                            id={`answer-${question.id}`}
                            aria-describedby={
                              question.hint ? `hint-${question.id}` : undefined
                            }
                            rows={3}
                            maxLength={FIELD_LIMITS[question.field]}
                            value={task.answers[question.id] ?? ""}
                            readOnly={readOnly}
                            onChange={(event) =>
                              update({
                                answers: {
                                  ...task.answers,
                                  [question.id]: event.target.value,
                                },
                              })
                            }
                            placeholder="Ваш ответ…"
                          />
                        </div>
                      ))}
                      {task.draft.context && (
                        <p className="small-note">
                          При повторной сборке ответы заменят соответствующие
                          поля карточки. Остальные сведения сохранятся.
                        </p>
                      )}
                      <div className="form-footer">
                        <button
                          className="button text-button"
                          disabled={readOnly}
                          onClick={() => update({ step: 1 })}
                        >
                          <ArrowLeft size={17} />
                          Назад
                        </button>
                        <button
                          className="button primary"
                          onClick={() => void assembleCard()}
                          disabled={readOnly}
                        >
                          {busy ? (
                            <LoaderCircle className="spin" size={17} />
                          ) : (
                            <FileText size={17} />
                          )}
                          {busy || "Собрать карточку"}
                          <ArrowRight size={17} />
                        </button>
                      </div>
                    </div>
                  )}
                  {task.step === 3 && (
                    <>
                      {task.publishedAt && (
                        <div className="publication-banner">
                          <span className="publication-icon">
                            <Rocket size={24} />
                          </span>
                          <div>
                            <h2>
                              {dirty
                                ? "Опубликованная версия сохранена"
                                : "Задача опубликована"}
                            </h2>
                            <p>
                              {dirty
                                ? "Новые правки появятся в карточке после вашего подтверждения."
                                : dataMode === "local"
                                  ? "Публикация показана в деморежиме. Данные доступны только в этом браузере."
                                  : "Задача доступна всем командам в общем каталоге."}
                            </p>
                            <button
                              className="inline-link"
                              onClick={() => setPreview("published")}
                            >
                              Посмотреть опубликованную версию{" "}
                              <ArrowRight size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="editor-toolbar">
                        <span>
                          <ShieldCheck size={16} />
                          {task.source === "ai"
                            ? "Проверьте текст, предложенный ИИ"
                            : "Заполнено только из вашего описания и ответов"}
                        </span>
                        <button
                          className="button secondary compact"
                          onClick={() => setPreview("draft")}
                        >
                          <Eye size={16} />
                          Предпросмотр
                        </button>
                      </div>
                      {FIELD_SECTIONS.map((section, index) => (
                        <section
                          className="panel field-section"
                          key={section.id}
                          aria-labelledby={`section-${section.id}`}
                        >
                          <div className="panel-heading">
                            <span className="section-count">0{index + 1}</span>
                            <div>
                              <h2 id={`section-${section.id}`}>
                                {section.title}
                              </h2>
                              <p>{section.description}</p>
                            </div>
                          </div>
                          {section.id === "essence" && (
                            <div className="editor-field">
                              <label
                                className="field-label"
                                htmlFor="card-industry"
                              >
                                Сфера бизнеса
                              </label>
                              <select
                                id="card-industry"
                                value={task.industry}
                                disabled={readOnly}
                                onChange={(event) =>
                                  update({ industry: event.target.value })
                                }
                              >
                                {INDUSTRIES.map((industry) => (
                                  <option key={industry}>{industry}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {section.fields.map((field) => {
                            const contactInvalid =
                              field.key === "contact" &&
                              Boolean(task.draft.contact.trim()) &&
                              !validContact(task.draft.contact);
                            return (
                              <div className="editor-field" key={field.key}>
                                <div className="label-row">
                                  <label
                                    className="field-label"
                                    htmlFor={`field-${field.key}`}
                                  >
                                    {field.label}
                                    {field.key === "title" && (
                                      <span className="required-mark"> *</span>
                                    )}
                                  </label>
                                  {meaningful(task.draft[field.key]) &&
                                    !contactInvalid && (
                                      <Check
                                        size={15}
                                        className="field-check"
                                        aria-label="Заполнено"
                                      />
                                    )}
                                </div>
                                <p
                                  className="field-hint"
                                  id={`field-hint-${field.key}`}
                                >
                                  {field.hint}
                                </p>
                                {field.short ? (
                                  <input
                                    id={`field-${field.key}`}
                                    value={task.draft[field.key]}
                                    readOnly={readOnly}
                                    maxLength={FIELD_LIMITS[field.key]}
                                    aria-describedby={`field-hint-${field.key}${contactInvalid ? " contact-error" : ""}`}
                                    aria-invalid={contactInvalid || undefined}
                                    placeholder={field.placeholder}
                                    onChange={(event) =>
                                      update({
                                        draft: {
                                          ...task.draft,
                                          [field.key]: event.target.value,
                                        },
                                      })
                                    }
                                  />
                                ) : (
                                  <textarea
                                    id={`field-${field.key}`}
                                    value={task.draft[field.key]}
                                    readOnly={readOnly}
                                    maxLength={FIELD_LIMITS[field.key]}
                                    rows={3}
                                    aria-describedby={`field-hint-${field.key}`}
                                    placeholder={field.placeholder}
                                    onChange={(event) =>
                                      update({
                                        draft: {
                                          ...task.draft,
                                          [field.key]: event.target.value,
                                        },
                                      })
                                    }
                                  />
                                )}
                                {contactInvalid && (
                                  <p className="field-error" id="contact-error">
                                    Для баллов укажите корректный email,
                                    телефон, @username или ссылку.
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </section>
                      ))}
                      <section className="panel confirmation-panel">
                        <div className="panel-heading">
                          <span className="section-icon">
                            <ShieldCheck size={20} />
                          </span>
                          <div>
                            <h2>
                              {dirty
                                ? "Всё верно? Подтвердите карточку"
                                : "Карточка подтверждена"}
                            </h2>
                            <p>
                              {dirty
                                ? "Это сохранит проверенные сведения и закрепит рейтинг."
                                : task.publishedAt
                                  ? "После правок потребуется новое подтверждение."
                                  : "Задачу можно публиковать с любым рейтингом."}
                            </p>
                          </div>
                        </div>
                        {dirty && (
                          <label className="acknowledgement">
                            <input
                              type="checkbox"
                              checked={acknowledged}
                              disabled={readOnly}
                              onChange={(event) =>
                                setAcknowledged(event.target.checked)
                              }
                            />
                            <span>
                              Я проверил(а) карточку. Заполненные сведения
                              верны, и их можно показать студенческим командам.
                            </span>
                          </label>
                        )}
                        <div className="confirmation-actions">
                          <button
                            className="button secondary"
                            onClick={() =>
                              void action("Сохраняем", async () => {
                                await flush(task);
                                setNotice(
                                  "Черновик сохранён. Его можно продолжить через «Мои задачи».",
                                );
                              })
                            }
                            disabled={readOnly}
                          >
                            <Save size={17} />
                            Сохранить черновик
                          </button>
                          {dirty ? (
                            <button
                              className="button primary"
                              disabled={readOnly || !acknowledged}
                              onClick={() => void confirm()}
                            >
                              {busy ? (
                                <LoaderCircle className="spin" size={17} />
                              ) : (
                                <CheckCircle2 size={17} />
                              )}
                              {busy ||
                                (task.publishedAt
                                  ? "Подтвердить изменения"
                                  : "Подтвердить карточку")}
                            </button>
                          ) : !task.publishedAt ? (
                            <button
                              className="button primary"
                              disabled={readOnly}
                              onClick={() => void publish()}
                            >
                              {busy ? (
                                <LoaderCircle className="spin" size={17} />
                              ) : (
                                <Rocket size={17} />
                              )}
                              {busy || "Опубликовать задачу"}
                            </button>
                          ) : (
                            <button
                              className="button primary"
                              onClick={() => setPreview("published")}
                            >
                              <Eye size={17} />
                              Посмотреть карточку
                            </button>
                          )}
                        </div>
                        {dataMode === "local" && (
                          <p className="small-note">
                            Демо-режим: черновик и публикация сохраняются в этом
                            браузере. Общий каталог будет доступен после
                            подключения сервера.
                          </p>
                        )}
                      </section>
                      <button
                        className="button text-button back-to-questions"
                        onClick={() => update({ step: 2 })}
                        disabled={readOnly}
                      >
                        <ArrowLeft size={16} />
                        Вернуться к вопросам
                      </button>
                    </>
                  )}
                  {task.step < 3 && (
                    <div className="editor-footnote">
                      <span className="tiny-brand">S</span>
                      <p>
                        Вы знаете свой бизнес. Мы поможем сформулировать задачу.
                        <br />
                        <span>
                          {dataMode === "local"
                            ? "Деморежим · ваши данные остаются в этом браузере"
                            : "Неизвестные сведения останутся незаполненными"}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
                <ScorePanel
                  score={score}
                  confirmed={task.confirmedScore}
                  dirty={dirty}
                  editable={task.step === 3}
                  onImprove={(field) => {
                    document
                      .getElementById(`field-${field}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                    document
                      .getElementById(`field-${field}`)
                      ?.focus({ preventScroll: true });
                  }}
                />
              </div>
            </>
          )}
        </main>
      </div>
      {task && (
        <TaskPreview
          open={preview !== null}
          onOpenChange={(open) => {
            if (!open) setPreview(null);
          }}
          content={
            preview === "published" && task.confirmedContent
              ? task.confirmedContent
              : task.draft
          }
          industry={
            preview === "published"
              ? (task.confirmedIndustry ?? task.industry)
              : task.industry
          }
          score={
            preview === "published" && task.confirmedScore
              ? task.confirmedScore
              : score
          }
          published={preview === "published"}
        />
      )}
      <Dialog.Root open={draftsOpen} onOpenChange={setDraftsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="drafts-dialog">
            <div className="preview-top">
              <Dialog.Title>Мои задачи</Dialog.Title>
              <Dialog.Close
                className="icon-button"
                aria-label="Закрыть список задач"
              >
                <X size={20} />
              </Dialog.Close>
            </div>
            <Dialog.Description>
              {dataMode === "local"
                ? "Черновики и публикации из этого браузера."
                : "Ваши сохранённые задачи."}
            </Dialog.Description>
            <div className="draft-list">
              {drafts.map((item) => (
                <button
                  className="draft-list-item"
                  disabled={readOnly}
                  key={item.id}
                  onClick={() => void navigate(`/tasks/${item.id}/edit`)}
                >
                  <span className="draft-list-icon">
                    <FileText size={21} />
                  </span>
                  <span>
                    <b>
                      {item.draft.title ||
                        item.confirmedContent?.title ||
                        item.rawText.slice(0, 65) ||
                        "Новая задача"}
                    </b>
                    <small>
                      {item.publishedAt ? "Опубликована" : "Черновик"} ·{" "}
                      {item.industry} ·{" "}
                      {new Date(item.updatedAt).toLocaleDateString("ru-RU")}
                    </small>
                  </span>
                  <span className="draft-list-score">
                    {item.confirmedScore?.total ??
                      calculateScore(item.draft).total}
                    <small>/100</small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
            <button
              className="button primary"
              disabled={readOnly}
              onClick={() => void navigate("/tasks/new")}
            >
              <Plus size={17} />
              Создать задачу
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 12 12 4M4 4h8v8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function InfoIcon() {
  return <CircleHelp size={16} aria-hidden />;
}
