// 백업 폴더 읽기·쓰기. 실제로는 브라우저의 폴더 접근(File System Access API, 크롬 계열만)을 쓰고,
// 테스트는 메모리 폴더를 쓴다. 경로는 "messages/C123/2026-10.json"처럼 /로 나눈다.

export type Folder = {
  readBlob(path: string): Promise<Blob | null>;
  read(path: string): Promise<string | null>;
  write(path: string, data: string | Blob): Promise<void>;
  exists(path: string): Promise<boolean>;
};

export async function readJson<T>(folder: Folder, path: string): Promise<T | null> {
  const text = await folder.read(path);
  return text === null ? null : (JSON.parse(text) as T);
}

export const writeJson = (folder: Folder, path: string, value: unknown) => folder.write(path, JSON.stringify(value));

// 파일 이름에 쓸 수 없는 글자(맥·윈도우)를 _로 바꾼다.
export const safeName = (name: string) => name.replace(/[/\\:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120) || "file";

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite"; id?: string }) => Promise<FileSystemDirectoryHandle>;
  }
}

export const canUseFolders = () => typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

export async function pickFolder() {
  return window.showDirectoryPicker!({ mode: "readwrite", id: "gh-slack-backup" });
}

/** 새로고침 뒤에는 폴더 권한이 풀려 있을 수 있다. 버튼 클릭 안에서 불러야 한다. */
export async function ensurePermission(handle: FileSystemDirectoryHandle) {
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (d: { mode: string }) => Promise<PermissionState>;
    requestPermission?: (d: { mode: string }) => Promise<PermissionState>;
  };
  if ((await h.queryPermission?.({ mode: "readwrite" })) === "granted") return true;
  return (await h.requestPermission?.({ mode: "readwrite" })) === "granted";
}

export function fsFolder(root: FileSystemDirectoryHandle): Folder {
  async function dir(parts: string[], create: boolean) {
    let current = root;
    for (const part of parts) current = await current.getDirectoryHandle(part, { create });
    return current;
  }
  async function file(path: string, create: boolean) {
    const parts = path.split("/");
    const name = parts.pop()!;
    return (await dir(parts, create)).getFileHandle(name, { create });
  }
  const readBlob = async (path: string) => {
    try {
      return await (await file(path, false)).getFile();
    } catch {
      return null;
    }
  };
  return {
    readBlob,
    read: async (path) => (await readBlob(path))?.text() ?? null,
    exists: async (path) => (await readBlob(path)) !== null,
    async write(path, data) {
      const writable = await (await file(path, true)).createWritable();
      await writable.write(data);
      await writable.close();
    },
  };
}

export function memoryFolder(files = new Map<string, string | Blob>()): Folder & { files: Map<string, string | Blob> } {
  const readBlob = async (path: string) => {
    const value = files.get(path);
    return value === undefined ? null : typeof value === "string" ? new Blob([value]) : value;
  };
  return {
    files,
    readBlob,
    read: async (path) => {
      const value = files.get(path);
      return value === undefined ? null : typeof value === "string" ? value : value.text();
    },
    exists: async (path) => files.has(path),
    write: async (path, data) => void files.set(path, data),
  };
}
