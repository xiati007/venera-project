/** @type {import('./_venera_.js')} */
/**
 * A漫 Venera 漫画源 v1.0.0
 *
 * 入口说明：用户入口 https://aman3.org（title「A漫-韩漫日漫H漫的天堂」）。
 * 本站是动态域名站：首页公告只给出「发邮件 qianf6348@gmail.com 换网址」的换址方式，
 * 页面内**没有镜像域名列表**（已全页取证 `conchtpl.tipc` / 红字公告 / 页脚），
 * 因此设置项做成 input（用户可手动输入任意域名），default 为实测可达的 aman3.org。
 * source.url 按动态域名源约定留空。
 *
 * 站点性质：MAC/苹果 CMS 模板站（内联 `var maccms`、路由 /cata.php、/manhuaview/），
 * 服务端渲染静态 HTML，前端仅 jQuery + swiper + 懒加载，**无前端框架、无业务 JSON 接口**。
 *
 * 已取证并验证的能力（样本见 C:\Users\xiati\AppData\Local\Temp\opencode\aman\）：
 *  - 首页 5 个推荐区块：div.hl-rb-vod > h2.hl-rb-title > a（区块名）+
 *    ul.hl-vod-list > li.hl-list-item 卡片；封面在 a.hl-item-thumb 的 data-original
 *  - 搜索 GET /cata.php?key={kw}（200 直接返回结果页，无 302），
 *    翻页 /cata.php?key={kw}&page={N}（实测与站内链接 /findbook/{kw}/page/N 字节等价）；
 *    maxPage 硬依据 = 页面 `.hl-page-total` 文本「1 / 2页」，备选 `.hl-total` 总数 ÷ 24；
 *    空结果页同样返回 200 + 「共0个筛选结果」+「1 / 0页」+ 空 ul.hl-vod-list
 *  - 分类 GET /bookcata/{分类}/ob/{排序}/st/{进度}，第 N≥2 页追加 /page/{N}；
 *    筛选面板三组与页面一字不差：分类(全部/韩漫/日漫/3D漫画/美女/单本)、
 *    进度(全部/已完结/更新中)、排序(按时间/按阅读)；24 条/页；
 *    maxPage 同样取 `.hl-page-total`（韩漫实测 62 页 / 全部 111 页 / 已完结 79 页），
 *    越界页（page/63、page/999）返回 200 + 0 卡片 + 「63 / 62页」——软边界，
 *    所以绝不能靠 404 探测，必须读页面页数文本（本源因此不需要 maxPage 探测缓存）
 *  - 详情 GET /manhuaview/{id}.html：h1.hl-dc-title 标题、.hl-dc-pic .hl-item-thumb
 *    的 data-original 封面、div.hl-full-box li 信息组（状态/TAG/作者/简介）、
 *    章节容器 ul#hl-plays-list > a.module-play-list-link[href][title]
 *  - 章节 ID 是**随机 token**（如 MYvgUDMaHtbYZqiAufzh，20 位字母数字），
 *    路由 /manhuaview/{comicId}/{token}.html；两次抓取 token 稳定（459392 的 29 话一致）；
 *    章节名必须读 a 的 title 属性（a 的正文被站点截断成「第1话-大难不死，」）
 *  - 章节图片：#m_r_imgbox_0 内 img[data-src][data-index]，明文绝对 URL，
 *    data-index 0..N-1 连续即顺序（三话实测 316/189/215 张全连续无重复），
 *    单页给全、无图片分页、无上下页链接（只有「下一章/章节目录」）；
 *    内联 ComicLoader 仅做 IntersectionObserver 懒加载 + 7 主机镜像轮换
 *    （img/p4/p6/p8/p9/p10/p11.nnpic.xyz），**无加密无解密**，故本源不写解密代码
 *  - 图片防盗链三组对照：封面 thumb.niaopic.com 与正文 img.nnpic.xyz
 *    在 无 Referer / 本站 Referer / 任意他站 Referer 下均 200 且字节一致
 *    （正文首图 40970 字节、FF D8、720x800；封面 23304 字节、RIFF/WEBP、302x403）
 *
 * 权限边界：取证范围内（列表/搜索/详情/章节/图片）全部公开可读，
 * 未发现登录或付费墙；源不实现登录，不做任何登录态伪造。
 * 书架 /bookmark 依赖浏览器本地存储，不纳入本源。
 *
 * 源设置：
 * - base_url：站点域名 **input**（用户可输入任意域名），default https://aman3.org；
 *   读取时 trim → 剥尾斜杠 → /^https?:\/\/[a-z0-9.\-]+(:\d+)?$/i 校验，
 *   非法值回退 default；全部请求、Referer、绝对化 URL 均随 baseUrl getter 走。
 * - 本源无 callback 类型设置。
 */
