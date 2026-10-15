/** @type {import('./_venera_.js')} */
/**
 * 太极漫画网 Venera 漫画源 v1.1.1
 *
 * v1.1.1（2026-10-05）修复三处，均为真实回归复现的缺陷：
 *  1) 搜索边界探测 kindOf 把「越界提示页」当异常抛错 → 结果 ≤ 8 页的关键词搜索返回空列表；
 *  2) parseRankPageCards 漏声明 id → 5 个榜单页全部 ReferenceError；
 *  3) 结果解析与 maxPage 探测解耦，探测失败只降级 maxPage、不丢弃已解析结果。
 *
 * 入口说明：用户提供的 https://tjmh8.com/ 是当前可用站点域名（首页红字「最新地址:tjmh8.com」）。
 * 首页另标注「地址发布页:tjmh.top」——实测 tjmh.top 为纯地址发布页（4505 字节、title
 * 「请收藏本页，防迷路」、0 个 /comic/ 链接，列出 tjmhw.com / okmh.top / tjmh8.com 等一批域名），
 * 与本站**不同构**，故 v1.0.0 固定域名、不提供站点切换（切换选项与镜像同构性留待后续取证）。
 *
 * 站点性质：自研 PHP 模板站（帝国 CMS 痕迹：/e/member/cp/ 个人中心、/e/action/onclick.php 统计），
 * 服务端渲染 HTML + 一批 JSON 接口（/api/classify、/api/rank、/api/latest），Cloudflare CDN，
 * 前端 jQuery + lazyload，无前端框架、无图片加密、无登录墙（取证范围内全部公开可读）。
 *
 * 已取证并验证的能力：
 *  - 首页 7 区块：imgBox 区块 6 个（人气最旺/大家都在看/佳作上新/韩漫力荐/日漫推荐/猜你喜歡，
 *    结构 div.imgBox > div.Sub_H2 span.Title + ul.col_3_1|col_3_2 > li）+ 排行区块 1 个
 *    （div.rankList > div.titleBar span.top「本周TOP10」+ ul.list > a > li.d-item）
 *  - 搜索 **v1.1.0 起改用路径式 GET /search/{encodeURIComponent(关键词)}?page={站点页码}**
 *    （用户指定入口 https://tjmh8.com/search/%E9%83%BD%E5%B8%82 ；v1.0.0 的查询式
 *    /search/?title={关键词}&page={N} 仍可用，两者同页返回字节级一致的 serchArry，
 *    2026-10-05 实测路径式与查询式 page=0 均为 15 条、hot 5566→197 完全相同；
 *    **路径分段式 /search/都市/page/2 无效**——关键词被吞、返回 serchArry= []，
 *    故分页只能走 ?page= 查询参数）；
 *    服务端内联 `var serchArry= [...]` JSON 由 JS 渲染，源直接解析该 JSON（不执行站点脚本）；
 *    15 条/页、站点页码从 0 起（无 ?page= ≡ page=0 ≡ 首页）；无结果返回 `serchArry= []`；
 *    越界返回帝国 CMS「您来自的链接不存在」提示页（967 字节、无 serchArry）
 *    → maxPage = 最大有效页码 + 1（二分取证，
 *    关键词「人」实测站点页码 59 为尾页 4 条 → maxPage=60）
 *  - 搜索 maxPage 探测的越界判定 v1.1.1 修正：**越界提示页是有效终止信号而非异常**
 *    （2026-10-05 实测关键词「都市」站点页码 8 已是「您来自的链接不存在」提示页，
 *    v1.1.0 的 kindOf 两次命中该页后抛错 → 搜索整体降级返回空列表，
 *    即结果 ≤ 8 页的关键词在 v1.1.0 上完全不可用）；现在重试确认后返回 "outofrange"，
 *    二分照常收敛 → maxPage = 最大有效站点页码 + 1；
 *    另：解析出真实结果后探测失败只降级 maxPage（不丢弃本页结果）
 *  - 分类（/classify 筛选面板 4 维 + 排序）→ /api/classify/{题材}-{读者群}-{进度}-{地域}-{排序}-{页码}
 *    15 条/页，四维与排序逐项实测生效；/api/rank/{类型}-{题材}-{时间}-{页码}（题材/时间实测生效）；
 *    /api/latest/{页码}；接口返回 `comics: []` 即末页 → maxPage 由「阶梯短路 + 单点二分」探测真实边界
 *    （实测 classify 默认 623 页、恋爱+完结 67 页、latest 623 页，11~15 请求、12~48 秒）
 *  - 榜单 5 个（/nvsheng /nansheng /renqi /xinzuo /zuigeng）：服务端渲染 30 条、无分页
 *    （?page=2 与首页字节完全相同，/nvsheng/2 → 404），故 maxPage=1；
 *    v1.1.1 修复 parseRankPageCards 漏声明 id 的 ReferenceError（v1.1.0 起 5 个榜单全挂），
 *    2026-10-05 实测 /renqi：div#listRanking 下 30 个 div.items（box1 前 3 名 h3.eli+p.eli，
 *    box2 第 4 名起 h3+p「更新于」+ span.tag），id 来自 onclick="clkComic(N)"（61 处）
 *  - 详情 GET /comic/{id}：标题 #comicName、封面 #Cover img、作者 a.introName、题材/读者群/地域 a.pd、
 *    状态 a.pd[href=/end/1.html]=连载 / /end/2.html=完结、更新时间 span.date、简介 p.txtDesc、
 *    章节为内联 `initIntroData([{title:"连载", data:[...]}])` JSON（id/chapter_name/chapter_order/
 *    is_free/gold/buy），实测 10523=80 话、8202=138 话、5200=357 话，chapter_order 升序、无付费标记
 *  - 章节 GET /view/{漫画ID}/{章节ID}：图片为 `img.comic_img.lazy` 的 `data-original` 明文绝对 URL
 *    （img1.du8.in 的 hmimg/ 与 hmpic/ 路径），单页全量内联、**无图片分页**（三话实测 67/46/160 张）
 *  - 图片实测无防盗链：无 Referer / 本站 Referer / 任意 Referer 均 200 + 正确文件头
 *    （章节图 webp 102182 字节 RIFF/WEBP/VP8、封面 jpg 16163 字节 JFIF、站内封面 jpg 8262 字节）
 *  - 已知站点脏数据：个别 API 响应把 latestVolume.id 拼成 `"id":,` 导致 JSON 非法
 *    （实测 /api/latest/227），源做最小修复（`"id":,` → `"id":0,`）后过滤无效条目，不缩边界
 *
 * 权限边界：取证范围内（列表/榜单/搜索/详情/章节/图片）全部公开可读，未发现登录或付费墙；
 * 详情章节 JSON 的 is_free/gold/buy 实测全为 0，章节页 pay=1 且图片明文输出 → 视为可读；
 * 源不实现登录，不做任何登录态伪造。
 *
 * 源设置：无（固定域名，见上方入口说明）。
 */
