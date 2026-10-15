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
 * 图片协议（已取证，无任何加解密）：
 *   封面   thumb.niaopic.com / new.niaopic.com 的 data-original
 *   正文图 <img data-src="https://..." data-index="N">，按 data-index 升序即阅读顺序
 *   实测章节图 200 image/jpeg（ff d8 ff e0），封面 200 RIFF/WEBP，均无需 Referer
 *
 * 已确认事项：
 *   - 分类每页 24 张；分页器 <ul class="page"> 末尾带 page/{尾页} 链接，
 *     page_tips 显示「当前X / 共有N页」，越界页返回 200 且 0 卡片，故 maxPage 取真实尾页号。
 *   - 详情页章节列表有 PC 折叠版与展开版两个 ul.content_playlist，内容完全重复，
 *     两者顺序一致（首章在前、最终话在后），故按 sid 去重后即为正序。
 *   - 首页 4 个 .vod_row 区块（最新更新/新书上架/小编推荐/已完結漫画）各 12 卡。
 *   - 首页轮播 a.wbalist_thumb 的 background-image 指向 https://xman7.org/upload_s//… 实测 404，
 *     封面不可用，因此首页不收录轮播。
 *
 * 待验证：
 *   - 站点无付费/VIP 章节，未取到受限样本；若日后出现无图章节，本源会返回空 images。
 */
class Xman7 extends ComicSource {
  name = "X漫";
  key = "xman7";
  version = "1.0.0";
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

