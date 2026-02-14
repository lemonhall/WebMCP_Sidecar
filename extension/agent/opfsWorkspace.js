function normalizePath(input) {
  const raw = String(input ?? "").replaceAll("\\", "/").trim();
  const stripped = raw.replace(/^\/+/, "");
  if (!stripped) return "";
  const parts = stripped.split("/").filter(Boolean);
  for (const p of parts) {
    if (p === "." || p === "..") throw new Error(`OPFSWorkspace: invalid path segment: ${p}`);
  }
  return parts.join("/");
}

function splitPath(p) {
  const norm = normalizePath(p);
  if (!norm) return { dir: "", base: "" };
  const idx = norm.lastIndexOf("/");
  if (idx < 0) return { dir: "", base: norm };
  return { dir: norm.slice(0, idx), base: norm.slice(idx + 1) };
}

async function getDirHandle(root, dirPath, create) {
  const norm = normalizePath(dirPath);
  let cur = root;
  if (!norm) return cur;
  for (const part of norm.split("/")) {
    cur = await cur.getDirectoryHandle(part, { create: Boolean(create) });
  }
  return cur;
}

export class OPFSWorkspace {
  #root;

  static async open() {
    const getDirectory = globalThis?.navigator?.storage?.getDirectory;
    if (typeof getDirectory !== "function") {
      throw new Error("OPFSWorkspace: navigator.storage.getDirectory() not available (File System Access API / OPFS missing)");
    }
    const root = await globalThis.navigator.storage.getDirectory();
    return new OPFSWorkspace(root);
  }

  constructor(rootHandle) {
    this.#root = rootHandle;
  }

  async readFile(path) {
    const filePath = normalizePath(path);
    if (!filePath) throw new Error("OPFSWorkspace.readFile: path required");
    const { dir, base } = splitPath(filePath);
    const dh = await getDirHandle(this.#root, dir, false);
    const fh = await dh.getFileHandle(base, { create: false });
    const file = await fh.getFile();
    const buf = await file.arrayBuffer();
    return new Uint8Array(buf);
  }

  async writeFile(path, data) {
    const filePath = normalizePath(path);
    if (!filePath) throw new Error("OPFSWorkspace.writeFile: path required");
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data ?? []);
    const { dir, base } = splitPath(filePath);
    const dh = await getDirHandle(this.#root, dir, true);
    const fh = await dh.getFileHandle(base, { create: true });
    const writable = await fh.createWritable();
    await writable.write(bytes);
    await writable.close();
  }

  async mkdir(path) {
    const dirPath = normalizePath(path);
    // mkdir('') is a no-op (root)
    await getDirHandle(this.#root, dirPath, true);
    return { path: dirPath };
  }

  async deleteFile(path) {
    const filePath = normalizePath(path);
    if (!filePath) throw new Error("OPFSWorkspace.deleteFile: path required");
    const { dir, base } = splitPath(filePath);
    const dh = await getDirHandle(this.#root, dir, false);
    await dh.removeEntry(base, { recursive: false });
  }

  async deletePath(path, options = {}) {
    const p = normalizePath(path);
    if (!p) throw new Error("OPFSWorkspace.deletePath: path required");
    const recursive = Boolean(options.recursive ?? false);
    const { dir, base } = splitPath(p);
    const dh = await getDirHandle(this.#root, dir, false);
    await dh.removeEntry(base, { recursive });
    return { path: p, recursive };
  }

  async stat(path) {
    const p = normalizePath(path);
    if (!p) return { type: "dir" };
    const { dir, base } = splitPath(p);
    const dh = await getDirHandle(this.#root, dir, false).catch(() => null);
    if (!dh) return null;

    // Try file first.
    try {
      const fh = await dh.getFileHandle(base, { create: false });
      const file = await fh.getFile();
      return { type: "file", size: file.size };
    } catch (_) {
      // ignore
    }

    // Then dir.
    try {
      await dh.getDirectoryHandle(base, { create: false });
      return { type: "dir" };
    } catch (_) {
      return null;
    }
  }

  async listDir(path = "") {
    const p = normalizePath(path);
    const dh = await getDirHandle(this.#root, p, false);
    const entries = [];
    // eslint-disable-next-line no-restricted-syntax
    for await (const [name, handle] of dh.entries()) {
      if (!name) continue;
      const kind = handle?.kind;
      const type = kind === "directory" ? "dir" : "file";
      entries.push({ name, type });
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
  }
}