class TjmhComicSource extends ComicSource {
  name = "太极漫画网";
  key = "tjmh";
  version = "1.1.1";
  minAppVersion = "1.6.0";
  // 固定域名源，入口元数据直接给出当前站点。
  url = "https://tjmh8.com";

  // 无用户可配置项（v1.0.0 固定域名，见头部入口说明；镜像同构性取证完成后再考虑开放切换）。
  settings = {};

  siteUa =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  listPageSize = 15; // 分类/搜索/更新列表实测每页条数
  rankListSize = 30; // 榜单页（女生榜等）实测固定条数

  // 分类接口 maxPage 探测缓存（key=域名|flag，便于后续引入域名切换时互不污染）。
  maxPageCache = {};
  // 搜索结果 maxPage 缓存（key=域名|关键词）。
  searchCache = {};

  /**
   * 当前站点域名。
   * v1.0.0 固定 tjmh8.com：首页标注的 tjmh.top 经实测为纯地址发布页（不同构），
   * 其余镜像域名未做同构取证，因此不提供切换（见已知限制）。
   */
  get baseUrl() {
    return "https://tjmh8.com";
  }

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

  /**
   * 接口响应解析（容错站点脏数据）。
   * 实测 /api/latest/227 返回 `"latestVolume":{"id":,,"title":""}`（服务端把空 id 直接拼进 JSON），
   * 属于**固定脏数据而非瞬态错误**：先原样解析，失败后仅做最小修复再解析，仍失败才抛错。
   * 修复后该条目 id=0，由 buildComicFromApi 的 ID 校验过滤，不影响其余条目。
   */
  parseApiJson(text) {
    const raw = String(text || "");
    if (!raw) throw new Error("空接口响应");
    try {
      return JSON.parse(raw);
    } catch (e) {
      // 最小修复：仅处理已取证的 `"id":,` / `"id": }` 空值形态，不执行任何站点脚本。
      const fixed = raw.replace(/"id"\s*:\s*,/g, '"id":0,').replace(/"id"\s*:\s*}/g, '"id":0}');
      try {
        return JSON.parse(fixed);
      } catch (e2) {
        throw new Error(`接口响应解析失败：${String(e2)}`);
      }
    }
  }

  async getApi(url, referer) {
    const text = await this.getText(url, referer);
    const json = this.parseApiJson(text);
    if (!json || json.code !== 0 || !json.data || !Array.isArray(json.data.comics)) {
      throw new Error(`接口返回异常（${url}）`);
    }
    return json.data.comics;
  }

  /**
   * 探测专用：GET 接口页并判定「有数据 / 空页」。
   * 判据用原始文本包含关系而非 JSON.parse——脏数据页（"id":,）同样是**有效页**，
   * 若按解析失败缩边界会误判（实测 /api/latest/227 曾被误判为越界）。
   * 异常状态（非 200、既无数据也无空标记）重试一次后抛错，避免瞬态错误误缩边界。
   */
  async probeApiPage(url) {
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
      if (status >= 500 && attempt === 0) {
        await this.sleep(400);
        continue;
      }
      if (status !== 200) throw new Error(`边界探测异常 HTTP ${status}（${url}）`);
      const body = String(res.body || "");
      if (body.indexOf('"comics":[{') >= 0) return "data";
      if (body.indexOf('"comics":[]') >= 0) return "empty";
      lastError = `响应不含 comics 标记（${body.slice(0, 60)}）`;
    }
    throw new Error(`边界探测失败：${lastError}（${url}）`);
  }

  // ------------------------------------------------------------ ID 标准化

  /**
   * 从 /comic/10523、https://tjmh8.com/comic/10523、纯数字、
   * 组合形态 tjmh|10523 中提取漫画 ID。
   */
  parseComicId(href) {
    const value = String(href || "").trim();
    if (!value) return null;
    const pathMatch = value.match(/\/comic\/(\d+)(?:\/|\?|#|$)/);
    if (pathMatch) return pathMatch[1] === "0" ? null : pathMatch[1];
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
   * 章节引用标准化，兼容历史入参，返回 {cid, eid} 或 null：
   *  533447                              普通章节 ID（cid 由调用方补齐）
   *  /view/10523/533447                  章节链接（含漫画 ID）
   *  https://tjmh8.com/view/10523/533447 完整章节 URL
   *  10523|533447                        组合 ID（首段为漫画 ID、末段为章节 ID）
   *  {epId/chapterId/id/url}             对象参数（白名单字段）
   *  0 / abc / 无法识别                   null（调用方安全返回空图片，不发请求）
   */
  parseEpRef(epId) {
    if (epId === null || epId === undefined || epId === "") return null;
    if (typeof epId === "object") {
      const inner =
        epId.epId !== undefined
          ? epId.epId
          : epId.chapterId !== undefined
          ? epId.chapterId
          : epId.id !== undefined
          ? epId.id
          : epId.url;
      return this.parseEpRef(inner);
    }
    const value = String(epId).trim();
    if (!value) return null;
    // /view/{cid}/{eid}（相对或完整 URL）
    const viewMatch = value.match(/\/view\/(\d+)\/(\d+)(?:\/|\?|#|$)/);
    if (viewMatch) {
      if (viewMatch[1] === "0" || viewMatch[2] === "0") return null;
      return { cid: viewMatch[1], eid: viewMatch[2] };
    }
    // 组合形态 cid|eid
    if (value.indexOf("|") >= 0) {
      const parts = value.split("|");
      const eid = parts[parts.length - 1].trim();
      const cid = parts.length > 1 ? parts[0].trim() : "";
      const eidNum = eid.match(/^\d+$/) ? eid : (eid.match(/(\d+)$/) || [])[1];
      if (!eidNum || eidNum === "0") return null;
      const cidNum = /^\d+$/.test(cid) && cid !== "0" ? cid : null;
      return { cid: cidNum, eid: eidNum };
    }
    // 纯数字 / 含数字的片段（如 533447、533447_2）
    if (value.indexOf("/") === -1) {
      const digits = value.match(/^(\d+)(?:_\d+)?$/) || value.match(/(\d+)\s*$/);
      if (digits && digits[1] !== "0") return { cid: null, eid: digits[1] };
    }
    return null;
  }

  normalizeEpId(epId) {
    const ref = this.parseEpRef(epId);
    return ref ? ref.eid : null;
  }

  // ------------------------------------------------------------ 列表数据 → Comic

  /** 接口/搜索 JSON 条目 → Comic（id/title/cover/authorstr/tags/isend 等字段）。 */
  buildComicFromApi(item) {
    if (!item) return null;
    const id = this.parseComicId(item.id);
    if (!id) return null;
    const tags =
      typeof item.tags === "string"
        ? item.tags
            .split(/\s+/)
            .map((t) => t.trim())
            .filter((t) => t)
        : Array.isArray(item.tags)
        ? item.tags
        : [];
    return new Comic({
      id,
      title: String(item.title || "未知漫画").trim(),
      subTitle: String(item.authorstr || "").trim(),
      cover: this.absoluteUrl(item.cover || ""),
      tags,
      sourceKey: this.key,
    });
  }

  /** 首页 imgBox 卡片（li：a.ImgA 封面 + a.txtA 标题 + span.info 作者）。 */
  parseHomeCard(li) {
    const link = li.querySelector("a.ImgA") || li.querySelector("a[href]");
    if (!link || !link.attributes) return null;
    const id = this.parseComicId(link.attributes.href || "");
    if (!id) return null;
    let title = "";
    const titleEl = li.querySelector("a.txtA");
    if (titleEl && titleEl.text) title = String(titleEl.text).trim();
    if (!title && link.attributes.title) title = String(link.attributes.title).trim();
    if (!title) return null;
    let cover = "";
    const img = li.querySelector("img");
    if (img && img.attributes) {
      cover = img.attributes.src || img.attributes["data-src"] || "";
    }
    let author = "";
    const info = li.querySelector("span.info");
    if (info && info.text) {
      author = String(info.text)
        .replace(/^\s*作者\s*[:：]\s*/, "")
        .trim();
    }
    return this.buildComicFromApi({ id, title, cover, authorstr: author, tags: "" });
  }

  /** 首页排行区块卡片（ul.list > a > li.d-item）。 */
  parseHomeRankCard(anchor) {
    if (!anchor || !anchor.attributes) return null;
    const id = this.parseComicId(anchor.attributes.href || "");
    if (!id) return null;
    const titleEl = anchor.querySelector("p.title");
    let title = titleEl && titleEl.text ? String(titleEl.text).trim() : "";
    if (!title) title = String(anchor.attributes.title || "").trim();
    if (!title) return null;
    const img = anchor.querySelector("img.cover");
    const cover = img && img.attributes ? img.attributes.src || "" : "";
    const bottom = anchor.querySelector("p.bottom");
    const subtitle = bottom && bottom.text
      ? String(bottom.text)
          .replace(/^\s*更新至\s*/, "")
          .trim()
      : "";
    return this.buildComicFromApi({ id, title, cover, authorstr: subtitle, tags: "" });
  }

  /**
   * 榜单页卡片（女生榜等，div#listRanking 内 div.items）：
   * id 来自 onclick="clkComic(N)"（页面无 <a href> 链接，JS 跳转）；
   * 前 3 名（box1）标题在 div.content > h3.eli、作者在 p.eli；
   * 第 4 名起（box2）标题在 div.content > h3、无作者、附 .tag 标签与更新日期。
   */
  parseRankPageCards(html) {
    const doc = new HtmlDocument(html);
    try {
      const items = doc.querySelectorAll("#listRanking .items");
      const comics = [];
      for (const item of items) {
        const content = item.querySelector("div.content");
        const imgDiv = item.querySelector("div.img-div");
        const onclick =
          (content && content.attributes && content.attributes.onclick) ||
          (imgDiv && imgDiv.attributes && imgDiv.attributes.onclick) ||
          "";
        const idMatch = String(onclick).match(/clkComic\((\d+)\)/);
        if (!idMatch || idMatch[1] === "0") continue;
        // v1.1.1 修复：此前此处只取了 idMatch 未声明 id，榜单页全部抛
        // ReferenceError: id is not defined（5 个榜单自 v1.1.0 起不可用）。
        const id = idMatch[1];
        const h3 = content ? content.querySelector("h3") : null;
        const title = h3 && h3.text ? String(h3.text).trim() : "";
        if (!title) continue;
        const img = item.querySelector("img");
        const cover = img && img.attributes ? img.attributes.src || "" : "";
        const p = content ? content.querySelector("p") : null;
        const subtitle = p && p.text ? String(p.text).trim() : "";
        const tagEls = item.querySelectorAll(".tag");
        const tags = [];
        for (const tag of tagEls) {
          if (tag.text) {
            const t = String(tag.text).trim();
            if (t && t !== "...") tags.push(t);
          }
        }
        comics.push(
          this.buildComicFromApi({ id, title, cover, authorstr: subtitle, tags: tags.join(" ") })
        );
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

          // 区块一：div.imgBox（Sub_H2 > span.Title 区块名 + ul.col_3_1|col_3_2 卡片列表）
          const boxes = doc.querySelectorAll("div.imgBox");
          for (const box of boxes) {
            const h2 = box.querySelector("div.Sub_H2");
            const titleEl = h2 ? h2.querySelector("span.Title") : null;
            const title = titleEl && titleEl.text ? String(titleEl.text).trim() : "";
            if (!title) continue;
            const items = box.querySelectorAll("li");
            const comics = [];
            for (const li of items) {
              const comic = this.parseHomeCard(li);
              if (comic) comics.push(comic);
            }
            if (comics.length > 0 && !result[title]) result[title] = comics;
          }

          // 区块二：div.rankList（titleBar > span.top 区块名 + ul.list 排行卡片）
          const rank = doc.querySelector("div.rankList");
          if (rank) {
            const top = rank.querySelector("span.top");
            const title = top && top.text ? String(top.text).trim() : "";
            const list = rank.querySelector("ul.list");
            const comics = [];
            if (list) {
              const anchors = list.querySelectorAll("a[href]");
              for (const a of anchors) {
                const comic = this.parseHomeRankCard(a);
                if (comic) comics.push(comic);
              }
            }
            if (title && comics.length > 0 && !result[title]) result[title] = comics;
          }

          return result;
        } catch (e) {
          console.error("太极漫画网首页解析失败：", e);
          return {};
        } finally {
          if (doc) doc.dispose();
        }
      },
    },
  ];

  // ------------------------------------------------------------ 分类

  /**
   * 分类分组与站点入口对齐（显示名取站点原文）：
   *  - 榜单：首页顶部入口 女生榜/男生榜/人气榜/新作榜 + 榜单页内导航 追更榜（顺序同榜单页 head-nav）
   *  - 导航：主导航栏 今日更新(/latest)、人气排行(/rank 页内 tab 名)、分类(/classify)
   *  - 题材/读者群/进度/地域：/classify 筛选面板 4 个 tab 的原文与顺序（全部 → 末项）
   * categoryParams 前缀：c=题材 r=读者群 s=进度 z=地域（值为站点 flag 索引），
   * 其余为入口路径段。站点有筛选面板 → 设 optionList（排序：人气/更新，对应 sortClickAction）。
   */
  category = {
    title: this.name,
    parts: [
      {
        name: "榜单",
        type: "fixed",
        itemType: "category",
        categories: ["女生榜", "男生榜", "人气榜", "新作榜", "追更榜"],
        categoryParams: ["nvsheng", "nansheng", "renqi", "xinzuo", "zuigeng"],
      },
      {
        name: "导航",
        type: "fixed",
        itemType: "category",
        categories: ["今日更新", "人气排行", "分类"],
        categoryParams: ["latest", "rank", "classify"],
      },
      {
        name: "题材",
        type: "fixed",
        itemType: "category",
        categories: [
          "全部",
          "热血",
          "恋爱",
          "青春",
          "彩虹",
          "冒险",
          "后宫",
          "悬疑",
          "玄幻",
          "穿越",
          "都市",
          "腹黑",
          "爆笑",
          "少年",
          "奇幻",
          "古风",
          "妖恋",
          "元气",
          "治愈",
          "励志",
          "日常",
          "百合",
          "福利",
          "其它",
          "友情",
          "情感",
          "异能",
          "BL",
          "纯爱",
          "搞笑",
          "末世",
        ],
        categoryParams: [
          "c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9",
          "c10", "c11", "c12", "c13", "c14", "c15", "c16", "c17", "c18", "c19",
          "c20", "c21", "c22", "c23", "c24", "c25", "c26", "c27", "c28", "c29",
          "c30",
        ],
      },
      {
        name: "读者群",
        type: "fixed",
        itemType: "category",
        categories: ["全部", "少年", "少女", "青年"],
        categoryParams: ["r0", "r1", "r2", "r3"],
      },
      {
        name: "进度",
        type: "fixed",
        itemType: "category",
        categories: ["全部", "连载", "完结"],
        categoryParams: ["s0", "s1", "s2"],
      },
      {
        name: "地域",
        type: "fixed",
        itemType: "category",
        categories: ["全部", "国漫", "韩国", "日本", "欧美", "港台"],
        categoryParams: ["z0", "z1", "z2", "z3", "z4", "z5"],
      },
    ],
    enableRankingPage: false,
  };

  /**
   * 读取 optionList 取值：Venera 可能传 "1-更新" 或 "1"，统一取 "-" 前的值；
   * 非法/缺省回退 0（对应站点「全部」/默认排序）。
   */
  optionValue(options, index) {
    const opts = Array.isArray(options) ? options : [];
    const raw = opts[index] != null ? String(opts[index]) : "";
    const value = raw.split("-")[0].trim();
    return /^\d+$/.test(value) ? value : "0";
  }

  /**
   * 分类参数 → 接口目标。
   * 返回 { flagKey, urlOf(page) }；榜单等单页列表返回 { single: true, path }。
   *  - c{N}/r{N}/s{N}/z{N}/classify → /api/classify/{题材}-{读者群}-{进度}-{地域}-{排序}-{页码}
   *    （排序取 optionList 第 1 组，站点默认 0=人气）
   *  - rank → /api/rank/0-{题材}-1-{页码}（类型 0=人气排行、时间 1=今日，均为站点默认；
   *    题材复用 optionList 第 1 组，站点 rank 面板题材索引与 classify 一致，已实测生效）
   *  - latest → /api/latest/{页码}
   *  - 榜单路径段 → 服务端渲染单页（无分页，实测 ?page=2 内容不变）
   */
  classifyTarget(param, options) {
    const key = String(param || "").trim();
    const sort = this.optionValue(options, 0);
    const topic = this.optionValue(options, 0);

    if (/^c\d+$/.test(key)) {
      const flag = `${key.slice(1)}-0-0-0-${sort}`;
      return { flagKey: "classify|" + flag, urlOf: (p) => `${this.baseUrl}/api/classify/${flag}-${p}` };
    }
    if (/^r\d+$/.test(key)) {
      const flag = `0-${key.slice(1)}-0-0-${sort}`;
      return { flagKey: "classify|" + flag, urlOf: (p) => `${this.baseUrl}/api/classify/${flag}-${p}` };
    }
    if (/^s\d+$/.test(key)) {
      const flag = `0-0-${key.slice(1)}-0-${sort}`;
      return { flagKey: "classify|" + flag, urlOf: (p) => `${this.baseUrl}/api/classify/${flag}-${p}` };
    }
    if (/^z\d+$/.test(key)) {
      const flag = `0-0-0-${key.slice(1)}-${sort}`;
      return { flagKey: "classify|" + flag, urlOf: (p) => `${this.baseUrl}/api/classify/${flag}-${p}` };
    }
    if (key === "classify") {
      const flag = `0-0-0-0-${sort}`;
      return { flagKey: "classify|" + flag, urlOf: (p) => `${this.baseUrl}/api/classify/${flag}-${p}` };
    }
    if (key === "rank") {
      const flag = `0-${topic}-1`;
      return { flagKey: "rank|" + flag, urlOf: (p) => `${this.baseUrl}/api/rank/${flag}-${p}` };
    }
    if (key === "latest") {
      return { flagKey: "latest", urlOf: (p) => `${this.baseUrl}/api/latest/${p}` };
    }
    if (["nvsheng", "nansheng", "renqi", "xinzuo", "zuigeng"].indexOf(key) >= 0) {
      return { single: true, path: key };
    }
    return null;
  }

  categoryComics = {
    load: async (category, param, options, page) => {
      const key = String(param || "").trim();
      const safePage = this.num(page, 1);
      if (!key) return { comics: [], maxPage: safePage };
      const target = this.classifyTarget(key, options);
      if (!target) {
        console.error(`太极漫画网分类参数不识别：${key}`);
        return { comics: [], maxPage: safePage };
      }

      // 榜单类：服务端渲染单页、无分页（实测 ?page=2 与首页字节相同、/nvsheng/2 → 404）。
      if (target.single) {
        if (safePage > 1) return { comics: [], maxPage: 1 };
        try {
          const html = await this.getText(`${this.baseUrl}/${target.path}`, this.baseUrl + "/");
          return { comics: this.parseRankPageCards(html), maxPage: 1 };
        } catch (e) {
          console.error(`太极漫画网榜单「${key}」加载失败：`, e);
          return { comics: [], maxPage: 1 };
        }
      }

      try {
        // 目标页与 maxPage 边界探测并行；maxPage 只在首次进入该筛选组合时探测并缓存。
        // v1.1.1：探测失败只降级 maxPage 为当前页（不宣称存在更多页），不丢弃已取到的列表。
        const [comics, maxPage] = await Promise.all([
          this.getApi(target.urlOf(safePage), this.baseUrl + "/"),
          this.detectMaxPage(target).catch((e) => {
            console.error(`太极漫画网分类 ${target.flagKey} maxPage 探测失败，降级为当前页：`, e);
            return safePage;
          }),
        ]);
        return {
          comics: comics.map((item) => this.buildComicFromApi(item)).filter((c) => c),
          maxPage,
        };
      } catch (e) {
        console.error(`太极漫画网分类「${category}」加载失败：`, e);
        return { comics: [], maxPage: safePage };
      }
    },
    // 站点 /classify 筛选面板的「排序」按钮（人气=sortClickAction(0)、更新=sortClickAction(1)）。
    optionList: [
      {
        label: "排序",
        type: "select",
        options: ["0-人气", "1-更新"],
      },
    ],
  };

  /**
   * 分类 maxPage 探测（真实依据：接口返回 `comics: []` 即末页）。
   * 页面无总数无尾页，故串行阶梯短路定区间 + 单点二分收敛：
   *  1) 阶梯 [64, 512, 4096, 65536]：有数据 → lo=n；第一个空页 → hi=n 短路；
   *  2) 二分 (lo, hi] 直到 hi = lo + 1，lo 即末页，写入缓存；
   *  3) 探测异常（非 200、响应无 comics 标记、重试后仍失败）直接抛错，不缩边界。
   * 实测量级：classify 默认 623 页（15 请求 / 15.8 秒）、恋爱+完结 67 页（11 请求 / 12 秒）、
   * latest 623 页（15 请求 / 47 秒，首次含网络波动）。每组合一次、缓存后零开销。
   */
  async detectMaxPage(target) {
    const cacheKey = this.baseUrl + "|" + target.flagKey;
    if (this.maxPageCache[cacheKey] != null) return this.maxPageCache[cacheKey];

    let lo = 1;
    let hi = null;
    for (const n of [64, 512, 4096, 65536]) {
      const state = await this.probeApiPage(target.urlOf(n));
      if (state === "data") lo = n;
      else {
        hi = n;
        break;
      }
    }
    if (hi === null) {
      throw new Error(`分类 ${target.flagKey} 边界探测失败：65536 页仍存在`);
    }

    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const state = await this.probeApiPage(target.urlOf(mid));
      if (state === "data") lo = mid;
      else hi = mid;
    }

    this.maxPageCache[cacheKey] = lo;
    return lo;
  }

  // ------------------------------------------------------------ 搜索

  /**
   * 搜索页判定：返回 "data"（有结果）/ "empty"（无结果）/ "outofrange"（越界提示页）。
   * - 有结果与无结果页都内联 `var serchArry=`；
   * - 越界页是帝国 CMS「您来自的链接不存在」提示页，无 serchArry。
   */
  searchPageKind(html) {
    const value = String(html || "");
    const idx = value.indexOf("var serchArry=");
    if (idx < 0) return "outofrange";
    const start = value.indexOf("[", idx);
    const end = value.indexOf("];", start);
    if (start < 0 || end < 0) return "outofrange";
    return value.slice(start + 1, end).trim().length > 0 ? "data" : "empty";
  }

  /**
   * 提取搜索结果（内联 JSON，逐对象括号配对解析）。
   * 站点存在 `var serchArry= [,{...}]` 前导逗号形态（page≥1 时 PHP 拼接产生，
   * JS 数组字面量中合法），整体 JSON.parse 会失败 → 逐对象提取规避。
   */
  parseSearchPage(html) {
    const value = String(html || "");
    const idx = value.indexOf("var serchArry=");
    if (idx < 0) return [];
    const start = value.indexOf("[", idx);
    const end = value.indexOf("];", start);
    if (start < 0 || end < 0) return [];
    const raw = value.slice(start, end + 1);
    const comics = [];
    let depth = 0;
    let objStart = -1;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === "{") {
        if (depth === 0) objStart = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && objStart >= 0) {
          try {
            const item = JSON.parse(raw.slice(objStart, i + 1));
            const comic = this.buildComicFromApi(item);
            if (comic) comics.push(comic);
          } catch (e) {
            // 单条脏数据跳过，不影响本页其余条目。
          }
          objStart = -1;
        }
      }
    }
    return comics;
  }

  search = {
    /**
     * 搜索 GET /search/{encodeURIComponent(关键词)}?page={站点页码}（v1.1.0 路径式）。
     * 关键词整体 encodeURIComponent：路径中的 / ? # 等一律编码，不会被拆成路径段
     * （路径分段 /search/都市/page/2 实测被吞成空结果）；分页仍用 ?page= 查询参数。
     * 站点页码从 0 起（无 ?page= ≡ page=0 ≡ 首页），Venera page N ↔ 站点 page N-1。
     */
    load: async (keyword, options, page) => {
      const kw = String(keyword || "").trim();
      const safePage = this.num(page, 1);
      if (!kw) return { comics: [], maxPage: 1 };
      const sitePage = Math.max(0, safePage - 1);
      try {
        const url = this.searchUrl(kw, sitePage);
        const html = await this.getText(url, this.baseUrl + "/");
        const kind = this.searchPageKind(html);

        if (kind === "empty") {
          // 无结果词：安全空（站点本就 0 条，无需探测边界）。
          this.searchCache[this.baseUrl + "|" + kw] = 1;
          return { comics: [], maxPage: 1 };
        }
        if (kind === "outofrange") {
          // 越界页：返回真实 maxPage，本页给空列表。
          const maxPage = await this.detectSearchMaxPage(kw);
          return { comics: [], maxPage };
        }
        const comics = this.parseSearchPage(html);
        // 结果与边界探测解耦（v1.1.1）：页面已解析出真实结果时，
        // 探测失败只降级 maxPage（不宣称存在更多页），不再丢弃本页结果。
        let maxPage = safePage;
        try {
          maxPage = await this.detectSearchMaxPage(kw);
        } catch (e) {
          console.error("太极漫画网搜索 maxPage 探测失败，降级为当前页：", e);
        }
        return { comics, maxPage };
      } catch (e) {
        console.error("太极漫画网搜索失败：", e);
        return { comics: [], maxPage: safePage };
      }
    },
    // 站点搜索表单无字段选择（placeholder「漫画名或作者」，但实测仅 title 参数生效，
    // author/authorstr 等均被忽略返回默认榜单），故不设 optionList。
    optionList: [],
  };

  /**
   * 搜索 URL 构造（路径式 + ?page=，v1.1.0 统一入口，search.load 与边界探测共用）。
   * kw 已由调用方 trim；encodeURIComponent 保证关键词不会改变路径结构。
   */
  searchUrl(kw, sitePage) {
    return `${this.baseUrl}/search/${encodeURIComponent(kw)}?page=${sitePage}`;
  }

  /**
   * 搜索 maxPage 探测（真实依据：越界页 = 帝国 CMS「您来自的链接不存在」提示页）。
   * 区间 [lo, hi]：lo 为已知有效站点页码（第 1 页结果非空时为 0），hi 为阶梯短路得到的首个越界页码；
   * 二分收敛后 maxPage = lo + 1（站点页码 0 对应 Venera 第 1 页）。
   * 探测异常抛错，不缩边界。
   * 实测：关键词「人」lo=0 → 阶梯 64 越界 → 二分收敛到站点页码 59（尾页 4 条）→ maxPage=60。
   * v1.1.0 起 urlOf 使用路径式 searchUrl（与 v1.0.0 查询式同页字节级一致）。
   */
  async detectSearchMaxPage(kw) {
    const cacheKey = this.baseUrl + "|" + kw;
    if (this.searchCache[cacheKey] != null) return this.searchCache[cacheKey];

    const urlOf = (p) => this.searchUrl(kw, p);
    const kindOf = async (p) => {
      let lastError = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        let html;
        try {
          html = await this.getText(urlOf(p), this.baseUrl + "/");
        } catch (e) {
          lastError = String(e);
          if (this.isTransientError(lastError) && attempt === 0) {
            await this.sleep(400);
            continue;
          }
          throw new Error(`搜索边界探测失败：${lastError}`);
        }
        const kind = this.searchPageKind(html);
        const isNotFoundPage = kind === "outofrange" && html.indexOf("您来自的链接不存在") >= 0;
        // 非「越界提示页」的响应（有结果 / 无结果 / 其它无 serchArry 页）直接判定。
        if (!isNotFoundPage) return kind;
        // 越界提示页 = **有效终止信号**而非异常：重试一次排除瞬态误判，
        // 两次一致即返回 "outofrange"（v1.1.1 修复：此前此处两次后抛错，
        // 导致结果 ≤ 8 页的关键词搜索必然整体失败返回空列表）。
        lastError = "越界响应";
        if (attempt === 0) {
          await this.sleep(300);
          continue;
        }
        return "outofrange";
      }
      throw new Error(`搜索边界探测失败：${lastError}`);
    };

    let lo = 0;
    let hi = null;
    for (const n of [8, 64, 512, 4096]) {
      const kind = await kindOf(n);
      if (kind === "data") lo = n;
      else {
        hi = n;
        break;
      }
    }
    if (hi === null) throw new Error(`搜索「${kw}」边界探测失败：4096 页仍存在`);

    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const kind = await kindOf(mid);
      if (kind === "data") lo = mid;
      else hi = mid;
    }

    const maxPage = lo + 1;
    this.searchCache[cacheKey] = maxPage;
    return maxPage;
  }

  // ------------------------------------------------------------ 详情与章节

  comic = {
    loadInfo: async (id) => {
      const comicId = this.normalizeComicId(id);
      if (!comicId) throw new Error(`无效的漫画 ID：${id}`);
      const html = await this.getText(`${this.baseUrl}/comic/${comicId}`, this.baseUrl + "/");
      const doc = new HtmlDocument(html);
      try {
        // 标题：div.BarTit#comicName
        const nameEl = doc.querySelector("#comicName");
        const title = nameEl && nameEl.text ? String(nameEl.text).trim() : "";
        if (!title) throw new Error("详情页标题缺失");

        // 封面：div#Cover > img（站内 /d/file/ 或 CDN img1.du8.in，均实测 200）
        const coverEl = doc.querySelector("#Cover img");
        const cover = coverEl && coverEl.attributes ? coverEl.attributes.src || "" : "";

        // 作者：p.txtItme > a.pd.introName
        const authorEl = doc.querySelector("a.introName");
        const author = authorEl && authorEl.text ? String(authorEl.text).trim() : "";

        // 题材 / 读者群 / 地域 / 状态：p.txtItme 内 a.pd（状态单独取自 /end/）
        const pdLinks = doc.querySelectorAll("a.pd");
        const topicList = [];
        const readerList = [];
        const zoneList = [];
        let status = "";
        for (const a of pdLinks) {
          if (!a.attributes) continue;
          const href = a.attributes.href || "";
          const text = a.text ? String(a.text).trim() : "";
          if (!text) continue;
          if (href.indexOf("/ticai/") >= 0) topicList.push(text);
          else if (href.indexOf("/reader/") >= 0) readerList.push(text);
          else if (href.indexOf("/zone/") >= 0) zoneList.push(text);
          else if (href.indexOf("/end/") >= 0) status = text;
        }

        // 更新时间：p.txtItme > span.date
        const dateEl = doc.querySelector("span.date");
        const updateTime = dateEl && dateEl.text ? String(dateEl.text).trim() : "";

        // 简介：p.txtDesc（站点自带「介绍:」前缀，最多剥一层）
        const descEl = doc.querySelector("p.txtDesc");
        let description = descEl && descEl.text ? String(descEl.text).trim() : "";
        description = description.replace(/^介绍\s*[:：]\s*/, "").trim();

        // 章节：内联 initIntroData([...]) JSON（不执行站点脚本，按字符串提取并解析）
        const chapters = this.parseIntroData(html);
        if (!chapters.size) throw new Error("详情页章节列表为空");

        const tags = {};
        if (topicList.length) tags["题材"] = topicList;
        if (readerList.length) tags["读者群"] = readerList;
        if (zoneList.length) tags["地域"] = zoneList;

        return new ComicDetails({
          title,
          subTitle: author,
          cover: this.absoluteUrl(cover),
          tags,
          status,
          description,
          updateTime,
          chapters,
          comic: new Comic({
            id: comicId,
            title,
            subTitle: author,
            cover: this.absoluteUrl(cover),
            tags: topicList,
            sourceKey: this.key,
          }),
          sourceKey: this.key,
        });
      } finally {
        doc.dispose();
      }
    },

    /**
     * 章节图片加载。
     * 章节页 /view/{漫画ID}/{章节ID}，图片为 img.comic_img.lazy 的 data-original 明文 URL；
     * 三话实测 67/46/160 张、无图片分页（无「下一页」，下一章为 JS 跳转）→ 单请求全量。
     * 历史入参（普通 ID / 完整 URL / 组合 ID / 对象 / 非法值）统一由 parseEpRef 归一；
     * 组合 ID 中的漫画 ID 与传入 comicId 不一致时拒绝（不发请求），避免串章。
     */
    loadEp: async (comicId, epId) => {
      const ref = this.parseEpRef(epId);
      if (!ref) return { images: [] };
      const cidParam = this.normalizeComicId(comicId);
      if (ref.cid && cidParam && ref.cid !== cidParam) {
        console.error(`太极漫画网章节漫画 ID 不一致：${ref.cid} ≠ ${cidParam}`);
        return { images: [] };
      }
      const cid = ref.cid || cidParam;
      if (!cid) return { images: [] };

      const referer = `${this.baseUrl}/view/${cid}/${ref.eid}`;
      try {
        const html = await this.getText(referer, `${this.baseUrl}/comic/${cid}`);
        const doc = new HtmlDocument(html);
        const images = [];
        const seen = new Set();
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
        } finally {
          doc.dispose();
        }
        return {
          images,
          headers: {
            "User-Agent": this.siteUa,
            Referer: referer,
          },
        };
      } catch (e) {
        console.error(`太极漫画网章节 ${ref.eid} 图片加载失败：`, e);
        return { images: [] };
      }
    },

    /**
     * 图片请求头：实测 img1.du8.in 无防盗链（无 Referer / 任意 Referer 均 200），
     * 这里防御性带上本站 Referer 与 UA，便于 CDN 策略变化时保持可用。
     */
    onImageLoad: (url, comicId, epId) => {
      const ref = this.parseEpRef(epId);
      const cid = (ref && ref.cid) || this.normalizeComicId(comicId);
      const referer =
        ref && cid ? `${this.baseUrl}/view/${cid}/${ref.eid}` : this.baseUrl + "/";
      return {
        headers: {
          "User-Agent": this.siteUa,
          Referer: referer,
        },
      };
    },
  };

  /**
   * 详情页章节 JSON 提取：`initIntroData([{title:"连载", data:[...]}])`。
   * 用括号配对（识别字符串与转义）取出数组后 JSON.parse，不执行站点脚本。
   * 章节按页面顺序插入（站点默认升序 chapter_order，与网页一致）。
   */
  parseIntroData(html) {
    const value = String(html || "");
    const idx = value.indexOf("initIntroData(");
    const chapters = new Map();
    if (idx < 0) return chapters;
    const start = value.indexOf("[", idx);
    if (start < 0) return chapters;

    let depth = 0;
    let end = -1;
    let inStr = false;
    let escaped = false;
    for (let i = start; i < value.length; i++) {
      const ch = value[i];
      if (inStr) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) return chapters;

    let groups;
    try {
      groups = JSON.parse(value.slice(start, end + 1));
    } catch (e) {
      console.error("太极漫画网章节 JSON 解析失败：", e);
      return chapters;
    }
    if (!Array.isArray(groups)) return chapters;

    for (const group of groups) {
      const list = group && Array.isArray(group.data) ? group.data : [];
      for (const item of list) {
        if (!item) continue;
        const epId = item.id != null ? String(item.id) : "";
        if (!epId || epId === "0") continue;
        const name = String(item.chapter_name || item.title || "").trim();
        if (!name) continue;
        if (!chapters.has(epId)) chapters.set(epId, name);
      }
    }
    return chapters;
  }
}
