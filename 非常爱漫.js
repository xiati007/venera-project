/**
 * 非常爱漫（veryim.com）Venera 漫画源 v1.0.1
 *
 * 站点：qingtiancms 建站系统（ASP.NET / IIS），服务端渲染静态 HTML。
 * 取证日期：2026-10-13
 *
 * 已取证并验证的能力：
 *  - 首页：多个 panel 推荐区块（JJ韩漫 / 国漫 / 日漫 等），广告区块跳过。
 *  - 近期更新：/update/（站点导航「近期更新」），单页全量、无分页链接，
 *    卡片结构与首页一致（.ph12 内为 <font color="red">日期</font>）。
 *    实测 /update/2.html 302 回首页 → 更新页无第 2 页。
 *  - 阅读排行：/rank/（站点导航「阅读排行」），13 个榜单 panel
 *    （热血榜/格斗榜/搞笑榜/耽美榜/少女榜/冒险榜/魔幻榜/校园榜/百合榜/
 *    JJ韩漫榜/韩耽榜/国漫榜/韩国榜），共 234 张卡片，单页全量、无分页，
 *    .ph12 为「热度：xxxx」。
 *  - 分类：/list/{pinyin}/ 第 1 页，第 N 页 /list/{pinyin}/{N}.html；
 *    全部列表 /list/ 与 /list/{N}.html。
 *    「下一页」链接存在即未到末页；越界页 302 重定向回首页（非 404）。
 *    分类导航全集已取证（/list/ 页）：状态（完结/连载中）、
 *    题材 9 项、综合分区 JJ韩漫/韩耽/国漫/韩国。
 *  - 搜索：GET /statics/search.aspx?key={关键词}，单页全量返回（无分页链接）。
 *    卡片 .col-lg-3 > .media：封面链接 title 属性、标题 .book-title a、
 *    作者 .book_author a。
 *  - 详情：/manhua/{id}/，og:title / og:image / og:novel:author /
 *    og:novel:category / og:novel:status；分类与状态另从 .info3 文本兜底；
 *    简介取 meta[name=description]（og:description 是「暂未提供简介」占位文案）；
 *    章节列表 #play_0 ul.list-charts li a[href="/manhua/{id}/{ep}.html"]（倒序全量）。
 *  - 章节图片：/manhua/{id}/{ep}.html 内联变量 qTcms_S_m_murl_e，
 *    标准 Base64 解码后用 "$qingtiandy$" 分隔出图片 URL 列表；
 *    实测 img1.du8.in/hmpic/...webp 直链 200 image/webp，无防盗链（任意 Referer 可读）。
 *    第 2 话 45 张、第 20 话 45 张，全部 https 直链。
 *
 * 图片协议结论：无加密（Base64 仅为传输编码，前端 js_cms.min.js 的
 * CMS.base64.decode2 同样 decode + split("$qingtiandy$")），不实现任何解密，
 * 不执行站点 eval/Function。
 *
 * 权限边界：取证范围内全部公开可读，未发现登录/付费墙；不实现登录。
 *
 * 已知限制：
 *  - 分类末页探测：越界页重定向首页而非 404，maxPage 采用「下一页」链接
 *    链式推进（进入分类时从第 1 页开始跟随，页数少时开销小）；
 *    不做盲目 page+1 推算。
 *  - 搜索、近期更新、阅读排行均为单页全量返回，无分页。
 *  - 部分漫画无作者/无简介，按空字符串处理。
 */

class FeiChangAiMan extends ComicSource {
  name = "非常爱漫";
  key = "veryim";
  version = "1.0.1";
  minAppVersion = "1.0.0";
  url = "https://www.veryim.com";

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

