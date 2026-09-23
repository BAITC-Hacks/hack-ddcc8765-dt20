"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowDownWideNarrow, Search } from "lucide-react";
import { INDUSTRIES, LEVELS } from "@/lib/contracts";
import { collaborationGateway } from "@/lib/collaboration-gateway";
import {
  EmptyState,
  LoadState,
  PlatformShell,
  Readiness,
  SeedDemo,
  useResource,
} from "./shared";

export function CatalogPage() {
  const resource = useResource(() => collaborationGateway.catalog());
  const [industry, setIndustry] = useState("");
  const [level, setLevel] = useState("");
  const [query, setQuery] = useState("");
  const tasks = resource.data ?? [];
  const filtered = tasks.filter(
    (t) =>
      (!industry || t.confirmedIndustry === industry) &&
      (!level || t.confirmedScore.level === level) &&
      `${t.confirmedContent.title} ${t.confirmedContent.context} ${t.confirmedContent.need}`
        .toLocaleLowerCase("ru")
        .includes(query.trim().toLocaleLowerCase("ru")),
  );
  const reset = () => {
    setIndustry("");
    setLevel("");
    setQuery("");
  };
  return (
    <PlatformShell>
      <section className="platform-hero">
        <div>
          <span className="eyebrow">ОТКРЫТЫЕ ВОЗМОЖНОСТИ</span>
          <h1>
            Задачи, которым нужна
            <br />
            ваша команда
          </h1>
          <p>
            Выберите реальную потребность бизнеса и предложите своё решение. Чем
            полнее задача, тем выше она в каталоге.
          </p>
        </div>
        <div className="hero-stat">
          <strong>{tasks.length}</strong>
          <span>опубликовано задач</span>
          <small>Все уровни открыты для откликов</small>
        </div>
      </section>
      <div className="catalog-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Поиск задач"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название или потребность…"
          />
        </label>
        <label>
          Тема
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          >
            <option value="">Все темы</option>
            {INDUSTRIES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Готовность
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Все уровни</option>
            {Object.entries(LEVELS).map(([key, v]) => (
              <option key={key} value={key}>
                {v.range} · {v.label}
              </option>
            ))}
          </select>
        </label>
        {(industry || level || query) && (
          <button className="button text-button" onClick={reset}>
            Сбросить
          </button>
        )}
      </div>
      <div className="list-caption">
        <span>Найдено: {filtered.length}</span>
        <span>
          <ArrowDownWideNarrow size={16} />
          По рейтингу готовности
        </span>
        <button
          className="button text-button compact"
          onClick={resource.reload}
        >
          Обновить
        </button>
      </div>
      <LoadState {...resource} retry={resource.reload} />
      <div className="catalog-grid">
        {filtered.map((task) => (
          <article
            key={task.id}
            className={`catalog-card ${task.confirmedScore.level}`}
          >
            <div className="card-topline">
              <span className="tag">{task.confirmedIndustry}</span>
              <span className="card-score">
                {task.confirmedScore.total}
                <small>/100</small>
              </span>
            </div>
            <Readiness score={task.confirmedScore} />
            <h2>
              <Link href={`/tasks/${task.id}`}>
                {task.confirmedContent.title}
              </Link>
            </h2>
            <p>
              {task.confirmedContent.need ||
                task.confirmedContent.context ||
                "Описание требует уточнения — обсудите задачу с бизнесом."}
            </p>
            <div className="card-bottom">
              <span>
                {task.confirmedContent.deadline || "Срок обсуждается"}
              </span>
              <Link href={`/tasks/${task.id}`} className="inline-link">
                Открыть задачу
                <ArrowRight size={17} />
              </Link>
            </div>
          </article>
        ))}
      </div>
      {!resource.loading && !resource.error && !filtered.length && (
        <EmptyState
          title={
            tasks.length
              ? "По этим условиям задач нет"
              : "Здесь появятся опубликованные задачи"
          }
        >
          {tasks.length ? (
            <button className="button secondary" onClick={reset}>
              Сбросить фильтры
            </button>
          ) : (
            <p>Создайте и опубликуйте свою задачу или добавьте примеры ниже.</p>
          )}
        </EmptyState>
      )}
      <p className="catalog-note">
        Рейтинг показывает полноту подтверждённого описания. Даже задача с 0
        баллов доступна каждой команде.
      </p>
      <SeedDemo onDone={resource.reload} />
    </PlatformShell>
  );
}
