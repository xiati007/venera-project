/** @type {import('./_venera_.js')} */
/**
 * 开心看漫画 Venera 漫画源 v1.2.0
 *
 * 入口说明：用户提供的 https://kxkmh.xyz/ 是「最新地址发布页」（title
 * 「开心看漫画 - 最新地址发布」），页面只列出两个实际站域名
 * https://kxmanhua.com（默认）与 https://kxmanhua1.com（备用）。
 * 本源以 kxmanhua.com 为默认请求地址，并提供「站点域名」select 设置切换。
 *
 * 站点性质：Cloudflare 前置的**服务端静态渲染 HTML 站**（非 SPA/接口渲染）——
 * 首页约 48.4KB（2026-10-05 实测 48370 字节，随推荐位内容小幅浮动）、卡片直接
 * 写在 HTML 里；全站只有 1 个外部脚本（Google
 * gtag）与 2 段内联脚本（埋点 + 阅读记录 localStorage 读取），无 Vue/React/
 * NUXT、无 /api/ 业务接口、无 eval/decrypt 逻辑，故源只做 HTML 解析。
 *
 * 已取证并验证的能力（2026-10-05，kxmanhua.com / kxmanhua1.com 双站实测）：
 *  - 首页 5 个推荐区块（.section-title > h4：最近更新 / 最新上架 / 热门韩漫 /
 *    热门日漫 / 本周热门），每区 8 张 .product__item 卡片，封面为
 *    .product__item__pic 的 data-setbg 字段（img.imh99.top 绝对 URL）
 *  - 搜索 GET /manga/search?keyword={enc}（200 无 302），结果区顶部
 *    「共找到{N}个结果」；**页面渲染了 page=2..8 与「下一页」分页链接，但服务端
 *    忽略 page 参数**（实测 page=2/3/9/10 返回与 page=1 完全相同的 24 条，
 *    浏览器同源 fetch 复核一致）→ 搜索 maxPage 恒为 1，翻页防御性返回空列表
 *  - 列表 GET /manga/library?type=&complete=&page=&orderby=（筛选面板三组
 *    真值：type 0全部漫画/1 3D漫画/2 韩漫/3 日漫/4 真人漫画/5 耽美BL漫画、
 *    complete 1全部/2完结/3连载、orderby 1最热门/2最近更新/3最新上架），
 *    24 卡/页、翻页有效；分页窗口是滑动窗口（p1 显示 1..8、p50 显示 48..53），
 *    越界页 page=9999 返回 **200 + 0 卡**（23701 字节空壳，不是 404）；
 *    **maxPage 直接解析分页区「末页」链接的 page 参数**（取证：page=1 与
 *    page=50 的末页 href 都是 page=141，与阶梯+二分独立探测出的 141 一致），
 *    与卡片在同一请求内解决；末页链接缺失时才回退阶梯+二分探测。
 *    实测各题材末页（complete=全部）：全部 141 / 3D 19 / 韩漫 74 / 日漫 40 /
 *    真人 7 / 耽美BL 2；orderby 只改排序不改总条目数（三种排序末页均为 141），
 *    complete 改变条目集合（韩漫：全部 74 → 完结 50）
 *  - 详情 GET /manga/{id}：h3 标题、.anime__details__pic[data-setbg] 封面、
 *    .ep/.epgreen 状态（连载/完结）、「作者：」「别名：」span、简介
 *    （.anime__details__text 内非空 <p>）、「漫画分类：」「最近更新：」
 *    「标签：」（标签是纯文本、&nbsp; 分隔，非链接）；
 *    章节 .anime__details__episodes > .chapter_list > a[href=/manga/{id}/detail/{epId}]
 *    站点页面**倒序**（最新话在前），如 7008 = 28 话、4015 = 332 话；
 *    **源按 epId 升序重排为正序输出**（第 1 话在前，见 loadInfo 注释）
 *  - 章节 GET /manga/{comicId}/detail/{epId}：图片为
 *    <img src="https://img.imh99.top/webtoon/content/{a}/{b}/{NNN}_{ts}.webp"
 *    loading="lazy">，**明文直链、单请求全图、无图片分页**（实测 4015 的
 *    最新 / 中间 / 较早三话 = 119 / 25 / 55 张，编号 000..N 连续且张数
 *    = 末号-首号+1），页内另有「上一话/下一话」
 *    链接 /manga/{id}/detail/{epId}
 *  - 图片防盗链对照（img.imh99.top 正文图 + 封面）：无 Referer / 本站 Referer /
 *    任意站外 Referer 三组均 **200 + image/webp + RIFF/WEBP 文件头**，尺寸
 *    正文 720×500、尾图 720×331、封面 302×403（curl 字节 + 浏览器 Image.onload
 *    双重验证）→ 无防盗链、无加密，故不实现 onImageLoad（loadEp 仍防御性带
 *    UA + 详情页 Referer）
 *  - 发布页 https://kxkmh.xyz/（间歇可达，见已知限制）实测 200/5549 字节，
 *    正文只有 2 个 href：https://kxmanhua.com 与 https://kxmanhua1.com，
 *    且两者 host 均出现在去标签正文中 → 「从发布页刷新地址」callback 采用
 *    「href 绝对链接 ∩ 正文域名」双证据解析
 *  - kxmanhua1.com 与 kxmanhua.com **同构**：首页字节数、5 区标题、卡片 id 序列、
 *    详情 title/章节结构、阅读页 148 张图 URL 全部一致
 *
 * 权限边界：取证范围内（首页/搜索/列表/详情/章节/图片）全部公开可读，
 * 未发现登录或付费墙；源不实现登录、不伪造登录态；不执行站点任何脚本。
 *
 * 源设置：
 * - base_url：站点域名 select（kxmanhua.com 默认 / kxmanhua1.com 备用），
 *   全部请求、Referer、绝对化与缓存键随 baseUrl getter 自动跟随；
 * - refresh_domain：callback「从发布页刷新地址」（**callback 必须放 settings 最后**）。
 *
 * v1.2.0 变更（相对 v1.1.0）：
 * - 目录改为**正序**（第 1 话在前）：站点详情页本身是倒序，源按 epId 数值升序重排；
 * - 按用户要求**移除「排行」分类**（原周榜/月榜/总榜）与 /manga/rank 解析、缓存代码，
 *   category 只保留「全部漫画」题材一组；categoryComics.load 增加 param 白名单，
 *   非法 param 安全返回空且不发畸形请求。
 *
 * v1.1.0 变更（相对 v1.0.0）：列表 maxPage 由「串行阶梯 + 二分探测」改为
 * 「解析分页区末页链接」，每个分类组合从约 12 个请求（实测十余秒）降到 0 个额外
 * 请求；二分探测保留为末页链接缺失时的兜底路径。其余功能、协议与字段无变更。
 */
