"use client";

import { useEffect, useState } from "react";
import { INDUSTRIES, LEVELS, type Score } from "@/lib/contracts";
import type { PublishedTask } from "@/lib/catalog";
import { collaboration } from "@/lib/collaboration-client";
import { CatalogShell, Notice, TaskTile } from "@/components/catalog/catalog-ui";
import styles from "@/components/catalog/catalog.module.css";

type Level = Score["level"] | "";
export default function CatalogPage() {
  const [industry, setIndustry] = useState("");
  const [level, setLevel] = useState<Level>("");
  const [items, setItems] = useState<PublishedTask[]>([]);
  const [emptyCatalog, setEmptyCatalog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const reload = () => setRefresh((value) => value + 1);
    window.addEventListener("focus", reload);
    window.addEventListener("sana:tasks-changed", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("focus", reload);
      window.removeEventListener("sana:tasks-changed", reload);
      window.removeEventListener("storage", reload);
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const filters = { industry: industry || undefined, level: level || undefined };
    void (async () => {
      try {
        const result = await collaboration.catalog(filters);
        const full = result.length === 0 && (industry || level)
          ? await collaboration.catalog()
          : result;
        if (active) {
          setItems(result);
          setEmptyCatalog(full.length === 0);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Не удалось загрузить каталог.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [industry, level, refresh]);
  const reset = () => { setIndustry(""); setLevel(""); };
  return <CatalogShell>
    <p className={styles.eyebrow}>Задачи бизнеса для студенческих команд</p>
    <h1 className={styles.title}>Каталог задач</h1>
    <p className={styles.intro}>Выберите опубликованную задачу и предложите свой подход. Задачи доступны при любом рейтинге готовности.</p>
    <div className={styles.toolbar}>
      <div className={styles.field}>
        <label htmlFor="industry">Отрасль</label>
        <select id="industry" value={industry} onChange={(event) => setIndustry(event.target.value)}>
          <option value="">Все отрасли</option>
          {INDUSTRIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="level">Уровень готовности</label>
        <select id="level" value={level} onChange={(event) => setLevel(event.target.value as Level)}>
          <option value="">Все уровни</option>
          {(Object.keys(LEVELS) as Score["level"][]).map((item) =>
            <option key={item} value={item}>{LEVELS[item].label} · {LEVELS[item].range}</option>)}
        </select>
      </div>
      <button type="button" className={styles.button} onClick={reset} disabled={!industry && !level}>Сбросить фильтры</button>
    </div>
    {loading ? <Notice>Загружаем опубликованные задачи…</Notice>
      : error ? <Notice kind="error" retry={() => setRefresh((value) => value + 1)}>{error}</Notice>
      : items.length === 0 ? <Notice>
          {emptyCatalog ? "В каталоге пока нет опубликованных задач." : "По выбранным фильтрам задач нет."}
          {!emptyCatalog && <div><button type="button" className={styles.button} onClick={reset}>Сбросить фильтры</button></div>}
        </Notice>
      : <><p className={styles.intro} style={{ marginBottom: 17 }}>Найдено задач: {items.length}. Сначала показаны задачи с более высоким подтверждённым рейтингом.</p>
          <div className={styles.grid}>{items.map((task) => <TaskTile key={task.id} task={task} />)}</div></>}
  </CatalogShell>;
}
