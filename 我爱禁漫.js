/**
 * 我爱禁漫 (52jinm.com) Venera 漫画源
 *
 * 站点性质：服务端渲染静态 HTML（帝国 CMS 系），jQuery lazyload，无业务 JSON API、无加密。
 * 取证时间：2026-10-13（首页/更新/热门/分类/搜索/详情/章节/图片全链路真网样本）
 *
 * 已取证的真实路由（全部 200）：
 *   首页        GET /                                  —— 5 个分区（更新/热门/新上架/推荐/已完结），每分区 12 卡，共 60 卡
 *   更新        GET /new-mangas                        —— 最新更新 90 卡，无分页
 *               GET /new-mangas/new-mangas             —— 新书上架 60 卡，无分页
 *               GET /new-mangas/recommend              —— 推荐漫画 90 卡，无分页
 *   热门        GET /manga-rank[/weekly]               —— 周榜默认，96 卡，无分页
 *               GET /manga-rank/daily                 —— 日榜，96 卡
 *               GET /manga-rank/monthly               —— 月榜，96 卡
 *               GET /manga-rank/all                   —— 总榜，96 卡
 *   分类        GET /manga-catalog[/{分类}/ob/{time|hits}/st/{all|serialized|completed}][/page/N]
 *                分类 6 项：全部/韩漫/日漫/3D漫画/真人/短篇（HTML 真实筛选区）
 *                进度 3 项：全部/连载中/已完结（st/serialized|completed）
 *                排序 2 项：按时间/按阅读（time|hits）
 *                每页 24 卡，共收录 3069 部 -> maxPage = ceil(3069/24) = 128（page/128 实测仍有数据）
 *                分页格式：/manga-catalog/{...}/page/N
 *                注意：部分筛选组合真实无数据（如 韩漫+已完结+按阅读 = 0 部），源按空结果安全返回
 *   搜索        GET /manga-search/{关键词}             —— 路径式；?key= 查询串不触发搜索（302 已被站点处理）
 *               分页：/manga-search/{关键词}/ob/time/st/all/page/N（越界返回空列表）
 *   详情        GET /manga-read/{id}.html              —— h1 标题、封面、作者、分类、进度、简介、
 *               .stui-content__playlist 全量章节（实测 76 章）
 *   章节        GET /manga-read/{comicId}/{epId}.html  —— img.lazyload[data-original] 绝对 URL
 *   图片        p3p/p4p/p6.18rouman.vip 直链 WEBP/JPEG，无 Referer 校验（实测裸请求 200 + WEBP 文件头）
 *
 * 字段矩阵：
 *   卡片      a.jinman_index_5[href=/manga-read/{id}.html] -> img[src] 封面 / .jinman_index_6 标题
 *   章节 ID   22 位大小写字母混合随机串（hmWulOirzZeZoPuCVkra），与漫画 ID 一起构成阅读 URL
 *
 * 权限边界：站内「放进书架」等为前端脚本；正文图片全部可公开直链访问，无付费/登录/VIP 信号。
 * 安全：不执行站点内联脚本（仅解析 HTML 与静态字段）。
 */

class AiWoJinMan extends ComicSource {
  name = "我爱禁漫";
  key = "aiwojinman";
  version = "1.1.0";
  minAppVersion = "1.6.0";
  url = "";

  host = "https://52jinm.com";

  siteUa =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  pageSize = 24; // 分类页实测每页 24 卡

  get headers() {
    return {
      "User-Agent": this.siteUa,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      Referer: this.host + "/",
    };
  }

  get imageHeaders() {
    return {
      "User-Agent": this.siteUa,
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      Referer: this.host + "/",
    };
  }

  // ---------------------------------------------------------------- 基础工具

  trim(v) {
    return String(v == null ? "" : v).trim();
  }

  num(v, def) {
    const n = parseInt(v, 10);
    return isNaN(n) ? def : n;
  }

  absolutize(u) {
    const s = this.trim(u);
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    if (s.indexOf("//") === 0) return "https:" + s;
    if (s.indexOf("/") === 0) return this.host + s;
    return this.host + "/" + s;
  }

  // 从漫画详情/章节 URL 或裸 id 提取漫画 ID
  comicIdFrom(input) {
    const s = this.trim(input);
    if (!s) return "";
    const m = /\/manga-read\/(\d+)/.exec(s);
    if (m) return m[1];
    return /^\d{1,10}$/.test(s) ? s : "";
  }