class AmanComicSource extends ComicSource {
  name = "A漫";
  key = "aman";
  version = "1.0.0";
  minAppVersion = "1.6.0";
  // 动态域名源（域名由用户在设置中输入），入口元数据留空（与 mwwz/dmmpic 同约定）。
  url = "";

  settings = {
    base_url: {
      title: "站点域名",
      type: "input",
      default: "https://aman3.org",
    },
  };

  /**
   * 当前站点域名：优先用户在设置中手动输入的值。
   * input 场景的取值顺序必须是「trim → 剥尾斜杠 → 正则校验 → 非法回退 default」，
   * 若先校验后剥斜杠，`https://aman3.org/` 会被误判为非法值（dmmpic v1.1.0 踩过的坑）。
   */
  get baseUrl() {
    const raw = this.loadSetting("base_url");
    const value = raw ? String(raw).trim().replace(/\/+$/, "") : "";
    if (value && /^https?:\/\/[a-z0-9.\-]+(:\d+)?$/i.test(value)) {
      return value;
    }
    return this.settings.base_url.default;
  }

  siteUa =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  listPageSize = 24; // 分类页/搜索页实测卡片数（2653 条 ÷ 111 页、37 条 = 24 + 13）

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
      Accept: "*/*",
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

  /** 统一网络请求：瞬态错误有限重试一次，5xx 有限重试一次，非 2xx/3xx 抛错。 */
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
      // 搜索 / 分类 / 详情均为 200 直出（取证未见 302）；404（如 /nbook/page/2）不重试。
      if (!status || status < 200 || status >= 400) {
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
   * 从 /manhuaview/459392.html、完整 URL、纯数字、组合形态 aman|459392
   * 中提取漫画 ID；章节路径 /manhuaview/459392/{token}.html 取其中的漫画 ID。
   */
  parseComicId(href) {
    const value = String(href || "").trim();
    if (!value) return null;
    const pathMatch = value.match(/\/manhuaview\/(\d+)(?:\.html)?(?:[\/?#]|$)/);
    if (pathMatch) return pathMatch[1];
    if (/^\d+$/.test(value)) return value;
    // 组合形态（sourceKey|comicId）等无斜杠输入，取末尾数字。
    if (value.indexOf("/") === -1) {
      const cleaned = value.replace(/\.html?$/i, "");
      if (/^\d+$/.test(cleaned)) return cleaned;
      const digits = cleaned.match(/(\d+)\s*$/);
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
   * 章节 token 合法性：站点实测 token 为 20 位字母数字混合（如 MYvgUDMaHtbYZqiAufzh），
   * 这里放宽到 4~64 位但**必须含字母**——这样 "0"、"12345"、详情页 ID "459392"
   * 等非法/错配入参会被判失败并安全返回空图片，而不是发出畸形请求。
   */
  isValidEpToken(value) {
    const token = String(value || "");
    return /^[A-Za-z0-9]{4,64}$/.test(token) && /[A-Za-z]/.test(token);
  }

  /**
   * 章节入参标准化，返回 {cid, token}，兼容历史入参：
   *  MYvgUDMaHtbYZqiAufzh                    纯 token
   *  /manhuaview/459392/MYvgUDMaHtbYZqiAufzh.html   章节链接
   *  https://aman3.org/manhuaview/459392/MYvgUDMaHtbYZqiAufzh.html  完整 URL
   *  459392|MYvgUDMaHtbYZqiAufzh             组合 ID（漫画 ID + token）
   *  {epId/chapterId/id/url}                 对象参数
   *  空值 / 0 / 详情页 URL / 无法识别的值   {cid:null, token:null}（调用方返回空图片）
   */
  parseEp(epId) {
    if (epId === null || epId === undefined || epId === "") return { cid: null, token: null };
    if (typeof epId === "object") {
      return this.parseEp(
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
    if (!value) return { cid: null, token: null };

    // 1) 章节路径（含完整 URL）：/manhuaview/{cid}/{token}.html
    const pathMatch = value.match(/\/manhuaview\/(\d+)\/([^/?#]+?)(?:\.html?)?(?:[?#].*)?$/);
    if (pathMatch && this.isValidEpToken(pathMatch[2])) {
      return { cid: pathMatch[1], token: pathMatch[2] };
    }

    // 2) 组合形态 / 纯 token：按分隔符切段，取最后一段作 token，第一段若为数字则作漫画 ID。
    const parts = value.split(/[|/?#]/);
    const last = String(parts[parts.length - 1] || "").trim().replace(/\.html?$/i, "");
    if (!this.isValidEpToken(last)) return { cid: null, token: null };
    const first = String(parts[0] || "").trim();
    const cid = /^\d+$/.test(first) && first !== "0" ? first : null;
    return { cid, token: last };
  }

  normalizeEpId(epId) {
    return this.parseEp(epId).token;
  }

  // ------------------------------------------------------------ 列表卡片解析

  /** 统一 Comic 构造：列表卡片给出 标题链接/封面/副标题（最新章节或日期）。 */
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
   * 单张卡片解析。结构（首页区块 / 分类页 / 搜索结果页 / 排行页一致）：
   * li.hl-list-item > a.hl-item-thumb[href][title][data-original=封面] +
   *                   div.hl-item-text > div.hl-item-title > a 标题
   *                                       div.hl-item-sub 最新章节或日期
   * 注意：封面在 a 标签的 data-original（无 img 节点），标题读 a 的 title 属性最稳。
   */
  parseCard(card) {
    if (!card) return null;
    const link = card.querySelector("a.hl-item-thumb") || card.querySelector("a[href]");
    if (!link || !link.attributes) return null;
    const href = link.attributes.href || "";
    const id = this.parseComicId(href);
    if (!id) return null;

    let title = link.attributes.title ? String(link.attributes.title).trim() : "";
    if (!title) {
      const titleLink = card.querySelector(".hl-item-title a");
      if (titleLink && titleLink.text) title = String(titleLink.text).trim();
    }
    if (!title) return null;

    const cover = link.attributes["data-original"] || link.attributes.src || "";
    const subEl = card.querySelector(".hl-item-sub");
    const subTitle = subEl && subEl.text ? String(subEl.text).trim() : "";
    return this.buildComic({ url: href, title, cover, subTitle });
  }

  /** 从已解析的文档中取全部列表卡片（分类页 / 搜索页 / 首页区块通用）。 */
  parseCardsFromDoc(doc) {
    const comics = [];
    if (!doc) return comics;
    const cards = doc.querySelectorAll("li.hl-list-item");
    for (const card of cards) {
      const comic = this.parseCard(card);
      if (comic) comics.push(comic);
    }
    return comics;
  }

  /**
   * maxPage 解析（真实依据，非 page+1 猜测）：
   *  1) 首选 `.hl-page-total` 文本「{当前} / {总}页」——分类页与搜索页每页都带；
   *  2) 备选 `.hl-total` 总结果数 ÷ 24 向上取整；
   *  3) 两者都没有 = 该页确实没有分页控件（实测 /nbook、/booktop 单页 96 卡、
   *     /nbook/page/2 为 404）→ 返回 1，**绝不拿请求页码当 maxPage**（那等于 page+1 猜）。
   * 越界页会返回「63 / 62页」（当前页>总页），因此只认「/」之后的总页数。
   */
  parseMaxPage(doc) {
    const pageEl = doc.querySelector(".hl-page-total");
    if (pageEl && pageEl.text) {
      const text = String(pageEl.text).replace(/\u00a0/g, " ");
      const match = text.match(/\/\s*(\d+)\s*页/);
      if (match) {
        const total = parseInt(match[1], 10);
        if (!Number.isNaN(total) && total >= 1) return total;
      }
    }
    const totalEl = doc.querySelector(".hl-total");
    if (totalEl && totalEl.text) {
      const total = parseInt(String(totalEl.text).replace(/[^\d]/g, ""), 10);
      if (!Number.isNaN(total) && total > 0) {
        return Math.max(1, Math.ceil(total / this.listPageSize));
      }
    }
    return 1;
  }

  /**
   * 取列表页并解析 {comics, maxPage}：单次请求同时拿到卡片与页数文本，
   * HtmlDocument 用完立即 dispose（分类与搜索共用）。
   */
  async fetchList(url, referer) {
    const html = await this.getText(url, referer);
    const doc = new HtmlDocument(html);
    try {
      return {
        comics: this.parseCardsFromDoc(doc),
        maxPage: this.parseMaxPage(doc),
      };
    } finally {
      doc.dispose();
    }
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
          // 首页 5 个区块 div.hl-rb-vod，区块名取 h2.hl-rb-title 内 a 的文本
          // （热门漫画 / 最新更新 / 站长推荐 / 新上架漫画 / 已完结漫画）。
          const boxes = doc.querySelectorAll("div.hl-rb-vod");
          for (const box of boxes) {
            const head = box.querySelector("h2.hl-rb-title a");
            if (!head || !head.text) continue;
            const title = String(head.text).trim();
            if (!title || result[title]) continue;
            const cards = box.querySelectorAll("li.hl-list-item");
            const comics = [];
            for (const card of cards) {
              const comic = this.parseCard(card);
              if (comic) comics.push(comic);
            }
            if (comics.length > 0) result[title] = comics;
          }
          return result;
        } catch (e) {
          console.error("A漫首页解析失败：", e);
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
    // 与站点导航栏对齐：导航「分类」= /bookcata 筛选面板（分类组 6 项，名称与页面一字不差），
    // 导航「最新」= /nbook、「排行」= /booktop（两页实测 96 卡、无分页控件、
    // /nbook/page/2 实测 404 → maxPage 恒为 1，有真实依据）。
    parts: [
      {
        name: "分类",
        type: "fixed",
        categories: ["全部", "韩漫", "日漫", "3D漫画", "美女", "单本"],
        itemType: "category",
        categoryParams: ["cata|all", "cata|韩漫", "cata|日漫", "cata|3D漫画", "cata|美女", "cata|单本"],
      },
      {
        name: "列表",
        type: "fixed",
        categories: ["最新", "排行"],
        itemType: "category",
        categoryParams: ["list|nbook", "list|booktop"],
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const raw = String(param || "").trim();
      const safePage = this.num(page, 1);
      if (!raw) return { comics: [], maxPage: Math.max(1, safePage) };
      if (safePage < 1) return { comics: [], maxPage: 1 };
      const seg = raw.split("|");
      const kind = seg[0];
      const value = String(seg[1] || "").trim();
      const opts = Array.isArray(options) ? options : [];
      try {
        let url;
        if (kind === "list") {
          // 导航列表页：/nbook、/booktop（单页，无分页参数——page/2 实测 404）。
          url = `${this.baseUrl}/${value}`;
        } else {
          // 筛选面板路由：/bookcata/{分类}/ob/{排序}/st/{进度}，第 N≥2 页追加 /page/{N}。
          const ob = String(opts[1] || "time").trim() || "time";
          const st = String(opts[0] || "all").trim() || "all";
          const cat = value || "all";
          url =
            `${this.baseUrl}/bookcata/${encodeURIComponent(cat)}` +
            `/ob/${encodeURIComponent(ob)}/st/${encodeURIComponent(st)}`;
          if (safePage > 1) url += `/page/${safePage}`;
        }
        return await this.fetchList(url, this.baseUrl + "/");
      } catch (e) {
        console.error(`A漫分类「${category}」加载失败：`, e);
        return { comics: [], maxPage: safePage };
      }
    },
    // 选项文本与站点筛选面板完全一致（进度组 / 排序组）；
    // 这两组只对「分类」组有意义，列表页隐藏（notShowWhen）。
    optionList: [
      {
        label: "进度",
        type: "select",
        notShowWhen: ["列表"],
        options: ["all-全部", "completed-已完结", "serialized-更新中"],
      },
      {
        label: "排序",
        type: "select",
        notShowWhen: ["列表"],
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
      if (safePage < 1) return { comics: [], maxPage: 1 };
      try {
        // 表单真值：method=get、action=/cata.php、字段 name=key（书名与作者共用一个输入框）。
        // 第 1 页 /cata.php?key={kw}；第 N≥2 页追加 &page={N}
        // （实测与站内翻页链接 /findbook/{kw}/page/{N} 返回字节完全一致）。
        let url = `${this.baseUrl}/cata.php?key=${encodeURIComponent(kw)}`;
        if (safePage > 1) url += `&page=${safePage}`;
        return await this.fetchList(url, this.baseUrl + "/");
      } catch (e) {
        console.error("A漫搜索失败：", e);
        return { comics: [], maxPage: safePage };
      }
    },
    optionList: [],
  };

  // ------------------------------------------------------------ 详情与章节

  comic = {
    loadInfo: async (id) => {
      const comicId = this.normalizeComicId(id);
      if (!comicId) throw new Error(`无效的漫画 ID：${id}`);
      const html = await this.getText(
        `${this.baseUrl}/manhuaview/${comicId}.html`,
        this.baseUrl + "/"
      );
      const doc = new HtmlDocument(html);
      try {
        const titleEl = doc.querySelector("h1.hl-dc-title");
        const title = titleEl && titleEl.text ? String(titleEl.text).trim() : "";
        if (!title) throw new Error("详情页标题缺失或页面结构未匹配");

        // 封面：div.hl-dc-pic 内 span.hl-item-thumb[data-original]（无 img 节点）。
        const coverEl = doc.querySelector(".hl-dc-pic .hl-item-thumb");
        const cover = coverEl && coverEl.attributes
          ? coverEl.attributes["data-original"] || coverEl.attributes.src || ""
          : "";

        // 信息组：div.hl-full-box > ul > li，每行 em 作标签、span/a 作值。
        let statusText = "";
        let updateTime = "";
        let author = "";
        let intro = "";
        let category = "";
        const tagList = [];
        const items = doc.querySelectorAll(".hl-full-box > ul > li");
        for (const li of items) {
          const em = li.querySelector("em");
          const label = em && em.text ? String(em.text).replace(/[：:]\s*$/, "").trim() : "";
          const raw = li.text ? String(li.text) : "";
          if (!label) continue;
          if (label === "状态") {
            const span = li.querySelector("span");
            const value = span && span.text ? String(span.text).trim() : raw.replace(/^状态：/, "").trim();
            const parts = value.split(/\s+/).filter((x) => x);
            if (parts.length) {
              statusText = parts[0];
              if (parts.length > 1) updateTime = parts.slice(1).join(" ");
            }
          } else if (label === "作者") {
            const a = li.querySelector("a");
            author = a && a.text ? String(a.text).trim() : raw.replace(/^作者：/, "").trim();
          } else if (label === "简介") {
            // li.blurb 的 textContent 形如「\r\n\t\t简介：\r\n\t\t正文…\t\t」，
            // 前导空白会让 ^简介： 失配，必须先允许前导空白再剥标签与冒号。
            intro = raw.replace(/^\s*简介\s*[：:]\s*/, "").trim();
          } else if (label === "TAG") {
            // TAG 行里 /bookcata/{x} 是分类，/findbook/{x} 是标签（作者行也是 findbook，
            // 但作者在独立的 li 中，按行分组不会串）。
            const links = li.querySelectorAll("a[href]");
            for (const a of links) {
              const href = a.attributes ? a.attributes.href || "" : "";
              const text = a.text ? String(a.text).trim() : "";
              if (!text) continue;
              if (href.indexOf("/bookcata/") === 0) {
                if (!category) category = text;
              } else if (href.indexOf("/findbook/") === 0) {
                tagList.push(text);
              }
            }
          }
        }

        // 章节：ul#hl-plays-list > a.module-play-list-link；
        // 章节名读 title 属性（a 的正文被站点截断），并剥掉「{标题}-」前缀。
        const links = doc.querySelectorAll("a.module-play-list-link");
        const chapters = new Map();
        for (const a of links) {
          if (!a.attributes) continue;
          const ep = this.parseEp(a.attributes.href || "");
          if (!ep.token) continue;
          let name = "";
          if (a.attributes.title) {
            name = String(a.attributes.title).trim();
            const prefix = title + "-";
            if (name.indexOf(prefix) === 0) name = name.slice(prefix.length).trim();
          }
          if (!name && a.text) name = String(a.text).trim();
          if (name) chapters.set(ep.token, name);
        }
        if (!chapters.size) throw new Error("详情页章节列表为空");

        const tags = [];
        if (category) tags.push(category);
        for (const t of tagList) if (tags.indexOf(t) === -1) tags.push(t);
        if (statusText) tags.push(statusText);

        // 状态同时写入 status 字段与 tags，任一被客户端采用都能看到。
        const tagMap = {};
        if (category) tagMap["分类"] = [category];
        if (tagList.length) tagMap["标签"] = tagList;
        if (statusText) tagMap["状态"] = [statusText];

        const coverUrl = this.absoluteUrl(cover);
        return new ComicDetails({
          title,
          subTitle: author,
          cover: coverUrl,
          tags: tagMap,
          status: statusText,
          description: intro,
          updateTime,
          chapters,
          comic: new Comic({
            id: comicId,
            title,
            subTitle: author,
            cover: coverUrl,
            tags,
            sourceKey: this.key,
          }),
          sourceKey: this.key,
        });
      } finally {
        doc.dispose();
      }
    },

    /**
     * 章节图片加载：
     * - 路由 /manhuaview/{comicId}/{token}.html，单次请求给全全部图片（取证无图片分页、
     *   无「下一页」图片链接，只有页脚「下一章/章节目录」）；
     * - 正文图 = #m_r_imgbox_0 内 img[data-src][data-index]，明文绝对 URL，
     *   data-index 即顺序；回退选择器 img[data-index][data-src]（同为正文图特征）；
     * - 跨页/重复按 URL 去重保序；
     * - 入参不一致（epId 内嵌的漫画 ID ≠ 传入 comicId）直接拒绝并返回空，不发请求；
     * - 图片无防盗链，但仍带 UA + 本站详情页 Referer（防御性）。
     */
    loadEp: async (comicId, epId) => {
      const ep = this.parseEp(epId);
      const cidParam = this.normalizeComicId(comicId);
      if (!ep.token || (!ep.cid && !cidParam)) return { images: [] };
      if (ep.cid && cidParam && ep.cid !== cidParam) return { images: [] };
      const cid = cidParam || ep.cid;
      const referer = `${this.baseUrl}/manhuaview/${cid}.html`;
      try {
        const url = `${this.baseUrl}/manhuaview/${cid}/${encodeURIComponent(ep.token)}.html`;
        const html = await this.getText(url, referer);
        const doc = new HtmlDocument(html);
        try {
          const box = doc.querySelector("#m_r_imgbox_0") || doc;
          const nodes = box.querySelectorAll("img[data-src][data-index]");
          const images = [];
          const seen = new Set();
          for (const node of nodes) {
            if (!node.attributes) continue;
            const abs = this.absoluteUrl(node.attributes["data-src"] || node.attributes.src || "");
            if (abs && !seen.has(abs)) {
              seen.add(abs);
              images.push(abs);
            }
          }
          if (!images.length) {
            // 主容器缺失时的回退：全页正文图特征选择器（data-index 为正文图专属）。
            const fallback = doc.querySelectorAll("img[data-src][data-index]");
            for (const node of fallback) {
              if (!node.attributes) continue;
              const abs = this.absoluteUrl(node.attributes["data-src"] || "");
              if (abs && !seen.has(abs)) {
                seen.add(abs);
                images.push(abs);
              }
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
        console.error(`A漫章节 ${ep.token} 图片加载失败：`, e);
        return { images: [] };
      }
    },
  };
}
