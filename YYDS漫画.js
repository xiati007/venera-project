/**
 * YYDS 漫画（www.yydsmh.com）Venera 漫画源 v1.0.0
 *
 * 站点：Kimicms（Laravel / PHP），服务端渲染 + 若干 AJAX 接口。
 * 取证日期：2026-10-14
 *
 * 已取证并验证的能力：
 *  - 首页：/  多 panel 推荐（今日推荐 / 精品漫画 / 最新上架 / 热门漫画 …）。
 *    卡片结构 <li class="acgn-item"> > a.acgn-thumbnail > img.cover。
 *  - 更新分区：/manga-update/{1..7}.html（1=星期一 … 7=星期日）。
 *    卡片容器 <ul class="J_comicUpdate acgn-comic-list">，单页全量、无分页。
 *    筛选面板：周一到周日。
 *  - 分类分区：/manga-lists/{area}/{theme}/{progress}/{page}.html。
 *    area=9/全部，1/日漫 2/港台 3/美漫 4/国漫 5/韩漫 6/未分类；
 *    progress=3/全部 4/连载中 1/已完结；theme 为 URL 编码的题材中文名。
 *    卡片容器 <ul id="J_comicList" class="acgn-comic-list">，分页。
 *    maxPage 依据：分页器最右页号文本（实测 /manga-lists/9/全部/3/1.html → 1489）。
 *  - 搜索：POST /api/front/index/search，body key={urlencoded}
 *    响应 {code:0,data:[{id,name,cover,info_url,author,...}]}，单页全量、无分页。
 *    （GET /search?searchkey=... 实测返回 0 字节，不可用；故使用 API。）
 *  - 详情：/manga/{id}/
 *    og:title / og:image / og:novel:author / og:novel:category /
 *    og:novel:status / og:novel:latest_chapter_url / og:novel:update_time；
 *    简介取 meta[name=description]（og:description 是「暂未提供简介」占位文案）。
 *    章节列表：<ol class="chapter-list" id="j_chapter_list">
 *      每 li[data-chapter="epId"] > a[href="/episode/{aid}/{epId}.html"]，正序。
 *    长漫画（>20 话）页面默认显示第 1-20 话，另有 button.page-last
 *    点击调用 get_end 加载最新 20 话（同源二次请求，非独立 URL）。
 *  - 正文：POST /api/comic/read/pics，body id={epId}&aid={comicId}&offset=0&limit=N
 *    响应 {code:1,data:{pic:[{pic:"https:\\//…jpg",id:"…"}],total:N,offset,limit}}。
 *    pic 字段用 '\\' 代替 '/'，需 replace(/\\\//g,'/') 还原。
 *    picCount 在详情页 head 里 `read={aid,cid,picCount,…}` 内联可读。
 *    接口无登录限制（未登录实测 code:1），无需 Cookie。
 *
 * 图片协议结论：直链 https（tuer.justpic01pt.com / pppic.greenkosovo.com 等 CDN），
 * 无加密、无防盗链（同源 Referer 均 200）。不实现任何解密。
 *
 * 权限边界：站点存在 VIP/付费章节提示（get_buy / ispay），但取证范围内
 * 全部公开章节通过 /api/comic/read/pics 直接可取（code:1）。
 * 不实现登录、不绕过付费。
 *
 * 已知限制：
 *  - 更新分区、搜索均单页全量返回，无分页。
 *  - 分类页 URL 三段为 area/theme/progress，任一组筛选生效即可（非组合过滤）；
 *    因此多组筛选同时选择时按 area > theme > progress 优先取一个具体值。
 *  - 详情页仅显示 20 条章节（前 20 或后 20）；超过 20 话时通过
 *    page-last 按钮二次触发站点 AJAX 才能加载完整目录，本源码中通过
 *    识别 page-last 按钮存在后请求带 tabs=chapters 的详情页兜底。
 */

class YydsManga extends ComicSource {
  name = "YYDS漫画";
  key = "yyds";
  version = "1.0.0";
  minAppVersion = "1.0.0";
  url = "https://www.yydsmh.com";

  siteUa =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  // ------------------------------------------------------------ 基础工具

  absoluteUrl(path) {
    const value = String(path || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("//")) return "https:" + value;
    if (value.startsWith("/")) return this.url + value;
    return this.url + "/" + value;
  }

