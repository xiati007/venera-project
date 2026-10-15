/**
 * X漫（xman7.org）Venera 漫画源
 *
 * 取证基准：2026-10-14，全部断言来自真实在线响应。
 *
 * 站点为苹果 CMS（maccms）二次模板，路由：
 *   分类   /mcata/{类型}/ob/{排序}/st/{状态}/page/{页码}
 *   标签搜索 /msearch/{关键词}/ob/{排序}/st/{状态}/page/{页码}
 *   站内搜索表单 POST /cata.php（key=关键词，等价于 /msearch/关键词）
 *   详情   /mdetail/{comicId}
 *   章节   /mread/{comicId}/{sid}   sid 为 20 位 base64 随机串
 *
 * ── v1.0.1 重大实现调整（由客户端实机反馈驱动）─────────────────
 * v1.0.0 使用 HtmlDocument + CSS 选择器解析，实机表现为
 * 「首页 / 分类 / 搜索全部空白，且日志无任何错误」。
 * 根因是 HtmlDocument 的每次 parse/querySelector 都要跨 JS↔Dart 桥接
 * （底层 package:html + csslib），桥接任一环节失败时 JS 侧只会拿到空结果，
 * 而 v1.0.0 的 catch 又把异常吞成空数组，导致故障完全不可见。
 *
 * v1.0.1 改为**纯正则解析**，只依赖 QuickJS 原生能力，不经过 Dart HTML 桥接：
 *   - 首页 / 分类 / 搜索 / 详情 / 章节 各自独立解析器，互不复用选择器
 *   - 不再创建 HtmlDocument，因此也不受 Dart 侧「最多 8 个 document」淘汰限制
 *   - 所有失败路径改为抛出带 URL 与状态码的错误，并在 catch 中 console.error，
 *     让 Venera 的调试日志能记录真实原因，而不是静默空白
 *
 * 图片协议（已取证，无任何加解密）：
 *   封面   thumb.niaopic.com / new.niaopic.com 的 data-original
 *   正文图 <img data-src="https://..." data-index="N">，按 data-index 升序即阅读顺序
 *   实测章节图 200 image/jpeg（ff d8 ff e0），封面 200 RIFF/WEBP，均无需 Referer
 *
 * 已确认事项：
 *   - 分类每页 24 张；分页器带 page/{尾页} 链接，page_tips 显示「当前X / 共有N页」，
 *     越界页返回 200 且 0 卡片，故 maxPage 取真实尾页号，禁用 page+1 猜测。
 *   - 详情页章节列表有 PC 折叠版与展开版两处，内容完全重复且顺序一致，
 *     按 sid 去重后即为正序。
 *   - 首页 4 个区块（最新更新/新书上架/小编推荐/已完結漫画）各 12 卡。
 *   - 首页轮播的背景图指向 https://xman7.org/upload_s//… 实测 404，封面不可用，故不收录。
 */
class Xman7 extends ComicSource {
  name = "X漫";
  key = "xman7";
  version = "1.0.1";
  minAppVersion = "1.6.0";
  url = "";

  static baseUrl = "https://xman7.org";
  static userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  // 站点真实分类（取自 /mcata 页头分类条）
  static categoryMap = [
    ["全部", "all"],
    ["韩漫", "韩漫"],
    ["日漫", "日漫"],
    ["3D漫画", "3D漫画"],
    ["真人美女", "真人美女"],
    ["单本", "单本"]
  ];

  headers() {
    return {
      "User-Agent": Xman7.userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9"
    };
  }

  imageHeaders() {
    return {
      "User-Agent": Xman7.userAgent,
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      Referer: Xman7.baseUrl + "/"
    };
  }

  /* ==================== 通用工具 ==================== */