  // 章节 ID 标准化：支持裸 epId / 完整章节 URL / comicId|epId 组合 / 对象参数
  normalizeEpId(input) {
    if (!input) return "";
    if (typeof input === "object") {
      return this.normalizeEpId(input.epId || input.chapterId || input.id || input.url);
    }
    const s = this.trim(input);
    if (!s) return "";
    // 完整 URL：/manga-read/{comicId}/{epId}.html
    const m = /\/manga-read\/\d+\/([A-Za-z0-9]+)/.exec(s);
    if (m) return m[1];
    // 组合 ID：取最后一段
    const parts = s.split("|");
    const last = parts[parts.length - 1].replace(/\.html?$/i, "").trim();
    return /^[A-Za-z0-9]{8,32}$/.test(last) ? last : "";
  }

  isPlaceholderImage(u) {
    const s = this.trim(u).toLowerCase();
    if (!s) return true;
    if (s.indexOf("data:image/") === 0) return true;
    if (s.indexOf("placeholder") >= 0) return true;
    if (/\.svg($|\?)/.test(s)) return true;
    return false;
  }

  // 卡片图片：先 data-original（章节图/懒加载），再 src（封面）
  imageFromImg(img) {
    if (!img || !img.attributes) return "";
    const a = img.attributes;
    const order = [a["data-original"], a["data-src"], a["lay-src"], a["src"]];
    for (const c of order) {
      const s = this.trim(c);
      if (!s || this.isPlaceholderImage(s)) continue;
      return this.absolutize(s);
    }
    return "";
  }

  // ---------------------------------------------------------------- 卡片解析

  parseComic(a) {
    if (!a || !a.attributes) return null;
    const id = this.comicIdFrom(a.attributes.href);
    if (!id) return null;
    const img = a.querySelector("img");
    let title = "";
    const t = a.querySelector(".jinman_index_6");
    if (t) title = this.trim(t.text);
    if (!title && img && img.attributes) title = this.trim(img.attributes.alt);
    if (!title) title = this.trim(a.attributes.title);
    if (!title) title = id;
    return new Comic({
      id: id,
      title: title,
      cover: this.imageFromImg(img),
      subTitle: "",
      sourceKey: this.key,
    });
  }

  // 解析一个列表页中的所有漫画卡片（自动去重）
  parseComicList(html) {
    const doc = new HtmlDocument(html);
    try {
      const comics = [];
      const seen = {};
      for (const a of doc.querySelectorAll('a[href*="/manga-read/"]')) {
        // 只取卡片级链接（href 形如 /manga-read/{id}.html，不取章节链接 /manga-read/{id}/{ep}.html）
        const href = this.trim(a.attributes && a.attributes.href);
        if (!/^\/manga-read\/\d+\.html$/.test(href)) continue;
        const c = this.parseComic(a);
        if (!c || seen[c.id]) continue;
        seen[c.id] = true;
        comics.push(c);
      }
      return comics;
    } finally {
      doc.dispose();
    }
  }

  // 分类/搜索页：从 .jinman_new_3 em 总数计算 maxPage（每页 24 卡）；
  // 分页控件是窗口式（每屏 5 个数字），不能只依赖可见数字。
  // 返回 { maxPage, end }；end=true 表示当前页无数据（越界/终止页）。
  pageState(html, page, fallbackMax) {
    const totalM = /<em>(\d+)<\/em>/.exec(html);
    if (totalM) {
      const total = parseInt(totalM[1], 10);
      if (!isNaN(total) && total > 0) {
        const maxPage = Math.max(1, Math.ceil(total / this.pageSize));
        const hasCards = /class="jinman_index_5"/.test(html);
        return { maxPage: maxPage, end: !hasCards };
      }
    }
    // 兜底：分页控件里的最大可见页码
    const m = /<a[^>]+href="([^"]*\/page\/(\d+)[^"]*)"[^>]*>\s*(\d+)\s*<\/a>/g;
    let max = 0;
    let hit;
    while ((hit = m.exec(html))) {
      const n = parseInt(hit[2], 10);
      if (!isNaN(n) && n > max) max = n;
    }
    if (max > 0) {
      const hasCards = /class="jinman_index_5"/.test(html);
      return { maxPage: max, end: !hasCards };
    }
    return { maxPage: fallbackMax, end: page > 1 };
  }