class KxkmhComicSource extends ComicSource {
  name = "开心看漫画";
  key = "kxkmh";
  version = "1.2.0";
  minAppVersion = "1.6.0";
  // 动态域名源（可切换镜像），入口元数据留空（与 mwwz / dmmpic 同约定）。
  url = "";

  /**
   * 源设置：
   * - base_url：站点域名 select，两个实际站一键切换（value 为完整 origin）；
   * - refresh_domain：从发布页 kxkmh.xyz 解析最新地址并探测可达性；
   *   【重要】callback 类型设置必须放在 settings 对象的最后。
   */
  settings = {
    base_url: {
      title: "站点域名",
      type: "select",
      // 发布页 kxkmh.xyz 正文列出的全集（2026-10-05 实测 href 仅此两项）。
      options: [
        { value: "https://kxmanhua.com", text: "kxmanhua.com（默认）" },
        { value: "https://kxmanhua1.com", text: "kxmanhua1.com（备用）" },
      ],
      default: "https://kxmanhua.com",
    },
    // 【重要】callback 类型设置必须放在 settings 对象的最后
    refresh_domain: {
      title: "刷新站点地址",
      type: "callback",
      buttonText: "从发布页刷新地址",
      callback: async () => {
        const found = await this.refreshDomainsFromPublishPage();
        if (!found) {
          throw new Error("发布页检测失败：未能从 kxkmh.xyz 解析出可达的站点域名（发布页可能临时不可用）");
        }
      },
    },
  };