  /**
   * maxPage 依据：分页器里的真实页码链接（含 page/{尾页}）与 page_tips 的「共有N页」。
   * 不使用 page+1 猜测，越界页虽然返回 200 但 0 卡片。
   */
  parseMaxPage(html, fallback) {
    let maxPage = fallback;
    const text = String(html || "");
    for (const m of text.matchAll(/page\/(\d+)/g)) {
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
   * 列表卡片：首页 / 分类 / 搜索共用的 li.vodlist_item 结构。
   * 封面是懒加载 data-original（实测 thumb.niaopic.com 与 new.niaopic.com 均可直读）。
   */
  parseCard(item) {
    if (!item) return null;
    const link = item.querySelector("a.vodlist_thumb");
    if (!link) return null;
    const id = this.parseComicId(link.attributes.href || "");
    if (!id) return null;
    const cover = this.absoluteUrl(
      link.attributes["data-original"] || link.attributes["data-src"] || link.attributes.src || ""
    );
    const titleEl = item.querySelector("p.vodlist_title a") || item.querySelector("p.vodlist_title");
    const title = String((titleEl ? titleEl.text : link.attributes.title) || "").trim();
    if (!title) return null;
    const subEl = item.querySelector("p.vodlist_sub");
    return new Comic({
      id: id,
      title: title,
      cover: cover,
      subTitle: subEl ? String(subEl.text || "").trim() : ""
    });
  }

  parseCards(doc, selector) {
    const comics = [];
    for (const item of Array.from(doc.querySelectorAll(selector))) {
      const comic = this.parseCard(item);
      if (comic) comics.push(comic);
    }
    return comics;
  }

  /**
   * 同时返回解析文档与原始 HTML：maxPage 必须从原始 HTML 的分页器读取，
   * HtmlDocument 没有 outerHTML，不能依赖它反推分页。
   */
  async loadPage(url) {
    const res = await Network.get(url, this.headers());
    if (res.status === 403 || res.status === 401) {
      throw "X漫访问被拒绝(403)，请检查网络或地区限制";
    }
    if (res.status !== 200) {
      throw `Invalid status code: ${res.status}`;
    }
    const body = String(res.body || "");
    if (!body) throw "X漫返回空页面";
    return { doc: new HtmlDocument(body), html: body };
  }

  // 清理标题里的 iconfont 私用区图标字符（&#xe631; 等）
  cleanText(value) {
    return String(value || "")
      .replace(/[\uE000-\uF8FF]/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
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

  explore = [
    {
      title: this.name,
      type: "singlePageWithMultiPart",
      load: async () => {
        let page = null;
        try {
          page = await this.loadPage(Xman7.baseUrl + "/");
          const doc = page.doc;
          const result = {};
          for (const row of Array.from(doc.querySelectorAll("div.vod_row"))) {
            let name = this.cleanText(row.querySelector("h2.title")?.text || "");
            if (!name) name = "推荐";
            const comics = this.parseCards(row, "ul.vodlist li.vodlist_item");
            if (comics.length > 0 && !result[name]) result[name] = comics;
          }
          if (Object.keys(result).length === 0) {
            return { "最新更新": this.parseCards(doc, "ul.vodlist li.vodlist_item") };
          }
          return result;
        } catch (e) {
          return {};
        } finally {
          if (page) page.doc.dispose();
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
      // 排序与状态只接受站点真实取值，避免非法值拼出畸形 URL
      const sort = options && options[0] === "hits" ? "hits" : "time";
      const rawStatus = options && options[1] ? String(options[1]) : "all";
      const status = ["all", "serialized", "completed"].indexOf(rawStatus) >= 0 ? rawStatus : "all";
      const type = String(param || "all").replace(/^\/+|\/+$/g, "");
      const url =
        `${Xman7.baseUrl}/mcata/${encodeURIComponent(type)}/ob/${sort}/st/${status}/page/${pageNo}`;
      let result = null;
      try {
        result = await this.loadPage(url);
        const comics = this.parseCards(result.doc, "ul.vodlist li.vodlist_item");
        // 直接复用原始 HTML 里的真实分页依据
        const maxPage = this.parseMaxPage(result.html, pageNo);
        return { comics: comics, maxPage: maxPage };
      } catch (e) {
        return { comics: [], maxPage: pageNo };
      } finally {
        if (result) result.doc.dispose();
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
      let result = null;
      try {
        result = await this.loadPage(url);
        const comics = this.parseCards(result.doc, "ul.vodlist li.vodlist_item");
        const maxPage = this.parseMaxPage(result.html, pageNo);
        return { comics: comics, maxPage: maxPage };
      } catch (e) {
        return { comics: [], maxPage: pageNo };
      } finally {
        if (result) result.doc.dispose();
      }
    }
  };

  comic = {
    loadInfo: async (id) => {
      const comicId = this.parseComicId("/mdetail/" + encodeURIComponent(String(id || ""))) || String(id || "").trim();
      if (!/^\d+$/.test(comicId)) return new ComicDetails({ title: "未知漫画", chapters: new Map() });
      let result = null;
      try {
        result = await this.loadPage(`${Xman7.baseUrl}/mdetail/${comicId}`);
        const doc = result.doc;

        const title = this.cleanText(doc.querySelector("h1.title")?.text) || comicId;
        const cover = this.absoluteUrl(
          doc.querySelector("div.content_thumb a.vodlist_thumb")?.attributes["data-original"] || ""
        );
        const description = this.cleanText(doc.querySelector("li.desc")?.text)
          .replace(/^简介[:：]/, "")
          .trim();

        const tags = {};
        const genres = [];
        const author = [];
        const labels = [];
        let statusText = "";
        // 详情信息区是并列的 li：分类 / 作者 / 简介 / 标签，按可见文本前缀区分，不依赖顺序
        for (const item of Array.from(doc.querySelectorAll("ul.content_min li"))) {
          const raw = this.cleanText(item.text);
          if (/^分类/.test(raw)) {
            for (const a of Array.from(item.querySelectorAll("a"))) {
              const t = this.cleanText(a.text);
              if (t && !genres.includes(t)) genres.push(t);
            }
          } else if (/^作者/.test(raw)) {
            for (const a of Array.from(item.querySelectorAll("a"))) {
              const t = this.cleanText(a.text);
              if (t && !author.includes(t)) author.push(t);
            }
          } else if (/^标签/.test(raw)) {
            for (const a of Array.from(item.querySelectorAll("a"))) {
              const t = this.cleanText(a.text);
              if (t && !labels.includes(t)) labels.push(t);
            }
          }
        }
        statusText = this.cleanText(doc.querySelector("div.content_detail.content_top font")?.text);
        if (statusText) tags["状态"] = statusText;
        if (genres.length > 0) tags["分类"] = genres;
        if (author.length > 0) tags["作者"] = author;
        if (labels.length > 0) tags["标签"] = labels;

        // 章节：PC 折叠版与展开版两个 ul.content_playlist 内容重复且同序，按 sid 去重即正序
        const chapters = new Map();
        for (const ul of Array.from(doc.querySelectorAll("ul.content_playlist"))) {
          for (const a of Array.from(ul.querySelectorAll("a"))) {
            const epId = this.parseEpId(a.attributes.href || "");
            if (!epId || chapters.has(epId)) continue;
            const name = this.cleanText(a.text) || `第${chapters.size + 1}话`;
            chapters.set(epId, name);
          }
        }

        return new ComicDetails({
          title: title,
          cover: cover,
          description: description,
          tags: tags,
          chapters: chapters,
          subId: comicId
        });
      } catch (e) {
        return new ComicDetails({ title: "加载失败", chapters: new Map() });
      } finally {
        if (result) result.doc.dispose();
      }
    },

    loadEp: async (comicId, epId) => {
      const sid = this.normalizeEpId(epId);
      if (!sid) return { images: [] };
      const cid = this.parseComicId("/mdetail/" + String(comicId || "")) || String(comicId || "").trim();
      if (!/^\d+$/.test(cid)) return { images: [] };
      let result = null;
      try {
        result = await this.loadPage(`${Xman7.baseUrl}/mread/${encodeURIComponent(cid)}/${sid}`);
        const ordered = [];
        // 阅读页正文图只有 img[data-src][data-index]，用 data-index 定序；
        // 其余 img（站点统计像素等）没有 data-index，直接排除。
        for (const img of Array.from(result.doc.querySelectorAll("img"))) {
          const indexAttr = img.attributes["data-index"];
          if (indexAttr === undefined || indexAttr === null) continue;
          const raw = img.attributes["data-src"] || "";
          if (!/^https?:\/\//i.test(raw)) continue;
          const idx = parseInt(indexAttr, 10);
          ordered.push({ idx: Number.isFinite(idx) ? idx : ordered.length, url: this.absoluteUrl(raw) });
        }
        ordered.sort((a, b) => a.idx - b.idx);
        // 实测个别章节存在重复 URL，按地址去重保持阅读顺序稳定
        const images = [];
        for (const item of ordered) {
          if (!images.includes(item.url)) images.push(item.url);
        }
        return { images: images };
      } catch (e) {
        return { images: [] };
      } finally {
        if (result) result.doc.dispose();
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