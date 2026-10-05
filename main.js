'use strict';
/**
 * Hexo Publisher —— 在 Obsidian 里用样式预设新建 Hexo 文章，并一键校验/发布到 GitHub Pages。
 *
 * ⚠️ 这个文件必须是**单文件、自包含**的：
 *    Obsidian 的插件加载器把 main.js 交给 window.eval 执行，只提供一个白名单 require
 *    （'obsidian' + Electron 内置模块）。写 `require('./lib.js')` 这类相对依赖会直接抛错，
 *    表现就是设置里「无法开启插件」。
 *
 * 站点路径和样式预设都在同目录的 data.json 里改，不需要动这个文件。
 */
const obsidian = require('obsidian');
const { Plugin, Notice, SuggestModal, Modal } = obsidian;

/* ------------------------------------------------------------------ *
 * front matter 规范
 * SCALAR_ORDER / LIST_KEYS 必须与 tools/frontmatter.mjs 一致，
 * 否则插件新建的文章会被 `npm run check` 判为不合规（改一处要同步另一处）。
 * ------------------------------------------------------------------ */
const SCALAR_ORDER = [
  'title', 'date', 'cover', 'description', 'mathjax', 'password', 'updated',
  'top_img', 'sticky', 'hide', 'comments', 'abbrlink', 'type',
];
const LIST_KEYS = ['tags', 'categories'];

function formatScalar(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return String(value);
}

