import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppData } from "../src/domain/types";
import { APP_DATA_VERSION, DEFAULT_SETTINGS } from "../src/domain/types";
import { AppDataStore } from "./storage";

const directories: string[] = [];

function snapshot(
  notificationsEnabled: boolean,
  theme: AppData["settings"]["theme"] = "system",
): AppData {
  return {
    version: APP_DATA_VERSION,
    events: [],
    applications: [],
    applicationSheet: null,
    importHistory: [],
    aiUsage: [],
    settings: {
      ...DEFAULT_SETTINGS,
      notificationsEnabled,
      theme,
    },
  };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

describe("AppDataStore", () => {
  it("repeatedly saves and retains the preceding snapshot as the backup on Windows", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "interviewbar-storage-test-"));
    directories.push(directory);
    const store = new AppDataStore(directory);
    const first = snapshot(true);
    const second = snapshot(false);
    const third = snapshot(false, "dark");

    await store.save(first);
    await store.save(second);
    await store.save(third);

    expect(JSON.parse(await readFile(store.file, "utf8"))).toEqual(third);
    expect(JSON.parse(await readFile(store.backup, "utf8"))).toEqual(second);
  });
});
