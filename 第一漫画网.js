/** @type {import('./_venera_.js')} */
/**
 * 第一漫画网 Venera 漫画源 v1.1.0
 *
 * 入口说明：用户提供的 https://dmmpic.com/ 是第一漫画网当前可用域名之一，
 * 页面红字「请截图收藏网址」列出全部镜像：dmmtu.com、dmmpic.com、dymmt.com、
 * kkmnt.com、mmxzt.com、xsjav.com。v1.1.0 起提供「站点域名」设置项在 6 个镜像
 * 间切换（实测 5 个同构可达；kkmnt.com 于 2026-10-05 两次连接失败）。
 *
 * 站点性质：帝国 CMS（EmpireCMS）模板站（/template/hm8/），服务端渲染静态 HTML，
 * 无前端框架、无加密接口、无登录墙（取证范围内全部公开可读）。
 *
 * 已取证并验证的能力：
 *  - 首页 5 个推荐区块（.mip-box > h3 标题 + ul.mip-xs-item-list 卡片）
 *  - 分类 10 项与导航栏完全对齐（顺序同导航）：更新 update / 完结 finish /
 *    排行 ranking / 韩漫 hanman / 日漫 riman / 3D 3d / 同人誌 tongren /
 *    单行本 danben / 短篇 short / 其他 qita；
 *    第 1 页 /{ch}/、第 N 页 /{ch}/index_N.html，30 条/页
 *  - 频道越界页返回 404（实测 index_500/index_999=404、index_100=200），
 *    页面无总数无尾页 → maxPage 由「串行阶梯短路 + 单点二分」探测 404 边界得到
 *    （200 边界页 5~8ms、404 越界页 673~2120ms，故不用并发等分）
 *  - 搜索 GET /e/search/index.php?searchget=1&show=title|writer&keyboard=... →
 *    302 → 静态结果页 /so/{id}.html（Venera dio 网络层默认跟随重定向）；
 *    翻页 /so/{id}_{P-1}.html（P≥2，_1=第 2 页 _2=第 3 页）；
 *    结果页含「尾页」链接 → maxPage = 尾页序号 + 1；20 条/页；
 *    无结果时返回「没有搜索到相关的内容」提示页
 *  - 详情 GET /book/{id}.html：主信息（标题/封面/作者/分类/更新时间/简介，
 *    无状态无标签字段）+ 两个 ul.bookAll-item-list（第 1 个=最新 8 话倒序、
 *    第 2 个「{标题}目录列表」= 全量话数正序，取第 2 个）
 *  - 章节分页（v1.1.0 关键能力）：图片不止一页时按「下一页」链接分页——
 *    第 1 页 /chapter/{id}.html、第 P 页 /chapter/{id}_{P}.html；
 *    实测 /chapter/262546.html 共 6 页（11×5+12=67 张），尾页无「下一页」链接；
 *    越界分页（_99 等）返回尾页克隆 200（软边界），因此必须纯链式跟随 href、
 *    按链接文字「下一页」判定（「上一页」href 同为 chapter_{N}.html 不可按 class 区分）；
 *    单页章节（如 262547，27 张）无「下一页」→ 单请求
 *  - 图片 https://img1.du8.in/...（webp）与站内封面 /d/file/titlepic/...，
 *    实测无防盗链：无 Referer / 本站 Referer / 任意 Referer 均 200 + RIFF/WEBP；
 *    部分作品走 img5.qy0.ru?verify={签名}（同样 200）
 *  - 章节页 /api/vol/{chapterId}/{bookId} 仅返回上一话/下一话跳转 JS，
 *    与图片加载无关
 *
 * 权限边界：取证范围内（列表/详情/章节/图片/搜索）全部公开可读，
 * 未发现登录或付费墙；源不实现登录，不做任何登录态伪造。
 *
 * 源设置：
 * - base_url：站点域名 select，6 个镜像一键切换（value 为完整 origin）；
 *   所有请求、Referer、绝对化与缓存键均随 baseUrl getter 自动跟随。
 * - 本源无 callback 类型设置。
 */
