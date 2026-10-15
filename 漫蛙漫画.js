/** @type {import('./_venera_.js')} */
/**
 * 漫蛙漫画 Venera 漫画源 v1.0.0
 *
 * 入口说明：用户提供的 https://www.mwwz.cc/ 是漫蛙的「防走失发布页」，
 * 页面只输出若干候选真实域名（mwmw.cc / manwalu.cc / manwaxu.cc / manwace.cc），
 * 本源以实测可达的 https://manwaxu.cc/ 为请求地址。
 *
 * 已取证并验证的能力：
 *  - 首页 5 个推荐区块（服务端渲染，.bm-box 结构）
 *  - 搜索 GET /api/search（keyword / author / tags 三种字段、分页、空结果）
 *  - 分类 POST /api/cate/{slug}（题材 + 状态/更新日/分级/地区/排序/向性筛选、分页）
 *  - 详情 GET /api/comic/{id} + 章节 GET /api/comic/{id}/chapters
 *  - 章节图片 GET /api/comic/image/{epId}?page&page_size（60 张/页，多页合并）
 *  - 封面与正文图片响应为 AES-CBC 密文，onResponse 解密
 *
 * 加密四证据：
 *  1) 密文来源：图片 CDN（en_images 路径）返回字节不是 JPEG/PNG/GIF/RIFF 文件头；
 *  2) 调用链：站点 base.js 的 BaseUtil.getSecureImageUrl 与 chapter.js
 *     均为 WebCrypto AES-CBC decrypt，IV = 响应前 16 字节，密文 = 其余字节；
 *  3) Key/IV：BaseUtil.AES_KEY = '0B6666A0-BB59-1381-B746-a0E4C9AC'，
 *     UTF-8 编码后取前 32 字节；IV 取自密文响应前 16 字节；
 *  4) 解密验证：真实章节首图解密得到 RIFF/WEBP，真实封面解密得到 FF D8 JPEG。
 *
 * 权限边界：章节接口 isVip=true 的章节在未登录状态返回的是白底占位图（不可读），
 * 源不做任何登录态伪造，直接返回空图片数组。
 */
class MwwzComicSource extends ComicSource {
  name = "漫蛙漫画";
  key = "mwwz";
  version = "1.2.1";
  minAppVersion = "1.6.0";
  url = "";

  /**
   * 源设置：
   * - base_url：主站域名，可手动改；「刷新主站域名」callback 从发布页探测最新可用域名并写入 default。
   * - image_line：图片线路（图2实测五条，高速① tu.mwrzu.cc 实测 DNS 不存在，改用站点同源可用的 tu.mwzu.cc）。
   * - callback 类型必须放在 settings 最后。
   */
  settings = {
    base_url: {
      title: "主站域名",
      type: "input",
      default: "https://manwaxu.cc",
    },
    image_line: {
      title: "图片线路",
      type: "select",
      options: [
        { value: "auto", text: "自动（跟随接口）" },
        { value: "https://tu.mwzu.cc", text: "高速源① tu.mwzu.cc" },
        { value: "https://tu.mhttu.cc", text: "高速源② tu.mhttu.cc" },
        { value: "https://mwtuwu.cc", text: "稳定源① mwtuwu.cc" },
        { value: "https://tu.mwla.cc", text: "稳定源② tu.mwla.cc" },
        { value: "https://124.221.66.202:36662", text: "备用源 124.221.66.202:36662" },
      ],
      default: "auto",
    },
    // 【重要】callback 类型设置必须放在 settings 对象的最后
    refresh_domain: {
      title: "刷新主站域名",
      type: "callback",
      buttonText: "从发布页检测最新可用域名",
      callback: async () => {
        const found = await this.detectDomainFromPublishPage();
        if (!found) {
          throw new Error("发布页检测失败：未能从 www.mwwz.cc / mwmw.cc 获得可用域名");
        }
        this.settings.base_url.default = found;
      },
    },
  };

  /**
   * 主站域名：优先用户手动设置的值，其次发布页刷新写入的默认值。
   * www.mwwz.cc 为发布页，以下默认值为实测可达的真实站点。
   */
  get baseUrl() {
    return (
      this.loadSetting("base_url") ||
      this.settings.base_url.default ||
      "https://manwaxu.cc"
    );
  }

  siteUa =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  // 图片响应解密密钥，来源见文件头「加密四证据」。
  imageAesKey = "0B6666A0-BB59-1381-B746-a0E4C9AC";

