"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CircleHelp } from "lucide-react";
import { HelpContent } from "./help-content";

type Position = { x: number; y: number };
const POSITION_KEY = "sana-brief.help-position.v1";
const SIZE = 52;
function clamp(position: Position): Position {
  return {
    x: Math.max(8, Math.min(position.x, window.innerWidth - SIZE - 8)),
    y: Math.max(8, Math.min(position.y, window.innerHeight - SIZE - 8)),
  };
}
const initialPosition = () =>
  clamp({ x: 24, y: window.innerHeight - SIZE - 24 });
function remember(position: Position) {
  try {
    window.localStorage.setItem(POSITION_KEY, JSON.stringify(position));
  } catch {
    /* Position persistence is optional. */
  }
}

export function FloatingHelp() {
  const [position, setPosition] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    pointerId: number;
    start: Position;
    origin: Position;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    let restored = initialPosition();
    try {
      const value = JSON.parse(
        window.localStorage.getItem(POSITION_KEY) ?? "null",
      );
      if (value && Number.isFinite(value.x) && Number.isFinite(value.y))
        restored = clamp(value);
    } catch {
      /* Use the default position when storage is unavailable. */
    }
    setPosition(restored);
    const resize = () =>
      setPosition((previous) => {
        const next = clamp(previous ?? initialPosition());
        remember(next);
        return next;
      });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  function reset() {
    const next = initialPosition();
    setPosition(next);
    remember(next);
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    suppressClick.current = current.moved;
    if (position) remember(position);
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          className={`floating-help${dragging ? " dragging" : ""}`}
          style={
            position
              ? { left: position.x, top: position.y }
              : { left: 24, bottom: 24 }
          }
          aria-label="Помощь SanaBrief"
          aria-describedby="help-move-instructions"
          title="Помощь SanaBrief — нажмите или перетащите"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            suppressClick.current = false;
            const rect = event.currentTarget.getBoundingClientRect();
            drag.current = {
              pointerId: event.pointerId,
              start: { x: event.clientX, y: event.clientY },
              origin: { x: rect.left, y: rect.top },
              moved: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const current = drag.current;
            if (!current || current.pointerId !== event.pointerId) return;
            const dx = event.clientX - current.start.x;
            const dy = event.clientY - current.start.y;
            if (!current.moved && Math.hypot(dx, dy) < 6) return;
            current.moved = true;
            setDragging(true);
            setPosition(
              clamp({ x: current.origin.x + dx, y: current.origin.y + dy }),
            );
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
          onClick={(event) => {
            if (suppressClick.current && event.detail !== 0) {
              event.preventDefault();
              suppressClick.current = false;
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Home") {
              event.preventDefault();
              reset();
              return;
            }
            const offsets: Record<string, Position> = {
              ArrowLeft: { x: -1, y: 0 },
              ArrowRight: { x: 1, y: 0 },
              ArrowUp: { x: 0, y: -1 },
              ArrowDown: { x: 0, y: 1 },
            };
            const offset = offsets[event.key];
            if (!offset) return;
            event.preventDefault();
            const current = position ?? initialPosition();
            const step = event.shiftKey ? 40 : 10;
            const next = clamp({
              x: current.x + offset.x * step,
              y: current.y + offset.y * step,
            });
            setPosition(next);
            remember(next);
          }}
        >
          <CircleHelp size={25} aria-hidden />
        </button>
      </Dialog.Trigger>
      <span className="sr-only" id="help-move-instructions">
        Нажмите, чтобы открыть помощь. Для перемещения перетащите кнопку или
        используйте стрелки клавиатуры. Home возвращает кнопку в левый нижний
        угол.
      </span>
      <HelpContent onResetPosition={reset} />
    </Dialog.Root>
  );
}
