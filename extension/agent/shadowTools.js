import { OPFSWorkspace } from "./opfsWorkspace.js";

function parseToolArguments(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      return { _raw: parsed };
    } catch {
      return { _raw: raw };
    }
  }
  return { _raw: raw };
}

function coerceInt(v, name) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const n = Number.parseInt(s, 10);
    if (Number.isFinite(n)) return n;
  }
  throw new Error(`Read: '${name}' must be an integer`);
}

function detectImageMime(path) {
  const lower = String(path ?? "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

function base64Encode(bytes) {
  const B = globalThis.Buffer;
  if (typeof B?.from === "function") return B.from(bytes).toString("base64");
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const btoaFn = globalThis.btoa;
  if (typeof btoaFn !== "function") throw new Error("Read: base64 encoding not available in this environment");
  return btoaFn(binary);
}

function splitFrontmatter(markdown) {
  const text = String(markdown ?? "");
  if (!text.startsWith("---")) return { frontmatter: null, body: text };
  const idx = text.indexOf("\n---");
  if (idx < 0) return { frontmatter: null, body: text };
  const end = text.indexOf("\n", idx + 4);
  if (end < 0) return { frontmatter: null, body: text };
  const fm = text.slice(3, idx).trim();
  const body = text.slice(end + 1);
  const obj = {};
  for (const line of fm.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    obj[m[1]] = m[2];
  }
  return { frontmatter: obj, body };
}

function escapeRegexLiteral(ch) {
  return /[\\.^$|?*+()[\]{}]/.test(ch) ? `\\${ch}` : ch;
}

function globToRegExp(pattern) {
  const p = String(pattern ?? "").replaceAll("\\", "/").trim().replace(/^\/+/, "");
  let re = "^";
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === "*") {
      if (p[i + 1] === "*") {
        if (p[i + 2] === "/") {
          re += "(?:.*\\/)?";
          i += 2;
          continue;
        }
        re += ".*";
        i += 1;
        continue;
      }
      re += "[^/]*";
      continue;
    }
    if (ch === "?") {
      re += "[^/]";
      continue;
    }
    re += escapeRegexLiteral(ch);
  }
  re += "$";
  return new RegExp(re);
}

function joinPath(a, b) {
  if (!a) return b;
  if (!b) return a;
  return `${String(a).replace(/\/+$/, "")}/${String(b).replace(/^\/+/, "")}`;
}

async function listFilesRecursive(workspace, rootDir, options) {
  const out = [];
  const maxFiles = options.maxFiles;
  async function walk(dir) {
    if (out.length >= maxFiles) return;
    const entries = await workspace.listDir(dir);
    for (const ent of entries) {
      if (out.length >= maxFiles) return;
      const full = dir ? `${dir}/${ent.name}` : ent.name;
      if (ent.type === "dir") await walk(full);
      else out.push(full);
    }
  }
  await walk(rootDir);
  return out;
}

function replaceN(text, oldStr, newStr, count) {
  if (count === 0) {
    const parts = text.split(oldStr);
    return { out: parts.join(newStr), replacements: parts.length - 1 };
  }
  let remaining = count;
  let replacements = 0;
  let out = "";
  let idx = 0;
  while (remaining > 0) {
    const j = text.indexOf(oldStr, idx);
    if (j < 0) break;
    out += text.slice(idx, j) + newStr;
    idx = j + oldStr.length;
    remaining -= 1;
    replacements += 1;
  }
  out += text.slice(idx);
  return { out, replacements };
}

async function listSkillNames(workspace) {
  const entries = await workspace.listDir(".agents/skills").catch(() => []);
  return entries.filter((e) => e.type === "dir").map((e) => e.name).sort((a, b) => a.localeCompare(b));
}

async function listSkills(workspace) {
  const names = await listSkillNames(workspace);
  const skills = [];
  for (const name of names) {
    const skillPath = `.agents/skills/${name}/SKILL.md`;
    const bytes = await workspace.readFile(skillPath).catch(() => null);
    const fileText = bytes ? new TextDecoder().decode(bytes) : "";
    const { frontmatter } = splitFrontmatter(fileText);
    const desc = typeof frontmatter?.description === "string" ? frontmatter.description : "";
    skills.push({ name, description: desc, path: skillPath });
  }
  return skills;
}

