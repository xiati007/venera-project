/** @type {import('./_venera_.js')} */
/**
 * 色漫天堂（semantt.org）Venera 漫画源 v1.0.1
 *
 * 入口说明：站点 title「色漫天堂 - 韩漫日漫18岁禁漫」，固定域名 https://semantt.org
 * （取证范围内未发现镜像域名公告，故 url 元数据写死、不做域名切换设置项）。
 *
 * 站点性质：苹果 CMS（maccms）+ conch 模板家族（var maccms/conchtpl、/jscss/conch.*.js），
 * 服务端渲染静态 HTML；正文图与封面走第三方图床 *.18rouman.vip。全部取证范围内
 * （首页/列表/搜索/详情/章节/图片）公开可读，未发现登录或付费墙，源不实现登录。
 *
 * 全站路由是拼音长路径风格（2026-10-05 实测，非跨站复制）：
 *  - 详情   /man-hua-yue-du/{comicId}.html
 *  - 章节   /man-hua-yue-du/{comicId}/{epKey}.html（epKey 为 20 位 base62 形态，非数字）
 *  - 分类   /man-hua-lei-bie/{类别}/ob/{排序}/st/{状态}[/page/{N}]
 *  - 列表   /xin-man-hua、/xin-man-hua/nb、/xin-man-hua/recommend
 *  - 榜单   /re-men-man-hua/{weekly|daily|monthly|all}
 *  - 搜索   /man-hua-sou-suo/{关键词}[/ob/{排序}/st/{状态}][/page/{N}]
 *
 * 已取证并验证的能力：
 *  - 首页 5 个推荐区块（div.hl-row-box > h2.hl-rb-title 标题 + ul.hl-vod-list 卡片，每区 12 卡）
 *    热门漫画/最新更新/站长推荐/新上架漫画/已完结漫画
 *  - 分类筛选页 24 卡/页；分页控件 div.hl-page-total 显示「N / M页」→ maxPage = M（真实依据）
 *    实测：全部 3036 条 127 页、日漫 1153 条 49 页、已完结 2220 条 93 页
 *  - **越界页是软边界**：/page/128 返回 200 + 0 卡（分页控件仍显示「128 / 127页」），
 *    绝不能用 404 探测定 maxPage，只能读分页控件分母（或尾页链接）
 *  - 最新 /xin-man-hua（96 卡）、xin-man-hua/nb（96 卡）、xin-man-hua/recommend（29 卡）
 *    与榜单 /re-men-man-hua/*（96 卡）各单屏、**页面无分页控件** → maxPage=1
 *  - 搜索 GET /man-hua-sou-suo/{kw}（与表单 action=/cata.php?key={kw} 等价，实测无 302、
 *    同为 39969 字节），24 卡/页，翻页 /man-hua-sou-suo/{kw}/page/{N}，无结果词返回
 *    0 卡 +「1 / 0页」+ hl-total=0（安全空）
 *  - 详情：h1.hl-dc-title 标题、div.hl-dc-pic > span.hl-item-thumb[data-original] 封面、
 *    em 前缀「状态：/TAG：/作者：/简介：」四字段、ul.hl-plays-list > a.module-play-list-link 章节
 *    （a.text 被模板截断到 9 字符，章节名必须取 title 属性再去掉「{漫画名}-」前缀）
 *  - 章节页图片：img.lazy[data-original] 明文直链，**单页全量、无「下一页」分页**
 *    （2026-10-05 实测第1/58/114 话为 77/163/181 张，全部无分页）
 *  - 章节页含统计像素 <img src="https://mc.yandex.ru/watch/*">（无 data-original、位于正文前），
 *    解析必须限定懒加载字段 + /manga_pics/ 路径双过滤，否则列表首位会混入坏图
 *  - 图片四线 host（p3p/p4p/p5/p6.18rouman.vip）与扩展名（同文件名 jpg/webp）均轮换，
 *    两者均为有效直链：抽样 11/11 200，JPEG FF D8 FF E0、WEBP RIFF/WEBP 文件头实测合法
 *  - 图片无防盗链：章节图与封面、站内 semantt.org/manga_pics，
 *    无 Referer / 本站 Referer 对照均 200 且字节一致
 *    （章节图 JPEG FF D8 FF E0、1061×1500；CDN 封面 WEBP RIFF/WEBP、270×400）
 *
 * 无效 ID 的错误页形态（HTTP 200 + 404 字节 `<script>window.location='/';</script>`）：
 * loadInfo 识别后安全抛错，不返回半截数据。
 *
 * 安全边界：页面底部含第三方广告脚本（new Function / document.write 混淆码）与
 * window.location 跳转脚本，本源**只解析静态 HTML 结构，不加载、不执行任何站点脚本**；
 * 无 eval、无 new Function、无字符串 throw；图片明文直链，无解密逻辑。
 *
 * 源设置：本源无 settings 项（固定域名，无已取证镜像集）。
 *
 * 版本历史：
 *  - v1.0.0 初版（首页/搜索/分类/详情/章节/图片全链路）
 *  - v1.0.1 回归修复：① normalizeEpId 对不可识别入参（如 "abc"/纯漫画 ID）安全返回 null，
 *    不再发畸形请求；② parseComicId 拒绝 0；③ loadEp 过滤统计像素杂图；
 *    ④ 删除未使用的 listPageSize/flatListSize 死常量；⑤ 修正 recommend tab 卡片数注释（29 卡）。
 */