  // 详情页/列表页通用请求
  async getHtml(url, referer) {
    const res = await Network.get(url, { ...this.headers, Referer: referer || this.host + "/" });
    if (res.status === 404 || res.status === 410) throw new Error("page_not_found");
    if (res.status !== 200) throw new Error(`Invalid status code: ${res.status}`);
    return res.body || "";
  }

  // ---------------------------------------------------------------- 探索（首页）

  explore = [
    {
      title: "我爱禁漫",
      type: "multiPartPage",
      load: async () => {
        const html = await this.getHtml(this.host + "/", this.host + "/");
        const doc = new HtmlDocument(html);
        const parts = [];
        try {
          // 首页 5 个分区：h3.jinman_index_2 标题 + 查看更多链接 + 对应卡片区
          const sectionMap = {
            "最新更新漫画": { page: "category", attributes: { category: "更新", param: "update" } },
            "热门漫画": { page: "category", attributes: { category: "热门", param: "rank" } },
            "新上架漫画": { page: "category", attributes: { category: "更新", param: "new" } },
            "站长推荐": { page: "category", attributes: { category: "更新", param: "recommend" } },
            "已完结漫画": { page: "category", attributes: { category: "分类", param: "all|time|completed" } },
          };
          const sections = doc.querySelectorAll("h3.jinman_index_2");
          for (const h of sections) {
            const title = this.trim(h.text).replace(/\s+/g, " ");
            const clean = title.replace(/查看更多$/, "").trim();
            // 首页布局：.b72be 下 h3.jinman_index_2（标题）与其后的 div.jinman_sec_2（卡片区）交替
            let container = h.nextElementSibling;
            if (!container || (container.className || "").indexOf("jinman_sec_2") < 0) continue;
            const comics = [];
            const seen = {};
            for (const a of container.querySelectorAll('a.jinman_index_5[href*="/manga-read/"]')) {
              const c = this.parseComic(a);
              if (!c || seen[c.id]) continue;
              seen[c.id] = true;
              comics.push(c);
            }
            if (comics.length === 0) continue;
            const part = { title: clean, comics: comics };
            const vm = sectionMap[clean];
            if (vm) part.viewMore = vm;
            parts.push(part);
          }
        } finally {
          doc.dispose();
        }
        if (parts.length === 0) throw new Error("首页未解析到任何推荐区块，站点结构可能已变更");
        return parts;
      },
    },
  ];

  // ---------------------------------------------------------------- 分类（漫蛙式：三个独立分区入口 + 多维筛选面板）

  category = {
    title: "我爱禁漫",
    // 外层只放三个单入口；各入口下的细分选项全部由筛选面板（optionList）按 showWhen 切换承载
    parts: [
      {
        name: "更新",
        type: "fixed",
        categories: ["更新"],
        itemType: "category",
        categoryParams: ["update"],
      },
      {
        name: "热门",
        type: "fixed",
        categories: ["热门"],
        itemType: "category",
        categoryParams: ["rank"],
      },
      {
        name: "分类",
        type: "fixed",
        categories: ["分类"],
        itemType: "category",
        categoryParams: ["catalog"],
      },
    ],
    enableRankingPage: false,
  };

  // 更新入口的子页（最新更新/新书上架/推荐漫画）
  updateList(param) {
    const map = {
      latest: "/new-mangas",
      new: "/new-mangas/new-mangas",
      recommend: "/new-mangas/recommend",
    };
    return this.host + (map[param] || "/new-mangas");
  }

  // 热门入口的子榜（日/周/月/总）
  rankList(param) {
    const map = {
      daily: "/manga-rank/daily",
      weekly: "/manga-rank/weekly",
      monthly: "/manga-rank/monthly",
      all: "/manga-rank/all",
    };
    return this.host + (map[param] || "/manga-rank");
  }

  // 分类入口的筛选页
  catalogUrl(param, sort, status, page) {
    const p = this.num(page, 1);
    const cat = param && param !== "all" ? encodeURIComponent(param) : "all";
    const s = sort === "hits" ? "hits" : "time";
    const st = status === "serialized" || status === "completed" ? status : "all";
    let url = `${this.host}/manga-catalog/${cat}/ob/${s}/st/${st}`;
    if (p > 1) url += `/page/${p}`;
    return url;
  }

