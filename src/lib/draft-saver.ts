import type { Task } from "./contracts";
import { draftInput } from "./gateway";

export const draftFingerprint = (task: Task) =>
  JSON.stringify(draftInput(task));

/** Serializes this editor's writes while retaining the version actually saved. */
export class DraftSaver {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  constructor(
    public saved: Task,
    private persist: (task: Task) => Promise<Task>,
  ) {}

  isSaved(task: Task) {
    return (
      this.pending === 0 &&
      draftFingerprint(task) === draftFingerprint(this.saved)
    );
  }

  async settled() {
    await this.tail.catch(() => undefined);
  }

  save(snapshot: Task): Promise<Task> {
    this.pending++;
    const job = this.tail
      .catch(() => undefined)
      .then(async () => {
        const saved = await this.persist({
          ...snapshot,
          revision: this.saved.revision,
          updatedAt: this.saved.updatedAt,
        });
        this.saved = saved;
        return saved;
      })
      .finally(() => {
        this.pending--;
      });
    this.tail = job;
    return job;
  }
}