class SemanttComicSource extends ComicSource {
  name = "色漫天堂";
  key = "semantt";
  version = "1.0.1";
  minAppVersion = "1.6.0";
  url = "https://semantt.org";

  // 站点固定域名：取证范围内无镜像公告，故不提供域名切换设置。
  baseUrl = "https://semantt.org";

  siteUa =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  // 分类筛选白名单（站点分类页筛选面板真值，防越权 URL 拼接）。
  categorySlugs = ["all", "日漫", "韩漫", "真人", "3D漫画", "同性"];
  statusSlugs = ["all", "completed", "serialized"];
  sortSlugs = ["time", "hits"];
  // 最新页三个子 tab / 排行页四个榜单 tab（URL 段真值）。
  // 卡片数取证（2026-10-05）：xin-man-hua 96 卡、xin-man-hua/nb 96 卡、
  // xin-man-hua/recommend 29 卡；榜单页 96 卡。四者页面均无分页控件 → maxPage=1。
  latestSlugs = ["xin-man-hua", "xin-man-hua/nb", "xin-man-hua/recommend"];
  rankSlugs = [
    "re-men-man-hua/weekly",
    "re-men-man-hua/daily",
    "re-men-man-hua/monthly",
    "re-men-man-hua/all",
  ];

  // ---------------------------------------------------------------- 基础工具

  absoluteUrl(path) {
    const value = String(path || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("//")) return "https:" + value;
    if (value.startsWith("/")) return this.baseUrl + value;
    return this.baseUrl + "/" + value;
  }

  baseHeaders(referer) {
    return {
      "User-Agent": this.siteUa,
      Referer: referer || this.baseUrl + "/",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
    };
  }