  /**
   * 当前站点域名：优先用户在设置中选择的域名，值必须是合法 origin
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

  // 发布页（只用于「刷新站点地址」，不是内容站地址）。
  publishUrl = "https://kxkmh.xyz";

  listPageSize = 24; // 列表/搜索结果页实测卡片数

  // 列表 maxPage 探测缓存（key=站点域名|筛选串，切换域名后互不污染）。
  maxPageCache = {};

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

  /** 读取 optionList 选项串（形如 "2-完结"）中 "-" 前的值；缺省返回默认值。 */
  optValue(raw, fallback) {
    if (typeof raw !== "string" || !raw) return fallback;
    const head = raw.split("-")[0].trim();
    return head ? head : fallback;
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
   * 从 /manga/7008、https://kxmanhua.com/manga/7008、纯数字、组合形态
   * kxkmh|7008 中提取漫画 ID；/manga/{id}/detail/{ep} 形态取漫画段。
   */
  parseComicId(href) {
    const value = String(href || "").trim();
    if (!value) return null;
    const path = value.match(/\/manga\/(\d+)(?:\/|$|\?|#)/);
    if (path) return path[1];
    // 无前导斜杠的章节形态：7008/detail/173894 → 取漫画段
    const bare = value.match(/^(\d+)\/detail\/(\d+)(?:\/|$|\?|#)/);
    if (bare) return bare[1] === "0" ? null : bare[1];
    if (/^\d+$/.test(value)) return value === "0" ? null : value;
    // 组合形态（sourceKey|comicId）等无斜杠输入，取末尾数字。
    if (value.indexOf("/") === -1) {
      const digits = value.match(/(\d+)\s*$/);
      if (digits && digits[1] !== "0") return digits[1];
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
   * 章节入参标准化，返回 { cid, ep } 或 null，兼容历史入参：
   *  173894                              普通章节 ID
   *  /manga/7008/detail/173894           章节链接
   *  https://kxmanhua.com/manga/7008/detail/173894  完整章节 URL
   *  7008|173894                         组合 ID（前段漫画、末段章节）
   *  {epId/chapterId/id/url}             对象参数
   *  其他无法识别的值返回 null，由调用方安全返回空图片。
   */
  normalizeEp(epId) {
    if (epId === null || epId === undefined || epId === "") return null;
    if (typeof epId === "object") {
      return this.normalizeEp(
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
    // 完整章节路径：/manga/{comicId}/detail/{epId}
    const path = value.match(/\/manga\/(\d+)\/detail\/(\d+)(?:\/|$|\?|#)/);
    if (path) return { cid: path[1], ep: path[2] };
    // 无前导斜杠的章节形态：7008/detail/173894
    const bare = value.match(/^(\d+)\/detail\/(\d+)(?:\/|$|\?|#)/);
    if (bare) return { cid: bare[1] === "0" ? null : bare[1], ep: bare[2] };
    if (value.indexOf("/") === -1) {
      const parts = value.split("|");
      if (parts.length >= 2) {
        // 组合形态：7008|173894 → 前段漫画 ID、末段章节 ID
        const ep = parts[parts.length - 1].trim();
        const cid = parts[parts.length - 2].trim();
        if (/^\d+$/.test(ep) && ep !== "0") {
          return { cid: /^\d+$/.test(cid) && cid !== "0" ? cid : null, ep };
        }
        // 形如 173894|xxx 的末段非数字时回退整体取尾数
        const tail = value.match(/(\d+)\s*$/);
        if (tail && tail[1] !== "0") return { cid: null, ep: tail[1] };
        return null;
      }
      if (/^\d+$/.test(value)) return value === "0" ? null : { cid: null, ep: value };
      const tail = value.match(/(\d+)\s*$/);
      if (tail && tail[1] !== "0") return { cid: null, ep: tail[1] };
    }
    return null;
  }

  // ------------------------------------------------------------ 列表卡片解析

  /** 统一 Comic 构造：站点列表卡片只有 标题链接/封面/状态。 */
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
   * 单张卡片解析。站点有两种卡片结构，字段等价、必须都支持：
   *  A. .product__item（首页前 4 区 / 列表页 / 搜索结果页）
   *      > .product__item__pic.set-bg[data-setbg] 封面 + .product__item__text > h6 > a
   *  B. .product__sidebar__view__item.set-bg（首页「本周热门」区；v1.2.0 前还用于排行三榜）
   *      > 根节点 data-setbg 封面 + p > a
   * 状态徽标：.ep = 连载、.epgreen = 完结；阅读量 .view 不入源。
   */
  parseCard(card) {
    if (!card) return null;
    const link =
      card.querySelector(".product__item__text a[href]") ||
      card.querySelector("p a[href]") ||
      card.querySelector("a[href]");
    if (!link || !link.attributes) return null;
    const href = link.attributes.href || "";
    const id = this.parseComicId(href);
    if (!id) return null;
    // 标题优先取链接文本（与详情页 h3 同名）；title 属性常带「漫画」前缀，仅作回退。
    let title = link.text ? String(link.text).trim() : "";
    if (!title && link.attributes.title) title = String(link.attributes.title).trim();
    if (!title) return null;

    // 封面：B 类卡片在根节点 data-setbg，A 类卡片在内层 .product__item__pic
    let cover = "";
    if (card.attributes) cover = card.attributes["data-setbg"] || "";
    if (!cover) {
      const coverEl = card.querySelector(".product__item__pic");
      if (coverEl && coverEl.attributes) {
        cover = coverEl.attributes["data-setbg"] || coverEl.attributes.src || "";
      }
    }

    // 状态：先找完结（.epgreen），再找连载（.ep）
    let status = "";
    const epGreen = card.querySelector(".epgreen");
    const ep = card.querySelector(".ep");
    if (epGreen && epGreen.text) status = String(epGreen.text).trim();
    else if (ep && ep.text) status = String(ep.text).trim();

    return this.buildComic({
      url: href,
      title,
      cover,
      tags: status ? [status] : [],
    });
  }

  /** 解析整页 HTML 中全部列表卡片（分类页 / 搜索结果页 / 首页区块通用）。 */
  parseCardsFromHtml(html) {
    const doc = new HtmlDocument(html);
    try {
      return this.parseCardsIn(doc);
    } finally {
      doc.dispose();
    }
  }

  /**
   * 在已打开的 HtmlDocument 内解析全部卡片（A、B 两类结构）。
   * 站点不存在两类卡片交错排列的区块（列表/搜索页仅 A、首页侧栏「本周热门」仅 B），
   * 故按类型先后取并保持各自 DOM 顺序即可。
   */
  parseCardsIn(doc) {
    const comics = [];
    if (!doc) return comics;
    for (const selector of [".product__item", ".product__sidebar__view__item"]) {
      const cards = doc.querySelectorAll(selector);
      for (const card of cards) {
        const comic = this.parseCard(card);
        if (comic) comics.push(comic);
      }
    }
    return comics;
  }

  // ------------------------------------------------------------ 首页推荐

  /**
   * 首页区块切分（服务端静态渲染，5 个 .section-title > h4 区块）：
   * 用文本定位标题位置、按区间切分，每段独立解析卡片（区块之间无嵌套）。
   * 实测 5 区：最近更新 / 最新上架 / 热门韩漫 / 热门日漫 / 本周热门，每区 8 卡。
   */
  parseHomeBlocks(html) {
    const value = String(html || "");
    const heads = [];
    const reHead = /<div class="section-title">\s*<h4[^>]*>([\s\S]*?)<\/h4>/g;
    let m;
    while ((m = reHead.exec(value)) !== null) {
      heads.push({ title: m[1].replace(/<[^>]+>/g, "").trim(), idx: m.index });
    }
    const result = {};
    for (let i = 0; i < heads.length; i++) {
      const start = heads[i].idx;
      const end = i + 1 < heads.length ? heads[i + 1].idx : value.length;
      const segment = value.slice(start, end);
      const comics = this.parseCardsFromHtml(segment);
      if (comics.length > 0 && heads[i].title && !result[heads[i].title]) {
        result[heads[i].title] = comics;
      }
    }
    return result;
  }

  explore = [
    {
      title: this.name,
      type: "singlePageWithMultiPart",
      load: async (page) => {
        try {
          const html = await this.getText(this.baseUrl + "/", this.baseUrl + "/");
          return this.parseHomeBlocks(html);
        } catch (e) {
          console.error("开心看漫画首页解析失败：", e);
          return {};
        }
      },
    },
  ];

  // ------------------------------------------------------------ 分类与列表

  /**
   * 分类与站点「全部漫画」筛选面板对齐（v1.2.0 起只保留题材一组）：
   * - 组「全部漫画」= /manga/library 筛选面板第一行题材（显示名一字不差）；
   * - 筛选面板另外两行（状态、排序）由 categoryComics.optionList 承载。
   * - v1.2.0 按用户要求移除「排行」分组（原周榜/月榜/总榜）与 /manga/rank 相关
   *   解析、缓存代码；站点的 /manga/rank 页面本身仍可访问，只是不再作为分类入口。
   */
  category = {
    title: this.name,
    parts: [
      {
        name: "全部漫画",
        type: "fixed",
        categories: ["全部漫画", "3D漫画", "韩漫", "日漫", "真人漫画", "耽美BL漫画"],
        itemType: "category",
        categoryParams: ["type=0", "type=1", "type=2", "type=3", "type=4", "type=5"],
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    // 筛选面板第 2、3 行真值（显示名与站点 .filter-row 完全一致）。
    optionList: [
      { label: "状态", options: ["-全部", "2-完结", "3-连载"] },
      { label: "排序", options: ["1-最热门", "2-最近更新", "3-最新上架"] },
    ],
    load: async (category, param, options, page) => {
      const key = String(param || "").trim();
      const safePage = this.num(page, 1);
      if (!key) return { comics: [], maxPage: safePage };
      // param 白名单（v1.2.0）：站点筛选面板只认 type=0..5 这一种形态。
      // 非法 param 一律安全返回空，**不向站点发畸形请求**——否则会拼出
      // /manga/library?rank:xxx 之类无意义查询，还得触发兜底 maxPage 探测。
      if (!/^type=[0-5]$/.test(key)) {
        return { comics: [], maxPage: safePage };
      }
      try {
        const opts = Array.isArray(options) ? options : [];
        // optionList 顺序：0 状态、1 排序（与站点筛选行顺序一致）
        const complete = this.optValue(opts[0], "1") || "1";
        const orderby = this.optValue(opts[1], "1") || "1";
        const query = `${key}&complete=${complete}&orderby=${orderby}`;
        const url = `${this.baseUrl}/manga/library?${query}&page=${safePage}`;
        const html = await this.getText(url, this.baseUrl + "/");
        // maxPage：站点列表页渲染「末页」链接且其 href 带真实页码（取证 page=141 与
        // 二分探测结果一致），故优先**解析**——与卡片同请求解决，零额外开销；
        // 仅当末页链接缺失/异常（小于当前页）时才退回 detectMaxPage 阶梯二分探测。
        let maxPage = this.parseMaxPageFromHtml(html);
        if (maxPage == null || maxPage < safePage) {
          maxPage = await this.detectMaxPage(query);
        }
        return { comics: this.parseCardsFromHtml(html), maxPage };
      } catch (e) {
        console.error(`开心看漫画分类「${category}」加载失败：`, e);
        return { comics: [], maxPage: safePage };
      }
    },
  };

  /**
   * 列表页卡数探测（边界判据）：返回该页卡片数。
   * 站点越界页不是 404 而是 **200 + 0 卡的空壳页**（实测 page=9999 → 23701 字节
   * 0 卡），所以边界必须按「卡片数是否为 0」判定，不能按状态码。
   * 瞬态错误重试一次；重试后仍失败抛错，避免瞬态错误误缩边界。
   */
  async countListCards(url) {
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
      if (status === 200) {
        const comics = this.parseCardsFromHtml(String(res.body || ""));
        return comics.length;
      }
      if (status >= 500 && attempt === 0) {
        await this.sleep(400);
        continue;
      }
      throw new Error(`边界探测异常 HTTP ${status}（${url}）`);
    }
    throw new Error(`边界探测失败：${lastError}（${url}）`);
  }

  /**
   * 从列表页 HTML 解析真实末页页码（v1.1.0 主路径，零额外请求）。
   *
   * 取证（2026-10-05，/manga/library?type=0&complete=1&orderby=1）：
   *   page=1  → <a href="/manga/library?type=0&amp;complete=1&amp;page=141&amp;orderby=1" title="第0页"> 末页 </a>
   *   page=50 → <a href="/manga/library?type=0&amp;complete=1&amp;page=141&amp;orderby=1" title="第49页"> 末页 </a>
   * 「末页」href 的 page 参数恒等于**真实末页**（141，与串行阶梯+二分探测
   * 独立得到的 141 一致），且出现在第 1 页与第 50 页（滑动窗口中途）。
   * 注意 title 属性（"第0页"/"第49页"）是站点模板 bug，与真实页码无关，不可采信；
   * 页码数字窗口只含「下一页 / 末页」两个链接，故必须锚定「末页」文本再向左
   * 回溯最近的 <a href>，不能取最后一个 a（那会拿到「下一页」）。
   * 返回 null 表示未取到（调用方退回 detectMaxPage 探测）。
   */
  parseMaxPageFromHtml(html) {
    const value = String(html || "");
    const i = value.indexOf("末页");
    if (i === -1) return null;
    const head = value.slice(Math.max(0, i - 800), i);
    const links = [];
    const re = /<a[^>]*href="([^"]+)"[^>]*>/g;
    let m;
    while ((m = re.exec(head)) !== null) links.push(m[1]);
    if (!links.length) return null;
    // 取「末页」左侧最近的链接（同窗口内最后一个）
    const page = links[links.length - 1].match(/[?&]page=(\d+)/);
    if (!page) return null;
    const n = parseInt(page[1], 10);
    return Number.isFinite(n) && n >= 1 ? n : null;
  }

  /**
   * 列表 maxPage 探测（**兜底路径**，v1.0.0 的主路径已由 parseMaxPageFromHtml 取代）。
   * 真实依据 = 最后一个非空页 / 第一个 0 卡页的前一页。
   * 站点分页窗口是滑动窗口（p1 显示 1..8、p50 显示 48..53），且越界页返回
   * 200 + 0 卡空壳（不是 404），故边界必须按卡片数判定，不能按状态码。
   * 仅在「末页」链接解析失败时兜底使用，采用：
   *  1) 串行阶梯 [64, 512, 4096, 32768] 短路定位「最大非空页 lo / 最小 0 卡页 hi」；
   *  2) 在 (lo, hi] 内二分收敛，直到 hi = lo + 1；
   *  3) lo 即末页，写入缓存（键带域名），后续翻页零开销。
   * 实测量级：type=0&complete=1&orderby=1 ∈ (64, 512]（p64=24 卡、p256=0 卡）。
   */
  async detectMaxPage(query) {
    const cacheKey = this.baseUrl + "|" + String(query || "");
    if (this.maxPageCache[cacheKey] != null) return this.maxPageCache[cacheKey];

    const q = String(query || "");
    const urlOf = (n) => `${this.baseUrl}/manga/library?${q}&page=${n}`;

    let lo = 1;
    let hi = null;
    for (const n of [64, 512, 4096, 32768]) {
      const cards = await this.countListCards(urlOf(n));
      if (cards > 0) lo = n;
      else {
        hi = n;
        break;
      }
    }
    if (hi === null) {
      // 32768 仍非空时（防御，全站量级远小于该页数）再扩一轮。
      for (const n of [262144, 1048576]) {
        const cards = await this.countListCards(urlOf(n));
        if (cards > 0) lo = n;
        else {
          hi = n;
          break;
        }
      }
    }
    if (hi === null) {
      throw new Error(`列表边界探测失败：1048576 页仍有内容（${q}）`);
    }

    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const cards = await this.countListCards(urlOf(mid));
      if (cards > 0) lo = mid;
      else hi = mid;
    }
    this.maxPageCache[cacheKey] = lo;
    return lo;
  }

  // ------------------------------------------------------------ 搜索

  search = {
    load: async (keyword, options, page) => {
      const kw = String(keyword || "").trim();
      const safePage = this.num(page, 1);
      if (!kw) return { comics: [], maxPage: 1 };
      // 站点渲染了 page=2..8 与「下一页」链接，但服务端忽略 page 参数
      // （实测 page=2/3/9/10 与 page=1 结果完全相同）→ 第 2 页起直接返回空，
      // 避免用户看到整页重复结果；maxPage 恒为 1（翻页在服务端未实现）。
      if (safePage > 1) return { comics: [], maxPage: 1 };
      try {
        const url = `${this.baseUrl}/manga/search?keyword=${encodeURIComponent(kw)}`;
        const html = await this.getText(url, this.baseUrl + "/");
        const doc = new HtmlDocument(html);
        try {
          const section = doc.querySelector("section.product-page");
          return {
            comics: section ? this.parseCardsIn(section) : [],
            maxPage: 1,
          };
        } finally {
          doc.dispose();
        }
      } catch (e) {
        console.error("开心看漫画搜索失败：", e);
        return { comics: [], maxPage: 1 };
      }
    },
    optionList: [],
  };

  // ------------------------------------------------------------ 详情与章节

  comic = {
    loadInfo: async (id) => {
      const comicId = this.normalizeComicId(id);
      if (!comicId) throw new Error(`无效的漫画 ID：${id}`);
      const html = await this.getText(`${this.baseUrl}/manga/${comicId}`, this.baseUrl + "/");
      const doc = new HtmlDocument(html);
      try {
        const titleBox = doc.querySelector(".anime__details__title");
        const h3 = titleBox ? titleBox.querySelector("h3") : null;
        const title = h3 && h3.text ? String(h3.text).trim() : "";
        if (!title) throw new Error("详情页标题结构未匹配");

        // 作者 / 别名：.anime__details__title 内 span 按前缀识别
        let author = "";
        if (titleBox) {
          const spans = titleBox.querySelectorAll("span");
          for (const span of spans) {
            const text = span.text ? String(span.text).replace(/\s+/g, " ").trim() : "";
            if (text.indexOf("作者：") === 0 || text.indexOf("作者:") === 0) {
              author = text.replace(/^作者[:：]\s*/, "").trim();
              break;
            }
          }
        }

        // 封面与状态：.anime__details__pic[data-setbg] + .ep/.epgreen
        const pic = doc.querySelector(".anime__details__pic");
        let cover = "";
        let status = "";
        if (pic) {
          if (pic.attributes) cover = pic.attributes["data-setbg"] || "";
          const green = pic.querySelector(".epgreen");
          const ep = pic.querySelector(".ep");
          if (green && green.text) status = String(green.text).trim();
          else if (ep && ep.text) status = String(ep.text).trim();
        }

        // 简介：.anime__details__text 内非空 <p> 拼接（首个 <p> 常为空）
        let description = "";
        const textBox = doc.querySelector(".anime__details__text");
        if (textBox) {
          const paras = textBox.querySelectorAll("p");
          const parts = [];
          for (const p of paras) {
            const text = p.text ? String(p.text).replace(/\s+/g, " ").trim() : "";
            if (text) parts.push(text);
          }
          description = parts.join("\n");
        }

        // 筛选信息：.anime__details__widget 的 li 按前缀识别
        let category = "";
        let updateTime = "";
        const tagList = [];
        const widget = doc.querySelector(".anime__details__widget");
        if (widget) {
          const items = widget.querySelectorAll("li");
          for (const li of items) {
            const text = li.text ? String(li.text).replace(/[\s\u00a0]+/g, " ").trim() : "";
            if (text.indexOf("漫画分类：") === 0 || text.indexOf("漫画分类:") === 0) {
              const a = li.querySelector("a");
              category = a && a.text
                ? String(a.text).replace(/[\s\u00a0]+/g, " ").trim()
                : text.replace(/^漫画分类[:：]\s*/, "").trim();
            } else if (text.indexOf("最近更新：") === 0 || text.indexOf("最近更新:") === 0) {
              updateTime = text.replace(/^最近更新[:：]\s*/, "").trim();
            } else if (text.indexOf("标签：") === 0 || text.indexOf("标签:") === 0) {
              // 标签是纯文本、&nbsp; 分隔（非链接），按空白切分
              const raw = text.replace(/^标签[:：]\s*/, "").trim();
              if (raw) {
                for (const one of raw.split(/[\s\u00a0]+/g)) {
                  if (one && tagList.indexOf(one) === -1) tagList.push(one);
                }
              }
            }
          }
        }

        // 章节：.anime__details__episodes > .chapter_list > a
        // 必须限定在章节区内——页面还有「你可能喜欢」推荐区与「开始阅读」按钮，
        // 两者的 /manga/{id}、/manga/{id}/detail/{ep} 链接都不能混入。
        //
        // v1.2.0：站点页面是**倒序**（最新话在前），源改为**正序输出**（第 1 话在前）。
        // 排序键 = epId 数值升序（epId 随上架时间单调递增）：
        //   4015 取证 332 章，页面顺序 epId 与话数双双严格递减；按 epId 升序还原后，
        //   331/332 章与「第N话」升序一致，仅 1 处站点自身数据瑕疵（第251话之后又
        //   插入了第250话，ep 143055/143056），属站点排序问题，任何键都需面对。
        // 不用章节名里的「第N话」作排序键：4015 有 10 个「休刊公告」无数字。
        const pairs = [];
        const seenEps = new Set();
        const episodes = doc.querySelector(".anime__details__episodes");
        if (episodes) {
          const anchors = episodes.querySelectorAll("a[href]");
          for (const a of anchors) {
            if (!a || !a.attributes) continue;
            const parsed = this.normalizeEp(a.attributes.href || "");
            if (!parsed || !parsed.ep || seenEps.has(parsed.ep)) continue;
            let name = a.text ? String(a.text).trim() : "";
            if (!name && a.attributes.title) name = String(a.attributes.title).trim();
            if (!name) continue;
            seenEps.add(parsed.ep);
            pairs.push({ ep: parsed.ep, name });
          }
        }
        pairs.sort((a, b) => Number(a.ep) - Number(b.ep));
        const chapters = new Map();
        for (const p of pairs) chapters.set(p.ep, p.name);
        if (!chapters.size) throw new Error("详情页章节列表为空");

        const tags = {};
        if (category) tags["分类"] = [category];
        if (tagList.length) tags["标签"] = tagList;

        return new ComicDetails({
          title,
          subTitle: author,
          cover: this.absoluteUrl(cover),
          tags,
          chapters,
          description,
          updateTime,
          status,
          comic: new Comic({
            id: comicId,
            title,
            subTitle: author,
            cover: this.absoluteUrl(cover),
            tags: status ? [status] : [],
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
     * - URL 形态 /manga/{comicId}/detail/{epId}，需要漫画 ID + 章节 ID；
     * - 图片为页面静态 <img src="https://img.imh99.top/webtoon/content/...webp">
     *   明文直链（loading=lazy 不影响 src 解析），**单请求即全图、无图片分页**；
     * - 只收 content/ 路径的图（排除 logo/广告 banner），按页面顺序去重；
     * - 漫画 ID 与章节内嵌 ID 冲突时安全返回空（历史入参矩阵要求）。
     */
    loadEp: async (comicId, epId) => {
      const parsed = this.normalizeEp(epId);
      if (!parsed || !parsed.ep) return { images: [] };
      const fromArg = this.normalizeComicId(comicId);
      // 章节参数内嵌的漫画 ID 与实参不一致 → 拒绝（防串台）
      if (parsed.cid && fromArg && parsed.cid !== fromArg) return { images: [] };
      const cid = fromArg || parsed.cid;
      if (!cid) return { images: [] };
      const referer = `${this.baseUrl}/manga/${cid}/detail/${parsed.ep}`;
      try {
        const html = await this.getText(referer, `${this.baseUrl}/manga/${cid}`);
        const doc = new HtmlDocument(html);
        try {
          const images = [];
          const seen = new Set();
          const nodes = doc.querySelectorAll("img");
          for (const node of nodes) {
            if (!node || !node.attributes) continue;
            const raw = node.attributes.src || node.attributes["data-src"] || "";
            if (raw.indexOf("/webtoon/content/") === -1) continue;
            const abs = this.absoluteUrl(raw);
            if (abs && !seen.has(abs)) {
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
        console.error(`开心看漫画章节 ${parsed.ep} 图片加载失败：`, e);
        return { images: [] };
      }
    },
  };

  // ------------------------------------------------------- 发布页刷新地址

  /**
   * 从发布页 kxkmh.xyz 解析站点域名（真实解析证据，2026-10-05 实测）：
   * 1) GET https://kxkmh.xyz/（发布页间歇可达，见已知限制，失败会抛错）；
   * 2) 取全部绝对 href 的 origin，排除发布页自身；
   * 3) **双证据**：该 origin 的 host 必须同时出现在去标签后的正文中
   *    （实测正文域名集合 = {kxkmh.xyz, kxmanhua.com, kxmanhua1.com}，
   *    可排除页面将来混入的广告外链）；
   * 4) 逐个探测候选 `{origin}/`：200 且 title 含「开心看漫画」才判可用；
   * 5) 第一个可达 origin 写入 settings.base_url.default；若候选不在现有
   *    select 选项内则追加选项（运行时追加是否生效待实机验证）。
   * 返回可用 origin 或空串。不执行发布页任何脚本，只做文本解析。
   */
  /**
   * 发布页 HTML → 候选站点 origin 列表（纯文本解析，不执行任何脚本）。
   * 双证据：① href 中的绝对 https 链接；② 该 host 必须同时出现在去标签正文。
   * 实测发布页正文域名集合 = {kxkmh.xyz, kxmanhua.com, kxmanhua1.com}，
   * 排除发布页自身后剩 2 个站域名；将来混入的广告外链因缺少证据②被排除。
   */
  parsePublishDomains(html) {
    const value = String(html || "");
    if (!value) return [];
    const textOnly = value.replace(/<[^>]+>/g, " ");
    const result = [];
    const seen = {};
    const re = /href\s*=\s*"https?:\/\/([^/"']+)/gi;
    let m;
    while ((m = re.exec(value)) !== null) {
      const origin = "https://" + m[1].toLowerCase();
      if (origin === this.publishUrl) continue;
      if (seen[origin]) continue;
      const host = origin.replace(/^https?:\/\//i, "");
      if (textOnly.indexOf(host) === -1) continue; // 证据②缺失 → 排除
      seen[origin] = true;
      result.push(origin);
    }
    return result;
  }

  async refreshDomainsFromPublishPage() {
    let html = "";
    try {
      html = await this.getText(this.publishUrl + "/", this.publishUrl + "/");
    } catch (e) {
      console.error("开心看漫画发布页读取失败：", e);
      return "";
    }
    const candidates = this.parsePublishDomains(html);

    for (const origin of candidates) {
      try {
        const res = await this.request("GET", origin + "/", this.baseHeaders(origin + "/"), null);
        const body = String(res.body || "");
        const title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
        if (title.indexOf("开心看漫画") === -1) continue;
        // 已在 select 选项内：直接切换默认值
        const opts = this.settings.base_url.options;
        const exists = opts.some((o) => o && o.value === origin);
        if (!exists) {
          opts.push({ value: origin, text: origin.replace(/^https?:\/\//i, "") + "（发布页新增）" });
        }
        this.settings.base_url.default = origin;
        console.log(`开心看漫画发布页刷新成功：${origin}`);
        return origin;
      } catch (e) {
        // 该候选不可达，继续下一个
        console.error(`开心看漫画候选域名不可达：${origin}`, e);
      }
    }
    return "";
  }
}