  absoluteUrl(u) {
    const value = String(u || "").trim();
    if (!value) return "";
    if (value.startsWith("//")) return "https:" + value;
    // 归一化必须排在 http(s) 直返之前：站点图片实测全为 https，
    // 若原样放行 http:// 会被 Android 明文流量策略拦截。
    if (/^http:\/\//i.test(value)) return "https://" + value.substring(7);
    if (/^https:\/\//i.test(value)) return value;
    if (value.startsWith("/")) return Xman7.baseUrl + value;
    return Xman7.baseUrl + "/" + value;
  }

  parseComicId(href) {
    const m = String(href || "").match(/\/mdetail\/(\d+)/i);
    return m ? m[1] : "";
  }

  parseEpId(href) {
    const m = String(href || "").match(/\/mread\/\d+\/([A-Za-z0-9_-]+)/i);
    return m ? m[1] : "";
  }

  parsePageNumber(value) {
    const n = parseInt(String(value || ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  /** HTML 实体解码（站点标题里会出现 &hellip; &amp; 以及自定义的 &hearts;） */
  decodeEntities(value) {
    const named = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      nbsp: " ",
      hellip: "…",
      mdash: "—",
      ndash: "–",
      lsquo: "‘",
      rsquo: "’",
      ldquo: "“",
      rdquo: "”",
      // 站点模板自定义实体：实测章节标题里 &hearts; = ♥，&hearts; 之外的同类符号一并覆盖
      hearts: "♥",
      star: "★",
      stars: "★",
      check: "✔",
      cross: "✘",
      copy: "©",
      reg: "®",
      trade: "™"
    };
    return String(value || "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (all, ent) => {
      if (ent[0] === "#") {
        const code =
          ent[1] === "x" || ent[1] === "X"
            ? parseInt(ent.substring(2), 16)
            : parseInt(ent.substring(1), 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return all;
        try {
          return String.fromCodePoint(code);
        } catch (e) {
          return all;
        }
      }
      const key = ent.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(named, key)) return named[key];
      // 未知命名实体：直接去掉而不是原样显示。
      // 站点模板会塞入 &hearts; 这类自定义符号，原样保留会在章节标题里显示成乱码。
      return "";
    });
  }

  /** 去掉标签、压空白、解实体 */
  cleanText(value) {
    return this.decodeEntities(String(value || "").replace(/<[^>]*>/g, " "))
      .replace(/[\uE000-\uF8FF]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * maxPage 依据：分页器里的真实页码链接（含 page/{尾页}）与 page_tips 的「共有N页」。
   * 越界页返回 200 但 0 卡片，因此不能用 page+1 猜。
   */
  parseMaxPage(html, fallback) {
    let maxPage = fallback;
    const text = String(html || "");
    let m;
    const pageRe = /page\/(\d+)/g;
    while ((m = pageRe.exec(text)) !== null) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxPage) maxPage = n;
    }
    const tip = text.match(/共有(\d+)页/);
    if (tip) {
      const n = parseInt(tip[1], 10);
      if (Number.isFinite(n) && n > maxPage) maxPage = n;
    }
    return maxPage;
  }

  /**
   * 历史入参标准化：兼容 sid、/mread/{cid}/{sid} 完整 URL、组合 ID、对象参数。
   * 无法识别时返回 null，调用方直接返回空图片，不发畸形请求。
   */
  normalizeEpId(epId) {
    if (epId === null || epId === undefined) return null;
    if (typeof epId === "object") {
      return this.normalizeEpId(epId.epId || epId.chapterId || epId.id || epId.url || "");
    }
    const value = String(epId).trim();
    if (!value) return null;
    const urlMatch = value.match(/\/mread\/\d+\/([A-Za-z0-9_-]+)/i);
    if (urlMatch) return urlMatch[1];
    // 组合 ID（漫画ID|章节ID、漫画ID,章节ID）取最后一段
    const parts = value.split(/[|,]/).map(s => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (/^[A-Za-z0-9_-]{8,}$/.test(last)) return last;
    return null;
  }

  /* ==================== 网络层 ==================== */

  /**
   * 失败一律抛出可读错误，不再吞异常。
   * v1.0.0 把异常吞成空数组，导致实机「空白且零报错」，无法定位。
   */
  async fetchPage(url) {
    let res;
    try {
      res = await Network.get(url, this.headers());
    } catch (e) {
      throw `X漫请求异常(${url})：${e}`;
    }
    const status = parseInt(res ? res.status : -1, 10);
    if (status !== 200) {
      const err = res && res.error ? " " + res.error : "";
      throw `X漫返回 HTTP ${status}(${url})${err}`;
    }
    const html = String((res && res.body) || "");
    if (!html) throw `X漫返回空响应(${url})`;
    if (html.length < 2000) {
      throw `X漫返回内容过短(${url}, ${html.length} 字节)，可能是验证页或跳转页`;
    }
    return html;
  }

  /* ==================== 解析器：列表卡片 ==================== */

  /**
   * 列表卡片（首页 / 分类 / 搜索共用 li.vodlist_item 模板）。
   * 以整个 <li> 为单位一次性取出 封面 / 标题 / 日期，
   * 属性逐个独立提取，不依赖书写顺序；封面懒加载字段为 data-original。
   */
  extractCards(html) {
    const comics = [];
    const text = String(html || "");
    const itemRe = /<li class="vodlist_item[^"]*"[\s\S]*?<\/li>/g;
    let m;
    while ((m = itemRe.exec(text)) !== null) {
      const seg = m[0];
      const tag = (seg.match(/<a\b[^>]*class="[^"]*vodlist_thumb[^"]*"[^>]*>/) || [])[0] || "";
      if (!tag) continue;
      const id = this.parseComicId((tag.match(/\shref="([^"]*)"/) || [])[1] || "");
      if (!id) continue;
      // 标题优先取 p.vodlist_title 的可见文本（完整标题），
      // 回退到 a 的 title 属性（maccms 会截断 title）
      const titleBlock = (seg.match(/<p class="vodlist_title">([\s\S]*?)<\/p>/) || [])[1] || "";
      const title =
        this.cleanText(titleBlock) || this.cleanText((tag.match(/\stitle="([^"]*)"/) || [])[1] || "");
      if (!title) continue;
      const rawCover =
        (tag.match(/\sdata-original="([^"]*)"/) || [])[1] ||
        (tag.match(/\sdata-src="([^"]*)"/) || [])[1] ||
        (tag.match(/\ssrc="([^"]*)"/) || [])[1] ||
        "";
      const sub = this.cleanText((seg.match(/<p class="vodlist_sub">([\s\S]*?)<\/p>/) || [])[1] || "");
      comics.push(
        new Comic({
          id: id,
          title: title,
          cover: this.absoluteUrl(rawCover),
          subTitle: sub
        })
      );
    }
    return comics;
  }

  /* ==================== 解析器：首页区块 ==================== */

  parseHomeSections(html) {
    const result = {};
    const text = String(html || "");
    const starts = [];
    const rowRe = /<div class="vod_row tit_up">/g;
    let m;
    while ((m = rowRe.exec(text)) !== null) starts.push(m.index);
    for (let i = 0; i < starts.length; i++) {
      const seg = text.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : text.length);
      const heading = (seg.match(/<h2 class="title">([\s\S]*?)<\/h2>/) || [])[1] || "";
      let name = this.cleanText(heading);
      if (!name) name = "推荐" + (i + 1);
      const comics = this.extractCards(seg);
      if (comics.length > 0 && !result[name]) result[name] = comics;
    }
    return result;
  }

  /* ==================== 解析器：详情 ==================== */

  parseDetail(html, comicId) {
    const text = String(html || "");
    const detail = {
      title: "",
      cover: "",
      description: "",
      status: "",
      updateTime: "",
      genres: [],
      authors: [],
      tags: [],
      chapters: new Map()
    };

    const h1 = (text.match(/<h1 class="title">([\s\S]*?)<\/h1>/) || [])[1] || "";
    detail.title = this.cleanText(h1) || comicId;

    // 详情封面：信息区头图的 data-original（排除轮播 a.wbalist_thumb）
    const coverTag = (text.match(/<a\b[^>]*class="[^"]*vodlist_thumb[^"]*"[^>]*>/) || [])[0] || "";
    const rawCover =
      (coverTag.match(/\sdata-original="([^"]*)"/) || [])[1] ||
      (coverTag.match(/\sdata-src="([^"]*)"/) || [])[1] ||
      "";
    detail.cover = this.absoluteUrl(rawCover);

    // <font> 内是「状态 + 时间」复合值（实测：连载中 9小时之前 / 已完结 09-27 / 已完结 12/05/2024）
    const fontRaw = this.cleanText((text.match(/<font[^>]*>([\s\S]*?)<\/font>/) || [])[1] || "");
    const stateMatch = fontRaw.match(/^(连载中|已完结|完结中|完结|更新中)/);
    detail.status = stateMatch ? stateMatch[1] : "";
    detail.updateTime = stateMatch ? fontRaw.substring(stateMatch[1].length).trim() : fontRaw;

    const descHtml = (text.match(/<li class="desc[^"]*">([\s\S]*?)<\/li>/) || [])[1] || "";
    detail.description = this.cleanText(descHtml).replace(/^简介[:：]/, "").trim();

    // 四个并列 li：分类 / 作者 / 简介 / 标签。
    // 分类那一项的可见文本就是分类名本身（没有「分类：」前缀），
    // 因此用 href 前缀 /mcata/ 识别；作者与标签用文本前缀识别。
    const liRe = /<li class="data">([\s\S]*?)<\/li>/g;
    let li;
    while ((li = liRe.exec(text)) !== null) {
      const raw = this.cleanText(li[1]);
      const links = [];
      const aRe = /<a\b[^>]*>([\s\S]*?)<\/a>/g;
      let a;
      while ((a = aRe.exec(li[1])) !== null) {
        const t = this.cleanText(a[1]);
        if (t && links.indexOf(t) < 0) links.push(t);
      }
      if (links.length === 0) continue;
      if (/<a\b[^>]*href="\/mcata\//i.test(li[1])) detail.genres = links;
      else if (/^作者/.test(raw)) detail.authors = links;
      else if (/^标签/.test(raw)) detail.tags = links;
    }

    // 章节：只在 <ul class="content_playlist"> 内收集，且必须是 <li><a> 结构。
    // 原因：详情头的「开始阅读」按钮也是 /mread/{cid}/{sid} 链接，位于章节列表之前，
    // 若不限定范围会抢先把第一章的 sid 占掉，导致第一章标题变成「开始阅读」。
    const lists = text.match(/<ul class="content_playlist[^"]*"[\s\S]*?<\/ul>/g) || [];
    const scope = lists.length > 0 ? lists.join("") : text;
    const epRe = /<li><a[^>]*href="\/mread\/(\d+)\/([A-Za-z0-9_-]+)"[^>]*>([\s\S]*?)<\/a><\/li>/g;
    let e;
    while ((e = epRe.exec(scope)) !== null) {
      const sid = e[2];
      if (detail.chapters.has(sid)) continue;
      const name = this.cleanText(e[3]) || "第" + (detail.chapters.size + 1) + "话";
      detail.chapters.set(sid, name);
    }

    return detail;
  }

  /* ==================== 解析器：章节图片 ==================== */

  extractImages(html) {
    const text = String(html || "");
    const ordered = [];
    const imgRe = /<img\b[^>]*>/g;
    let m;
    let seq = 0;
    while ((m = imgRe.exec(text)) !== null) {
      const tag = m[0];
      // 只认正文图：必须同时带 data-src 与 data-index，
      // 站点统计像素等 <img> 没有这两个属性。
      const raw =
        (tag.match(/\sdata-src="([^"]*)"/) || [])[1] ||
        (tag.match(/\sdata-original="([^"]*)"/) || [])[1] ||
        "";
      const idxAttr = (tag.match(/\sdata-index="([^"]*)"/) || [])[1];
      if (!raw || !/^https?:\/\//i.test(raw) || idxAttr === undefined) continue;
      const idx = parseInt(idxAttr, 10);
      ordered.push({
        idx: Number.isFinite(idx) ? idx : seq++,
        url: this.absoluteUrl(raw)
      });
    }
    ordered.sort((a, b) => a.idx - b.idx);
    const images = [];
    for (const item of ordered) {
      // 实测个别章节源数据里存在重复 URL，按地址去重保持阅读顺序稳定
      if (images.indexOf(item.url) < 0) images.push(item.url);
    }
    return images;
  }

  /* ==================== Venera 入口 ==================== */

  explore = [
    {
      title: this.name,
      type: "singlePageWithMultiPart",
      load: async () => {
        try {
          const html = await this.fetchPage(Xman7.baseUrl + "/");
          const result = this.parseHomeSections(html);
          if (Object.keys(result).length === 0) {
            console.error("X漫 首页解析为空，请检查站点结构是否变更");
            return { "最新更新": this.extractCards(html) };
          }
          return result;
        } catch (e) {
          console.error("X漫 首页加载失败: " + e);
          throw e;
        }
      }
    }
  ];

  category = {
    title: this.name,
    parts: [
      {
        name: "类型",
        type: "fixed",
        categories: Xman7.categoryMap.map(e => e[0]),
        categoryParams: Xman7.categoryMap.map(e => e[1]),
        itemType: "category"
      }
    ],
    enableRankingPage: false
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const pageNo = this.parsePageNumber(page);
      // Venera 传入的 options 是 optionList 里「键-显示名」的原文（如 "hits-按阅读"），
      // 这里按键名解析并做白名单校验，避免拼出畸形 URL。
      // 同时兼容直接传键名（"hits"）的情况。
      const optKey = (value) => String(value || "").split("-")[0];
      const sort =
        options && options.length > 0 && ["time", "hits"].indexOf(optKey(options[0])) >= 0
          ? optKey(options[0])
          : "time";
      const status =
        options && options.length > 1 && ["all", "serialized", "completed"].indexOf(optKey(options[1])) >= 0
          ? optKey(options[1])
          : "all";
      const type = String(param || "all").replace(/^\/+|\/+$/g, "");
      const url =
        `${Xman7.baseUrl}/mcata/${encodeURIComponent(type)}/ob/${sort}/st/${status}/page/${pageNo}`;
      try {
        const html = await this.fetchPage(url);
        return {
          comics: this.extractCards(html),
          maxPage: this.parseMaxPage(html, pageNo)
        };
      } catch (e) {
        console.error("X漫 分类加载失败: " + e);
        throw e;
      }
    },
    optionList: [
      { options: ["time-按时间", "hits-按阅读"] },
      { options: ["all-全部", "serialized-更新中", "completed-已完结"] }
    ]
  };

  search = {
    load: async (keyword, options, page) => {
      const pageNo = this.parsePageNumber(page);
      const kw = String(keyword || "").trim();
      if (!kw) return { comics: [], maxPage: pageNo };
      // /msearch 是站内搜索结果页（/cata.php 的下一跳），自带 page/{n} 分页
      const url = `${Xman7.baseUrl}/msearch/${encodeURIComponent(kw)}/ob/time/st/all/page/${pageNo}`;
      try {
        const html = await this.fetchPage(url);
        return {
          comics: this.extractCards(html),
          maxPage: this.parseMaxPage(html, pageNo)
        };
      } catch (e) {
        console.error("X漫 搜索加载失败: " + e);
        throw e;
      }
    }
  };

  comic = {
    loadInfo: async (id) => {
      const comicId =
        this.parseComicId("/mdetail/" + encodeURIComponent(String(id || ""))) ||
        String(id || "").trim();
      if (!/^\d+$/.test(comicId)) {
        throw "X漫 漫画 ID 非法: " + id;
      }
      try {
        const html = await this.fetchPage(`${Xman7.baseUrl}/mdetail/${comicId}`);
        const d = this.parseDetail(html, comicId);
        const tags = {};
        if (d.status) tags["状态"] = [d.status];
        if (d.genres.length > 0) tags["分类"] = d.genres;
        if (d.authors.length > 0) tags["作者"] = d.authors;
        if (d.tags.length > 0) tags["标签"] = d.tags;
        return new ComicDetails({
          title: d.title,
          cover: d.cover,
          description: d.description,
          tags: tags,
          chapters: d.chapters,
          updateTime: d.updateTime,
          subId: comicId
        });
      } catch (e) {
        console.error("X漫 详情加载失败: " + e);
        throw e;
      }
    },

    loadEp: async (comicId, epId) => {
      const sid = this.normalizeEpId(epId);
      if (!sid) return { images: [] };
      const cid =
        this.parseComicId("/mdetail/" + String(comicId || "")) || String(comicId || "").trim();
      if (!/^\d+$/.test(cid)) return { images: [] };
      try {
        const html = await this.fetchPage(
          `${Xman7.baseUrl}/mread/${encodeURIComponent(cid)}/${sid}`
        );
        const images = this.extractImages(html);
        if (images.length === 0) {
          console.error("X漫 章节无图片 cid=" + cid + " sid=" + sid);
        }
        return { images: images };
      } catch (e) {
        console.error("X漫 章节加载失败: " + e);
        throw e;
      }
    },

    // 正文图：实测无需 Referer，仍按浏览器 UA 发送以保证 CDN 行为一致
    onImageLoad: () => {
      return { headers: this.imageHeaders() };
    },
    // 封面 / 历史缩略图
    onThumbnailLoad: () => {
      return { headers: this.imageHeaders() };
    }
  };
}