/**
 * 爱漫画网 (eemh.top) Venera 漫画源
 *
 * 版本: 1.0.2
 * 站点: https://eemh.top/  「爱漫画网」— WordPress + 帝国CMS(readnovel 5.0.1) 小说/漫画主题
 * 取证时间: 2026-10-14   证据等级: 真实页面在线取证（首页/搜索/分类/详情/章节/图片）
 *
 * 1.0.2 修复 (相较 1.0.1):
 * - ComicDetails.tags 契约错误：Venera 的 tags 是 Map<String, List<String>>（分组标签），
 *   不是 List<String>。传数组会让 Dart 侧 _generateMap(Map<dynamic, dynamic>) 抛
 *   "type 'List<dynamic>' is not a subtype of type 'Map<dynamic, dynamic>'"，详情页仍打不开。
 *   取证：venera `lib/foundation/comic_source/models.dart` L151
 *         `final Map<String, List<String>> tags;` / L189 `_generateMap(Map<dynamic, dynamic>)`。
 *   修复：tags 改为分组 Map，如 { "作者": [...], "分类": [...], "状态": [...] }。
 * - 同时撤销 1.0.1 之后的一次错误改动：曾误判「JS Map 会被桥接成 List」而把
 *   collectChapters 的返回值替换成空对象 {}，导致章节列表全丢（详情页有标题无章节）。
 *   取证：venera 所用 flutter_qjs 的 `lib/src/wrapper.dart` L224 有 jsIsMap 分支，
 *         明确把 JS Map 转成 Dart Map —— 与已发布的 50+ 源写法一致，无需改写对象。
 *   修复：恢复 `const chapters = await this.collectChapters(cid, baseUrl, doc)`。
 *
 * 1.0.1 修复 (相较 1.0.0):
 * - ComicDetails 构造字段名错误：用了 name / intro，Venera 契约要求 title / description。
 *   导致 Dart 侧 title 为 null，客户端打开详情页报
 *   "type 'Null' is not a subtype of type 'String'"。
 *   分类/首页/搜索不受影响（它们不构造 ComicDetails），因此此前在线回归未能发现。
 *   修复：name→title、intro→description；并在 final_check.js 增加契约字段静态断言。
 *
 * ── URL 规则（全部由真实响应取证，非猜测） ────────────────────────────
 *   漫画详情   GET /novel{id}/                    200
 *   章节       GET /novel{id}/chapter{N}.html      200   （N 从 0 开始，非连续）
 *   详情章节分页 GET /novel{id}/?p=N              200   每页 50 话，Last 链接给出总页数
 *   分类/列表   GET /{slug}/                       200   第 N 页 /{slug}/index_{N}.html
 *   搜索入口   GET /e/search/index.php?keyboard={kw}&show=title,writer,byr&searchget=1
 *              → 302 Location: result/?searchid={sid}   （命中时）
 *              → 200 直接返回（无命中时，无 302）
 *   搜索翻页   GET /e/search/result/index.php?page={N-1}&searchid={sid}   （0 基页码）
 *
 * ── 分类 slug 与真实页数（每项均由 Last 链接取证，maxPage 不硬编码） ─────
 *   hanman 354 / riman 1937 / 3d 153 / doujin 1916 / single 208
 *   short 815 / cosplay 338 / cg 249
 *   latest 50 / release 50 / popular 50 / completed 50
 *
 * ── 卡片结构（分类/搜索/列表页同构，主区每页 20 张） ──────────────────
 *   <div class="col-md-3 col-sm-6 col-xs-6 home-truyendecu" itemscope itemtype=".../Book">
 *     <div class="each_truyen"><a href="/novel{id}/"><img src="{封面}"></a></div>
 *     <div class="caption">
 *       <a href="/novel{id}/"><h3 itemprop="name">{标题}</h3></a>
 *       <div class="chi-tiet tt-status"><a href="/novel{id}/chapter{N}.html">
 *         <small class="btn-xs label-primary">…{最新章节标题}</small></a></div>
 *     </div>
 *   </div>
 *
 * ── 首页区块 ──────────────────────────────────────────────────────
 *   推荐漫画   .de-cu > .normal-image1（7 张，含真实封面）
 *   最近更新   ul.truyenhot_ul_customcol > li.truyenhot_li_customcol（20 条，纯文字无封面）
 *             站点该区块 DOM 内确无 img/background/data-*，故用 favicon 占位，
 *             避免 UI 对空 cover 发起 "" 请求（参照已发布源同类问题的修复方式）
 *
 * ── 详情页字段（og 系列齐全，已逐项验证） ──────────────────────────
 *   og:image                真实封面（如 https://img1.du8.in/titlepic/yyt4896.jpg）
 *   og:novel:book_name      标题        og:novel:author   作者
 *   og:novel:category       分类        og:novel:status   连载/完结
 *   og:novel:update_time    更新时间    h3.title[itemprop=name] 标题回退
 *   .desc-text[itemprop=description] > .short-content    简介（含「介绍:」前缀与 <br>）
 *
 * ── 章节列表（两个 list-chapter 容器，必须只取正序那个） ──────────────
 *   容器①（"最新话"）  倒序，仅最近 6 话 —— 不含全量，不可用于 loadEp 的章节 Map
 *   容器②（id="list-chapter" 内）正序全量，每页 50，需遍历 ?p=1..maxPage
 *   真实样本 novel56136：p1 = n0..n49（50 话），p2 = n50..n91（42 话），合计 92 话
 *
 * ── 图片协议 ──────────────────────────────────────────────────────
 *   章节图为懒加载直链，无加密、无签名、无 Base64：
 *     <img style="..." data-original='{URL}' class='comic_img lazy' id="img{N}">
 *   实测三话样本：chapter0 = 336 张、chapter45 = 168 张、chapter91 = 165 张，
 *   均为 webp/jpeg 原始字节（RIFF/FFD8 文件头），Range 探测 206 + image/*。
 *   图片域名 img1.du8.in，实测无 Referer 亦可取；源内仍统一携带 UA+Referer。
 *
 * ── 安全边界 ──────────────────────────────────────────────────────
 *   只解析静态 HTML（正则 / HtmlDocument），不 eval、不 Function、
 *   不执行站点任何内联脚本；不做任何付费/登录/地区限制绕过。
 */