export async function openShadowWorkspace() {
  return OPFSWorkspace.open();
}

export async function ensureHelloWorldSkill(workspace) {
  const path = ".agents/skills/hello-world/SKILL.md";
  const exists = await workspace.stat(path).catch(() => null);
  if (exists?.type === "file") return { ok: true, path, created: false };

  const content = [
    "---",
    "name: hello-world",
    "description: Use when validating Skill loading and shadow workspace tools in WebMCP Sidecar.",
    "---",
    "",
    "# Hello World Skill",
    "",
    "这是一个用于验证 `Skill` Meta Tool 是否可用的最小示例。",
    "",
    "## Rules",
    "- 当你需要确认 Skill 是否加载成功：请先复述你看到的 Skill 标题与关键规则。",
    "- 不要臆造：如果 Skill 内容里没写，就明确说不知道。",
    "",
    "## Checklist",
    "- [ ] 能通过 `Skill` tool 加载本文件",
    "- [ ] 能通过 `ListDir/Read/Write/Edit/Glob/Grep` 浏览与修改 shadow workspace",
    "",
  ].join("\n");

  await workspace.writeFile(path, new TextEncoder().encode(content));
  return { ok: true, path, created: true };
}

export function createShadowWorkspaceTools(options) {
  const workspace = options?.workspace;
  if (!workspace) throw new Error("createShadowWorkspaceTools: workspace required");

  const tools = [];

  tools.push({
    name: "ListSkills",
    description: "List available skills from the shadow workspace (.agents/skills).",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const skills = await listSkills(workspace);
      return { count: skills.length, skills };
    },
  });

  tools.push({
    name: "Mkdir",
    description: "Create a directory (and parents) in the shadow workspace.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative directory path." },
      },
      required: ["path"],
    },
    run: async (toolInput) => {
      const pathRaw = toolInput?.path;
      const path = typeof pathRaw === "string" ? pathRaw.trim() : "";
      if (!path) throw new Error("Mkdir: 'path' must be a non-empty string");
      await workspace.mkdir(path);
      return { ok: true, path };
    },
  });

  tools.push({
    name: "Delete",
    description: "Delete a file or directory in the shadow workspace (supports recursive).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative path to delete." },
        recursive: { type: "boolean", description: "Allow recursive directory delete (default: false)." },
      },
      required: ["path"],
    },
    run: async (toolInput) => {
      const pathRaw = toolInput?.path;
      const path = typeof pathRaw === "string" ? pathRaw.trim() : "";
      if (!path) throw new Error("Delete: 'path' must be a non-empty string");
      const recursive = Boolean(toolInput?.recursive ?? false);
      const st = await workspace.stat(path);
      if (!st) throw new Error(`Delete: not found: ${path}`);
      if (st.type === "file") {
        await workspace.deleteFile(path);
        return { ok: true, path, type: "file" };
      }
      await workspace.deletePath(path, { recursive });
      return { ok: true, path, type: "dir", recursive };
    },
  });

  tools.push({
    name: "ListDir",
    description: "List a directory in the shadow workspace.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative directory path (default: empty root)." },
      },
    },
    run: async (input) => {
      const path = typeof input?.path === "string" ? input.path : "";
      const entries = await workspace.listDir(path);
      return { path, entries };
    },
  });

  tools.push({
    name: "Read",
    description: "Read a file from the shadow workspace.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Workspace-relative path." },
        filePath: { type: "string", description: "Alias of file_path." },
        offset: { type: ["integer", "string"], description: "1-based line offset (optional)." },
        limit: { type: ["integer", "string"], description: "Max lines to return (optional)." },
      },
      required: [],
    },
    run: async (toolInput) => {
      const filePathRaw = toolInput?.file_path ?? toolInput?.filePath;
      const filePath = typeof filePathRaw === "string" ? filePathRaw.trim() : "";
      if (!filePath) throw new Error("Read: 'file_path' must be a non-empty string");

      let offset = coerceInt(toolInput?.offset, "offset");
      const limit = coerceInt(toolInput?.limit, "limit");
      if (offset === 0) offset = 1;
      if (offset != null && offset < 1) throw new Error("Read: 'offset' must be a positive integer (1-based)");
      if (limit != null && limit < 0) throw new Error("Read: 'limit' must be a non-negative integer");

      let bytes = await workspace.readFile(filePath);
      const mime = detectImageMime(filePath);
      if (mime) {
        const image = base64Encode(bytes);
        return { file_path: filePath, image, mime_type: mime, file_size: bytes.byteLength };
      }

      const text = new TextDecoder().decode(bytes);
      const lines = text.split(/\r?\n/);
      if (lines.length && lines.at(-1) === "") lines.pop();

      if (offset != null || limit != null) {
        const start = offset != null ? offset - 1 : 0;
        const end = limit != null ? start + limit : lines.length;
        const slice = lines.slice(start, end);
        const numbered = slice.map((line, i) => `${start + i + 1}: ${line}`).join("\n");
        return { file_path: filePath, content: numbered, total_lines: lines.length, lines_returned: slice.length };
      }

      return { file_path: filePath, content: text };
    },
  });

  tools.push({
    name: "Write",
    description: "Create or overwrite a file in the shadow workspace.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Workspace-relative path." },
        filePath: { type: "string", description: "Alias of file_path." },
        content: { type: "string", description: "UTF-8 text content." },
        overwrite: { type: "boolean", description: "Allow overwriting an existing file (default: false)." },
      },
      required: ["content"],
    },
    run: async (toolInput) => {
      const filePathRaw = toolInput?.file_path ?? toolInput?.filePath;
      const filePath = typeof filePathRaw === "string" ? filePathRaw.trim() : "";
      if (!filePath) throw new Error("Write: 'file_path' must be a non-empty string");

      const content = toolInput?.content;
      if (typeof content !== "string") throw new Error("Write: 'content' must be a string");

      const overwrite = Boolean(toolInput?.overwrite ?? false);
      const existing = await workspace.stat(filePath);
      if (existing && !overwrite) throw new Error(`Write: file exists: ${filePath}`);

      const bytes = new TextEncoder().encode(content);
      await workspace.writeFile(filePath, bytes);
      return { message: `Wrote ${bytes.byteLength} bytes`, file_path: filePath, bytes_written: bytes.byteLength };
    },
  });

  tools.push({
    name: "Edit",
    description: "Apply a precise edit (string replace) to a file in the shadow workspace.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Workspace-relative path." },
        filePath: { type: "string", description: "Alias of file_path." },
        old: { type: "string", description: "Exact text to replace." },
        old_string: { type: "string", description: "Alias of old." },
        oldString: { type: "string", description: "Alias of old." },
        new: { type: "string", description: "Replacement text." },
        new_string: { type: "string", description: "Alias of new." },
        newString: { type: "string", description: "Alias of new." },
        replace_all: { type: "boolean", description: "Replace all occurrences." },
        replaceAll: { type: "boolean", description: "Alias of replace_all." },
        count: { type: "integer", description: "Max replacements (0 = replace all). Default: 1." },
        before: { type: "string", description: "Optional anchor that must occur before `old`." },
        after: { type: "string", description: "Optional anchor that must occur after `old`." },
      },
      required: ["old", "new"],
    },
    run: async (toolInput) => {
      const filePathRaw = toolInput?.file_path ?? toolInput?.filePath;
      const filePath = typeof filePathRaw === "string" ? filePathRaw.trim() : "";
      if (!filePath) throw new Error("Edit: 'file_path' must be a non-empty string");

      const old = toolInput?.old ?? toolInput?.old_string ?? toolInput?.oldString;
      const newStr = toolInput?.new ?? toolInput?.new_string ?? toolInput?.newString;
      if (typeof old !== "string" || old === "") throw new Error("Edit: 'old' must be a non-empty string");
      if (typeof newStr !== "string") throw new Error("Edit: 'new' must be a string");

      const replaceAll = Boolean(toolInput?.replace_all ?? toolInput?.replaceAll ?? false);
      const countRaw = toolInput?.count;
      const count = replaceAll ? 0 : typeof countRaw === "number" && Number.isFinite(countRaw) ? Math.trunc(countRaw) : 1;
      if (!Number.isInteger(count) || count < 0) throw new Error("Edit: 'count' must be a non-negative integer");

      const before = toolInput?.before;
      const after = toolInput?.after;
      if (before != null && typeof before !== "string") throw new Error("Edit: 'before' must be a string");
      if (after != null && typeof after !== "string") throw new Error("Edit: 'after' must be a string");

      const text = new TextDecoder().decode(await workspace.readFile(filePath));
      const idxOld = text.indexOf(old);
      if (idxOld < 0) throw new Error("Edit: 'old' text not found in file");

      if (typeof before === "string") {
        const idxBefore = text.indexOf(before);
        if (idxBefore < 0) throw new Error("Edit: 'before' anchor not found in file");
        if (idxBefore >= idxOld) throw new Error("Edit: 'before' must appear before 'old'");
      }
      if (typeof after === "string") {
        const idxAfter = text.indexOf(after);
        if (idxAfter < 0) throw new Error("Edit: 'after' anchor not found in file");
        if (idxOld >= idxAfter) throw new Error("Edit: 'after' must appear after 'old'");
      }

      const { out, replacements } = replaceN(text, old, newStr, count);
      await workspace.writeFile(filePath, new TextEncoder().encode(out));
      return { message: "Edit applied", file_path: filePath, replacements };
    },
  });

  tools.push({
    name: "Glob",
    description: "Find files by glob pattern (workspace-relative).",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern (subset: *, ?, **)." },
        root: { type: "string", description: "Workspace-relative root dir (optional)." },
        path: { type: "string", description: "Alias of root." },
        max_files: { type: "integer", description: "Hard cap on scanned file count (optional)." },
      },
      required: ["pattern"],
    },
    run: async (toolInput) => {
      const patternRaw = toolInput?.pattern;
      const pattern = typeof patternRaw === "string" ? patternRaw.trim() : "";
      if (!pattern) throw new Error("Glob: 'pattern' must be a non-empty string");

      const rootRaw = toolInput?.root ?? toolInput?.path;
      const root = typeof rootRaw === "string" ? rootRaw.trim().replace(/^\/+/, "") : "";
      const maxFilesIn = toolInput?.max_files;
      const maxFiles = typeof maxFilesIn === "number" && Number.isFinite(maxFilesIn) && maxFilesIn > 0 ? Math.trunc(maxFilesIn) : 20_000;

      const rx = globToRegExp(pattern);
      const files = await listFilesRecursive(workspace, root, { maxFiles });
      const matches = files
        .map((p) => (root ? p.slice(root.length + 1) : p))
        .filter((rel) => rx.test(rel))
        .map((rel) => joinPath(root, rel))
        .sort((a, b) => a.localeCompare(b));

      return { root, matches, search_path: root, pattern, count: matches.length };
    },
  });

  tools.push({
    name: "Grep",
    description: "Search file contents with a regex over the shadow workspace.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Regex pattern." },
        file_glob: { type: "string", description: "Glob for files to search (default: **/*)." },
        root: { type: "string", description: "Workspace-relative root dir (optional)." },
        path: { type: "string", description: "Alias of root." },
        case_sensitive: { type: "boolean", description: "Case sensitive search (default: true)." },
        mode: { type: "string", description: "content | files_with_matches" },
        before_context: { type: "integer", description: "Lines of leading context (default: 0)." },
        after_context: { type: "integer", description: "Lines of trailing context (default: 0)." },
      },
      required: ["query"],
    },
    run: async (toolInput) => {
      const queryRaw = toolInput?.query;
      const query = typeof queryRaw === "string" ? queryRaw : "";
      if (!query) throw new Error("Grep: 'query' must be a non-empty string");

      const fileGlobRaw = toolInput?.file_glob ?? "**/*";
      const fileGlob = typeof fileGlobRaw === "string" ? fileGlobRaw.trim() : "";
      if (!fileGlob) throw new Error("Grep: 'file_glob' must be a non-empty string");

      const rootRaw = toolInput?.root ?? toolInput?.path;
      const root = typeof rootRaw === "string" ? rootRaw.trim().replace(/^\/+/, "") : "";

      const caseSensitive = toolInput?.case_sensitive !== false;
      const flags = caseSensitive ? "g" : "gi";
      let rx;
      try {
        rx = new RegExp(query, flags);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        throw new Error(`Grep: invalid regex: ${err.message}`);
      }

      const modeRaw = toolInput?.mode;
      const mode = typeof modeRaw === "string" && modeRaw.trim() ? modeRaw : "content";
      if (mode !== "content" && mode !== "files_with_matches") throw new Error("Grep: 'mode' must be 'content' or 'files_with_matches'");

      const beforeN = typeof toolInput?.before_context === "number" ? Math.trunc(toolInput.before_context) : 0;
      const afterN = typeof toolInput?.after_context === "number" ? Math.trunc(toolInput.after_context) : 0;
      if (beforeN < 0) throw new Error("Grep: 'before_context' must be a non-negative integer");
      if (afterN < 0) throw new Error("Grep: 'after_context' must be a non-negative integer");

      const fileRx = globToRegExp(fileGlob);
      const filesAll = await listFilesRecursive(workspace, root, { maxFiles: 20_000 });
      const files = filesAll
        .map((p) => (root ? p.slice(root.length + 1) : p))
        .filter((rel) => fileRx.test(rel))
        .map((rel) => (root ? `${root}/${rel}` : rel))
        .sort((a, b) => a.localeCompare(b));

      const matches = [];
      const filesWithMatches = new Set();

      for (const p of files) {
        const bytes = await workspace.readFile(p).catch(() => null);
        if (!bytes) continue;
        const text = new TextDecoder().decode(bytes);
        const lines = text.split(/\r?\n/);
        if (lines.length && lines.at(-1) === "") lines.pop();

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          rx.lastIndex = 0;
          if (!rx.test(line)) continue;
          filesWithMatches.add(p);
          if (mode === "files_with_matches") continue;

          const lineNo = i + 1;
          const before = beforeN ? lines.slice(Math.max(0, i - beforeN), i) : null;
          const after = afterN ? lines.slice(i + 1, Math.min(lines.length, i + 1 + afterN)) : null;
          matches.push({ file_path: p, line: lineNo, text: line, before_context: before, after_context: after });
          if (matches.length >= 5000) return { root, query, matches, truncated: true };
        }
      }

      if (mode === "files_with_matches") {
        const files2 = Array.from(filesWithMatches).sort((a, b) => a.localeCompare(b));
        return { root, query, files: files2, count: files2.length };
      }

      return { root, query, matches, truncated: false, total_matches: matches.length };
    },
  });

  tools.push({
    name: "Skill",
    description: "Load a Skill by name from the shadow workspace (.agents/skills/<name>/SKILL.md).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Skill name." },
      },
      required: ["name"],
    },
    run: async (toolInput) => {
      const nameRaw = toolInput?.name;
      const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
      if (!name) throw new Error("Skill: 'name' must be a non-empty string");

      const available = await listSkills(workspace);
      if (!available.some((s) => s.name === name)) {
        const hint = available.length ? available.map((s) => s.name).join(", ") : "none";
        throw new Error(`Skill: not found: ${name}. Available skills: ${hint}`);
      }

      const skillPath = `.agents/skills/${name}/SKILL.md`;
      const bytes = await workspace.readFile(skillPath);
      const fileText = new TextDecoder().decode(bytes);
      const { frontmatter, body } = splitFrontmatter(fileText);
      const desc = typeof frontmatter?.description === "string" ? frontmatter.description : "";
      const out = [`## Skill: ${name}`, "", body.trimStart()].join("\n").trim();

      return {
        title: `Loaded skill: ${name}`,
        output: out,
        metadata: { name, dir: "opfs", file_path: skillPath },
        name,
        description: desc,
        summary: null,
        checklist: [],
        path: `opfs:${skillPath}`,
      };
    },
  });

  return tools;
}