class DmmpicComicSource extends ComicSource {
  name = "第一漫画网";
  key = "dmmpic";
  version = "1.1.0";
  minAppVersion = "1.6.0";
  // 动态域名源（可切换镜像），入口元数据留空（与 mwwz 同约定）。
  url = "";

  settings = {
    base_url: {
      title: "站点域名",
      type: "select",
      // 站点首页红字「请截图收藏网址」全集；2026-10-05 实测除 kkmnt 外均可达同构。
      options: [
        { value: "https://dmmpic.com", text: "dmmpic.com（默认）" },
        { value: "https://dmmtu.com", text: "dmmtu.com" },
        { value: "https://dymmt.com", text: "dymmt.com" },
        { value: "https://kkmnt.com", text: "kkmnt.com" },
        { value: "https://mmxzt.com", text: "mmxzt.com" },
        { value: "https://xsjav.com", text: "xsjav.com" },
      ],
      default: "https://dmmpic.com",
    },
  };

  /**
   * 当前站点域名：优先用户在设置中选择的镜像，值必须是合法 origin
   * （防御异常写入），否则回退默认域名；结尾斜杠会被剥除。
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

  listPageSize = 30; // 频道列表页实测卡片数
  searchPageSize = 20; // 搜索结果页实测卡片数

  // 频道 maxPage 探测缓存（key=站点域名|频道路径，切换镜像后互不污染）。
  maxPageCache = {};
  // 搜索结果页 {id, maxPage} 缓存（key=站点域名|字段|关键词），翻页复用避免重复搜索。
  searchCache = {};

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
      // 搜索入口会 302 到 /so/{id}.html，Venera dio 默认跟随重定向，
      // 跟随后为 200；若客户端不跟随则此处为 302 且 body 为空，自然落入空响应抛错。
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

  /**
   * 探测专用：GET 指定页并返回 200/404。
   * 404 是频道越界页的真实边界（实测），必须与普通请求分开处理——
   * 普通 request 对 4xx 直接抛错，而探测需要拿到 404 这个结果值。
   * 其他状态码（5xx 重试后仍存在 / 异常状态）抛错，避免瞬态错误误缩边界。
   */
  async probeStatus(url) {
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try {
        res = await Network.sendRequest("GET", url, this.baseHeaders(this.baseUrl + "/"), null);
      } catch (e) {
        res = { error: String(e) };
      }
      if (res && res.error) {
        lastError = String(res.error);
        if (this.isTransientError(lastError) && attempt === 0) {
          await this.sleep(400);
          continue;
        }
        throw new Error(`边界探测失败：${lastError}（${url}）`);
      }
      const status = Number(res && res.status);
      if (status === 404) return 404;
      if (status === 200) return 200;
      if (status >= 500 && attempt === 0) {
        await this.sleep(400);
        continue;
      }
      throw new Error(`边界探测异常 HTTP ${status}（${url}）`);
    }
    throw new Error(`边界探测失败：${lastError}（${url}）`);
  }

  // ------------------------------------------------------------ ID 标准化

  /**
   * 从 /book/5913.html、https://dmmpic.com/book/5913.html、纯数字、
   * 组合形态 dmmpic|5913 中提取漫画 ID；章节路径不误配。
   */
  parseComicId(href) {
    const value = String(href || "").trim();
    if (!value) return null;
    const match = value.match(/\/book\/(\d+)(?:\.html|\/|\?|$)/);
    if (match) return match[1];
    if (/^\d+$/.test(value)) return value;
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
   * 章节 ID 标准化，兼容历史入参：
   *  262547                        普通章节 ID
   *  /chapter/262547.html          章节链接
   *  https://dmmpic.com/chapter/262547.html  完整章节 URL
   *  5913|262547                   组合 ID（取最后一段）
   *  {epId/chapterId/id/url}       对象参数
   *  其他无法识别的值返回 null，由调用方安全返回空图片。
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
    // 分页 URL /chapter/{id}_{P}.html 归一到章节 id（页号不是章节号）。
    const pathMatch = value.match(/\/chapter\/(\d+)(?:_\d+)?(?:\.html|\/|\?|$)/);
    if (pathMatch) return pathMatch[1];
    const parts = value.split(/[|/?#]/);
    let last = parts[parts.length - 1].trim();
    last = last.replace(/\.html?$/i, "").replace(/_\d+$/, "");
    if (/^\d+$/.test(last)) return last === "0" ? null : last;
    const digits = last.match(/(\d+)$/);
    if (digits && digits[1] !== "0") return digits[1];
    return null;
  }

  // ------------------------------------------------------------ 列表卡片解析

  /** 统一 Comic 构造：站点列表卡片只有 标题链接/封面/作者。 */
  buildComic(item) {
    if (!item) return null;
    const id = this.parseComicId(item.url || item.href || "");
    if (!id) return null;
    return new Comic({
      id,
      title: String(item.title || "未知漫画").trim(),
      subTitle: String(item.author || "").trim(),
      cover: this.absoluteUrl(item.cover || ""),
      tags: Array.isArray(item.tags) ? item.tags : [],
      sourceKey: this.key,
    });
  }

  /**
   * 单张卡片解析。结构（频道页/搜索页/首页区块一致）：
   * .mipui-xs-item-list > .item-media(a > img|mip-img 封面) +
   *                      .item-content(h4.list-title > a 标题、p.info > span > a 作者)
   */
  parseCard(card) {
    const link =
      card.querySelector(".list-title a") ||
      card.querySelector(".item-link") ||
      card.querySelector("a[href]");
    if (!link || !link.attributes) return null;
    const href = link.attributes.href || "";
    const id = this.parseComicId(href);
    if (!id) return null;
    let title = link.text ? String(link.text).trim() : "";
    if (!title && link.attributes.title) title = String(link.attributes.title).trim();
    if (!title) return null;

    let cover = "";
    const coverEl = card.querySelector(".item-media img") || card.querySelector(".item-media mip-img");
    if (coverEl && coverEl.attributes) {
      cover = coverEl.attributes["data-src"] || coverEl.attributes.src || "";
    }

    // 作者：p.info 内第一个 span 是作者链接，第二个 span.pull-right 是 日期+状态（丢弃）。
    let author = "";
    const info = card.querySelector(".info");
    if (info) {
      const spans = info.querySelectorAll("span");
      if (spans.length) {
        const a = spans[0].querySelector("a");
        if (a && a.text) author = String(a.text).trim();
      }
    }

    return this.buildComic({ url: href, title, cover, author });
  }

  /** 解析整页 HTML 中全部列表卡片（分类页 / 搜索结果页通用）。 */
  parseCards(html) {
    const doc = new HtmlDocument(html);
    try {
      const cards = doc.querySelectorAll(".mipui-xs-item-list");
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
          const boxes = doc.querySelectorAll(".mip-box");
          for (const box of boxes) {
            const h3 = box.querySelector("h3");
            if (!h3 || !h3.text) continue;
            // 区块标题形如「韩国漫画更多>>」，去掉尾部「更多>>」。
            const title = String(h3.text).replace(/更多\s*>>+\s*$/, "").trim();
            if (!title) continue;
            const cards = box.querySelectorAll(".mipui-xs-item-list");
            const comics = [];
            for (const card of cards) {
              const comic = this.parseCard(card);
              if (comic) comics.push(comic);
            }
            if (comics.length > 0 && !result[title]) result[title] = comics;
          }
          return result;
        } catch (e) {
          console.error("第一漫画网首页解析失败：", e);
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
    // 站点没有统一筛选页（无状态/题材/地区筛选），分类即频道列表：
    // 10 项与站点导航栏完全对齐（显示名与顺序均同导航截图），无 optionList。
    parts: [
      {
        name: "分类",
        type: "fixed",
        categories: ["更新", "完结", "排行", "韩漫", "日漫", "3D", "同人誌", "单行本", "短篇", "其他"],
        itemType: "category",
        categoryParams: [
          "update",
          "finish",
          "ranking",
          "hanman",
          "riman",
          "3d",
          "tongren",
          "danben",
          "short",
          "qita",
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
      try {
        const url =
          safePage <= 1
            ? `${this.baseUrl}/${path}/`
            : `${this.baseUrl}/${path}/index_${safePage}.html`;
        // 目标页与 maxPage 边界探测并行；maxPage 只在首次进入频道时探测并缓存。
        const [html, maxPage] = await Promise.all([
          this.getText(url, this.baseUrl + "/"),
          this.detectMaxPage(path),
        ]);
        return { comics: this.parseCards(html), maxPage };
      } catch (e) {
        console.error(`第一漫画网分类「${category}」加载失败：`, e);
        return { comics: [], maxPage: safePage };
      }
    },
  };

  /**
   * 频道 maxPage 探测（真实依据：越界页 404）。
   * 页面只有 1..5 的分页窗口，无尾页无总数（实测），因此：
   *  1) 串行阶梯 [64, 512, 4096] 短路定位「最大存在页 lo / 最小 404 页 hi」区间；
   *  2) 在 (lo, hi] 内单点二分收敛（404 边界响应慢，见实现处注释），直到 hi = lo + 1；
   *  3) lo 即末页，写入缓存，后续翻页零开销。
   * 探测请求异常（非 200/404、重试后仍失败）直接抛错，避免瞬态错误误缩边界。
   * 量级实测：hanman ∈ (175, 200]、ranking < 64、3d/danben ∈ (64, 128]、
   * update ∈ (128, 256]、riman/tongren/qita/finish ≥ 256。
   */
  async detectMaxPage(path) {
    // 缓存键带站点域名：切换镜像后互不污染。
    const cacheKey = this.baseUrl + "|" + String(path || "");
    if (this.maxPageCache[cacheKey] != null) return this.maxPageCache[cacheKey];

    const p = String(path || "");
    const urlOf = (n) =>
      n <= 1 ? `${this.baseUrl}/${p}/` : `${this.baseUrl}/${p}/index_${n}.html`;

    // 第一轮：串行阶梯自下而上短路（404 响应慢，第一个 404 即为 hi，后续不再发）。
    // 量级实测 hanman ∈ (64, 512]、ranking < 64、update ∈ (128, 256]。
    let lo = 1;
    let hi = null;
    for (const n of [64, 512, 4096]) {
      const status = await this.probeStatus(urlOf(n));
      if (status === 200) lo = n;
      else {
        hi = n;
        break;
      }
    }
    if (hi === null) {
      // 4096 仍存在时再扩一轮（防御，全站量级远小于 65536 页）。
      for (const n of [16384, 65536]) {
        const status = await this.probeStatus(urlOf(n));
        if (status === 200) lo = n;
        else {
          hi = n;
          break;
        }
      }
    }
    if (hi === null) {
      throw new Error(`频道 ${p} 边界探测失败：65536 页仍存在`);
    }

    // 单点二分收敛。不采用并发等分：实测 200 边界页 5~8ms、404 越界页
    // 673~2120ms（不存在页由 CMS 动态处理），并发轮的延迟被最慢的 404 主导，
    // 反而慢于"部分步命中 200 快速路径"的单点二分。
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const status = await this.probeStatus(urlOf(mid));
      if (status === 404) hi = mid;
      else lo = mid;
    }
    this.maxPageCache[cacheKey] = lo;
    return lo;
  }

  // ------------------------------------------------------------ 搜索

  search = {
    load: async (keyword, options, page) => {
      const kw = String(keyword || "").trim();
      const safePage = this.num(page, 1);
      if (!kw) return { comics: [], maxPage: safePage };
      const opts = Array.isArray(options) ? options : [];
      const field = opts[0] === "writer" ? "writer" : "title";
      const cacheKey = this.baseUrl + "|" + field + "|" + kw;
      try {
        let entry = this.searchCache[cacheKey];
        let firstHtml = null;
        // 第 1 页总是重新搜索（结果可能更新）；第 ≥2 页无缓存时先搜索拿 id。
        if (safePage <= 1 || !entry) {
          const searchUrl =
            `${this.baseUrl}/e/search/index.php?searchget=1&show=${field}` +
            `&keyboard=${encodeURIComponent(kw)}`;
          // GET → 302 → /so/{id}.html，dio 跟随后 body 即结果页。
          firstHtml = await this.getText(searchUrl, this.baseUrl + "/");
          entry = this.parseSearchEntry(firstHtml);
          this.searchCache[cacheKey] = entry;
        }
        if (safePage <= 1) {
          return {
            comics: entry ? this.parseCards(firstHtml) : [],
            maxPage: entry ? entry.maxPage : 1,
          };
        }
        // 翻页：/so/{id}_{P-1}.html（P≥2；实测 _1=第 2 页、_2=第 3 页）。
        if (!entry || !entry.id) return { comics: [], maxPage: 1 };
        const pageHtml = await this.getText(
          `${this.baseUrl}/so/${entry.id}_${safePage - 1}.html`,
          this.baseUrl + "/"
        );
        return { comics: this.parseCards(pageHtml), maxPage: entry.maxPage };
      } catch (e) {
        console.error("第一漫画网搜索失败：", e);
        return { comics: [], maxPage: safePage };
      }
    },
    optionList: [
      {
        label: "字段",
        type: "select",
        // 站点搜索表单 select 真值：title=漫画（标题）、writer=作者。
        options: ["title-漫画", "writer-作者"],
      },
    ],
  };

  /**
   * 从搜索结果页提取 {id, maxPage}。
   * - 空结果页（含「没有搜索到相关的内容」）→ null；
   * - 有翻页时从 /so/{id}_N.html 链接提取 id，「尾页」链接给出末页序号
   *   （尾页 _k 对应第 k+1 页）→ maxPage = k + 1；
   * - 仅 1 页时结果页无任何 /so/ 链接 → id=null、maxPage=1（翻页不会发生）。
   */
  parseSearchEntry(html) {
    if (String(html || "").indexOf("没有搜索到相关的内容") >= 0) return null;
    const value = String(html || "");
    const pageLink = value.match(/href="\/so\/(\d+)_(\d+)\.html"/);
    if (pageLink) {
      const id = pageLink[1];
      let maxPage = 0;
      const tail = value.match(/href="\/so\/\d+_(\d+)\.html"[^>]*>尾页</);
      if (tail) {
        maxPage = Number(tail[1]) + 1;
      } else {
        // 无尾页链接（窗口截断）时取可见翻页序号最大值 + 1。
        const re = /\/so\/\d+_(\d+)\.html/g;
        let m;
        while ((m = re.exec(value)) !== null) {
          maxPage = Math.max(maxPage, Number(m[1]) + 1);
        }
      }
      return { id, maxPage: Math.max(2, maxPage) };
    }
    return { id: null, maxPage: 1 };
  }

  // ------------------------------------------------------------ 详情与章节

  comic = {
    loadInfo: async (id) => {
      const comicId = this.normalizeComicId(id);
      if (!comicId) throw new Error(`无效的漫画 ID：${id}`);
      const html = await this.getText(
        `${this.baseUrl}/book/${comicId}.html`,
        this.baseUrl + "/"
      );
      const doc = new HtmlDocument(html);
      try {
        // 主信息：.book-top > .left(封面) + .right(h1/分类/作者/更新/简介)
        const right = doc.querySelector(".book-top .right");
        if (!right) throw new Error("详情页主信息结构未匹配");
        const h1 = right.querySelector("h1");
        const title = h1 && h1.text ? String(h1.text).trim() : "";
        if (!title) throw new Error("详情页标题缺失");

        const left = doc.querySelector(".book-top .left");
        const coverEl = left ? left.querySelector("img") : null;
        const cover = coverEl && coverEl.attributes ? coverEl.attributes.src || "" : "";

        // 分类：第一个 p 形如「分类：韩国漫画 最新章节：…」，取其第一个 span。
        let category = "";
        const ps = right.querySelectorAll("p");
        for (const p of ps) {
          const text = p.text ? String(p.text) : "";
          if (text.indexOf("分类：") === 0 || text.indexOf("分类:") === 0) {
            const span = p.querySelector("span");
            if (span && span.text) category = String(span.text).trim();
            break;
          }
        }

        // 简介：p.hidden-xs
        const descEl = right.querySelector("p.hidden-xs");
        const description = descEl && descEl.text ? String(descEl.text).trim() : "";

        // 作者 / 更新时间：.right 下的 div 文本前缀匹配。
        let author = "";
        let updateTime = "";
        const divs = right.querySelectorAll("div");
        for (const div of divs) {
          const text = div.text ? String(div.text) : "";
          if (text.indexOf("作者：") === 0) {
            const a = div.querySelector("a");
            author = a && a.text
              ? String(a.text).trim()
              : text.replace(/^作者：/, "").trim();
          } else if (text.indexOf("更新：") === 0) {
            const span = div.querySelector("span");
            if (span && span.text) updateTime = String(span.text).trim();
          }
        }

        // 章节：两个 ul.bookAll-item-list 时取第 2 个（「{标题}目录列表」全量正序），
        // 仅 1 个时（话数 ≤8，两区内容一致）取第 1 个。
        const uls = doc.querySelectorAll("ul.bookAll-item-list");
        if (!uls.length) throw new Error("详情页未找到章节列表");
        const target = uls.length >= 2 ? uls[1] : uls[0];
        const chapters = new Map();
        const items = target.querySelectorAll("li");
        for (const li of items) {
          const a = li.querySelector("a[href]");
          if (!a || !a.attributes) continue;
          const epId = this.normalizeEpId(a.attributes.href || "");
          if (!epId) continue;
          let name = a.text ? String(a.text).trim() : "";
          if (!name && a.attributes.title) name = String(a.attributes.title).trim();
          if (name) chapters.set(epId, name);
        }
        if (!chapters.size) throw new Error("章节列表为空");

        const tags = category ? [category] : [];
        return new ComicDetails({
          title,
          subTitle: author,
          cover: this.absoluteUrl(cover),
          tags: category ? { 分类: [category] } : {},
          chapters,
          description,
          updateTime,
          comic: new Comic({
            id: comicId,
            title,
            subTitle: author,
            cover: this.absoluteUrl(cover),
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
     * 章节图片加载（v1.1.0 起支持多页章节）：
     * - 第 1 页 /chapter/{id}.html；有「下一页」时按其 href 链式跟随
     *   （第 P 页 /chapter/{id}_{P}.html），直到尾页无「下一页」为止；
     * - 越界分页返回尾页克隆 200（软边界），因此绝不满页号推算、只认真实 href；
     * - 「上一页」的 href 同为 chapter_{N}.html 且 class 相同，必须按链接文字区分；
     * - 全部页图片按出现顺序合并、跨页去重，hops 硬上限 100 页防模板异常循环；
     * - 单页章节（无「下一页」）保持单请求。
     */
    loadEp: async (comicId, epId) => {
      const epIdNorm = this.normalizeEpId(epId);
      if (!epIdNorm) return { images: [] };
      const cid = this.normalizeComicId(comicId);
      const referer = cid ? `${this.baseUrl}/book/${cid}.html` : this.baseUrl + "/";
      try {
        const images = [];
        const seen = new Set();
        let url = `${this.baseUrl}/chapter/${epIdNorm}.html`;
        let hops = 0;
        while (url && hops < 100) {
          hops++;
          const html = await this.getText(url, referer);
          const doc = new HtmlDocument(html);
          let next = null;
          try {
            const nodes = doc.querySelectorAll("img.comic_img");
            for (const node of nodes) {
              if (!node.attributes) continue;
              const raw = node.attributes["data-original"] || node.attributes.src || "";
              const abs = this.absoluteUrl(raw);
              if (abs && !seen.has(abs)) {
                seen.add(abs);
                images.push(abs);
              }
            }
            // 「下一页」按链接文字精确匹配 + href 必须属于本章节的分页链。
            const anchors = doc.querySelectorAll("a[href]");
            for (const a of anchors) {
              if (!a.attributes) continue;
              const text = a.text ? String(a.text).trim() : "";
              const href = a.attributes.href || "";
              if (text === "下一页" && new RegExp(`/${epIdNorm}_\\d+\\.html`).test(href)) {
                next = this.absoluteUrl(href);
                break;
              }
            }
          } finally {
            doc.dispose();
          }
          url = next;
        }
        return {
          images,
          headers: {
            "User-Agent": this.siteUa,
            Referer: referer,
          },
        };
      } catch (e) {
        console.error(`第一漫画网章节 ${epIdNorm} 图片加载失败：`, e);
        return { images: [] };
      }
    },
  };
}