class AiManHuaWang extends ComicSource {
  name = "爱漫画网";
  key = "eemh";
  version = "1.0.2";
  minAppVersion = "1.0.0";
  url = "";

  HOST = "https://eemh.top";
  UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  /** 最近更新文字流无封面，用站点 favicon 占位，避免 UI 请求空 URL */
  PLACEHOLDER_COVER = "https://eemh.top/favicon.ico";

  /** 详情章节分页每页 50 话（取证：novel56136 p1=50, p2=42） */
  DETAIL_PAGE_SIZE = 50;
  /** 详情章节分页上限保护，避免异常超长漫画无限翻页 */
  MAX_DETAIL_PAGES = 60;

  // ---------------------------------------------------------------- 工具

  absoluteUrl(p) {
    if (!p) return "";
    const s = String(p).trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith("//")) return "https:" + s;
    if (s.startsWith("/")) return this.HOST + s;
    return this.HOST + "/" + s;
  }

  _headers(referer) {
    const h = { "User-Agent": this.UA };
    if (referer) h["Referer"] = referer;
    return h;
  }

  /**
   * 网络请求：仅对瞬态错误有限重试一次；403/404 等确定性错误不重试。
   */
  async _get(url, referer) {
    const transient = /timeout|timed out|connection reset|connection closed|peer closed|broken pipe|UnexpectedEof|network error|aborted|temporary|502|503|504/i;
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await Network.get(url, this._headers(referer || this.HOST + "/"));
        if (!res) throw new Error("empty response");
        if (res.status === 404 || res.status === 403 || res.status === 401) {
          // 确定性错误：直接返回，不重试
          return res;
        }
        if (res.status !== 200) {
          throw new Error("HTTP " + res.status);
        }
        return res;
      } catch (e) {
        lastErr = e;
        const msg = String(e == null ? "" : e);
        if (!transient.test(msg)) break;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
      }
    }
    throw lastErr || new Error("request failed");
  }

  /** 统一取文档；失败返回 null（调用方负责返回合规空结构） */
  async _doc(url, referer) {
    const res = await this._get(url, referer);
    if (!res || res.status !== 200 || !res.body) return null;
    return new HtmlDocument(res.body);
  }

  /** 漫画 ID 标准化：接受 56136 / novel56136 / /novel56136/ / 完整 URL */
  normalizeComicId(comicId) {
    if (comicId == null) return null;
    if (typeof comicId === "object") {
      return this.normalizeComicId(
        comicId.comicId || comicId.id || comicId.novelId || comicId.url || comicId.path
      );
    }
    const s = String(comicId).trim();
    if (!s) return null;
    const m = s.match(/novel(\d+)/i);
    if (m) return m[1];
    if (/^\d+$/.test(s)) return s;
    return null;
  }

  /**
   * 章节 ID 标准化（历史入参兼容矩阵）
   *   普通 ID        "91"                          -> "91"
   *   完整章节 URL   ".../novel56136/chapter91.html" -> "91"
   *   文件名形式     "chapter91.html"              -> "91"
   *   组合 ID        "56136|91" / "56136,91"       -> "91"（取最后一段）
   *   对象参数       {epId}/{chapterId}/{id}/{url}  -> 读白名单字段后递归
   *   非法/缺失      "" / null / {} / "abc"        -> null（不���请求）
   */
  normalizeEpId(epId) {
    if (epId == null) return null;
    if (typeof epId === "object") {
      return this.normalizeEpId(
        epId.epId || epId.chapterId || epId.chapter || epId.id || epId.url || epId.path
      );
    }
    const s = String(epId).trim();
    if (!s) return null;

    // 组合 ID：先按常见分隔符切分，取最后一段再判断
    if (s.indexOf("|") >= 0 || s.indexOf(",") >= 0) {
      const parts = s.split(/[|,]/).map((x) => x.trim()).filter(Boolean);
      return this.normalizeEpId(parts.length ? parts[parts.length - 1] : null);
    }

    const withChapter = s.match(/chapter(\d+)\.html/i);
    if (withChapter) return withChapter[1];

    // 尾部纯数字（兼容 "novel56136/chapter91" 之类）
    const tail = s.match(/(\d+)\s*$/);
    if (tail && /[/?=]|\.html?$/i.test(s)) return tail[1];

    if (/^\d+$/.test(s)) return s;
    return null;
  }

  // -------------------------------------------------------------- 列表解析

  /** 从 /novel{id}/ 形式的 href 提取漫画 ID */
  comicIdFromHref(href) {
    if (!href) return null;
    const m = String(href).match(/\/novel(\d+)\/?/);
    return m ? m[1] : null;
  }

  /** 列表卡片：.home-truyendecu（分类/搜索/列表页主区，共 20 张/页） */
  parseListCard(card) {
    if (!card) return null;
    const link = card.querySelector("a[href*='/novel']");
    if (!link) return null;
    const id = this.comicIdFromHref(link.attributes.href);
    if (!id) return null;

    let title = "";
    const h3 = card.querySelector("h3[itemprop=name]");
    if (h3) title = (h3.text || "").trim();
    if (!title) title = (link.attributes.title || "").trim();
    if (!title) return null;

    let cover = "";
    const box = card.querySelector(".each_truyen");
    if (box) {
      const img = box.querySelector("img");
      if (img) cover = img.attributes.src || img.attributes["data-original"] || "";
    }
    if (!cover) {
      const img = card.querySelector("img[itemprop=image]");
      if (img) cover = img.attributes.src || img.attributes["data-original"] || "";
    }
    cover = this.absoluteUrl(cover);

    // 最新章节：tt-status 内的小标签文本
    let sub = "";
    const statusA = card.querySelector(".tt-status a");
    if (statusA) {
      const small = statusA.querySelector("small");
      const t = ((small ? small.text : statusA.text) || "").replace(/\s+/g, " ").trim();
      if (t) sub = t;
    }

    return new Comic({
      id: id,
      title: title,
      subTitle: sub,
      cover: cover,
      description: "",
      tags: [],
    });
  }

  /** 首页推荐卡片：.de-cu .normal-image1 */
  parseHomeCard(card) {
    if (!card) return null;
    const link = card.querySelector("a[href*='/novel']");
    if (!link) return null;
    const id = this.comicIdFromHref(link.attributes.href);
    if (!id) return null;

    const h3 = card.querySelector("h3[itemprop=name]");
    let title = h3 ? (h3.text || "").trim() : "";
    if (!title) title = (link.attributes.title || "").trim();
    if (!title) return null;

    const img = card.querySelector("img[itemprop=image]") || card.querySelector("img");
    let cover = img ? img.attributes.src || img.attributes["data-original"] || "" : "";
    cover = this.absoluteUrl(cover);

    const cateEl = card.querySelector(".chuyen-muc");
    const cate = cateEl ? (cateEl.attributes.title || cateEl.text || "").trim() : "";

    return new Comic({
      id: id,
      title: title,
      subTitle: cate,
      cover: cover,
      description: "",
      tags: cate ? [cate] : [],
    });
  }

  /** 首页最近更新条目：li.truyenhot_li_customcol（站点未提供封面） */
  parseLatestItem(li) {
    if (!li) return null;
    let a = li.querySelector("h3 a");
    if (!a) a = li.querySelector("a[href*='/novel']");
    if (!a) return null;
    const id = this.comicIdFromHref(a.attributes.href);
    if (!id) return null;
    const title = (a.text || a.attributes.title || "").trim();
    if (!title) return null;

    const parts = [];
    const cate = li.querySelector(".update_cate");
    if (cate) {
      const t = (cate.attributes.title || cate.text || "").trim();
      if (t) parts.push(t);
    }
    const chapA = li.querySelector(".update_chap a");
    if (chapA) {
      let t = (chapA.attributes.title || chapA.text || "").replace(/\s+/g, " ").trim();
      const idx = t.indexOf(" - ");
      if (idx >= 0) t = t.substring(idx + 3).trim();
      if (t) parts.push(t);
    }

    return new Comic({
      id: id,
      title: title,
      subTitle: parts.join(" · "),
      cover: this.PLACEHOLDER_COVER,
      description: "",
      tags: [],
    });
  }

  /**
   * 从分页器解析总页数。
   * 分类/列表页：Last 链接形如 /hanman/index_354.html → 354
   * 搜索结果页：Last 链接形如 /e/search/result/index.php?page=1&searchid=74 → 2（0 基）
   */
  parseMaxPage(doc, current) {
    const p = parseInt(current, 10) || 1;
    if (!doc) return p;
    let max = 0;
    const links = doc.querySelectorAll("a[href]");
    for (let i = 0; i < links.length; i++) {
      const href = links[i].attributes.href || "";
      let n = 0;
      let m = href.match(/\/index_(\d+)\.html/);
      if (m) n = parseInt(m[1], 10);
      else {
        m = href.match(/[?&]page=(\d+)/);
        if (m) n = parseInt(m[1], 10) + 1;
      }
      if (n > max) max = n;
    }
    if (max < p) max = p;
    return max;
  }

  /** 搜索结果页分页器里取 searchid（翻页必需） */
  parseSearchId(doc) {
    if (!doc) return null;
    // 遍历全部链接取 searchid：分页器 href 形如 /e/search/result/index.php?page=1&searchid=74
    const links = doc.querySelectorAll("a[href]");
    for (let i = 0; i < links.length; i++) {
      const m = (links[i].attributes.href || "").match(/[?&]searchid=(\d+)/);
      if (m) return m[1];
    }
    return null;
  }

  // ---------------------------------------------------------------- 首页

  explore = [
    {
      title: "爱漫画网",
      type: "multiPartPage",
      load: async () => {
        const parts = [];
        let doc = null;
        try {
          doc = await this._doc(this.HOST + "/", this.HOST + "/");
          if (!doc) return parts;

          const recommend = [];
          const deCu = doc.querySelector(".de-cu");
          if (deCu) {
            const cards = deCu.querySelectorAll(".normal-image1");
            for (let i = 0; i < cards.length; i++) {
              const c = this.parseHomeCard(cards[i]);
              if (c) recommend.push(c);
            }
          }
          if (recommend.length > 0) {
            parts.push({ title: "推荐漫画", comics: recommend, viewMore: "热门排行" });
          }

          const latest = [];
          const ul = doc.querySelector("ul.truyenhot_ul_customcol");
          if (ul) {
            const lis = ul.querySelectorAll("li");
            for (let i = 0; i < lis.length; i++) {
              const c = this.parseLatestItem(lis[i]);
              if (c) latest.push(c);
            }
          }
          if (latest.length > 0) {
            parts.push({ title: "最近更新", comics: latest, viewMore: "最新更新" });
          }
        } catch (e) {
          console.log("aiManHuaWang explore error: " + e);
        } finally {
          if (doc) doc.dispose();
        }
        return parts;
      },
    },
  ];

  // ---------------------------------------------------------------- 分类

  category = {
    title: "爱漫画网",
    parts: [
      {
        name: "漫画分类",
        type: "fixed",
        categories: ["韩国漫画", "日文漫画", "3D漫画", "同人誌", "单行本", "杂志短篇", "Cosplay", "CG漫画"],
        itemType: "category",
        categoryParams: ["hanman", "riman", "3d", "doujin", "single", "short", "cosplay", "cg"],
      },
      {
        name: "更新与状态",
        type: "fixed",
        categories: ["最新更新", "最新入库", "热门排行", "完本漫画"],
        itemType: "category",
        categoryParams: ["latest", "release", "popular", "completed"],
      },
    ],
    // maxPage 一律由页面 Last 链接实时解析，无排行页
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      return await this.loadListPage(param, page);
    },
  };

  /** 列表页：第 1 页 /{slug}/，第 N 页 /{slug}/index_{N}.html */
  async loadListPage(slug, page) {
    if (!slug || page < 1) return { comics: [], maxPage: 1 };
    const s = String(slug).replace(/^\/+|\/+$/g, "");
    if (!/^[a-z0-9_-]+$/i.test(s)) return { comics: [], maxPage: 1 };
    const p = parseInt(page, 10) || 1;

    const url = p <= 1
      ? this.HOST + "/" + s + "/"
      : this.HOST + "/" + s + "/index_" + p + ".html";

    let doc = null;
    try {
      doc = await this._doc(url, this.HOST + "/" + s + "/");
      if (!doc) return { comics: [], maxPage: p };

      const comics = [];
      const seen = new Set();
      const cards = doc.querySelectorAll(".home-truyendecu");
      for (let i = 0; i < cards.length; i++) {
        const c = this.parseListCard(cards[i]);
        if (!c || seen.has(c.id)) continue;
        seen.add(c.id);
        comics.push(c);
      }
      const maxPage = this.parseMaxPage(doc, p);
      return { comics: comics, maxPage: maxPage };
    } catch (e) {
      console.log("aiManHuaWang loadListPage error: " + e);
      return { comics: [], maxPage: p };
    } finally {
      if (doc) doc.dispose();
    }
  }

  // ---------------------------------------------------------------- 搜索

  /** searchid 缓存：同关键词复用，避免翻页重复发起搜索 */
  _searchCache = null;

  search = {
    load: async (keyword, options, page) => {
      const kw = String(keyword == null ? "" : keyword).trim();
      const p = parseInt(page, 10) || 1;
      if (!kw || p < 1) return { comics: [], maxPage: 1 };

      const entryUrl = this.HOST + "/e/search/index.php?keyboard=" + encodeURIComponent(kw)
        + "&show=title,writer,byr&searchget=1";

      let sid = null;
      if (this._searchCache && this._searchCache.keyword === kw && this._searchCache.searchId) {
        sid = this._searchCache.searchId;
      }

      // 第 1 页：直接发起搜索（命中时 302 → 结果页；无命中时 200 且无结果卡片）
      if (p === 1 && !sid) {
        let doc = null;
        try {
          doc = await this._doc(entryUrl, this.HOST + "/");
          if (!doc) return { comics: [], maxPage: 1 };

          const comics = [];
          const seen = new Set();
          const cards = doc.querySelectorAll(".home-truyendecu");
          for (let i = 0; i < cards.length; i++) {
            const c = this.parseListCard(cards[i]);
            if (!c || seen.has(c.id)) continue;
            seen.add(c.id);
            comics.push(c);
          }
          const s = this.parseSearchId(doc);
          this._searchCache = s ? { keyword: kw, searchId: s } : null;
          const maxPage = comics.length === 0 ? 1 : this.parseMaxPage(doc, 1);
          return { comics: comics, maxPage: maxPage };
        } catch (e) {
          console.log("aiManHuaWang search error: " + e);
          return { comics: [], maxPage: 1 };
        } finally {
          if (doc) doc.dispose();
        }
      }

      // 第 N 页 / 缓存失效后的补建：先确保拿到 searchid
      if (!sid) {
        let doc = null;
        try {
          doc = await this._doc(entryUrl, this.HOST + "/");
          if (!doc) return { comics: [], maxPage: p };
          sid = this.parseSearchId(doc);
          if (sid) this._searchCache = { keyword: kw, searchId: sid };
        } catch (e) {
          console.log("aiManHuaWang search bootstrap error: " + e);
          return { comics: [], maxPage: p };
        } finally {
          if (doc) doc.dispose();
        }
        if (!sid) return { comics: [], maxPage: p };
      }

      // 0 基页码：显示第 N 页 ↔ page=N-1
      const pageUrl = this.HOST + "/e/search/result/index.php?page=" + (p - 1) + "&searchid=" + sid;
      let doc = null;
      try {
        doc = await this._doc(pageUrl, this.HOST + "/e/search/result/");
        if (!doc) return { comics: [], maxPage: p };

        const comics = [];
        const seen = new Set();
        const cards = doc.querySelectorAll(".home-truyendecu");
        for (let i = 0; i < cards.length; i++) {
          const c = this.parseListCard(cards[i]);
          if (!c || seen.has(c.id)) continue;
          seen.add(c.id);
          comics.push(c);
        }
        // searchid 失效 / 越界：页面无卡片，安全返回空，不猜 maxPage
        if (comics.length === 0) return { comics: [], maxPage: p };
        return { comics: comics, maxPage: this.parseMaxPage(doc, p) };
      } catch (e) {
        console.log("aiManHuaWang search page error: " + e);
        return { comics: [], maxPage: p };
      } finally {
        if (doc) doc.dispose();
      }
    },
  };

  // -------------------------------------------------------------- 详情/章节

  comic = {
    loadInfo: async (id) => {
      const cid = this.normalizeComicId(id);
      if (!cid) throw new Error("invalid comic id");
      return await this.loadComicInfo(cid);
    },

    loadEp: async (comicId, epId) => {
      const cid = this.normalizeComicId(comicId);
      const eid = this.normalizeEpId(epId);
      // 非法入参：安全返回空，不发畸形请求
      if (!cid || !eid) return { images: [] };
      return await this.loadChapterImages(cid, eid);
    },

    onImageLoad: (url, comicId, epId) => {
      const cid = this.normalizeComicId(comicId);
      const eid = this.normalizeEpId(epId);
      let referer = this.HOST + "/";
      if (cid && eid) {
        referer = this.HOST + "/novel" + cid + "/chapter" + eid + ".html";
      }
      return {
        headers: {
          "User-Agent": this.UA,
          "Referer": referer,
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      };
    },

    onThumbnailLoad: (url) => {
      return {
        headers: {
          "User-Agent": this.UA,
          "Referer": this.HOST + "/",
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      };
    },
  };

  /**
   * 识别站点「信息提示」错误页。
   * 实测：不存在的漫画与章节均返回 200 + <title>信息提示</title> + 正文「此信息不存在」。
   * 只读静态文本，不执行页面里的 history.go(-1) 等脚本。
   */
  isErrorPage(doc) {
    if (!doc) return true;
    const titleEl = doc.querySelector("title");
    const title = titleEl ? (titleEl.text || "").trim() : "";
    if (title === "信息提示" || title.indexOf("信息提示") >= 0) return true;
    const body = doc.querySelector("body");
    const text = body ? (body.text || "") : "";
    return text.indexOf("此信息不存在") >= 0;
  }

  async loadComicInfo(rawId) {
    const cid = this.normalizeComicId(rawId);
    if (!cid) throw new Error("invalid comic id");

    const baseUrl = this.HOST + "/novel" + cid + "/";
    let doc = null;
    try {
      doc = await this._doc(baseUrl, this.HOST + "/");
      if (!doc) throw new Error("failed to load detail page");

      // 错误页识别：站点对不存在的 ID 返回 HTTP 200 + 1399 字节的
      // 「信息提示 / 此信息不存在」页（含 history.go(-1) 脚本），不是 404。
      // 只解析静态 HTML，不执行其脚本；此处按文本特征判定并安全抛错。
      if (this.isErrorPage(doc)) {
        throw new Error("漫画不存在或已被移除");
      }

      // ---- og 字段（实测齐全，逐项回退） ----
      const meta = (key) => {
        const el = doc.querySelector("meta[property='" + key + "']");
        return el && el.attributes ? (el.attributes.content || "").trim() : "";
      };

      let title = meta("og:novel:book_name");
      if (!title) {
        const h = doc.querySelector("h3.title[itemprop=name]");
        if (h) title = (h.text || "").trim();
      }
      if (!title) title = "novel" + cid;

      let cover = meta("og:image");
      if (!cover) {
        const img = doc.querySelector("img[itemprop=image]");
        if (img) cover = img.attributes.src || img.attributes["data-original"] || "";
      }
      cover = this.absoluteUrl(cover);

      const author = meta("og:novel:author");
      const cate = meta("og:novel:category");
      const status = meta("og:novel:status");
      const updateTime = meta("og:novel:update_time");

      let intro = "";
      // 站点结构：.desc-text 内 .short-content 只装「漫画介绍」小标题，
      // 介绍正文写在小标题 div 之外（<br> 前），因此取 desc-text 全文再清洗。
      const descBox = doc.querySelector(".desc-text[itemprop=description]");
      if (descBox) {
        intro = (descBox.text || "")
          .replace(/漫画介绍/g, "")
          .replace(/介绍[:：]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }

      // Venera 契约（models.dart L151）：ComicDetails.tags 是 Map<String, List<String>>，
      // 不是 List<String>。传数组会在 Dart 侧 _generateMap(Map<dynamic, dynamic>) 抛
      // "type 'List<dynamic>' is not a subtype of type 'Map<dynamic, dynamic>'"。
      const tags = {};
      if (author) tags["作者"] = [author];
      if (cate) tags["分类"] = [cate];
      if (status) tags["状态"] = [status];
      if (updateTime) tags["更新时间"] = [updateTime];

      // ---- 章节：遍历 ?p=1..maxPage 收集正序全量 ----
      // chapters 保持 Map：Venera 所用 flutter_qjs 的 wrapper.dart L224 有 jsIsMap 分支，
      // JS Map 会被正确转成 Dart Map（与已发布的 50+ 源写法一致），不会退化成 List。
      const chapters = await this.collectChapters(cid, baseUrl, doc);
      // 兜底：正常详情页至少有一话；零话视为无效详情，不返回脏数据
      if (!chapters || chapters.size === 0) throw new Error("详情页无任何章节");

      // 注意：Venera ComicDetails 契约字段名为 title / cover / description / tags / chapters，
      // 传 name 或 intro 会导致 Dart 侧 title 为 null（type 'Null' is not a subtype of type 'String'）
      const info = {
        title: title,
        url: baseUrl,
        cover: cover,
        largeCover: cover,
        description: intro,
        author: author,
        tags: tags,
        lastChapterName: "",
        lastChapterUrl: "",
        lastChapterDate: updateTime,
        chapters: chapters,
        updateTime: updateTime,
        statusText: status,
        cateText: cate,
      };
      return new ComicDetails(info);
    } finally {
      if (doc) doc.dispose();
    }
  }

  /**
   * 收集全量章节。
   * 只取 id="list-chapter" 容器之后的正序列表；页数由分页器 Last 链接决定。
   * 真实样本 novel56136：p1 = n0..n49，p2 = n50..n91。
   */
  async collectChapters(cid, baseUrl, firstDoc) {
    const order = [];
    const seen = new Set();

    const harvest = (doc) => {
      if (!doc) return;
      // 定位正序容器：id="list-chapter" 之后的第一个 <ul class="list-chapter">
      const zone = doc.querySelector("#list-chapter");
      const root = zone || doc;
      const uls = root.querySelectorAll("ul.list-chapter");
      const list = uls.length > 0 ? uls[0] : null;
      if (!list) return;

      const items = list.querySelectorAll("li");
      for (let i = 0; i < items.length; i++) {
        const a = items[i].querySelector("a[href*='chapter']");
        if (!a) continue;
        const eid = this.normalizeEpId(a.attributes.href);
        if (!eid || seen.has(eid)) continue;
        seen.add(eid);
        let name = (a.attributes.title || "").trim();
        if (!name) {
          const span = a.querySelector("span.chapter-text");
          if (span) name = (span.text || "").trim();
        }
        if (!name) name = "第 " + eid + " 话";
        order.push([eid, name]);
      }
    };

    let maxPage = this.parseMaxPage(firstDoc, 1);
    // 章节分页与列表页分页结构不同，这里用 detail 页自身的 Last 链接重算一次
    maxPage = this.parseDetailMaxPage(firstDoc, maxPage);
    harvest(firstDoc);

    for (let p = 2; p <= maxPage && p <= this.MAX_DETAIL_PAGES; p++) {
      let doc = null;
      try {
        doc = await this._doc(baseUrl + "?p=" + p, baseUrl);
        if (!doc) break;
        harvest(doc);
      } catch (e) {
        console.log("aiManHuaWang collectChapters p=" + p + " error: " + e);
        break;
      } finally {
        if (doc) doc.dispose();
      }
    }

    // 站点正序即阅读序（n 从小到大）；仍按 ID 数值兜底排序，防止分页返回乱序
    order.sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));

    // 返回 Map：Venera 所用 flutter_qjs 的 wrapper.dart L224 有 jsIsMap 分支，
    // JS Map 会被正确转成 Dart Map；Dart 侧 ComicChapters.fromJson 只接受 Map
    // （`if (json is! Map) throw ArgumentError`）。此处与已发布的 50+ 源写法一致。
    const map = new Map();
    for (let i = 0; i < order.length; i++) {
      map.set(order[i][0], order[i][1]);
    }
    return map;
  }

  /** 详情页分页器（id="pagination"）Last 链接形如 /novel{id}/?p=N → N */
  parseDetailMaxPage(doc, fallback) {
    const p = parseInt(fallback, 10) || 1;
    if (!doc) return p;
    let max = 0;
    const links = doc.querySelectorAll("a[href*='?p=']");
    for (let i = 0; i < links.length; i++) {
      const m = (links[i].attributes.href || "").match(/[?&]p=(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    return max > 0 ? max : p;
  }

  async loadChapterImages(cid, eid) {
    const url = this.HOST + "/novel" + cid + "/chapter" + eid + ".html";
    let doc = null;
    try {
      doc = await this._doc(url, this.HOST + "/novel" + cid + "/");
      if (!doc) return { images: [] };

      const images = [];
      const seen = new Set();
      const imgs = doc.querySelectorAll("img.comic_img");
      for (let i = 0; i < imgs.length; i++) {
        const el = imgs[i];
        // 章节图为懒加载：优先 data-original，其次 data-src / src
        const raw = el.attributes["data-original"]
          || el.attributes["data-src"]
          || el.attributes.src
          || "";
        const abs = this.absoluteUrl(raw);
        if (!abs || seen.has(abs)) continue;
        // 只接受图片 URL，跳过占位符/脚本等
        if (!/^https?:\/\//i.test(abs)) continue;
        seen.add(abs);
        images.push(abs);
      }
      return { images: images };
    } catch (e) {
      console.log("aiManHuaWang loadChapterImages error: " + e);
      return { images: [] };
    } finally {
      if (doc) doc.dispose();
    }
  }
}