  baseHeaders(referer) {
    return {
      "User-Agent": this.siteUa,
      Referer: referer || this.url + "/",
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

  /** 统一网络请求：瞬态错误有限重试一次，非 2xx 抛错。 */
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

  /** 从 impanel-heading 取区块标题：去掉图标 span 与冗余空白。 */
  panelTitle(head) {
    if (!head) return "";
    const clone = String(head.text || "");
    // head.text 已是纯文本；图标 span 通常无文本，仅清理前后空白
    return clone.replace(/\s+/g, " ").trim();
  }

  // ------------------------------------------------------------ ID 标准化

  /** 从 /manhua/72639/、完整 URL、纯数字、组合形态中提取漫画 ID。 */
  parseComicId(href) {
    const value = String(href || "").trim();
    if (!value) return null;
    const match = value.match(/\/manhua\/(\d+)(?:\/|\.html|$)/);
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
   *  2051300                    普通章节 ID
   *  /manhua/72639/2051300.html 章节链接
   *  https://www.veryim.com/manhua/72639/2051300.html  完整章节 URL
   *  72639|2051300              组合 ID（取最后一段）
   *  {epId/chapterId/id/url}    对象参数
   *  非法值返回 null，由调用方安全返回空图片。
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
    const pathMatch = value.match(/\/manhua\/\d+\/(\d+)\.html/);
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
   * 通用卡片解析。三类卡片统一处理：
   *
   * 首页/分类/更新/排行（结构 A）：
   *   .media > .media-left > a[href="/manhua/{id}/"]（封面 img.src）
   *   > p.ph11 > a 标题；p.ph12 日期或「热度：n」
   *
   * 搜索页（结构 B）：
   *   .media > .media-left > a[href]（封面 img.src）
   *   > .media-body > h4.book-title > a 标题；.book_author > a 作者
   *
   * 统一取法：ID 从任意指向 /manhua/ 的链接取；
   * 标题优先 .book-title a，其次 .ph11 a，再次首个 /manhua/ 链接的
   * 文本或 title 属性；副标题优先作者（.book_author），否则 .ph12。
   */
  parseMediaCard(card) {
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
    const bookTitleA = card.querySelector(".book-title a");
    if (bookTitleA) {
      title = (bookTitleA.text || "").trim();
      if (!title && bookTitleA.attributes) title = (bookTitleA.attributes.title || "").trim();
    }
    if (!title) {
      const ph11A = card.querySelector(".ph11 a");
      if (ph11A) {
        title = (ph11A.text || "").trim();
        if (!title && ph11A.attributes) title = (ph11A.attributes.title || "").trim();
      }
    }
    if (!title) {
      title = (link.text || "").trim();
      if (!title) title = (link.attributes.title || "").trim();
    }
    if (!title) return null;

    // 3) 封面
    let cover = "";
    const img = card.querySelector("img");
    if (img && img.attributes) {
      cover =
        img.attributes["data-src"] ||
        img.attributes["data-original"] ||
        img.attributes.src ||
        "";
    }

    // 4) 更新时间：.ph12 在列表页/首页/更新页为日期（如 2026-10-13）
    let updateTime = "";
    const ph12 = card.querySelector(".ph12");
    if (ph12 && ph12.text) updateTime = (ph12.text || "").trim();

    // 5) 副标题：作者（搜索页）优先，其次日期/热度
    let subTitle = "";
    const authorEl = card.querySelector(".book_author");
    if (authorEl) {
      const authorA = authorEl.querySelector("a");
      subTitle = ((authorA ? authorA.text : authorEl.text) || "").trim();
      subTitle = subTitle.replace(/^作者\s*[:：]?\s*/, "").trim();
    }
    if (!subTitle) subTitle = updateTime;

    return new Comic({
      id,
      title,
      cover: this.absoluteUrl(cover),
      subTitle,
      updateTime,
      sourceKey: this.key,
    });
  }

  /** 解析整页 HTML 中全部列表卡片（首页区块 / 分类页 / 更新 / 排行 / 搜索通用）。 */
  parseCards(html, cardSelector) {
    const doc = new HtmlDocument(html);
    try {
      const cards = doc.querySelectorAll(cardSelector || ".media");
      const comics = [];
      const seen = new Set();
      for (const card of cards) {
        const comic = this.parseMediaCard(card);
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
   * 解析页面内所有「推荐/榜单」区块（首页、更新页、排行页通用）：
   * .panel > .impanel-heading（标题）+ .impanel-body.panel-recommand > .media
   * 标题为空或「广告」等无内容区块自动跳过。
   */
  parsePanels(html) {
    const doc = new HtmlDocument(html);
    try {
      const panels = doc.querySelectorAll(".panel");
      const result = [];
      for (const panel of panels) {
        const head = panel.querySelector(".impanel-heading");
        const body = panel.querySelector(".impanel-body.panel-recommand");
        if (!head || !body) continue;
        let title = this.panelTitle(head);
        if (!title || title === "广告" || title.indexOf("广而告之") >= 0) continue;
        const comics = [];
        for (const item of body.querySelectorAll(".media")) {
          const comic = this.parseMediaCard(item);
          if (comic) comics.push(comic);
        }
        if (comics.length > 0) result.push({ title, comics });
      }
      return result;
    } finally {
      doc.dispose();
    }
  }

  // ------------------------------------------------------------ 首页推荐
  //
  // 首页为多 panel 推荐（JJ韩漫 / 国漫 / 日漫 等），无分页。
  // 另加「近期更新」区块（/update/，站点导航入口，单页全量）。

  explore = [
    {
      title: this.name,
      type: "multiPartPage",
      load: async () => {
        const parts = [];
        try {
          const html = await this.getText(this.url + "/", this.url + "/");
          for (const part of this.parsePanels(html)) parts.push(part);
        } catch (e) {
          console.error("非常爱漫首页解析失败：", e);
        }
        try {
          const html = await this.getText(this.url + "/update/", this.url + "/");
          const comics = this.parseCards(html, ".media");
          if (comics.length) parts.push({ title: "近期更新", comics });
        } catch (e) {
          console.error("非常爱漫近期更新解析失败：", e);
        }
        return parts;
      },
    },
  ];

  // ------------------------------------------------------------ 分类
  //
  // 设计：独立分区入口「全部漫画」（对应 /list/），进入后提供多维筛选面板。
  // 站点 /list/ 首屏有 3 行筛选（状态 / 字母 / 题材），按用户要求去掉字母，
  // 只保留题材 + 状态两组。站点 URL 只支持单一 pinyin 维度（不能组合），
  // 因此两组筛选是互斥的：题材优先，题材选了具体值就用题材 pinyin；
  // 否则看状态；都为「全部」时请求 /list/ 全部漫画列表。
  //
  // 题材列表取自 /list/ 首屏筛选面板取证（9 项 + 4 个综合分区：
  // JJ韩漫 / 韩耽 / 国漫 / 韩国，与站点导航一致）。
  // 状态取自 /list/ 首屏第一行（完结 / 连载中）。
  //
  // 排行页：站点导航「阅读排行」/rank/ 含 13 个题材榜（单页全量）。

  category = {
    title: this.name,
    parts: [
      {
        name: "漫画分类",
        type: "fixed",
        categories: ["全部漫画"],
        itemType: "category",
        categoryParams: ["all"],
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    // 多维筛选面板（2 组，均带「全部」默认项）。
    // 选项格式 "pinyin-显示名"；pinyin 为空串表示「全部」（不附加路径段）。
    optionList: [
      {
        label: "题材",
        type: "select",
        options: [
          "-全部",
          "rexue-热血", "gedou-格斗", "gaoxiao-搞笑", "danmei-耽美",
          "shaonv-少女", "maoxian-冒险", "mohuan-魔幻", "xiaoyuan-校园",
          "baihe-百合", "JJ-JJ韩漫", "handan-韩耽", "guoman-国漫", "hanguo-韩国",
        ],
      },
      {
        label: "状态",
        type: "select",
        options: ["-全部", "wanjie-完结", "lianzai-连载中"],
      },
    ],

    /**
     * 分类列表加载：
     * - 入口 param="all"（全部漫画）→ /list/ 全部列表；
     * - 筛选面板：题材组(0)优先，题材选了具体值 → /list/{题材pinyin}/；
     *   题材为「全部」时看状态组(1)，状态选了具体值 → /list/{状态pinyin}/；
     *   两组都「全部」→ /list/ 全部漫画。
     * - 分页：/list/{pinyin}/{N}.html（第 1 页无页号）；
     *   全部列表分页 /list/{N}.html。
     * - maxPage：页面有「下一页」链接 → page+1；否则末页。
     *   （越界页 302 重定向首页，不能靠二分探测。）
     */
    load: async (category, param, options, page) => {
      const safePage = typeof page === "number" ? page : parseInt(page, 10) || 1;
      const opts = Array.isArray(options) ? options : [];
      const optPinyin = (val) => {
        const s = typeof val === "string" ? val.trim() : "";
        if (!s) return "";
        const idx = s.indexOf("-");
        return idx >= 0 ? s.slice(0, idx).trim() : s;
      };
      const themePinyin = optPinyin(opts[0]);
      const statusPinyin = optPinyin(opts[1]);
      const pinyin = themePinyin || statusPinyin || "";

      try {
        // 分页规则写死：/list/{pinyin}/{page}.html，无 pinyin 时 /list/{page}.html
        // 已实测 /list/rexue/1.html 与 /list/rexue/ 内容完全一致，故第 1 页无需特判。
        const url = pinyin
          ? `${this.url}/list/${pinyin}/${safePage}.html`
          : `${this.url}/list/${safePage}.html`;

        const html = await this.getText(url, this.url + "/");
        const comics = this.parseCards(html, ".media");
        return {
          comics,
          maxPage: this.hasNextPage(html) ? safePage + 1 : safePage,
        };
      } catch (e) {
        console.error(`非常爱漫分类「${category}」加载失败：`, e);
        return { comics: [], maxPage: safePage };
      }
    },
  };

  /**
   * 判断列表页是否存在「下一页」按钮（即是否还有下一页）。
   *
   * 真实分页器结构（/list/2.html 与 /list/rexue/2.html 均一致）：
   *   <ul class="pager">
   *     <li><a href="./" class="btn btn-info">上一页</a></li>
   *     <li><a href="3.html" class="btn btn-info">下一页</a></li>
   *   </ul>
   *
   * 注意两点：
   *  - href 是「相对链接」(3.html)，不是 /list/3.html，因此不能按绝对路径正则判定；
   *  - 末页没有「尾页」按钮，是「下一页」这个 <li> 整体消失。
   * 所以直接按按钮文本判定即可，pinyin 无关。
   */
  hasNextPage(html) {
    return />\s*下一页\s*<\/a>/i.test(String(html || ""));
  }

  // ------------------------------------------------------------ 搜索

  search = {
    load: async (keyword, options, page) => {
      const kw = String(keyword || "").trim();
      const safePage = typeof page === "number" ? page : parseInt(page, 10) || 1;
      if (!kw) return { comics: [], maxPage: safePage };
      try {
        const url = `${this.url}/statics/search.aspx?key=${encodeURIComponent(kw)}`;
        const html = await this.getText(url, this.url + "/");
        // 搜索页单页全量返回，无分页链接 → maxPage = 1
        return { comics: this.parseCards(html, ".media"), maxPage: 1 };
      } catch (e) {
        console.error("非常爱漫搜索失败：", e);
        return { comics: [], maxPage: safePage };
      }
    },
  };

  // ------------------------------------------------------------ 详情与章节

  /** 标准 Base64 解码为 UTF-8 字符串（与站点 CMS.base64.decode 同语义）。 */
  decodeBase64(b64) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    const bytes = [];
    let i = 0;
    while (i < b64.length) {
      let enc1 = alphabet.indexOf(b64.charAt(i++));
      let enc2 = alphabet.indexOf(b64.charAt(i++));
      let enc3 = alphabet.indexOf(b64.charAt(i++));
      let enc4 = alphabet.indexOf(b64.charAt(i++));
      if (enc1 === -1 || enc2 === -1) break;
      const res = (enc1 << 18) | (enc2 << 12) | (enc3 << 6) | enc4;
      bytes.push((res >> 16) & 0xff);
      if (enc3 !== 64 && enc3 !== -1) {
        bytes.push((res >> 8) & 0xff);
        if (enc4 !== 64 && enc4 !== -1) bytes.push(res & 0xff);
      }
    }
    let out = "";
    let j = 0;
    while (j < bytes.length) {
      const b = bytes[j];
      if (b < 0x80) {
        out += String.fromCharCode(b);
        j++;
      } else if (b < 0xe0) {
        out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[j + 1] & 0x3f));
        j += 2;
      } else {
        out += String.fromCharCode(
          ((b & 0x0f) << 12) | ((bytes[j + 1] & 0x3f) << 6) | (bytes[j + 2] & 0x3f)
        );
        j += 3;
      }
    }
    return out;
  }

  comic = {
    loadInfo: async (id) => {
      const comicId = this.normalizeComicId(id);
      if (!comicId) throw new Error(`无效的漫画 ID：${id}`);
      const html = await this.getText(
        `${this.url}/manhua/${comicId}/`,
        this.url + "/"
      );
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

        // 封面：og:image
        const ogImage = doc.querySelector('meta[property="og:image"]');
        let cover = ogImage && ogImage.attributes ? ogImage.attributes.content || "" : "";
        if (!cover) {
          const info1 = doc.querySelector(".info1 img");
          if (info1 && info1.attributes) cover = info1.attributes.src || "";
        }

        // 作者：og:novel:author
        const ogAuthor = doc.querySelector('meta[property="og:novel:author"]');
        let author = ogAuthor && ogAuthor.attributes ? ogAuthor.attributes.content || "" : "";
        if (!author) {
          // 页面正文作者兜底（<font color="blue">作者：</font> 后接 a/文字）
          const textMatch = String(doc.querySelector("body") ? doc.querySelector("body").text : "")
            .match(/作者\s*[:：]\s*([^<\s，,]+)/);
          if (textMatch) author = textMatch[1];
        }

        // 分类 + 状态：og:novel:category / og:novel:status 优先，.info3 文本兜底
        let category = "";
        let status = "";
        const ogCategory = doc.querySelector('meta[property="og:novel:category"]');
        if (ogCategory && ogCategory.attributes) category = ogCategory.attributes.content || "";
        const ogStatus = doc.querySelector('meta[property="og:novel:status"]');
        if (ogStatus && ogStatus.attributes) status = ogStatus.attributes.content || "";
        const info3 = doc.querySelector(".info3");
        if (info3 && info3.text) {
          const infoText = String(info3.text);
          if (!category) {
            const catMatch = infoText.match(/漫画类别[：:]\s*([^\s/]+)/);
            if (catMatch) category = catMatch[1];
          }
          if (!status) {
            const statusMatch = infoText.match(/漫画状态[：:]\s*([^\s/]+)/);
            if (statusMatch) status = statusMatch[1];
          }
        }

        // 简介：meta[name=description]（页面真实简介；og:description 是占位文案）
        let description = "";
        const metaDesc = doc.querySelector('meta[name="description"]');
        if (metaDesc && metaDesc.attributes && metaDesc.attributes.content) {
          description = String(metaDesc.attributes.content)
            .replace(/^《.*?》漫画[^。]*。/g, "")
            .trim();
        }
        if (
          !description ||
          description === "暂未提供简介" ||
          /^暂未提供简介/.test(description)
        ) {
          description = "";
        }

        // 章节列表：#play_0 ul.list-charts li a
        // 站点页面是**倒序**（最新话在前，如 第20话→第19话→…→第1话），
        // 这里整体反转还原为**正序**（第 1 话在前）。
        // 用 DOM 顺序反转而非 epId 数值排序：epId 随上架时间分配、并非严格
        // 单调递增，按数值排可能打乱站点自身的正确顺序。
        const chapters = new Map();
        const chapterEls = doc.querySelectorAll("#play_0 ul.list-charts li a[href]");
        const reversedEls = Array.prototype.slice.call(chapterEls).reverse();
        for (const el of reversedEls) {
          if (!el.attributes) continue;
          const href = el.attributes.href || "";
          const epId = this.normalizeEpId(href);
          if (!epId) continue;
          let name = el.text ? String(el.text).trim() : "";
          if (!name && el.attributes.title) name = String(el.attributes.title).trim();
          if (name && !chapters.has(epId)) chapters.set(epId, name);
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
          updateTime: "",
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
     * 章节页 /manhua/{cid}/{ep}.html 内联变量 qTcms_S_m_murl_e，
     * Base64 解码 → "$qingtiandy$" 分隔 → 图片 URL 数组。
     * 与站点前端 js_cms.min.js CMS.base64.decode2 完全一致（取证）。
     * 单页全量（45 张实测），无图片分页。
     */
    loadEp: async (comicId, epId) => {
      const epIdNorm = this.normalizeEpId(epId);
      if (!epIdNorm) return { images: [] };
      const cid = this.normalizeComicId(comicId);
      if (!cid) return { images: [] };
      const referer = `${this.url}/manhua/${cid}/${epIdNorm}.html`;
      try {
        const html = await this.getText(referer, `${this.url}/manhua/${cid}/`);
        const m = String(html).match(/qTcms_S_m_murl_e\s*=\s*"([A-Za-z0-9+/=]+)"/);
        if (!m || !m[1]) {
          console.error(`非常爱漫章节 ${epIdNorm} 未找到 qTcms_S_m_murl_e`);
          return { images: [] };
        }
        const decoded = this.decodeBase64(m[1]);
        const urls = decoded.split("$qingtiandy$").filter(Boolean);
        const images = [];
        const seen = new Set();
        for (const u of urls) {
          const abs = this.absoluteUrl(u);
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
      } catch (e) {
        console.error(`非常爱漫章节 ${epIdNorm} 图片加载失败：`, e);
        return { images: [] };
      }
    },

    /**
     * 图片请求头：实测 img1.du8.in 无防盗链（任意 Referer 均 200），
     * 防御性带上本章 Referer 与 UA。
     */
    onImageLoad: (url, comicId, epId) => {
      const epIdNorm = this.normalizeEpId(epId);
      const cid = this.normalizeComicId(comicId);
      const referer =
        epIdNorm && cid ? `${this.url}/manhua/${cid}/${epIdNorm}.html` : this.url + "/";
      return {
        headers: {
          "User-Agent": this.siteUa,
          Referer: referer,
        },
      };
    },
  };
}