/** 渲染成规范顺序的 front matter 行（不含 --- 分隔线） */
function buildFrontMatter(fields) {
  const lines = [];
  for (const key of SCALAR_ORDER) {
    const value = fields[key];
    if (value === undefined || value === null || value === '') continue;
    lines.push(key + ': ' + formatScalar(value));
  }
  for (const key of LIST_KEYS) {
    if (fields[key] === undefined || fields[key] === null) continue;
    lines.push(key + ':');                        // 空列表也留占位，方便之后手填
    const items = Array.isArray(fields[key]) ? fields[key] : [fields[key]];
    for (const item of items) lines.push('  - ' + item);
  }
  for (const key of Object.keys(fields)) {
    if (SCALAR_ORDER.indexOf(key) >= 0 || LIST_KEYS.indexOf(key) >= 0) continue;
    const value = fields[key];
    if (value === undefined || value === null || value === '') continue;
    lines.push(key + ': ' + formatScalar(value));
  }
  return lines;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Hexo 的 date 写法：YYYY-MM-DD HH:mm:ss（本地时间） */
function formatDate(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' +
    pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

/** 文件名沿用 Hexo 的 new_post_name: :title.md，只去掉 Windows 非法字符 */
function safeFileName(title) {
  const cleaned = String(title)
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '');
  return cleaned || 'untitled';
}

function composeNewPost(title, preset, date) {
  const fields = Object.assign({}, preset || {}, { title: String(title).trim(), date: formatDate(date) });
  return '---\n' + buildFrontMatter(fields).join('\n') + '\n---\n\n';
}

/* ------------------------------------------------------------------ *
 * 弹窗
 * ------------------------------------------------------------------ */
class PresetSuggestModal extends SuggestModal {
  constructor(app, names, onChoose) {
    super(app);
    this.names = names;
    this.onChoose = onChoose;
    this.setPlaceholder('选择样式预设…');
  }
  getSuggestions(query) {
    const q = (query || '').trim();
    return q ? this.names.filter((n) => n.indexOf(q) >= 0) : this.names;
  }
  renderSuggestion(name, el) {
    el.setText(name);
  }
  onChooseSuggestion(name) {
    this.onChoose(name);
  }
}

class TextPromptModal extends Modal {
  constructor(app, title, placeholder, onSubmit) {
    super(app);
    this.promptTitle = title;
    this.placeholder = placeholder;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    this.titleEl.setText(this.promptTitle);
    const input = this.contentEl.createEl('input');
    input.type = 'text';
    input.placeholder = this.placeholder;
    input.style.width = '100%';
    input.style.marginTop = '8px';
    const submit = () => {
      const value = input.value.trim();
      this.close();
      if (value) this.onSubmit(value);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
    this.contentEl.createEl('button', { text: '创建' }).addEventListener('click', submit);
    setTimeout(() => input.focus(), 0);
  }
  onClose() {
    this.contentEl.empty();
  }
}

class LogModal extends Modal {
  constructor(app, title) {
    super(app);
    this.logTitle = title;
    this.buffer = '';
    this.pre = null;
  }
  onOpen() {
    this.titleEl.setText(this.logTitle);
    this.pre = this.contentEl.createEl('pre', { cls: 'hexo-log' });
    this.pre.setText(this.buffer);
    this.pre.scrollTop = this.pre.scrollHeight;
  }
  /** 没打开时先缓存，避免调用 open 之前 append 报错 */
  append(text) {
    this.buffer += text;
    if (this.buffer.length > 200000) this.buffer = this.buffer.slice(-200000);
    if (this.pre) {
      this.pre.setText(this.buffer);
      this.pre.scrollTop = this.pre.scrollHeight;
    }
  }
  onClose() {
    this.contentEl.empty();
    this.pre = null;
  }
}

/* ------------------------------------------------------------------ *
 * 插件
 * ------------------------------------------------------------------ */
/** 首次运行（还没有 data.json）时的默认值，保证 clone 下来开箱可用 */
const DEFAULT_SETTINGS = {
  siteRoot: '',
  siteUrl: '',
  presets: {
    '普通文章': { mathjax: false, tags: [], categories: [] },
    '带公式的长文': { mathjax: true, tags: [], categories: [] },
    '加密文章': { mathjax: false, password: 'changeme', tags: [], categories: [] },
    '置顶': { mathjax: false, sticky: 1, tags: [], categories: [] },
  },
};

class HexoPublisher extends Plugin {
  async onload() {
    try {
      const saved = (await this.loadData()) || {};
      this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
      this.running = false;
      this.statusEl = this.addStatusBarItem();   // 右下角状态栏：替代命令行窗口显示进度

      this.addCommand({
        id: 'new-post',
        name: '新建文章（选择样式预设）',
        callback: () => this.newPost(),
      });
      this.addCommand({
        id: 'check',
        name: '校验文章 front matter',
        callback: () => this.runNpm('check', '校验 front matter'),
      });
      this.addCommand({
        id: 'publish',
        name: '发布到 GitHub Pages',
        callback: () => this.runNpm('publish', '发布到 GitHub Pages'),
      });

      // 左侧边栏的可见按钮（只在命令面板里出现太难找，这里给两个能看见的入口）
      this.addRibbonIcon('file-plus', 'Hexo: 新建文章（选择样式预设）', () => this.newPost());
      this.addRibbonIcon('upload', 'Hexo: 发布到 GitHub Pages', () => this.runNpm('publish', '发布到 GitHub Pages'));

      console.log('[hexo-publisher] 已加载，样式预设：' + (Object.keys(this.settings.presets).join(' / ') || '（无）'));
    } catch (e) {
      console.error('[hexo-publisher] onload 失败', e);
      new Notice('Hexo Publisher 加载失败：' + ((e && e.message) || e));
    }
  }

  newPost() {
    const names = Object.keys(this.settings.presets || {});
    if (!names.length) {
      new Notice('data.json 里没有配置样式预设');
      return;
    }
    new PresetSuggestModal(this.app, names, (name) => {
      new TextPromptModal(this.app, '新建文章 · ' + name, '文章标题', (title) => {
        this.createNote(title, this.settings.presets[name]).catch((e) => {
          new Notice('创建失败：' + ((e && e.message) || e));
        });
      }).open();
    }).open();
  }

  async createNote(title, preset) {
    if (!this.app.vault.getAbstractFileByPath('_posts')) {
      await this.app.vault.createFolder('_posts');
    }
    const filePath = '_posts/' + safeFileName(title) + '.md';
    if (this.app.vault.getAbstractFileByPath(filePath)) {
      new Notice('已存在：' + filePath);
      return;
    }
    const file = await this.app.vault.create(filePath, composeNewPost(title, preset, new Date()));
    await this.app.workspace.getLeaf('tab').openFile(file);
    new Notice('已创建 ' + filePath);
  }

  setStatus(text) {
    if (this.statusEl) this.statusEl.setText(text || '');
  }

  runNpm(script, title) {
    const root = this.settings.siteRoot;
    let fs;
    let pathMod;
    let spawn;
    try {
      // Obsidian 桌面端：优先用 Electron 的 require 取内置模块
      const req = (typeof window !== 'undefined' && window.require) ? window.require : require;
      fs = req('fs');
      pathMod = req('path');
      spawn = req('child_process').spawn;
    } catch (e) {
      new Notice('无法加载 Node 内置模块：' + ((e && e.message) || e));
      return;
    }
    if (!root || !fs.existsSync(pathMod.join(root, 'node_modules', 'hexo'))) {
      new Notice('站点目录无效，请在插件 data.json 里改 siteRoot：' + root);
      return;
    }
    if (this.running) {
      new Notice('已有任务在跑，等它结束再试');
      return;
    }
    this.running = true;

    // 日志窗口先不打开：成功就完全不出现（不想看到命令行），失败才自动弹出来给原因
    const log = new LogModal(this.app, title);
    log.append('$ npm.cmd run ' + script + '\n\n');
    const notice = new Notice('Hexo：' + title + '…', 3600000);
    this.setStatus('Hexo: ' + title + '…');

    const finish = (ok, code, errText) => {
      this.running = false;
      if (notice && notice.hide) notice.hide();
      this.setStatus('');
      if (ok) {
        const tail = (script === 'publish' && this.settings.siteUrl) ? '（' + this.settings.siteUrl + '）' : '';
        new Notice(title + '：完成' + tail, 6000);
        return;
      }
      if (errText) log.append('\n[错误] ' + errText + '\n');
      log.append('\n[失败] 退出码 ' + code + '\n');
      log.open();
      new Notice(title + '：失败，已打开日志', 10000);
    };

    const child = spawn('cmd.exe', ['/d', '/s', '/c', 'npm.cmd run ' + script], {
      cwd: root,
      windowsHide: true,   // 不弹出系统命令行窗口
    });
    child.stdout.on('data', (d) => log.append(d.toString('utf8')));
    child.stderr.on('data', (d) => log.append(d.toString('utf8')));
    child.on('error', (e) => finish(false, -1, e.message));
    child.on('close', (code) => finish(code === 0, code));
  }
}

module.exports = HexoPublisher;
module.exports.default = HexoPublisher;
/** 纯函数副本，仅供 Node 侧测试取用，不影响 Obsidian 运行 */
module.exports.pure = {
  SCALAR_ORDER, LIST_KEYS, buildFrontMatter, composeNewPost, formatDate, safeFileName,
};