  isTransientError(message) {
    return /timeout|timed out|connection reset|connection closed|peer closed|broken pipe|unexpected.?eof|network error|aborted|connection refused|unreachable|temporary/i.test(
      String(message || "")
    );
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  num(value, fallback) {
    if (value === "all" || value === "" || value === null || value === undefined) {
      return fallback;
    }
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  // ---------------------------------------------------------------- 网络

  /** 统一网络请求：瞬态错误有限重试一次，5xx 有限重试一次，非 2xx 抛错。 */
  async request(method, url, headers, body) {
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try {
        res = await Network.sendRequest(method, url, headers, body);
      } catch (e) {
        res = { error: String(e) };
      }
      if (res && res.error) {
        lastError = String(res.error);
        if (this.isTransientError(lastError) && attempt === 0) {
          await this.sleep(400);
          continue;
        }
        throw new Error(`网络请求失败：${lastError}（${url}）`);
      }
      const status = Number(res && res.status);
      if (status >= 500 && attempt === 0) {
        await this.sleep(400);
        continue;
      }
      if (!status || status < 200 || status >= 300) {
        throw new Error(`请求失败 HTTP ${status}（${url}）`);
      }
      return res;
    }
    throw new Error(`网络请求失败：${lastError}（${url}）`);
  }

  async getText(url, referer) {
    const res = await this.request("GET", url, this.baseHeaders(referer), null);
    if (!res.body) throw new Error(`空响应（${url}）`);
    return String(res.body);
  }

  // ------------------------------------------------------------ ID 标准化

  /**
   * 从 /man-hua-yue-du/12348418.html、完整 URL、纯数字、组合形态 semantt|12348418
   * 中提取漫画 ID；章节链接 /man-hua-yue-du/{cid}/{epKey}.html 不误配（返回 null）。
   */
  parseComicId(href) {
    const value = String(href || "").trim();
    if (!value) return null;
    const match = value.match(/\/man-hua-yue-du\/(\d+)(?:\.html)?(?:[?#].*)?$/);
    if (match) return match[1] === "0" ? null : match[1];
    if (/^\d+$/.test(value)) return value === "0" ? null : value;
    // 组合形态（sourceKey|comicId）等无斜杠输入，取末尾数字。
    if (value.indexOf("/") === -1) {
      const digits = value.match(/(\d+)\s*$/);
      if (digits) return digits[1];
    }
    return null;
  }

  normalizeComicId(id) {
    if (id === null || id === undefined) return null;
    if (typeof id === "object") {
      return this.normalizeComicId(
        id.comicId !== undefined ? id.comicId : id.id !== undefined ? id.id : id.url
      );
    }
    return this.parseComicId(String(id));
  }

  /**
   * 章节 ID（epKey，20 位 base62 形态）标准化，兼容历史入参：
   *  zJJsGbVFpGTZnDzABkWT                          普通章节 ID
   *  /man-hua-yue-du/12348418/zJJs....html         章节链接
   *  https://semantt.org/man-hua-yue-du/…/xxx.html 完整章节 URL
   *  12348418|zJJsGbVFpGTZnDzABkWT                 组合 ID（取最后一段）
   *  {epId/chapterId/id/url}                       对象参数
   *  /man-hua-yue-du/12348418.html                 只有漫画 ID → null（拒绝）
   *  空值 / 0 / 不可识别                           → null，由调用方安全返回空图片
   */
  normalizeEpId(epId) {
    if (epId === null || epId === undefined || epId === "") return null;
    if (typeof epId === "object") {
      return this.normalizeEpId(
        epId.epId !== undefined
          ? epId.epId
          : epId.chapterId !== undefined
          ? epId.chapterId
          : epId.id !== undefined
          ? epId.id
          : epId.url
      );
    }
    const value = String(epId).trim();
    if (!value) return null;
    // 章节 epKey 已取证为 20 位 base62 形态；用 16-32 位字母数字正则做
    // 防御性校验，既容纳站点未来长度漂移，也拒绝 "abc"/"0"/纯漫画 ID 等
    // 不可识别输入（未知入参安全失败，不发畸形请求）。
    const validEpKey = (s) => /^[A-Za-z0-9]{16,32}$/.test(s);
    // 先剥离 query/hash 与 .html 后缀，再按路径段处理（大小写不敏感后缀）。
    const clean = value.split(/[?#]/)[0].replace(/\.html?$/i, "");
    const segments = clean.split("/").filter((s) => s);
    const anchor = segments.indexOf("man-hua-yue-du");
    if (anchor >= 0) {
      // /man-hua-yue-du/{cid}/{epKey} 才是章节；缺 epKey 段一律拒绝。
      if (segments.length >= anchor + 3) {
        const cid = segments[anchor + 1];
        const ep = segments[anchor + 2];
        if (/^\d+$/.test(cid) && validEpKey(ep)) return ep;
      }
      return null;
    }
    // 组合形态 a|b 取最后一段；纯 epKey 直接用（均需通过格式校验）。
    const last = clean.split("|").pop().trim();
    return validEpKey(last) ? last : null;
  }

  // ------------------------------------------------------------ 列表卡片解析

  /** 统一 Comic 构造：站点列表卡片只有 详情链接/封面/标题/副标题（最新话或时间）。 */
  buildComic(item) {
    if (!item) return null;
    const id = this.parseComicId(item.url || item.href || "");
    if (!id) return null;
    return new Comic({
      id,
      title: String(item.title || "未知漫画").trim(),
      subTitle: String(item.subTitle || "").trim(),
      cover: this.absoluteUrl(item.cover || ""),
      tags: Array.isArray(item.tags) ? item.tags : [],
      sourceKey: this.key,
    });
  }

  /**
   * 单张卡片解析（首页区块、分类页、搜索页、最新页、榜单页结构一致，
   * 五处分别取证确认同为 ul.hl-vod-list > li.hl-list-item 模板）：
   * li.hl-list-item > a.hl-item-thumb[href][title][data-original]（封面+详情链接）
   *                 + div.hl-item-text > div.hl-item-title > a（标题）
   *                                 > div.hl-item-sub（最新话 / 更新时间 / 日期）
   */
  parseCard(card) {
    if (!card) return null;
    const link =
      card.querySelector("a.hl-item-thumb") ||
      card.querySelector(".hl-item-title a") ||
      card.querySelector("a[href]");
    if (!link || !link.attributes) return null;
    const href = link.attributes.href || "";
    const id = this.parseComicId(href);
    if (!id) return null;

    let title = link.attributes.title ? String(link.attributes.title).trim() : "";
    if (!title && link.text) title = String(link.text).trim();
    if (!title) {
      const titleLink = card.querySelector(".hl-item-title a");
      if (titleLink) {
        title = titleLink.attributes && titleLink.attributes.title
          ? String(titleLink.attributes.title).trim()
          : titleLink.text
          ? String(titleLink.text).trim()
          : "";
      }
    }
    if (!title) return null;

    const coverRaw =
      link.attributes["data-original"] ||
      link.attributes["data-src"] ||
      link.attributes.src ||
      "";
    const sub = card.querySelector(".hl-item-sub");
    const subTitle = sub && sub.text ? String(sub.text).trim() : "";

    return this.buildComic({ url: href, title, cover: coverRaw, subTitle });
  }

  /** 解析整页 HTML 中全部列表卡片（分类页 / 搜索结果页 / 首页区块各自调用）。 */
  parseCards(html) {
    const doc = new HtmlDocument(html);
    try {
      const cards = doc.querySelectorAll("ul.hl-vod-list > li.hl-list-item");
      const comics = [];
      for (const card of cards) {
        const comic = this.parseCard(card);
        if (comic) comics.push(comic);
      }
      return comics;
    } finally {
      doc.dispose();
    }
  }

  /**
   * maxPage 真实依据：分页控件 div.hl-page-total 文本「N / M页」的分母 M。
   * 实测越界页 /page/128 仍 200 且显示「128 / 127页」（软边界空页），
   * 因此绝不能靠 404 探测，只能读分页控件；分母为 0（无结果词「1 / 0页」）按 1 处理。
   * 页面无分页控件（最新 / 榜单页）→ 无控件即 1，与取证一致。
   * 复用已解析的 doc，避免为同一份 HTML 反复建文档。
   */
  readMaxPage(doc) {
    const total = doc.querySelector(".hl-page-total");
    const text = total && total.text ? String(total.text) : "";
    const m = text.match(/(\d+)\s*\/\s*(\d+)/);
    const pages = m ? Number(m[2]) : 0;
    return pages > 0 ? pages : 1;
  }

  // ------------------------------------------------------------ 首页推荐

  explore = [
    {
      title: this.name,
      type: "singlePageWithMultiPart",
      load: async (page) => {
        let doc = null;
        try {
          const html = await this.getText(this.baseUrl + "/", this.baseUrl + "/");
          doc = new HtmlDocument(html);
          const result = {};
          const boxes = doc.querySelectorAll("div.hl-row-box");
          for (const box of boxes) {
            const h2 = box.querySelector("h2.hl-rb-title a");
            if (!h2 || !h2.text) continue;
            const title = String(h2.text).trim();
            if (!title) continue;
            const cards = box.querySelectorAll("li.hl-list-item");
            const comics = [];
            for (const card of cards) {
              const comic = this.parseCard(card);
              if (comic) comics.push(comic);
            }
            if (comics.length > 0 && !result[title]) result[title] = comics;
          }
          return result;
        } catch (e) {
          console.error("色漫天堂首页解析失败：", e);
          return {};
        } finally {
          if (doc) doc.dispose();
        }
      },
    },
  ];

  // ------------------------------------------------------------ 分类频道

  category = {
    title: this.name,
    // parts 分组按站点导航与各页筛选面板：
    //  - 「分类」= 导航「分类」页的类别筛选（全部/日漫/韩漫/真人/3D漫画/同性，与站点一字不差）
    //  - 「最新」 = 导航「最新」页的三个子 tab（最新更新/新书发布/推荐漫画）
    //  - 「排行」 = 导航「排行」页的四个榜单 tab（周榜/日榜/月榜/总榜）
    // 状态与排序两组筛选由 optionList 承载（站点确有筛选面板），仅「分类」组可见。
    parts: [
      {
        name: "分类",
        type: "fixed",
        categories: ["全部", "日漫", "韩漫", "真人", "3D漫画", "同性"],
        itemType: "category",
        categoryParams: ["all", "日漫", "韩漫", "真人", "3D漫画", "同性"],
      },
      {
        name: "最新",
        type: "fixed",
        categories: ["最新更新", "新书发布", "推荐漫画"],
        itemType: "category",
        categoryParams: ["xin-man-hua", "xin-man-hua/nb", "xin-man-hua/recommend"],
      },
      {
        name: "排行",
        type: "fixed",
        categories: ["周榜", "日榜", "月榜", "总榜"],
        itemType: "category",
        categoryParams: [
          "re-men-man-hua/weekly",
          "re-men-man-hua/daily",
          "re-men-man-hua/monthly",
          "re-men-man-hua/all",
        ],
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const path = String(param || "").trim();
      const safePage = this.num(page, 1);
      if (!path) return { comics: [], maxPage: safePage };
      const opts = Array.isArray(options) ? options : [];
      try {
        let url;
        let maxPage = 1;
        if (this.rankSlugs.indexOf(path) >= 0) {
          // 榜单页：4 个榜单 tab，96 卡单屏、页面无分页控件 → maxPage 恒为 1。
          url = `${this.baseUrl}/${path}`;
          if (safePage > 1) return { comics: [], maxPage };
        } else if (this.latestSlugs.indexOf(path) >= 0) {
          // 最新页：3 个子 tab（96/96/29 卡），页面无分页控件 → maxPage 恒为 1。
          url = `${this.baseUrl}/${path}`;
          if (safePage > 1) return { comics: [], maxPage };
        } else {
          // 分类筛选页：/man-hua-lei-bie/{类别}/ob/{排序}/st/{状态}[/page/{N}]
          const slug = this.categorySlugs.indexOf(path) >= 0 ? path : "all";
          const status = this.statusSlugs.indexOf(opts[0]) >= 0 ? opts[0] : "all";
          const sort = this.sortSlugs.indexOf(opts[1]) >= 0 ? opts[1] : "time";
          const base = `${this.baseUrl}/man-hua-lei-bie/${encodeURIComponent(slug)}/ob/${sort}/st/${status}`;
          url = safePage > 1 ? `${base}/page/${safePage}` : base;
        }
        const html = await this.getText(url, this.baseUrl + "/");
        // 目标页与 maxPage 同源解析（同一份 HTML），避免为 maxPage 多发一次请求。
        const doc = new HtmlDocument(html);
        let comics = [];
        try {
          const cards = doc.querySelectorAll("ul.hl-vod-list > li.hl-list-item");
          for (const card of cards) {
            const comic = this.parseCard(card);
            if (comic) comics.push(comic);
          }
          maxPage = this.readMaxPage(doc);
        } finally {
          doc.dispose();
        }
        return { comics, maxPage };
      } catch (e) {
        console.error(`色漫天堂分类「${category}」加载失败：`, e);
        return { comics: [], maxPage: safePage };
      }
    },
    optionList: [
      {
        label: "状态",
        type: "select",
        // 最新 / 排行子 tab 页没有状态筛选，按分类名隐藏这些组。
        notShowWhen: ["最新更新", "新书发布", "推荐漫画", "周榜", "日榜", "月榜", "总榜"],
        options: ["all-全部", "completed-已完结", "serialized-更新中"],
      },
      {
        label: "排序",
        type: "select",
        notShowWhen: ["最新更新", "新书发布", "推荐漫画", "周榜", "日榜", "月榜", "总榜"],
        options: ["time-按时间", "hits-按阅读"],
      },
    ],
  };

  // ------------------------------------------------------------ 搜索

  search = {
    load: async (keyword, options, page) => {
      const kw = String(keyword || "").trim();
      const safePage = this.num(page, 1);
      if (!kw) return { comics: [], maxPage: safePage };
      const opts = Array.isArray(options) ? options : [];
      const status = this.statusSlugs.indexOf(opts[0]) >= 0 ? opts[0] : "all";
      const sort = this.sortSlugs.indexOf(opts[1]) >= 0 ? opts[1] : "time";
      try {
        const base =
          `${this.baseUrl}/man-hua-sou-suo/${encodeURIComponent(kw)}` +
          `/ob/${sort}/st/${status}`;
        const url = safePage > 1 ? `${base}/page/${safePage}` : base;
        const html = await this.getText(url, this.baseUrl + "/");
        const doc = new HtmlDocument(html);
        try {
          const comics = [];
          const cards = doc.querySelectorAll("ul.hl-vod-list > li.hl-list-item");
          for (const card of cards) {
            const comic = this.parseCard(card);
            if (comic) comics.push(comic);
          }
          // 无结果词页面显示「1 / 0页」→ 0 卡 + maxPage=1（安全空，UI 不翻页）。
          return { comics, maxPage: this.readMaxPage(doc) };
        } finally {
          doc.dispose();
        }
      } catch (e) {
        console.error("色漫天堂搜索失败：", e);
        return { comics: [], maxPage: safePage };
      }
    },
    optionList: [
      {
        label: "状态",
        type: "select",
        options: ["all-全部", "completed-已完结", "serialized-更新中"],
      },
      {
        label: "排序",
        type: "select",
        options: ["time-按时间", "hits-按阅读"],
      },
    ],
  };

  // ------------------------------------------------------------ 详情与章节

  comic = {
    loadInfo: async (id) => {
      const comicId = this.normalizeComicId(id);
      if (!comicId) throw new Error(`无效的漫画 ID：${id}`);
      const url = `${this.baseUrl}/man-hua-yue-du/${comicId}.html`;
      const html = await this.getText(url, this.baseUrl + "/");
      // 站点对不存在的漫画返回 HTTP 200 + 404 字节的跳转脚本页（错误页）。
      if (html.indexOf("window.location") >= 0 && html.indexOf("hl-dc-title") < 0) {
        throw new Error(`漫画不存在或已下架：${comicId}`);
      }
      const doc = new HtmlDocument(html);
      try {
        const h1 = doc.querySelector("h1.hl-dc-title");
        const title = h1 && h1.text ? String(h1.text).trim() : "";
        if (!title) throw new Error("详情页标题缺失");

        // 封面：div.hl-dc-pic > span.hl-item-thumb 的 data-original（span 节点，非 img）。
        const pic = doc.querySelector("div.hl-dc-pic span.hl-item-thumb");
        const coverRaw =
          pic && pic.attributes
            ? pic.attributes["data-original"] || pic.attributes.src || ""
            : "";
        const cover = this.absoluteUrl(coverRaw);

        // 桌面版信息块 div.hl-data-sm > ul > li，字段以 em 前缀区分。
        let status = "";
        let author = "";
        let description = "";
        const tagList = [];
        const items = doc.querySelectorAll("div.hl-data-sm ul li");
        for (const li of items) {
          const em = li.querySelector("em");
          if (!em || !em.text) continue;
          const label = String(em.text).replace(/\s+/g, "");
          if (label.indexOf("状态：") === 0 || label.indexOf("状态:") === 0) {
            const span = li.querySelector("span");
            if (span && span.text) status = String(span.text).trim();
          } else if (label.indexOf("作者：") === 0 || label.indexOf("作者:") === 0) {
            const a = li.querySelector("a");
            if (a && a.text) author = String(a.text).trim();
          } else if (label.indexOf("简介：") === 0 || label.indexOf("简介:") === 0) {
            // 简介是 li.blurb 内 em 之后的文本节点。
            const full = li.text ? String(li.text) : "";
            description = full.replace(/^\s*简介[：:]\s*/, "").trim();
          } else if (label.indexOf("TAG：") === 0 || label.indexOf("TAG:") === 0) {
            const links = li.querySelectorAll("a[href]");
            for (const a of links) {
              const t = a.text ? String(a.text).trim() : "";
              if (t && tagList.indexOf(t) < 0) tagList.push(t);
            }
          }
        }

        // 章节：a.module-play-list-link（全站唯一章节链接 class，多线路时自动合并去重）。
        // a.text 被模板截断到 9 字符 → 章节名取 title 属性去掉「{漫画名}-」前缀。
        const chapters = new Map();
        const links = doc.querySelectorAll("a.module-play-list-link");
        for (const a of links) {
          if (!a.attributes) continue;
          const href = a.attributes.href || "";
          const epId = this.normalizeEpId(href);
          if (!epId || chapters.has(epId)) continue;
          let name = a.attributes.title ? String(a.attributes.title).trim() : "";
          const prefix = title + "-";
          if (name.indexOf(prefix) === 0) name = name.slice(prefix.length);
          if (!name) name = a.text ? String(a.text).trim() : "";
          if (name) chapters.set(epId, name);
        }
        if (!chapters.size) throw new Error("详情页章节列表为空");

        const authors = author ? [author] : [];
        const statusText = String(status).trim();
        return new ComicDetails({
          title,
          subTitle: author,
          cover,
          tags: {
            状态: statusText,
            类型: tagList,
          },
          authors,
          status: statusText,
          intro: description,
          description,
          chapters,
          comic: new Comic({
            id: comicId,
            title,
            subTitle: author,
            cover,
            tags: tagList,
            sourceKey: this.key,
          }),
          sourceKey: this.key,
        });
      } finally {
        doc.dispose();
      }
    },

    /**
     * 章节图片加载：站点阅读页把整话图片一次性渲染在 HTML 内
     * （img.lazy[data-original] 明文直链），实测 77/154/181/214 张四个章节
     * 均无「下一页」分页控件 → 单请求取全量，按 DOM 顺序输出、跨页去重逻辑不需要。
     * 章节 URL 必须同时有 comicId 与 epKey（仅 epKey 会 404），故两者缺一即安全返回空。
     */
    loadEp: async (comicId, epId) => {
      const epIdNorm = this.normalizeEpId(epId);
      if (!epIdNorm) return { images: [] };
      const cid = this.normalizeComicId(comicId);
      if (!cid) return { images: [] };
      const referer = `${this.baseUrl}/man-hua-yue-du/${cid}.html`;
      try {
        const url = `${this.baseUrl}/man-hua-yue-du/${cid}/${epIdNorm}.html`;
        const html = await this.getText(url, referer);
        // 站点对不存在的章节返回 HTTP 200 + 404 字节跳转脚本页（0 图）。
        if (html.indexOf("window.location") >= 0 && html.indexOf("data-original") < 0) {
          return { images: [] };
        }
        const doc = new HtmlDocument(html);
        try {
          const images = [];
          const seen = new Set();
          // 只取带懒加载字段的 img（正文图已取证全部为 img.lazy[data-original]）；
          // 不能用裸 img 兜底，否则会混入统计像素（实测页面含
          // <img src="https://mc.yandex.ru/watch/97623896">，位于正文之前）。
          const nodes = doc.querySelectorAll("img[data-original], img[data-src], img.lazy");
          for (const node of nodes) {
            if (!node.attributes) continue;
            const raw =
              node.attributes["data-original"] ||
              node.attributes["data-src"] ||
              node.attributes.src ||
              "";
            if (!raw) continue;
            const abs = this.absoluteUrl(raw);
            // 双保险：正文图已取证均为 /manga_pics/ 路径（站内或 *.18rouman.vip 图床，
            // 四线 host 轮换、jpg/webp 格式轮换均不影响路径特征），据此过滤杂图。
            if (abs && abs.indexOf("/manga_pics/") >= 0 && !seen.has(abs)) {
              seen.add(abs);
              images.push(abs);
            }
          }
          return {
            images,
            headers: {
              "User-Agent": this.siteUa,
              Referer: referer,
            },
          };
        } finally {
          doc.dispose();
        }
      } catch (e) {
        console.error(`色漫天堂章节 ${epIdNorm} 图片加载失败：`, e);
        return { images: [] };
      }
    },

    /**
     * 图片请求头：实测 p4p/p6/p5/p3p.18rouman.vip 与站内封面均无防盗链
     * （无 Referer / 本站 Referer / 任意 Referer 三组对照 200 且字节一致），
     * 此处仍防御性带上本站 Referer，避免图床未来收紧时失效。
     */
    onImageLoad: (url, comicId, epId) => {
      const cid = this.normalizeComicId(comicId);
      const referer = cid ? `${this.baseUrl}/man-hua-yue-du/${cid}.html` : this.baseUrl + "/";
      return {
        headers: {
          "User-Agent": this.siteUa,
          Referer: referer,
        },
      };
    },
  };
}