  categoryComics = {
    // 多维筛选面板：每组通过 showWhen 绑定到对应分区入口（漫蛙式）
    optionList: [
      {
        // 更新入口的细分：最新更新/新书上架/推荐漫画
        label: "更新",
        type: "select",
        showWhen: ["更新"],
        options: ["latest-最新更新", "new-新书上架", "recommend-推荐漫画"],
      },
      {
        // 热门入口的细分：日/周/月/总榜
        label: "榜单",
        type: "select",
        showWhen: ["热门"],
        options: ["daily-日榜", "weekly-周榜", "monthly-月榜", "all-总榜"],
      },
      {
        // 分类入口的细分：类型
        label: "分类",
        type: "select",
        showWhen: ["分类"],
        options: [
          "all-全部",
          "韩漫-韩漫",
          "日漫-日漫",
          "3D漫画-3D漫画",
          "真人-真人",
          "短篇-短篇",
        ],
      },
      {
        // 分类入口的细分：进度
        label: "进度",
        type: "select",
        showWhen: ["分类"],
        options: ["all-全部", "serialized-连载中", "completed-已完结"],
      },
      {
        // 分类入口的细分：排序
        label: "排序",
        type: "select",
        showWhen: ["分类"],
        options: ["time-按时间", "hits-按阅读"],
      },
    ],
    load: async (category, param, options, page) => {
      const p = this.num(page, 1);
      const opts = Array.isArray(options) ? options : [];
      const safeOpt = (i, def) => (typeof opts[i] === "string" && opts[i] ? opts[i] : def);

      if (param === "update") {
        // 更新入口：筛选面板第一项决定子页（最新更新/新书上架/推荐漫画），无分页
        const sub = safeOpt(0, "latest");
        const url = this.updateList(sub);
        try {
          const html = await this.getHtml(url, this.host + "/");
          const comics = this.parseComicList(html);
          return { comics: p > 1 ? [] : comics, maxPage: 1 };
        } catch (e) {
          console.error("我爱禁漫更新列表加载失败:", e);
          return { comics: [], maxPage: 1 };
        }
      }

      if (param === "rank") {
        // 热门入口：筛选面板第一项决定子榜（日/周/月/总），无分页
        const sub = safeOpt(0, "weekly");
        const url = this.rankList(sub);
        try {
          const html = await this.getHtml(url, this.host + "/");
          const comics = this.parseComicList(html);
          return { comics: p > 1 ? [] : comics, maxPage: 1 };
        } catch (e) {
          console.error("我爱禁漫排行榜加载失败:", e);
          return { comics: [], maxPage: 1 };
        }
      }

      if (param === "catalog") {
        // 分类入口：筛选面板依次为 分类 / 进度 / 排序，带分页
        // 默认：全部 + 全部进度 + 按时间（对应 /manga-catalog/all/ob/time/st/all）
        const cat = safeOpt(0, "all");
        const status = safeOpt(1, "all");
        const sort = safeOpt(2, "time");
        const url = this.catalogUrl(cat, sort, status, p);
        try {
          const html = await this.getHtml(url, this.host + "/");
          const comics = this.parseComicList(html);
          const st = this.pageState(html, p, p);
          return { comics: st.end ? [] : comics, maxPage: st.maxPage };
        } catch (e) {
          console.error("我爱禁漫分类加载失败:", e);
          return { comics: [], maxPage: p };
        }
      }

      return { comics: [], maxPage: p };
    },
  };

  // ---------------------------------------------------------------- 搜索

  search = {
    load: async (keyword, options, page) => {
      const kw = this.trim(keyword);
      const p = this.num(page, 1);
      if (!kw) return { comics: [], maxPage: p };
      // 路径式搜索入口；?key= 查询串不触发搜索（取证确认）
      let url = `${this.host}/manga-search/${encodeURIComponent(kw)}`;
      if (p > 1) url += `/ob/time/st/all/page/${p}`;
      try {
        const html = await this.getHtml(url, this.host + "/");
        const comics = this.parseComicList(html);
        // 搜索无结果时站点返回空卡片 + 空分页；有结果时按分页控件判断
        const st = this.pageState(html, p, 1);
        if (comics.length === 0) return { comics: [], maxPage: p > 1 ? p - 1 : 1 };
        return { comics: comics, maxPage: st.maxPage };
      } catch (e) {
        return { comics: [], maxPage: p > 1 ? p - 1 : 1 };
      }
    },
    optionList: [],
    enableTagsSuggestions: false,
  };

  // ---------------------------------------------------------------- 详情与章节