  listPageSize = 36; // 分类接口实测 pageSize
  searchPageSize = 20; // 搜索接口实测 pageSize
  imagePageSize = 60; // 阅读页 chapter.js 实测 pageSize
  commentPageSize = 20; // 评论页 comment.js 实测 pageSize
  rankPageSize = 10; // 排行榜 rank.js 实测 pageSize

  // 每部漫画的 VIP 章节集合缓存，loadInfo 填充、loadEp 懒加载。
  vipChapterCache = {};

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

  /**
   * 从发布页检测最新可用主站域名：
   * 1) 读 www.mwwz.cc 按钮链接（永久地址/自测地址/漫蛙地址）；
   * 2) 读 mwmw.cc 线路检测页内的 base64 候选域名；
   * 3) 逐个探测 `{origin}/check`，响应含 `mw` 判定可用（与发布页自身检测逻辑一致）。
   * 返回可用的 `https://host` 或空串。
   */
  async detectDomainFromPublishPage() {
    const candidates = [];
    const push = (raw) => {
      const value = String(raw || "").trim().replace(/\/+$/, "");
      const m = value.match(/^https?:\/\/([^\/]+)$/i);
      if (!m) return;
      const host = m[1];
      // 只接受 .cc 域名或 IPv4[:port]，排除统计/APP 等无关站点
      if (!/^[a-z0-9.-]+\.cc$/i.test(host) && !/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host)) return;
      if (candidates.indexOf(value) === -1) candidates.push(value);
    };
    try {
      const res = await this.request(
        "GET",
        "https://www.mwwz.cc/",
        this.baseHeaders("https://www.mwwz.cc/"),
        null
      );
      const re = /href="(https:\/\/[^"]+)"/g;
      let m;
      while ((m = re.exec(String(res.body || ""))) !== null) push(m[1]);
    } catch (e) {
      console.error("漫蛙发布页读取失败：", e);
    }
    try {
      const res = await this.request(
        "GET",
        "https://mwmw.cc/",
        this.baseHeaders("https://mwmw.cc/"),
        null
      );
      const re = /"([A-Za-z0-9+/]{16,}={0,2})"/g;
      let m;
      while ((m = re.exec(String(res.body || ""))) !== null) {
        try {
          push(Convert.decodeUtf8(Convert.decodeBase64(m[1])));
        } catch (e) {
          // 非候选字符串，忽略
        }
      }
    } catch (e) {
      console.error("漫蛙线路检测页读取失败：", e);
    }
    for (const origin of candidates) {
      try {
        const res = await this.request(
          "GET",
          origin + "/check",
          this.baseHeaders(origin + "/"),
          null
        );
        if (/mw/i.test(String(res.body || ""))) return origin;
      } catch (e) {
        // 该候选不可用，继续下一个
      }
    }
    return "";
  }

  /** 按设置替换图片 URL 的 host 为所选线路；auto 或解析失败时原样返回。 */
  applyImageLine(url) {
    const line = this.loadSetting("image_line") || "auto";
    if (!line || line === "auto") return url;
    const value = String(url || "");
    const m = value.match(/^(https?:\/\/)[^\/]+(\/.*)?$/i);
    if (!m) return value;
    return String(line).replace(/\/+$/, "") + (m[2] || "/");
  }

  /**
   * 排行榜：`GET /api/rank?page=&pageSize=10&sort=&timeType=`（rank.js 实测参数）。
   * - sort（榜类型，/rank/ 页 tab 真值）：0=人气榜、1=完结榜（total≈41772）、2=新番榜（≈4029）。
   * - timeType（时间榜，data-time 真值）：0=总榜、1=月榜、2=周榜、3=日榜；改变排序序列，total 为该 sort 集合总数。
   * - 向性：与分类一致走 Cookie typeId（实测 typeId=2 → total 17557，typeId=0 → 164440）。
   * - 排行榜分类（category="排行榜"）下筛选组经 notShowWhen/showWhen 过滤后顺序为：0向性、1榜单类型、2时间榜。
   * - maxPage 依据接口 data.total（实测越界页仍返回数据，不能以空页判边界）。
   */
  async loadRank(category, options, page) {
    const opts = Array.isArray(options) ? options : [];
    // 过滤后 options：0=向性（首项 key="all" → num 归 0）、1=榜单类型（0/1/2）、2=时间榜（0/1/2/3）
    const typeId = this.num(opts[0], 0);
    const sort = this.num(opts[1], 0);
    const timeType = this.num(opts[2], 0);
    const safePage = this.num(page, 1);
    try {
      const data = await this.getJson(
        `${this.baseUrl}/api/rank?page=${safePage}&pageSize=${this.rankPageSize}&sort=${sort}&timeType=${timeType}`,
        this.baseUrl + "/rank/",
        { Cookie: "typeId=" + typeId }
      );
      const list = (data.data && data.data.list) || [];
      const total = Number((data.data && data.data.total) || 0);
      const comics = [];
      for (const item of list) {
        const comic = this.buildComic({
          url: item.url,
          title: item.title,
          cover: item.pic,
          tags: item.tags,
          subTitle: item.tags,
        });
        if (comic) comics.push(comic);
      }
      return {
        comics,
        maxPage: total > 0 ? Math.max(1, Math.ceil(total / this.rankPageSize)) : safePage,
      };
    } catch (e) {
      console.error("漫蛙排行榜加载失败：", e);
      return { comics: [], maxPage: safePage };
    }
  }

  /** 统一网络请求：瞬态错误有限重试一次，5xx 有限重试一次，不重试 4xx。 */
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

  async getJson(url, referer, extraHeaders) {
    const headers = this.baseHeaders(referer);
    if (extraHeaders) {
      const keys = Object.keys(extraHeaders);
      for (let i = 0; i < keys.length; i++) headers[keys[i]] = extraHeaders[keys[i]];
    }
    const res = await this.request("GET", url, headers, null);
    let data;
    try {
      data = JSON.parse(res.body);
    } catch (e) {
      throw new Error(`响应不是合法 JSON（${url}）`);
    }
    if (data && data.code !== undefined && Number(data.code) !== 200) {
      throw new Error(`接口返回 code=${data.code} ${data.msg || ""}（${url}）`);
    }
    return data;
  }

  async postJson(url, payload, referer, extraHeaders) {
    const headers = this.baseHeaders(referer);
    headers["Content-Type"] = "application/json";
    if (extraHeaders) {
      const keys = Object.keys(extraHeaders);
      for (let i = 0; i < keys.length; i++) headers[keys[i]] = extraHeaders[keys[i]];
    }
    const res = await this.request(
      "POST",
      url,
      headers,
      typeof payload === "string" ? payload : JSON.stringify(payload)
    );
    let data;
    try {
      data = JSON.parse(res.body);
    } catch (e) {
      throw new Error(`响应不是合法 JSON（${url}）`);
    }
    if (data && data.code !== undefined && Number(data.code) !== 200) {
      throw new Error(`接口返回 code=${data.code} ${data.msg || ""}（${url}）`);
    }
    return data;
  }

  async getText(url, referer) {
    const res = await this.request("GET", url, this.baseHeaders(referer), null);
    if (!res.body) throw new Error(`空响应（${url}）`);
    return String(res.body);
  }

  // ------------------------------------------------------------ ID 标准化

  /** 从 /comic/94789、/comic/94789/1361313、完整 URL 中提取漫画 ID。 */
  parseComicId(href) {
    const value = String(href || "").trim();
    if (!value) return null;
    const match = value.match(/\/comic\/(\d+)(?:\/|$)/);
    if (match) return match[1];
    if (/^\d+$/.test(value)) return value;
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
   *  1361313                    普通章节 ID
   *  /comic/94789/1361313       详情页章节链接
   *  https://.../comic/94789/1361313  完整章节 URL
   *  94789|1361313              组合 ID（取最后一段）
   *  1361313_2                  阅读页分页后缀（取下划线前）
   *  {epId/chapterId/id/url}    对象参数
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
    let value = String(epId).trim();
    if (!value) return null;
    value = value.split("_")[0];
    const urlMatch = value.match(/\/comic\/\d+\/(\d+)/);
    if (urlMatch) return urlMatch[1];
    const parts = value.split(/[|\/]/);
    value = parts[parts.length - 1].trim();
    // 章节 id 从 1 开始，"0" 视为无效
    if (value === "0") return null;
    if (/^\d+$/.test(value)) return value;
    const digits = value.match(/(\d+)\s*$/);
    if (value.indexOf("/") === -1 && digits) return digits[1];
    return null;
  }

  // ------------------------------------------------------------ 列表卡片解析

  /** 首页 / 分类 / 搜索的统一 Comic 构造。 */
  buildComic(item) {
    if (!item) return null;
    const id = this.parseComicId(item.url || item.href || "");
    if (!id) return null;
    const tags = String(item.tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);
    const subTitle = String(item.subTitle || item.author || item.tags || "").trim();
    return new Comic({
      id,
      title: String(item.title || "未知漫画").trim(),
      subTitle,
      cover: this.absoluteUrl(item.cover || item.pic || ""),
      tags,
      sourceKey: this.key,
    });
  }

  /** 首页区块卡片：.item > a[href]，封面 .thumb_img[data-src]，标题 .title，描述 .desc。 */
  parseHomeItem(item) {
    const link = item.querySelector("a[href]");
    if (!link) return null;
    const id = this.parseComicId(link.attributes ? link.attributes.href : "");
    if (!id) return null;
    const titleEl = item.querySelector(".title");
    const coverEl = item.querySelector(".thumb_img");
    const descEl = item.querySelector(".desc");
    let subTitle = "";
    if (descEl && descEl.text) {
      // 首页 desc 形如「作者 | 标签1,标签2,...」，列表只保留作者段。
      subTitle = String(descEl.text).split("|")[0].trim();
    }
    const title = titleEl && titleEl.text ? String(titleEl.text).trim() : "";
    if (!title) return null;
    let tags = [];
    if (descEl && descEl.text) {
      const parts = String(descEl.text).split("|");
      if (parts.length > 1) {
        tags = parts[1].split(",").map((t) => t.trim()).filter((t) => t);
      }
    }
    return new Comic({
      id,
      title,
      subTitle,
      cover: this.absoluteUrl(
        coverEl ? coverEl.attributes["data-src"] || coverEl.attributes.src || "" : ""
      ),
      tags,
      sourceKey: this.key,
    });
  }

  // ------------------------------------------------------------ 首页

  explore = [
    {
      title: this.name,
      type: "singlePageWithMultiPart",
      load: async (page) => {
        let doc = null;
        try {
          const html = await this.getText(this.baseUrl + "/", this.baseUrl + "/");
          doc = new HtmlDocument(html);
          const sections = doc.querySelectorAll(".bm-box");
          const result = {};
          for (const box of sections) {
            const titleEl = box.querySelector(".bm-box__head .title");
            const title = titleEl && titleEl.text ? String(titleEl.text).trim() : "";
            if (!title) continue;
            const comics = [];
            for (const item of box.querySelectorAll(".item")) {
              const comic = this.parseHomeItem(item);
              if (comic) comics.push(comic);
            }
            if (comics.length > 0 && !result[title]) result[title] = comics;
          }
          return result;
        } catch (e) {
          console.error("漫蛙首页解析失败：", e);
          return {};
        } finally {
          if (doc) doc.dispose();
        }
      },
    },
  ];

  // ------------------------------------------------------------ 分类

  category = {
    title: this.name,
    // 「分类」「排行榜」各放单个入口；分类的题材/状态/更新/地区/排序/向性、
    // 排行榜的榜单类型/时间榜/向性均由筛选面板（optionList）按 notShowWhen/showWhen 切换承载。
    parts: [
      {
        name: "分类",
        type: "fixed",
        categories: ["全部"],
        itemType: "category",
        categoryParams: [""],
      },
      {
        name: "排行榜",
        type: "fixed",
        categories: ["排行榜"],
        itemType: "category",
        categoryParams: ["rank"],
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const opts = Array.isArray(options) ? options : [];
      // 排行榜类别：param="rank"；该分类下可见组（过滤后顺序）：0向性、1榜单类型、2时间榜
      if (param === "rank") {
        return await this.loadRank(category, opts, page);
      }
      // 筛选组顺序与 optionList 一致：0状态、1更新、2地区、3排序、4向性、5题材
      const status = this.num(opts[0], -1);
      const day = this.num(opts[1], 0);
      const areaId = this.num(opts[2], 0);
      const sort = this.num(opts[3], 0);
      // 向性：站点 cate.js 把选中值写入 Cookie typeId 并同步 body.comic.typeId，两者都要带上才能正确切换
      const typeId = this.num(opts[4], 0);
      const tagOpt = typeof opts[5] === "string" ? opts[5] : "";
      const slug =
        tagOpt && tagOpt !== "all"
          ? tagOpt
          : typeof param === "string" && param
          ? param
          : "";
      const url =
        this.baseUrl + "/api/cate" + (slug ? "/" + encodeURIComponent(slug) : "");
      const payload = {
        page: { page: this.num(page, 1), pageSize: this.listPageSize },
        category: "comic",
        sort,
        comic: {
          status,
          day,
          // 题材以 URL 路径为准（实测 body.tag 单独不生效），body 保持站点默认
          tag: "",
          level: 0,
          areaId,
          typeId,
        },
        video: {
          year: 0,
          typeId: 0,
          typeId1: 0,
          area: "",
          lang: "",
          status: -1,
          day: 0,
          level: 0,
        },
        novel: { status: -1, day: 0, sortId: 0, level: 0 },
      };
      const safePage = this.num(page, 1);
      try {
        const data = await this.postJson(
          url,
          payload,
          this.baseUrl + "/cate?category=comic",
          { Cookie: "typeId=" + typeId }
        );
        const list = (data.data && data.data.list) || [];
        const total = Number((data.data && data.data.total) || 0);
        const comics = [];
        for (const item of list) {
          const comic = this.buildComic({
            url: item.url,
            title: item.title,
            cover: item.pic,
            tags: item.tags,
            subTitle: item.tags,
          });
          if (comic) comics.push(comic);
        }
        return {
          comics,
          maxPage: total > 0 ? Math.max(1, Math.ceil(total / this.listPageSize)) : safePage,
        };
      } catch (e) {
        console.error("漫蛙分类加载失败：", e);
        return { comics: [], maxPage: safePage };
      }
    },
    optionList: [
      {
        label: "状态",
        type: "select",
        notShowWhen: ["排行榜"],
        options: ["all-全部", "0-连载中", "1-已完结"],
      },
      {
        label: "更新",
        type: "select",
        notShowWhen: ["排行榜"],
        options: [
          "all-全部",
          "1-周一",
          "2-周二",
          "3-周三",
          "4-周四",
          "5-周五",
          "6-周六",
          "7-周日",
        ],
      },
      {
        label: "地区",
        type: "select",
        notShowWhen: ["排行榜"],
        options: [
          "all-全部",
          "2-韩国",
          "3-日漫",
          "4-国漫",
          "5-台漫",
          "6-其他",
          "1-未分类",
        ],
      },
      {
        label: "排序",
        type: "select",
        notShowWhen: ["排行榜"],
        options: ["all-更新", "1-新作", "3-热门"],
      },
      {
        label: "向性",
        type: "select",
        options: [
          "all-全部",
          "1-一般向",
          "2-BL向",
          "3-TL向",
          "5-GL向",
          "4-禁漫",
        ],
      },
      {
        // 题材 value 为 /cate 页面真实 href 后缀，与 URL 路径 /api/cate/{value} 对应
        // 23 项 >8，Venera 硬规则自动渲染为下拉（已与用户确认保持）
        label: "题材",
        type: "select",
        notShowWhen: ["排行榜"],
        options: [
          "all-全部",
          "hotblooded-热血",
          "xuanhuan-玄幻",
          "romance-恋爱",
          "adventure-冒险",
          "historical-古风",
          "urban-都市",
          "transmigration-穿越",
          "fantasy-奇幻",
          "comedy-搞笑",
          "shounen-少男",
          "action-战斗",
          "rebirth-重生",
          "counterattack-逆袭",
          "hilarious-爆笑",
          "youth-少年",
          "harem-后宫",
          "system-系统",
          "bl-BL",
          "manhwa-韩漫",
          "fullversion-完整版",
          "19plus-19r",
          "taiwanver-台版",
        ],
      },
      {
        // 榜单类型：/rank/ 页 tab data-sort 真值（0=人气榜 total≈164444、1=完结榜≈41772、2=新番榜≈4029）
        label: "榜单",
        type: "select",
        showWhen: ["排行榜"],
        options: ["0-人气榜", "1-完结榜", "2-新番榜"],
      },
      {
        // 时间榜：/rank/ 页 data-time 真值；改变排序序列，接口 total 不变
        label: "时间",
        type: "select",
        showWhen: ["排行榜"],
        options: ["0-总榜", "1-月榜", "2-周榜", "3-日榜"],
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
      const field = ["keyword", "author", "tags"].indexOf(opts[0]) >= 0 ? opts[0] : "keyword";
      const url =
        this.baseUrl +
        "/api/search?type=mh&page=" +
        safePage +
        "&pageSize=" +
        this.searchPageSize +
        "&" +
        field +
        "=" +
        encodeURIComponent(kw);
      try {
        const data = await this.getJson(url, this.baseUrl + "/search/");
        const list = (data.data && data.data.list) || [];
        const total = Number((data.data && data.data.total) || 0);
        const comics = [];
        for (const item of list) {
          const comic = this.buildComic({
            url: item.url,
            title: item.title,
            cover: item.cover,
            tags: item.tags,
            subTitle: item.author,
          });
          if (comic) comics.push(comic);
        }
        return {
          comics,
          maxPage: total > 0 ? Math.max(1, Math.ceil(total / this.searchPageSize)) : safePage,
        };
      } catch (e) {
        console.error("漫蛙搜索失败：", e);
        return { comics: [], maxPage: safePage };
      }
    },
    optionList: [
      {
        label: "字段",
        type: "select",
        options: ["keyword-名称", "author-作者", "tags-标签"],
      },
    ],
  };

  // ------------------------------------------------------------ 详情与章节

  comic = {
    loadInfo: async (id) => {
      const comicId = this.normalizeComicId(id);
      if (!comicId) throw new Error(`无效的漫画 ID：${id}`);
      const detailUrl = `${this.baseUrl}/api/comic/${comicId}`;
      const chaptersUrl = `${this.baseUrl}/api/comic/${comicId}/chapters`;
      const [detail, chapterRes] = await Promise.all([
        this.getJson(detailUrl, this.baseUrl + "/"),
        this.getJson(chaptersUrl, this.baseUrl + "/comic/" + comicId),
      ]);
      const d = (detail && detail.data) || {};
      const list = (chapterRes.data && chapterRes.data.list) || [];

      const chapters = new Map();
      const vipList = [];
      for (const item of list) {
        if (!item || item.id === null || item.id === undefined) continue;
        const epId = String(item.id);
        chapters.set(epId, String(item.title || "未命名章节"));
        if (item.isVip) vipList.push(epId);
      }
      this.vipChapterCache[comicId] = vipList;

      const title = String(d.title || "未知漫画");
      const author = String(d.author || "");
      const cover = this.absoluteUrl(d.cover || "");
      const tags = String(d.tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t);
      // 实测 data.status：1 = 连载中，0 = 已完结（与分类筛选参数取值相反）。
      const statusText = Number(d.status) === 1 ? "连载中" : "已完结";

      return new ComicDetails({
        title,
        subTitle: author,
        cover,
        tags: {
          状态: statusText,
          类型: tags,
        },
        chapters,
        description: String(d.intro || ""),
        updateTime: d.editTime
          ? new Date(Number(d.editTime) * 1000).toLocaleDateString()
          : "",
        comic: new Comic({
          id: comicId,
          title,
          subTitle: author,
          cover,
          tags,
          sourceKey: this.key,
        }),
        sourceKey: this.key,
      });
    },

    loadEp: async (comicId, epId) => {
      const comicIdNorm = this.normalizeComicId(comicId);
      const epIdNorm = this.normalizeEpId(epId);
      if (!epIdNorm) return { images: [] };

      // 权限分支：未登录时 isVip 章节站点返回白底占位图，视为不可读。
      if (comicIdNorm) {
        try {
          const locked = await this.isChapterLocked(comicIdNorm, epIdNorm);
          if (locked) {
            console.warn(`漫蛙章节 ${epIdNorm} 为 VIP 章节，未登录不可读，返回空图片。`);
            return { images: [] };
          }
        } catch (e) {
          // 章节元数据不可得时不阻断，交由图片接口自行判定。
          console.error("漫蛙章节权限查询失败：", e);
        }
      }

      try {
        const images = await this.fetchAllImages(epIdNorm);
        const referer = comicIdNorm
          ? `${this.baseUrl}/comic/${comicIdNorm}/${epIdNorm}`
          : this.baseUrl + "/";
        return {
          images,
          headers: {
            "User-Agent": this.siteUa,
            Referer: referer,
          },
        };
      } catch (e) {
        console.error("漫蛙章节图片加载失败：", e);
        return { images: [] };
      }
    },

    onImageLoad: (url, comicId, epId) => {
      const cid = this.normalizeComicId(comicId);
      const eid = this.normalizeEpId(epId);
      const referer =
        cid && eid ? `${this.baseUrl}/comic/${cid}/${eid}` : this.baseUrl + "/";
      return {
        url: this.applyImageLine(url),
        headers: {
          "User-Agent": this.siteUa,
          Referer: referer,
          Accept: "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
        onResponse: (buffer) => this.decryptImageBuffer(buffer),
      };
    },

    onThumbnailLoad: (url) => ({
      url: this.applyImageLine(url),
      headers: {
        "User-Agent": this.siteUa,
        Referer: this.baseUrl + "/",
        Accept: "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      onResponse: (buffer) => this.decryptImageBuffer(buffer),
    }),

    /**
     * 详情页评论：GET /api/comments?comic_id=&page=&page_size=20&sort=time（实测无需登录）。
     * 回复不支持 parent_id 查询（实测参数不生效），内嵌于顶层评论 replies 数组，
     * replyTo 场景通过定位评论所在页后取其 replies。
     * @returns {Promise<{comments: Object[], maxPage: number}>}
     */
    loadComments: async (comicId, subId, page, replyTo) => {
      const cid = this.normalizeComicId(comicId);
      if (!cid) return { comments: [], maxPage: 0 };
      if (replyTo) return await this.loadCommentReplies(cid, replyTo);
      const safePage = this.num(page, 1);
      try {
        const data = await this.getJson(
          `${this.baseUrl}/api/comments?comic_id=${cid}&page=${safePage}&page_size=${this.commentPageSize}&sort=time`,
          this.baseUrl + "/comic/" + cid
        );
        const list = (data.data && data.data.list) || [];
        const total = Number((data.data && data.data.total) || 0);
        return {
          comments: list.map((item) => this.buildComment(item)),
          maxPage:
            total > 0
              ? Math.max(1, Math.ceil(total / this.commentPageSize))
              : safePage,
        };
      } catch (e) {
        console.error("漫蛙评论加载失败：", e);
        return { comments: [], maxPage: safePage };
      }
    },

    /**
     * 正文页（章节）评论：同接口追加 chapter_id 过滤（实测生效，只返回带该章节标记的评论）。
     */
    loadChapterComments: async (comicId, epId, page, replyTo) => {
      const cid = this.normalizeComicId(comicId);
      const eid = this.normalizeEpId(epId);
      if (!cid || !eid) return { comments: [], maxPage: 0 };
      if (replyTo) return await this.loadCommentReplies(cid, replyTo);
      const safePage = this.num(page, 1);
      try {
        const data = await this.getJson(
          `${this.baseUrl}/api/comments?comic_id=${cid}&page=${safePage}&page_size=${this.commentPageSize}&sort=time&chapter_id=${eid}`,
          this.baseUrl + "/comic/" + cid + "/" + eid
        );
        const list = (data.data && data.data.list) || [];
        const total = Number((data.data && data.data.total) || 0);
        return {
          comments: list.map((item) => this.buildComment(item)),
          maxPage:
            total > 0
              ? Math.max(1, Math.ceil(total / this.commentPageSize))
              : safePage,
        };
      } catch (e) {
        console.error("漫蛙章节评论加载失败：", e);
        return { comments: [], maxPage: safePage };
      }
    },
  };

  // ------------------------------------------------------------ 章节图片

  /** 查询章节是否为 VIP 章节（带缓存，loadInfo 已填充时不重复请求）。 */
  async isChapterLocked(comicId, epId) {
    let cached = this.vipChapterCache[comicId];
    if (!Array.isArray(cached)) {
      const res = await this.getJson(
        `${this.baseUrl}/api/comic/${comicId}/chapters`,
        `${this.baseUrl}/comic/${comicId}`
      );
      const list = (res.data && res.data.list) || [];
      cached = [];
      for (const item of list) {
        if (item && item.isVip && item.id !== null && item.id !== undefined) {
          cached.push(String(item.id));
        }
      }
      this.vipChapterCache[comicId] = cached;
    }
    return cached.indexOf(String(epId)) >= 0;
  }

  /** 按站点分页拉取整话图片并去重，total_pages 来自接口 pagination。 */
  async fetchAllImages(epId) {
    const firstUrl =
      `${this.baseUrl}/api/comic/image/${epId}` +
      `?page=1&page_size=${this.imagePageSize}`;
    const first = await this.getJson(firstUrl, `${this.baseUrl}/comic/0/${epId}`);
    const firstData = (first && first.data) || {};
    const images = [];
    const seen = new Set();
    const pushAll = (list) => {
      for (const item of list || []) {
        const url = this.absoluteUrl(item && item.url);
        if (url && !seen.has(url)) {
          seen.add(url);
          images.push(url);
        }
      }
    };
    pushAll(firstData.images);

    const pagination = firstData.pagination || {};
    const total = Number(pagination.total) || 0;
    const totalPages =
      Number(pagination.total_pages) ||
      (total > 0 ? Math.ceil(total / this.imagePageSize) : 1) ||
      1;

    if (totalPages > 1) {
      const tasks = [];
      for (let p = 2; p <= totalPages; p++) {
        const url =
          `${this.baseUrl}/api/comic/image/${epId}` +
          `?page=${p}&page_size=${this.imagePageSize}`;
        tasks.push(
          this.getJson(url, `${this.baseUrl}/comic/0/${epId}`).catch((e) => {
            console.error(`漫蛙图片第 ${p} 页加载失败：`, e);
            return null;
          })
        );
      }
      const results = await Promise.all(tasks);
      for (const res of results) {
        if (res && res.data) pushAll(res.data.images);
      }
    }
    return images;
  }

  // ------------------------------------------------------------ 图片解密

  looksLikeImage(view) {
    if (!view || view.length < 4) return false;
    return (
      (view[0] === 0xff && view[1] === 0xd8) || // JPEG
      (view[0] === 0x89 && view[1] === 0x50) || // PNG
      (view[0] === 0x47 && view[1] === 0x49) || // GIF
      (view[0] === 0x52 && view[1] === 0x49) // RIFF / WEBP
    );
  }

  /** 去除 PKCS#7 padding；末尾不满足合法 padding 形态时原样返回。 */
  removePkcs7Padding(buffer) {
    const bytes = new Uint8Array(buffer);
    if (!bytes || bytes.length === 0) return buffer;
    const pad = bytes[bytes.length - 1];
    if (pad < 1 || pad > 16 || bytes.length <= pad) return buffer;
    for (let i = bytes.length - pad; i < bytes.length; i++) {
      if (bytes[i] !== pad) return buffer;
    }
    return bytes.slice(0, bytes.length - pad).buffer;
  }

  /**
   * 图片响应解密：明文文件头直接返回；否则按
   * IV = 前 16 字节、密文 = 其余字节、Key = AES_KEY UTF-8 前 32 字节做 AES-CBC 解密。
   * Venera 的 Convert.decryptAesCbc 不自动去 PKCS#7，这里显式去除。
   */
  decryptImageBuffer(buffer) {
    if (!buffer) return buffer;
    let view;
    try {
      view = new Uint8Array(buffer);
    } catch (e) {
      return buffer;
    }
    if (this.looksLikeImage(view)) return buffer;
    if (view.length <= 16) return buffer;
    try {
      const iv = buffer.slice(0, 16);
      const ciphertext = buffer.slice(16);
      const key = Convert.encodeUtf8(this.imageAesKey).slice(0, 32);
      const plain = Convert.decryptAesCbc(ciphertext, key, iv);
      return this.removePkcs7Padding(plain);
    } catch (e) {
      console.error("漫蛙图片解密失败：", e);
      return buffer;
    }
  }

  /** 评论条目（/api/comments 响应）-> Venera Comment。 */
  buildComment(item) {
    const user = (item && item.user) || {};
    const comment = {
      userName: user.nickname || user.username || "匿名",
      avatar: this.absoluteUrl(user.avatar || ""),
      content: String((item && item.content) || ""),
      time: String((item && item.created_at) || ""),
      id: String((item && item.id) || ""),
      isLiked: !!(item && item.is_liked),
      score: Number((item && item.likes) || 0),
    };
    const replies = item && Array.isArray(item.replies) ? item.replies : null;
    if (replies && replies.length > 0) comment.replyCount = replies.length;
    return comment;
  }

  /**
   * replyTo 场景：先用 /comments/page?commentId= 定位评论所在页（comment.js 同款），
   * 拉取该页后返回目标评论内嵌的 replies；找不到时安全返回空列表。
   */
  async loadCommentReplies(comicId, replyTo) {
    const rid = String(replyTo);
    const referer = this.baseUrl + "/comic/" + comicId;
    let page = 1;
    try {
      const loc = await this.getJson(
        `${this.baseUrl}/api/comments/page?commentId=${encodeURIComponent(rid)}&comic_id=${comicId}&page_size=${this.commentPageSize}&sort=time`,
        referer
      );
      page = this.num(
        loc.page !== undefined
          ? loc.page
          : loc.data && loc.data.page !== undefined
          ? loc.data.page
          : 1,
        1
      );
    } catch (e) {
      // 定位接口不可用时回退到第 1 页
      page = 1;
    }
    try {
      const data = await this.getJson(
        `${this.baseUrl}/api/comments?comic_id=${comicId}&page=${page}&page_size=${this.commentPageSize}&sort=time`,
        referer
      );
      const list = (data.data && data.data.list) || [];
      for (let i = 0; i < list.length; i++) {
        if (String(list[i].id) === rid) {
          const replies = Array.isArray(list[i].replies) ? list[i].replies : [];
          return {
            comments: replies.map((r) => this.buildComment(r)),
            maxPage: 0,
          };
        }
      }
      return { comments: [], maxPage: 0 };
    } catch (e) {
      console.error("漫蛙评论回复加载失败：", e);
      return { comments: [], maxPage: 0 };
    }
  }
}
