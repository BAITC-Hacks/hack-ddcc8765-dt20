import Link from "next/link";
import { PlatformShell } from "@/components/platform/shared";

export default function NotFound() {
  return (
    <PlatformShell>
      <section className="panel empty-state">
        <span className="eyebrow">404</span>
        <h1>Страница не найдена</h1>
        <p>Откройте каталог, чтобы найти задачу или продолжить работу.</p>
        <Link href="/catalog" className="button primary">
          Перейти в каталог
        </Link>
      </section>
    </PlatformShell>
  );
}
