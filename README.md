# Hexo Publisher

An [Obsidian](https://obsidian.md) plugin that creates Hexo posts from **front-matter presets**, validates them, and publishes your site to GitHub Pages — without leaving the editor.

- 🗂 **Presets** — pick a preset, type a title, get a post with correctly ordered front matter. No more hand-writing YAML.
- ✅ **Validate** — run your own front-matter check before publishing.
- 🚀 **Publish** — runs your site's `npm run publish` (clean → generate → deploy) and reports the result.
- 🖥 **Desktop only** — it spawns your local build. No network calls, no telemetry, no data leaves your machine.

## Requirements

- Obsidian 1.4+ (desktop)
- A local [Hexo](https://hexo.io/) site with dependencies installed (`node_modules/` present)
- `npm` available on `PATH`
- Optional: an `npm run check` script in your site, if you want the *Validate* command

## Install

1. Clone or download this repository.
2. Copy the folder into `<your-vault>/.obsidian/plugins/hexo-publisher/` — it must contain `main.js`, `manifest.json`, `styles.css`.
3. Obsidian → **Settings → Community plugins** → turn off Restricted mode → enable **Hexo Publisher**.

### Recommended vault layout

Open your Hexo `source/` folder as the Obsidian vault. Then:

- a post lives at `_posts/xxx.md` and images at `img/posts/`
- with **Files & Links → New link format: `Absolute path in vault`** and **Use `[[Wikilinks]]`: off**, pasting an image produces `![](/img/posts/xxx.png)` — exactly the path Hexo serves

Hexo ignores dot-folders, so `.obsidian/` never ends up in your published site.

## Configure

Settings live in `<plugin-folder>/data.json`. This file is **runtime data and is not part of this repository** — you create it yourself (defaults apply if it is missing):

```json
{
  "siteRoot": "D:\\path\\to\\your-hexo-site",
  "siteUrl": "https://example.com",
  "presets": {
    "Normal post": { "mathjax": false, "tags": [], "categories": [] },
    "Post with math": { "mathjax": true, "tags": [], "categories": [] },
    "Encrypted": { "mathjax": false, "password": "changeme", "tags": [], "categories": [] },
    "Pinned": { "mathjax": false, "sticky": 1, "tags": [], "categories": [] }
  }
}
```

After editing, reload the plugin (**Settings → Community plugins → toggle it off and on**).

Every key of the chosen preset is written into the new post's front matter. Useful fields:

| Field | Purpose |
| --- | --- |
| `mathjax` / `katex` | enable math rendering for the post |
| `cover` | list-page cover image, e.g. `/img/posts/xxx.png` |
| `top_img` | post top image (`transparent` = none) |
| `password` | encrypt the post (requires a blog-encrypt style plugin) |
| `sticky` | pin the post |
| `toc` / `comments` / `copyright` | per-post toggles |

Field order is fixed (`title`, `date`, `cover`, `description`, `mathjax`, `password`, `updated`, `top_img`, `sticky`, `hide`, `comments`, `abbrlink`, `type`, then `tags`, `categories`, then any other field) and lists are indented with 2 spaces — tab indentation is invalid YAML and breaks Obsidian, GitHub previews and prettier.

## Commands

| Command | Ribbon icon | Suggested hotkey |
| --- | --- | --- |
| Hexo: New post (choose a preset) | file-plus | `Ctrl/Cmd+Shift+N` |
| Hexo: Validate front matter | — | — |
| Hexo: Publish to GitHub Pages | upload | `Ctrl/Cmd+Shift+P` |

The plugin intentionally does **not** ship default hotkeys; bind them in **Settings → Hotkeys** (search for "Hexo").

## How publishing works

The plugin runs this in `siteRoot`:

```
npm run publish
```

so *you* define what publishing means. A typical setup, with a validation gate:

```json
"scripts": {
  "check": "node tools/frontmatter-check.mjs --check",
  "publish": "npm run check && hexo clean && hexo generate && hexo deploy"
}
```

> ⚠️ `npm run deploy` on its own does **not** regenerate `public/` — it will happily deploy a stale build. Always chain clean → generate → deploy.

Progress appears in the status bar; a notice reports the outcome. **On failure, a log window opens with the full output** — on success nothing pops up.

## Notes

- Windows: commands go through `cmd.exe /c npm.cmd …` with `windowsHide: true`, so no console window appears.
- A publish runs a full rebuild; expect a few seconds on a small site.
- Only one task runs at a time; a second click is rejected while a publish is in flight.

## License

MIT — see [LICENSE](LICENSE).

---

## 中文说明

在 Obsidian 里用**样式预设**新建 Hexo 文章，并一键发布到 GitHub Pages。

- 安装：把 `main.js` / `manifest.json` / `styles.css` 放进 `<仓库>/.obsidian/plugins/hexo-publisher/`，然后在 设置 → 第三方插件 里启用。
- 建议把你的 Hexo `source/` 目录当作 Obsidian 仓库，并把 设置 → 文件与链接 里的"新链接格式"设为**绝对路径**、"使用 [[Wikilinks]]"关闭——这样粘贴图片写出的 `/img/posts/xxx.png` 正好是 Hexo 需要的路径。
- 站点路径与样式预设写在插件目录的 `data.json` 里（该文件属于你的运行时数据，不在本仓库内）。
- 发布时执行你站点里的 `npm run publish`，脚本内容由你决定；记得把 `clean → generate → deploy` 串起来，单独 `hexo deploy` 会把过期的 `public/` 发上去。