  comic = {
    idMatch: "^\\d{1,10}$",

    loadInfo: async (id) => {
      const cid = this.comicIdFrom(id);
      if (!cid) throw new Error("无法解析漫画 ID，请从探索、搜索或分类页重新打开这部作品");
      const html = await this.getHtml(`${this.host}/manga-read/${cid}.html`, this.host + "/");
      const doc = new HtmlDocument(html);
      let title = "";
      let author = "";
      let statusText = "";
      let description = "";
      let cover = "";
      const tagList = [];
      const chapters = new Map();
      try {
        const h1 = doc.querySelector(".jinman_index_2 h1") || doc.querySelector("h1");
        if (h1) title = this.trim(h1.text);
        // 详情元数据：.be998a 内的 p，用 span 前缀区分字段（作者/分类/更新/简介）
        for (const pEl of doc.querySelectorAll(".be998a p")) {
          const span = pEl.querySelector("span");
          const prefix = span ? this.trim(span.text) : "";
          const raw = this.trim(pEl.text);
          if (prefix.indexOf("作者") >= 0 && !author) {
            const a = pEl.querySelector("a");
            author = this.trim(a ? a.text : raw.replace(/^作者[：:]\s*/, ""));
          } else if (prefix.indexOf("分类") >= 0 && tagList.length === 0) {
            for (const a of pEl.querySelectorAll("a")) {
              const c = this.trim(a.text);
              if (c && tagList.indexOf(c) < 0) tagList.push(c);
            }
          } else if (prefix.indexOf("更新") >= 0 && !statusText) {
            // 状态：span.jinman_view_8
            const st = pEl.querySelector(".jinman_view_8");
            if (st) statusText = this.trim(st.text);
            if (!statusText) statusText = raw.replace(/^更新[：:]\s*/, "");
          } else if (prefix.indexOf("简介") >= 0 && !description) {
            const d = pEl.querySelector(".jinman_view_8");
            description = this.trim(d ? d.text : raw.replace(/^简介[：:]\s*/, ""));
          }
        }
        // 封面：详情头部第一张图
        const coverImg = doc.querySelector(".jinman_view_1 img");
        if (coverImg) cover = this.imageFromImg(coverImg);
        // 章节列表
        const epLinks = doc.querySelectorAll('.stui-content__playlist a[href*="/manga-read/"]');
        for (const a of epLinks) {
          const href = this.trim(a.attributes && a.attributes.href);
          const ep = this.normalizeEpId(href);
          if (!ep) continue;
          const t = this.trim(a.attributes && a.attributes.title) || this.trim(a.text);
          chapters.set(ep, t || ep);
        }
      } finally {
        doc.dispose();
      }
      if (!title) throw new Error("详情页解析失败，站点结构可能已变更");

      const tags = {};
      if (tagList.length > 0) tags["分类"] = tagList;
      if (author) tags["作者"] = [author];
      if (statusText) tags["状态"] = [statusText];

      return new ComicDetails({
        title: title,
        subtitle: author,
        subTitle: author,
        cover: cover,
        description: description,
        tags: tags,
        chapters: chapters,
        updateTime: "",
        url: `${this.host}/manga-read/${cid}.html`,
      });
    },

    loadEp: async (comicId, epId) => {
      const cid = this.comicIdFrom(comicId);
      const ep = this.normalizeEpId(epId);
      if (!cid || !ep) return { images: [] };
      const url = `${this.host}/manga-read/${cid}/${ep}.html`;
      try {
        const html = await this.getHtml(url, `${this.host}/manga-read/${cid}.html`);
        const doc = new HtmlDocument(html);
        try {
          const images = [];
          const seen = {};
          for (const img of doc.querySelectorAll("img.lazyload, img[data-original]")) {
            const u = this.imageFromImg(img);
            if (!u || seen[u]) continue;
            seen[u] = true;
            images.push(u);
          }
          return { images: images };
        } finally {
          doc.dispose();
        }
      } catch (e) {
        console.error("我爱禁漫章节加载失败:", e);
        return { images: [] };
      }
    },

    // 图片直链 WEBP/JPEG，无 Referer 校验；固定带浏览器头更稳
    onImageLoad: (url) => {
      return { url: url, headers: this.imageHeaders };
    },

    onThumbnailLoad: (url) => {
      return { url: url, headers: this.imageHeaders };
    },

    link: {
      domains: ["52jinm.com"],
      linkToId: (url) => {
        const m = /\/manga-read\/(\d+)/.exec(String(url == null ? "" : url));
        return m ? m[1] : null;
      },
    },
  };
}