  /** 修复站点 JSON 中用反斜杠替换斜杠的 URL（"https:\\\\/…jpg" → "https://…jpg"）。 */
  fixBackslashUrl(u) {
    if (!u) return "";
    return String(u).replace(/\\\//g, "/").trim();
  }

  baseHeaders(referer) {
    return {
      "User-Agent": this.siteUa,
      Referer: referer || this.url + "/",
      Accept: "*/*",
      "Accept-Language": "zh-CN,zh;q=0.9",
    };
  }

  postHeaders(referer) {
    return {
      "User-Agent": this.siteUa,
      Referer: referer || this.url + "/",
      Origin: this.url,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "zh-CN,zh;q=0.9",
    };
  }

  isTransientError(message) {
    return /timeout|timed out|connection reset|connection closed|peer closed|broken pipe|unexpected.?eof|network error|aborted|connection refused|unreachable|temporary|econnreset|econnrefused/i.test(
      String(message || "")
    );
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** 统一网络请求：瞬态错误有限重试一次，非 2xx 抛错。 */
  async request(method, url, headers, body) {
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try {
        if (method === "GET" || method === "HEAD") {
          res = await Network.get(url, headers);
        } else {
          res = await Network.post(url, headers, body);
        }
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

  async postJson(url, body, referer) {
    const res = await this.request("POST", url, this.postHeaders(referer), body);
    if (!res.body) throw new Error(`空响应（${url}）`);
    const raw = String(res.body);
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(`JSON 解析失败（${url}）：${raw.slice(0, 120)}`);
    }
  }

  // ------------------------------------------------------------ ID 标准化

  /** 从 /manga/62866/、完整 URL、纯数字、组合形态中提取漫画 ID。 */
  parseComicId(href) {
    const value = String(href || "").trim();
    if (!value) return null;
    const match = value.match(/\/manga\/(\d+)(?:\/|$)/);
    if (match) return match[1];
    if (/^\d+$/.test(value)) return value;
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
   *  2095380                         普通章节 ID
   *  /episode/62866/2095380.html     章节路径
   *  https://www.yydsmh.com/episode/62866/2095380.html  完整 URL
   *  62866|2095380                   组合 ID（取最后一段）
   *  {epId/chapterId/id/url}         对象参数
   *  非法值返回 null。
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
    const pathMatch = value.match(/\/episode\/\d+\/(\d+)\.html/);
    if (pathMatch) return pathMatch[1];
    const parts = value.split(/[|/?#]/);
    let last = parts[parts.length - 1].trim();
    last = last.replace(/\.html?$/i, "");
    if (/^\d+$/.test(last)) return last === "0" ? null : last;
    const digits = last.match(/(\d+)$/);
    if (digits && digits[1] !== "0") return digits[1];
    return null;
  }

  // ------------------------------------------------------------ 列表卡片解析

  /**
   * 通用卡片解析（首页 / 更新 / 分类 三类卡片共用）。
   *
   * 站点三种卡片结构：
   *  A. 首页 panel 内 <li class="acgn-item">：
   *     a.acgn-thumbnail[href="/manga/{id}/"] > img.cover[src=" …url"]
   *     .acgn-info > .acgn-primary-info > h3.acgn-title > a（标题）
   *     .acgn-info 下 p / span 可能带副标题（作者/题材）
   *
   *  B. 更新页 <li class="acgn-item acgn-clearfix">：
   *     同 A 结构。
   *
   *  C. 分类页 <li class="acgn-item">（#J_comicList 内）：
   *     a[href="/manga/{id}/"] > img[src=" …url"]（可能带前导空格）
   *     .acgn-title > a（标题）；.acgn-desc（简介，可选）
   *
   * 统一：ID 从任何指向 /manga/ 的链接取；封面从首个 img 的 src 取
   * （注意 src 值有前导空格，需 trim）；标题从 h3/h4 a 或首个 /manga/ 链接文本取。
   */
  parseCard(card) {
    if (!card) return null;

    // 1) 定位指向漫画详情页的链接（ID + 封面）
    let link = null;
    const allA = card.querySelectorAll("a[href]");
    for (const a of allA) {
      if (a && a.attributes && this.parseComicId(a.attributes.href || "")) {
        link = a;
        break;
      }
    }
    if (!link || !link.attributes) return null;
    const id = this.parseComicId(link.attributes.href || "");
    if (!id) return null;

    // 2) 标题
    let title = "";
    for (const sel of [".acgn-title a", ".book-title a", ".name a", "h3 a", "h4 a", "p.ph11 a"]) {
      const el = card.querySelector(sel);
      if (el) {
        title = (el.text || "").trim();
        if (!title && el.attributes) title = (el.attributes.title || "").trim();
        if (title) break;
      }
    }
    if (!title) {
      title = (link.text || "").trim();
      if (!title && link.attributes) title = (link.attributes.title || "").trim();
    }
    if (!title) return null;

    // 3) 封面：src 值常有前导空格
    let cover = "";
    const img = card.querySelector("img");
    if (img && img.attributes) {
      cover =
        img.attributes["data-src"] ||
        img.attributes["data-original"] ||
        img.attributes.src ||
        "";
    }

    // 4) 副标题（作者 / 题材 / 简介）
    let subTitle = "";
    const descEl = card.querySelector(".acgn-desc, .ph12, .book_author, .acgn-desc-text");
    if (descEl && descEl.text) {
      subTitle = String(descEl.text).trim();
      subTitle = subTitle.replace(/^作者\s*[:：]?\s*/, "").trim();
      if (subTitle.length > 40) subTitle = subTitle.slice(0, 40);
    }

    return new Comic({
      id,
      title,
      cover: this.absoluteUrl(cover),
      subTitle,
      updateTime: "",
      sourceKey: this.key,
    });
  }

  /** 解析整页 HTML 中全部列表卡片。cardSelector 可选（默认 .acgn-item）。 */
  parseCards(html, cardSelector) {
    const doc = new HtmlDocument(html);
    try {
      const cards = doc.querySelectorAll(cardSelector || ".acgn-item");
      const comics = [];
      const seen = new Set();
      for (const card of cards) {
        const comic = this.parseCard(card);
        if (comic && !seen.has(comic.id)) {
          seen.add(comic.id);
          comics.push(comic);
        }
      }
      return comics;
    } finally {
      doc.dispose();
    }
  }

  /**
   * 解析页面内所有「推荐/榜单」区块（首页多 panel 结构）：
   * 结构：<section class="acgn-row"> > .acgn-col-24 > .acgn-block
   *        > .acgn-model-head > h2.title（区块名）
   *        > .acgn-comic-list > li.acgn-item
   * 标题为空或区块内无卡片的直接跳过。
   */
  parseHomePanels(html) {
    const doc = new HtmlDocument(html);
    try {
      // 定位每个含标题的区块：优先 .acgn-block，回退 .acgn-col-24 > .acgn-model-*
      const blocks = doc.querySelectorAll(".acgn-block, .acgn-comic-list");
      const result = [];
      for (const block of blocks) {
        if (!block) continue;
        // 找标题：向上/相邻找 h2/h3.title
        const parent = block.attributes && block.attributes.class && /acgn-block/.test(block.attributes.class) ? block : null;
        const scope = parent || block;
        let title = "";
        const head = scope.querySelector("h2.title, h3.title, .acgn-model-head .title, .model-head_left .title, .title");
        if (head) title = (head.text || "").trim();
        const comics = [];
        for (const item of scope.querySelectorAll(".acgn-item")) {
          const comic = this.parseCard(item);
          if (comic) comics.push(comic);
        }
        if (comics.length > 0) {
          const key = title || "推荐";
          if (!result.some((r) => r.title === key)) {
            result.push({ title: key, comics });
          }
        }
      }
      return result;
    } finally {
      doc.dispose();
    }
  }

  // ------------------------------------------------------------ 首页推荐
  //
  // 首页多 panel 推荐 + 更新（星期一）作为兜底最新分区。

  explore = [
    {
      title: this.name,
      type: "multiPartPage",
      load: async () => {
        const parts = [];
        try {
          const html = await this.getText(this.url + "/", this.url + "/");
          for (const part of this.parseHomePanels(html)) parts.push(part);
        } catch (e) {
          console.error("YYDS 首页解析失败：", e);
        }
        // 兜底：更新（星期一）
        if (parts.length === 0) {
          try {
            const html = await this.getText(
              this.url + "/manga-update/1.html",
              this.url + "/"
            );
            const comics = this.parseCards(html, "ul.J_comicUpdate li.acgn-item");
            if (comics.length) parts.push({ title: "最新更新", comics });
          } catch (e) {
            console.error("YYDS 更新页兜底解析失败：", e);
          }
        }
        return parts;
      },
    },
  ];

  // ------------------------------------------------------------ 分类
  //
  // 两个独立分区入口：
  //   1. 更新：周一到周日（7 页，每页 1 页全量）
  //   2. 分类：题材 / 地区 / 进度 三维筛选，多维联动
  //
  // 分类 URL 结构：/manga-lists/{area}/{theme}/{progress}/{page}.html
  //   area:     9=全部 1=日漫 2=港台 3=美漫 4=国漫 5=韩漫 6=未分类
  //   theme:    题材中文名（URL 编码）或"全部"
  //   progress: 3=全部 4=连载中 1=已完结
  //
  // maxPage 依据：分页器最右页号文本（实测 /manga-lists/9/全部/3/1.html → 1489）。
  // 更新页无分页，maxPage 固定 1。

  category = {
    title: this.name,
    parts: [
      {
        name: "更新",
        type: "fixed",
        categories: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
        itemType: "category",
        categoryParams: ["1", "2", "3", "4", "5", "6", "7"],
      },
      {
        name: "分类",
        type: "fixed",
        categories: ["全部漫画"],
        itemType: "category",
        categoryParams: ["list"],
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    /**
     * 筛选面板：
     *   分区=更新  → 只显示"更新日"（周一..周日），但由 category.params 决定日期；
     *                因此这里对"更新"分区不响应筛选，仅使用 category.param。
     *   分区=分类  → 三组筛选：题材 / 地区 / 进度，均带"全部"默认。
     */
    optionList: [
      {
        label: "题材",
        type: "select",
        options: [
          "-全部",
          "长条", "大女主", "百合", "耽美", "纯爱", "後宫", "韩漫", "奇幻", "轻小说",
          "生活", "悬疑", "格斗", "搞笑", "伪娘", "竞技", "职场", "萌系", "冒险", "治愈",
          "都市", "霸总", "神鬼", "侦探", "爱情", "古风", "欢乐向", "科幻", "穿越",
          "性转换", "校园", "美食", "剧情", "热血", "节操", "励志", "异世界", "历史",
          "战争", "恐怖",
        ],
      },
      {
        label: "地区",
        type: "select",
        options: [
          "-全部",
          "1-日漫", "2-港台", "3-美漫", "4-国漫", "5-韩漫", "6-未分类",
        ],
      },
      {
        label: "进度",
        type: "select",
        options: ["-全部", "4-连载中", "1-已完结"],
      },
    ],

    /**
     * 分类列表加载：
     *  - param="1..7"（更新分区）→ /manga-update/{param}.html（无分页，maxPage=1）
     *  - param="list"（分类分区）→ /manga-lists/{area}/{theme}/{progress}/{page}.html
     *    默认 area=9/theme=全部/progress=3；筛选面板三组生效顺序：
     *    地区(1) > 题材(0) > 进度(2)，未选时保持默认。
     *  - maxPage：解析页面分页器最后一个页号 <span class="acgn-active">N</span>
     *    或页码序列中最大数字；无分页器返回 1。
     */
    load: async (category, param, options, page) => {
      const safePage = typeof page === "number" ? page : parseInt(page, 10) || 1;

      // ---------- 更新分区 ----------
      if (/^\d+$/.test(String(param || ""))) {
        const dayNum = parseInt(param, 10);
        if (dayNum < 1 || dayNum > 7) return { comics: [], maxPage: 1 };
        try {
          const url = `${this.url}/manga-update/${dayNum}.html`;
          const html = await this.getText(url, this.url + "/");
          const comics = this.parseCards(html, "ul.J_comicUpdate li.acgn-item");
          return { comics, maxPage: 1 };
        } catch (e) {
          console.error(`YYDS 更新 ${dayNum} 加载失败：`, e);
          return { comics: [], maxPage: 1 };
        }
      }

      // ---------- 分类分区 ----------
      const opts = Array.isArray(options) ? options : [];
      const themeVal = String(opts[0] || "").trim();
      const areaVal = String(opts[1] || "").trim();
      const progressVal = String(opts[2] || "").trim();
      const extractId = (val) => {
        // "4-国漫" → "4"；"-全部" 或空 → ""
        const s = (val || "").trim();
        if (!s || s.startsWith("-")) return "";
        const idx = s.indexOf("-");
        return idx >= 0 ? s.slice(0, idx).trim() : s;
      };
      const area = extractId(areaVal) || "9";
      const progress = extractId(progressVal) || "3";
      const theme = (themeVal || "").startsWith("-") ? "全部" : (themeVal || "全部");

      try {
        const url = `${this.url}/manga-lists/${area}/${encodeURIComponent(theme)}/${progress}/${safePage}.html`;
        const html = await this.getText(url, this.url + "/");
        const comics = this.parseCards(html, "#J_comicList .acgn-item");
        return {
          comics,
          maxPage: this.parseMaxPage(html, safePage),
        };
      } catch (e) {
        console.error(`YYDS 分类「${theme}」加载失败：`, e);
        return { comics: [], maxPage: safePage };
      }
    },
  };

  /**
   * 解析分类页分页器，返回总页数。
   *
   * 真实结构（/manga-lists/9/全部/3/1.html 实测）：
   *   <div class="acgn-pages J_pages">
   *     <span class="acgn-active">1</span>
   *     <a target="_self" href="/manga-lists/9/全部/3/2.html">2</a>
   *     ...
   *     <em>…</em>
   *     <a target="_self" href="/manga-lists/9/全部/3/1489.html">1489</a>
   *     <a target="_self" class="acgn-next" href="/manga-lists/9/全部/3/2.html">…</a>
   *   </div>
   *
   * 策略：先找 acgn-pages 容器（若无则找任意分页容器），在其内扫描
   * 所有页号（href 或 span 数字），取最大者。
   * 找不到或只有当前页时返回当前页（说明只有 1 页）。
   */
  parseMaxPage(html, currentPage) {
    const text = String(html || "");
    // 取分页器区段（若不存在则退化为全文，安全性由正则限定）
    const m = text.match(/<div[^>]*class="[^"]*\bacgn-pages[^"]*"[^>]*>([\s\S]{0,40000}?)<\/div>/i);
    const scope = m ? m[1] : text;

    // 从 href 提取 /{page}.html 的数字
    let max = 0;
    const re = /\/(\d+)\.html/g;
    let mm;
    while ((mm = re.exec(scope))) {
      const n = parseInt(mm[1], 10);
      if (n > max) max = n;
    }
    // 从纯文本页号 span 提取（acgn-active）
    const activeRe = /class="[^"]*\bacgn-active\b[^"]*">(\d+)<\/span>/g;
    while ((mm = activeRe.exec(scope))) {
      const n = parseInt(mm[1], 10);
      if (n > max) max = n;
    }

    if (max > 0) return max;
    // 无分页器：若当前页有内容仍返回 currentPage（可能是单页）
    return currentPage;
  }

  // ------------------------------------------------------------ 搜索
  //
  // 站点搜索通过 POST /api/front/index/search 完成，body: key={urlencoded}
  // 响应：{code:0,data:[{id,name,cover,info_url,author,keywords,area,isfull,...}]}
  // 单页全量、无分页。
  //
  // GET /search?searchkey=... 实测返回 0 字节（页面 JS 渲染），故用 API。

  search = {
    load: async (keyword, options, page) => {
      const kw = String(keyword || "").trim();
      const safePage = typeof page === "number" ? page : parseInt(page, 10) || 1;
      if (!kw) return { comics: [], maxPage: safePage };
      try {
        const url = `${this.url}/api/front/index/search`;
        const body = "key=" + encodeURIComponent(kw);
        const res = await this.postJson(url, body, `${this.url}/`);
        const list = (res && res.code === 0 && Array.isArray(res.data)) ? res.data : [];
        const comics = [];
        const seen = new Set();
        for (const item of list) {
          if (!item || !item.id) continue;
          const id = String(item.id);
          if (seen.has(id)) continue;
          seen.add(id);
          const infoUrl = item.info_url || item.uri || `/manga/${id}/`;
          const title = (item.name || "").trim();
          if (!title) continue;
          const cover = this.fixBackslashUrl(item.cover || item.bcover || item.banner_cover || "");
          const subTitle = (item.author || "").trim();
          comics.push(new Comic({
            id,
            title,
            cover: this.absoluteUrl(cover),
            subTitle,
            updateTime: "",
            sourceKey: this.key,
          }));
          if (comics.length >= 100) break; // 站点单页最多返回 100 条左右
        }
        // 搜索无分页
        return { comics, maxPage: 1 };
      } catch (e) {
        console.error("YYDS 搜索失败：", e);
        return { comics: [], maxPage: safePage };
      }
    },
  };

  // ------------------------------------------------------------ 详情与章节

  comic = {
    loadInfo: async (id) => {
      const comicId = this.normalizeComicId(id);
      if (!comicId) throw new Error(`无效的漫画 ID：${id}`);
      const detailUrl = `${this.url}/manga/${comicId}/`;
      const html = await this.getText(detailUrl, this.url + "/");
      const doc = new HtmlDocument(html);
      try {
        // 标题
        const ogTitle = doc.querySelector('meta[property="og:title"]');
        let title = ogTitle && ogTitle.attributes ? ogTitle.attributes.content || "" : "";
        if (!title) {
          const h1 = doc.querySelector("h1");
          if (h1 && h1.text) title = String(h1.text).trim();
        }
        if (!title) throw new Error("详情页标题缺失");

        // 封面：og:image（可信，非 share-icon）
        const ogImage = doc.querySelector('meta[property="og:image"]');
        let cover = ogImage && ogImage.attributes ? ogImage.attributes.content || "" : "";
        if (!cover) {
          const info1 = doc.querySelector(".info1 img, .model-cover img, img.acgn-cover, .cover");
          if (info1 && info1.attributes) cover = info1.attributes.src || "";
        }

        // 作者
        const ogAuthor = doc.querySelector('meta[property="og:novel:author"]');
        let author = ogAuthor && ogAuthor.attributes ? ogAuthor.attributes.content || "" : "";

        // 分类 / 状态 / 最近更新
        const ogCategory = doc.querySelector('meta[property="og:novel:category"]');
        let category = ogCategory && ogCategory.attributes ? ogCategory.attributes.content || "" : "";
        const ogStatus = doc.querySelector('meta[property="og:novel:status"]');
        let status = ogStatus && ogStatus.attributes ? ogStatus.attributes.content || "" : "";
        const ogUpdateTime = doc.querySelector('meta[property="og:novel:update_time"]');
        let updateTime = ogUpdateTime && ogUpdateTime.attributes ? ogUpdateTime.attributes.content || "" : "";

        // 简介：meta[name=description]（og:description 是「暂未提供简介」占位文案）
        let description = "";
        const metaDesc = doc.querySelector('meta[name="description"]');
        if (metaDesc && metaDesc.attributes && metaDesc.attributes.content) {
          description = String(metaDesc.attributes.content).trim();
        }
        const ogDesc = doc.querySelector('meta[property="og:description"]');
        if ((!description || description === "暂未提供简介") && ogDesc && ogDesc.attributes) {
          const d = ogDesc.attributes.content || "";
          if (d && d !== "暂未提供简介") description = d;
        }
        if (!description || /^暂未提供简介/.test(description)) description = "";

        // 章节列表：<ol class="chapter-list" id="j_chapter_list">
        // 每 li[data-chapter="epId"] > a[href="/episode/{aid}/{epId}.html"]
        // 站点页面默认正序（第 1 话在前）。
        // 长漫画（>20 话）页面默认只展示前 20 或后 20 条，通过 page-last 二次加载。
        const chapters = new Map();
        const chapterEls = doc.querySelectorAll("ol.chapter-list li[data-chapter]");
        for (const el of chapterEls) {
          if (!el.attributes) continue;
          const epId = this.normalizeEpId(el.attributes["data-chapter"] || "");
          if (!epId) continue;
          const a = el.querySelector("a[href]");
          let name = "";
          if (a) {
            name = (a.text || "").trim();
            if (!name && a.attributes) name = (a.attributes.title || "").trim();
          }
          if (!name) {
            const nameEl = el.querySelector(".name, .acgn-title, a");
            if (nameEl) name = (nameEl.text || "").trim();
          }
          if (name && !chapters.has(epId)) chapters.set(epId, name);
        }

        // 若章节数 = 20 且页面有 page-last 按钮，则尝试加载完整目录
        if (chapters.size === 20) {
          const pageLastEl = doc.querySelector("button.page-last, .page-last");
          if (pageLastEl) {
            try {
              const fullUrl = `${this.url}/manga/${comicId}/?tabs=chapters`;
              const fullHtml = await this.getText(fullUrl, this.url + "/");
              const fullDoc = new HtmlDocument(fullHtml);
              try {
                const fullEls = fullDoc.querySelectorAll("ol.chapter-list li[data-chapter]");
                // 只有当二次请求返回更多章节时才替换
                if (fullEls.length > 20) {
                  chapters.clear();
                  for (const el of fullEls) {
                    if (!el.attributes) continue;
                    const epId = this.normalizeEpId(el.attributes["data-chapter"] || "");
                    if (!epId) continue;
                    const a = el.querySelector("a[href]");
                    let name = "";
                    if (a) {
                      name = (a.text || "").trim();
                      if (!name && a.attributes) name = (a.attributes.title || "").trim();
                    }
                    if (name && !chapters.has(epId)) chapters.set(epId, name);
                  }
                }
              } finally {
                fullDoc.dispose();
              }
            } catch (e) {
              console.error("YYDS 加载完整目录失败：", e);
            }
          }
        }

        if (!chapters.size) throw new Error("章节列表为空");

        const tags = {};
        if (category) tags["分类"] = [category];
        if (status) tags["状态"] = [status];

        return new ComicDetails({
          title,
          subTitle: author,
          cover: this.absoluteUrl(cover),
          tags,
          chapters,
          description,
          updateTime,
          comic: new Comic({
            id: comicId,
            title,
            subTitle: author,
            cover: this.absoluteUrl(cover),
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
     * POST /api/comic/read/pics
     *   body: id={epId}&aid={comicId}&offset=0&limit={picCount 或大值}
     *   响应：{code:1,data:{pic:[{pic:"https:\\\\/…jpg",id:"…"}],total,offset,limit}}
     *
     * 一次请求即可取全部图片（total 一般 ≤ 100），limit 设为 max(100, picCount)。
     * pic 字段用 \\/ 表示 /，需要 fixBackslashUrl 还原。
     */
    loadEp: async (comicId, epId) => {
      const epIdNorm = this.normalizeEpId(epId);
      if (!epIdNorm) return { images: [] };
      const cid = this.normalizeComicId(comicId);
      if (!cid) return { images: [] };
      const referer = `${this.url}/episode/${cid}/${epIdNorm}.html`;
      try {
        const url = `${this.url}/api/comic/read/pics`;
        let allImages = [];
        let offset = 0;
        const limit = 100;
        // 循环直到取完（正常 1-2 次即可）
        for (let round = 0; round < 10; round++) {
          const body = `id=${epIdNorm}&aid=${cid}&offset=${offset}&limit=${limit}`;
          const res = await this.postJson(url, body, referer);
          if (!res || res.code !== 1) {
            // 接口报错：可能是付费章节或用户校验失败
            console.error(`YYDS 章节 ${epIdNorm} 接口返回异常：`, res && res.msg);
            break;
          }
          const data = res.data || {};
          const pics = Array.isArray(data.pic) ? data.pic : [];
          if (!pics.length) break;
          for (const p of pics) {
            if (p && p.pic) {
              const u = this.fixBackslashUrl(p.pic);
              if (u) allImages.push(u);
            }
          }
          const total = Number(data.total) || 0;
          offset += pics.length;
          if (offset >= total) break;
          if (pics.length < limit) break;
        }
        return {
          images: allImages,
          headers: {
            "User-Agent": this.siteUa,
            Referer: referer,
          },
        };
      } catch (e) {
        console.error(`YYDS 章节 ${epIdNorm} 图片加载失败：`, e);
        return { images: [] };
      }
    },

    /**
     * 图片请求头：CDN（tuer.justpic01pt.com / pppic.greenkosovo.com / pic3.vinceus.top 等）
     * 无防盗链，但为稳妥带上本章 Referer 与 UA。
     */
    onImageLoad: (url, comicId, epId) => {
      const epIdNorm = this.normalizeEpId(epId);
      const cid = this.normalizeComicId(comicId);
      const referer =
        epIdNorm && cid ? `${this.url}/episode/${cid}/${epIdNorm}.html` : this.url + "/";
      return {
        headers: {
          "User-Agent": this.siteUa,
          Referer: referer,
        },
      };
    },
  };
}
