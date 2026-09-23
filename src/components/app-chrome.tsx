"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import type { MouseEvent } from "react";
import { dataMode } from "@/lib/gateway";

type NavigationProps = {
  onNavigate?: (href: string) => Promise<void>;
  disabled?: boolean;
};

export function SiteHeader({ onNavigate, disabled = false }: NavigationProps) {
  const path = usePathname();
  const section =
    path === "/tasks/new" || path.endsWith("/edit")
      ? "/business"
      : path.startsWith("/tasks/")
        ? "/catalog"
        : path;
  function follow(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (disabled) {
      event.preventDefault();
      return;
    }
    // Keep normal new-tab behavior. In-page editor navigation waits for saving.
    if (
      onNavigate &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      event.button === 0
    ) {
      event.preventDefault();
      void onNavigate(href);
    }
  }
  const navigation = (href: string) => ({
    onClick: (event: MouseEvent<HTMLAnchorElement>) => follow(event, href),
    "aria-disabled": disabled || undefined,
    tabIndex: disabled ? -1 : undefined,
  });
  return (
    <>
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <header className="app-header platform-header">
        <Link
          className="brand"
          href="/catalog"
          aria-label="SanaBrief — каталог"
          {...navigation("/catalog")}
        >
          <img src="/icon.svg" width="36" height="36" alt="" />
          <span>
            Sana<span className="brand-light">Brief</span>
          </span>
        </Link>
        <nav className="platform-nav" aria-label="Основная навигация">
          {[
            ["/catalog", "Каталог задач"],
            ["/student", "Кабинет команды"],
            ["/business", "Кабинет бизнеса"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={section === href ? "page" : undefined}
              {...navigation(href)}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <span className={`mode-pill ${dataMode}`}>
            <span />
            {dataMode === "local" ? "Локальное демо" : "Общее демо"}
          </span>
          <Link
            className="button primary compact"
            href="/tasks/new"
            {...navigation("/tasks/new")}
          >
            <Plus size={16} />
            Создать задачу
          </Link>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="platform-footer">
      <span className="footer-brand">SanaBrief · AI Sana</span>
      <span>
        {dataMode === "local"
          ? "Данные сохраняются в этом браузере. Для работы с разных устройств подключите общий сервер."
          : "Общий демостенд: роли переключаются свободно, без личных учётных записей."}
      </span>
    </footer>
  );
}
