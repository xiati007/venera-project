// 酷漫熊 (www.kumanxiong.org) Venera 漫画源
// 版本: 1.0.5
// 取证: 2026-10-07（详见 /workspace/kumanxiong/evidence.md）
//
// 站点事实（均已实测）:
//   首页     GET https://www.kumanxiong.org/                          200，热门推荐 + 4 地区分区
//   搜索     GET /search/{kw}/{page}                                  第1页 /search/{kw}/1；越界页 500 Database Error
//   分类     GET /category/list/{1-4}/order/{addtime|hits}[...]       组合筛选实测有效（/tags/{id} /finish/{1|2} /page/{n}）
//   详情     GET /comic/{id}                                          200，.vod-info/.info/.episode-box
//   章节     GET /chapter/{epId}.html                                 200，尾部内联 params 密文
//   图片     img1.baipiaoguai.org 直链 WebP；Referer 校验（无 Referer -> 403，同族实测）
//
// 章节图片协议（四证据闭环）：
//   页面内联 var params='...'（base64 密文）→ base64 解码 → 前 16 字节为 IV，
//   其余为 AES-128-CBC(Pkcs7) 密文，key 与同族 51漫画/漫网 params 相同
//   “9S8$vJnU2ANeSRoF”，解密得 JSON {host, source_id, comic_id, chapter_id, images:[...], lazy}
//   实测 chapter gM4aLUXLmK → 152 张图全部绝对 URL（source_id=12 直链，无图级加密）。

class KuManXiong extends ComicSource {
  name = "酷漫熊";
  key = "kumanxiong2";
  version = "1.0.6";
  minAppVersion = "1.6.0";
  url = "";

  static host = "https://www.kumanxiong.org";
  static imgCdn = "https://img1.baipiaoguai.org";
  static aesKey = "9S8$vJnU2ANeSRoF";
  // 移动端 UA + 漫画页 Referer（站点搜索接口实测校验请求头：
  //   移动 UA + 具体漫画页 Referer + 带页码 URL -> 200 满结果
  //   首页 Referer / 无 Referer / 桌面 UA -> 500 或空结果）
  static ua = "Mozilla/5.0 (Linux; Android 16; V2452A Build/BP2A.250605.031.A3_V000L1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.179 Mobile Safari/537.36";
  static refPage = "https://www.kumanxiong.org/comic/qQ26Gk4koz";

  // 地区：/category/list/{1..4}（nav 实测 国产/日本/韩国/欧美）
  static regions = [
    ["全部", ""],
    ["国产漫画", "list/1"],
    ["日本漫画", "list/2"],
    ["韩国漫画", "list/3"],
    ["欧美漫画", "list/4"]
  ];
  // 题材：/category/tags/{id}（分类筛选面板“标签”组实测全量；879-899 为面板中确认存在项）
  static tags = [
    ["全部", ""],
    ["科幻", "867"], ["后宫", "868"], ["机甲", "869"], ["都市", "870"], ["恋爱生活", "871"],
    ["恋爱", "872"], ["恋爱2", "873"], ["其他", "874"], ["推理悬疑", "875"], ["魔法", "876"],
    ["奇幻", "877"], ["异世界", "878"], ["滑稽搞笑", "879"], ["重生", "880"], ["励志", "881"],
    ["浪漫", "882"], ["逆袭", "883"], ["脑洞", "884"], ["日常", "885"], ["热血机战", "886"],
    ["魔法/奇幻", "887"], ["武侠经典", "888"], ["韩漫", "889"], ["小说改编", "890"], ["穿越", "891"],
    ["非现代", "892"], ["大女主", "893"], ["腹黑", "894"], ["校园", "895"], ["剧情", "896"],
    ["爱情", "897"], ["复仇", "898"], ["玄幻", "899"]
  ];
  // 进度：/category/finish/{1|2}（面板实测 连载/完结）
  static statuses = [
    ["全部", ""],
    ["连载", "finish/1"],
    ["完结", "finish/2"]
  ];
  // 排序：/category/order/{addtime|hits}（面板实测 最近更新/最多阅读）
  static orders = [
    ["最近更新", "addtime"],
    ["最多阅读", "hits"]
  ];

  get headers() {
    return {
      "User-Agent": KuManXiong.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": KuManXiong.refPage
    };
  }

  get imageHeaders() {
    return {
      "User-Agent": KuManXiong.ua,
      "Referer": KuManXiong.refPage,
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9"
    };
  }

  // ---------- 通用工具 ----------

  trim(v) { return String(v == null ? "" : v).trim(); }

  isPlaceholderImage(u) {
    const s = this.trim(u).toLowerCase();
    if (!s) return true;
    if (s.indexOf("data:image/") === 0) return true;
    if (s.indexOf("empty.png") >= 0) return true;
    if (s.indexOf("placeholder") >= 0) return true;
    return false;
  }

  absolutize(u, base) {
    const s = this.trim(u);
    if (!s) return "";
    if (s.indexOf("//") === 0) return "https:" + s;
    if (s.indexOf("http://") === 0 || s.indexOf("https://") === 0) return s;
    return (base || KuManXiong.host) + (s.charAt(0) === "/" ? s : "/" + s);
  }

  imageFromEl(el) {
    if (!el || !el.attributes) return "";
    const a = el.attributes;
    const order = [a["data-original"], a["data-background"], a["lay-src"], a["data-src"], a["src"]];
    for (const c of order) {
      const s = this.trim(c);
      if (!s || this.isPlaceholderImage(s)) continue;
      return this.absolutize(s, KuManXiong.host);
    }
    return "";
  }

  // 漫画 ID：/comic/{字母数字}；章节 ID：/chapter/{字母数字}.html
  comicIdFromHref(href) {
    const m = /\/comic\/([A-Za-z0-9]+)/.exec(this.trim(href));
    return m ? m[1] : "";
  }

  normalizeComicId(input) {
    const s = this.trim(input);
    if (!s) return "";
    const m = /\/comic\/([A-Za-z0-9]+)/.exec(s);
    if (m) return m[1];
    return /^[A-Za-z0-9]{4,32}$/.test(s) ? s : "";
  }

  normalizeEpId(input) {
    const s = this.trim(input);
    if (!s) return "";
    const m = /\/chapter\/([A-Za-z0-9]+)/.exec(s);
    if (m) return m[1];
    const bare = s.replace(/\.html?$/i, "");
    return /^[A-Za-z0-9]{4,32}$/.test(bare) ? bare : "";
  }// ---------- 卡片解析 ----------
  // 注意：Venera JS 引擎对 querySelector 的后代组合选择器（如 ".vod-info .pic img"、"h3 a"）会抛
  // "Null check operator used on a null value"（实机日志证实）。原则：顶层用单级 querySelectorAll
  // 拿到卡片容器（li），卡片内部一律用正则解析，不在任何 querySelector 里写后代组合。

  // 网格卡片：li.col-xs-4... 内取 /comic/ 链接、h3 标题、封面 data-original
  parseComicItem(liHtml) {
    const h = String(liHtml == null ? "" : (liHtml.html || liHtml));
    const a = /<a[^>]*href="(\/comic\/[A-Za-z0-9]+)"[^>]*>/.exec(h);
    if (!a) return null;
    const id = this.comicIdFromHref(a[1]) || a[1].replace(/^\/comic\//, "");
    let title = "";
    const t = /<h3[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/.exec(h) || /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(h);
    if (t) title = this.trim(t[1]);
    const ta = /<a[^>]*href="\/comic\/[A-Za-z0-9]+"[^>]*title="([^"]*)"/.exec(h);
    if (!title && ta) title = this.trim(ta[1]);
    if (!title) title = id;
    let cover = "";
    const ci = /<(?:img|div)[^>]*(?:data-original)="([^"]+)"/.exec(h);
    if (ci && !this.isPlaceholderImage(ci[1])) cover = this.absolutize(ci[1], KuManXiong.host);
    let sub = "";
    const st = /<p[^>]*class="[^"]*item-status[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(h)
      || /<div[^>]*class="[^"]*mask[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(h);
    if (st) sub = this.trim(st[1]);
    return new Comic({
      id: id,
      title: title,
      cover: cover,
      subTitle: sub
    });
  }

  parseList(html) {
    // 纯正则解析,完全不依赖 HtmlDocument 查询(Venera 引擎对复杂选择器会抛 Null check 例外)。
    // 卡片容器: <ul class="row"> 内 <li class="col-xs-4 ...">
    const comics = [];
    const seen = {};
    const liRe = /<li[^>]*class="[^"]*col-xs-4[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
    let lm;
    while ((lm = liRe.exec(html || "")) !== null) {
      const c = this.parseComicItem(lm[1]);
      if (!c || seen[c.id]) continue;
      seen[c.id] = true;
      comics.push(c);
    }
    return comics;
  }

  // 更新/排行列表卡片：li.ranking-item 内取 /comic/ 链接、h4 标题、封面
  parseRankingItem(liHtml) {
    const h = String(liHtml == null ? "" : (liHtml.html || liHtml));
    const a = /<a[^>]*href="(\/comic\/[A-Za-z0-9]+)"[^>]*>/.exec(h);
    if (!a) return null;
    const id = this.comicIdFromHref(a[1]) || a[1].replace(/^\/comic\//, "");
    let title = "";
    const t = /<h4[^>]*>([\s\S]*?)<\/h4>/.exec(h);
    if (t) title = this.trim(t[1]);
    const ta = /<a[^>]*href="\/comic\/[A-Za-z0-9]+"[^>]*title="([^"]*)"/.exec(h);
    if (!title && ta) title = this.trim(ta[1]);
    if (!title) title = id;
    let cover = "";
    const ci = /<(?:img|div)[^>]*(?:data-original)="([^"]+)"/.exec(h);
    if (ci && !this.isPlaceholderImage(ci[1])) cover = this.absolutize(ci[1], KuManXiong.host);
    let sub = "";
    const sp = /<div class="[^"]*ranking-item-info[^"]*">[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/.exec(h);
    if (sp) sub = this.trim(sp[1]);
    return new Comic({
      id: id,
      title: title,
      cover: cover,
      subTitle: sub
    });
  }

  // /custom/update 最近更新页: ul.ranking-list > li.ranking-item（纯正则，不依赖 DOM 查询）
  parseRankingList(html) {
    const comics = [];
    const seen = {};
    const liRe = /<li[^>]*class="[^"]*ranking-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
    let lm;
    while ((lm = liRe.exec(html || "")) !== null) {
      const c = this.parseRankingItem(lm[1]);
      if (!c || seen[c.id]) continue;
      seen[c.id] = true;
      comics.push(c);
    }
    return comics;
  }

  // 分页：实测文本 “共{total}个漫画 · 第{cur}页” + “{cur}/{total}”
  // 分类页实测：“国产漫画 共1820个漫画 · 第1页” + “1/50”
  pageState(html, page, fallbackMaxPage) {
    let maxPage = 0;
    const mCur = /共\d+个漫画\s*[·•.]\s*第(\d+)页/.exec(html);   // 当前页
    const mTotal = /(\d+)\s*\/\s*(\d+)/.exec(html);              // cur/total
    if (mTotal) maxPage = parseInt(mTotal[2], 10);
    let cur = page;
    if (mCur) cur = parseInt(mCur[1], 10);
    if (!maxPage || isNaN(maxPage)) maxPage = fallbackMaxPage;
    if (maxPage < 1) maxPage = 1;
    const end = cur > maxPage;
    return { end: end, maxPage: maxPage };
  }

  // ---------- 探索 ----------

  explore = [
    {
      title: "酷漫熊",
      type: "multiPartPage",
      load: async () => {
        try {
        const res = await Network.get(KuManXiong.host + "/", this.headers);
        if (res.status !== 200) return {};
        const html = res.body || "";
        // 首页分区全部正则：Venera 引擎不支持后代组合选择器（实机日志证实），
        // 这里直接按 HTML 结构分块：.layout-box > h2 + ul.row > li.col-xs-4
        const parts = [];
        const regionMap = {
          "国产漫画": "list/1",
          "日本漫画": "list/2",
          "韩国漫画": "list/3",
          "欧美漫画": "list/4"
        };
        const boxRe = /<div[^>]*class="[^"]*layout-box[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*layout-box|$)/g;
        let bm;
        while ((bm = boxRe.exec(html)) !== null) {
          const boxHtml = bm[1];
          const h2 = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(boxHtml);
          if (!h2) continue;
          const t = this.trim(h2[1]);
          if (!t) continue;
          const ul = /<ul[^>]*class="[^"]*row[^"]*"[^>]*>([\s\S]*?)<\/ul>/.exec(boxHtml);
          if (!ul) continue;
          const comics = [];
          const seen = {};
          const liRe = /<li[^>]*class="[^"]*col-xs-4[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
          let lm;
          while ((lm = liRe.exec(ul[1])) !== null) {
            const c = this.parseComicItem(lm[1]);
            if (!c || seen[c.id]) continue;
            seen[c.id] = true;
            comics.push(c);
          }
          if (comics.length === 0) continue;
          const p = { title: t, comics: comics };
          const param = regionMap[t];
          if (param) {
            // viewMore 指向“分类”分区，param 直接给地区段（面板可再叠加标签/进度/排序）
            p.viewMore = { page: "category", attributes: { category: "分类", param: param } };
          }
          parts.push(p);
        }
        if (parts.length === 0) throw "首页未解析到推荐区块，站点结构可能已变更";
        return parts;
        } catch (e) {
          // 顶层兜底：首页解析失败不抛异常，返回空分区（客户端不空白）
          return {};
        }
      }
    },
    {
      title: "最近更新",
      type: "multiPageComicList",
      load: async (page) => {
        try {
          const p = page && page > 0 ? page : 1;
          // /custom/update 为单页 ranking 列表；无分页控件
          if (p > 1) return { comics: [], maxPage: 1 };
          const res = await Network.get(KuManXiong.host + "/custom/update", this.headers);
          if (res.status !== 200) return { comics: [], maxPage: 1 };
          return { comics: this.parseRankingList(res.body), maxPage: 1 };
        } catch (e) {
          return { comics: [], maxPage: 1 };
        }
      }
    }
  ];

  // ---------- 分类 ----------

  // 漫画式：单分区「分类」，多维筛选面板（地区/标签/进度/排序）。
  //   分区1 分类：单个入口“全部”（param=""），/category 全量 + 面板筛选
  category = {
    title: "酷漫熊",
    parts: [
      {
        name: "分类",
        type: "fixed",
        itemType: "category",
        categories: ["全部"],
        categoryParams: [""]
      }
    ],
    enableRankingPage: false
  };

  categoryComics = {
    // 分类筛选面板：仅「地区」+「排序」两组（用户确认：标签和进度不要了）。
    // 选项值避开斜杠（Venera 对含 / 的选项值切换可能不生效）：
    //   地区  -> 1/2/3/4（load 内拼 list/1..list/4）
    //   排序  -> addtime / hits（load 内拼 order/addtime、order/hits）
    optionList: [
      {
        label: "地区",
        options: [
          "-全部",
          "1-国产漫画",
          "2-日本漫画",
          "3-韩国漫画",
          "4-欧美漫画"
        ]
      },
      {
        label: "排序",
        options: [
          "addtime-最近更新",
          "hits-最多阅读"
        ]
      }
    ],
    load: async (category, param, options, page) => {
      try {
      const p = page && page > 0 ? page : 1;
      // 地区/排序/进度/标签按简单值收集，最后拼 URL。
      // 站点段顺序实测：/category/{list}/{order}/page/{n}
      const byKind = { "list": "", "order": "", "tags": "", "finish": "" };
      const push = (v) => {
        const s = this.trim(v);
        if (!s) return;
        const kind = s.split("/")[0];
        if (!(kind in byKind)) return;
        if (!byKind[kind]) byKind[kind] = s;
      };
      // param 兼容两种形态：旧 "list/1" 或 新 "1"
      push(/^[1-4]$/.test(param) ? "list/" + param : param);
      for (const o of options || []) {
        // options 可能是 "1"、"addtime"、"order/addtime" 等
        const s = this.trim(o);
        if (!s || s === "-") continue;
        if (/^[1-4]$/.test(s)) { push("list/" + s); continue; }
        if (s === "addtime" || s === "hits") { push("order/" + s); continue; }
        push(s);
      }
      // 兜底地区：必须先补齐 list 再按固定顺序拼段，否则会 append 到末尾产生
      // /category/order/hits/list/1 这类站点不认识的顺序
      if (!byKind["list"]) byKind["list"] = "list/1";
      let path = "/category";
      for (const kind of ["list", "order", "tags", "finish"]) {
        if (byKind[kind]) path += "/" + byKind[kind];
      }
      if (p > 1) path += "/page/" + p;
      const res = await Network.get(KuManXiong.host + path, this.headers);
      if (res.status !== 200) return { comics: [], maxPage: p };
      const html = res.body || "";
      const st = this.pageState(html, p, p);
      if (st.end) return { comics: [], maxPage: st.maxPage };
      return { comics: this.parseList(html), maxPage: st.maxPage };
      } catch (e) {
        // 顶层兜底：任何未捕获异常都不上抛，避免客户端整屏空白
        return { comics: [], maxPage: p };
      }
    }
  };

  // ---------- 搜索 ----------

  search = {
    load: async (keyword, options, page) => {
      try {
        const p = page && page > 0 ? page : 1;
        const kw = this.trim(keyword);
        if (!kw) return { comics: [], maxPage: p };
        const enc = encodeURIComponent(kw);
              // 站点搜索 URL 带页码（Legado searchUrl=/search/{{key}}/{{page}} 实证）：
              //   第 1 页 /search/{关键词}/1，第 2 页 /search/{关键词}/2 ...
              // 无页码或首页 Referer/桌面 UA 会导致 500 或空结果（实测）
              const url = `${KuManXiong.host}/search/${enc}/${p}`;
        // 站点搜索接口实测间歇性返回：200 空（ul.row 空、1/1）、500、200 满结果。
        // 对「200 空 或 500」自动重试（网络请求之间有自然间隔），最多 3 次。
        for (let attempt = 1; attempt <= 3; attempt++) {
          let res = null;
          try {
            res = await Network.get(url, this.headers);
          } catch (e) {
            if (attempt >= 3) return { comics: [], maxPage: p > 1 ? p - 1 : 1 };
            continue;
          }
          if (res.status === 404 || res.status === 410) return { comics: [], maxPage: p > 1 ? p - 1 : 1 };
          if (res.status === 200) {
            const html = res.body || "";
            const comics = this.parseList(html);
            if (comics.length > 0) {
              const st = this.pageState(html, p, 1);
              return { comics: comics, maxPage: st.maxPage };
            }
            // 200 但空：第 1 页可能被站点瞬时空响应命中，重试；第 2+ 页视为越界结束
            if (p > 1 || attempt >= 3) return { comics: [], maxPage: p > 1 ? p - 1 : 1 };
            continue;
          }
          // 非 200（含 500）：越界或瞬时错误，重试后仍失败则安全返回
          if (attempt >= 3) return { comics: [], maxPage: p > 1 ? p - 1 : 1 };
        }
        return { comics: [], maxPage: p > 1 ? p - 1 : 1 };
      } catch (e) {
        // 顶层兜底：任何未捕获异常都不上抛，避免客户端整屏空白
        return { comics: [], maxPage: p > 1 ? p - 1 : 1 };
      }
    },
    optionList: [],
    enableTagsSuggestions: false
  };// ---------- params 解密（AES-128-CBC） ----------
  // 复刻 pic-v3.js decryptParams：base64 解码 → 前16字节IV → AES-128-CBC(Pkcs7) → UTF8 → JSON
  // 优先用 Venera 官方 Convert.decryptAesCbc；不可用时回退内置纯 JS 实现。
  // 纯 JS 实现与 51漫画/漫网 同族同款，已用 酷漫熊 chapter gM4aLUXLmK 实测解密 152 张图通过。
  decryptParams(b64) {
    const raw = Convert.decodeBase64(b64);
    const rawView = new Uint8Array(raw);
    if (rawView.length < 32 || (rawView.length - 16) % 16 !== 0) throw "params 密文长度无效";
    const iv = rawView.slice(0, 16);
    const cipher = rawView.slice(16);
    const key = new Uint8Array(16);
    for (let i = 0; i < 16; i++) key[i] = KuManXiong.aesKey.charCodeAt(i);
    let text = null;
    if (typeof Convert !== "undefined" && Convert && typeof Convert.decryptAesCbc === "function") {
      try {
        const plain = new Uint8Array(Convert.decryptAesCbc(cipher.buffer, key.buffer, iv.buffer));
        const pad = plain.length > 0 ? plain[plain.length - 1] : 0;
        const end = (pad >= 1 && pad <= 16 && pad <= plain.length) ? plain.length - pad : plain.length;
        text = Convert.decodeUtf8(plain.slice(0, end).buffer);
      } catch (e) {
        text = null;
      }
    }
    if (text == null) text = KuManXiong.aesDecryptToUtf8(cipher, key, iv);
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw "params 解密结果不是 JSON";
    return JSON.parse(text.slice(start, end + 1));
  }

  imageUrl(src) {
    const s = this.trim(src);
    if (!s) return "";
    if (s.indexOf("//") === 0) return "https:" + s;
    if (s.indexOf("http://") === 0 || s.indexOf("https://") === 0) return s;
    return KuManXiong.imgCdn + (s.charAt(0) === "/" ? s : "/" + s);
  }

  // ---------- 详情 / 章节 ----------

  comic = {
    idMatch: "^[A-Za-z0-9]{4,32}$",

    loadInfo: async (id) => {
      try {
      const cid = this.normalizeComicId(id);
      if (!cid) throw "无法解析漫画 ID";
      const res = await Network.get(`${KuManXiong.host}/comic/${cid}`, this.headers);
      if (res.status !== 200) throw `Invalid status code: ${res.status}`;
      const html = res.body || "";
      // 注意：Venera JS 引擎对 querySelector 的后代组合选择器（如 ".vod-info .pic img"）会抛
      // "Null check operator used on a null value"（实机日志证实）。这里详情页全部用正则解析，
      // 完全绕开 HtmlDocument 查询，保证在 Venera 实机可用。
      let title = "";
      let description = "";
      let author = "";
      let updateTime = "";
      const tagList = [];
      const chapters = new Map();

      // 标题：.vod-info .info h3 a
      let m = /<h3><a[^>]*href="\/comic\/[^"]*"[^>]*>([\s\S]*?)<\/a><\/h3>/.exec(html);
      if (m) title = this.trim(m[1]);
      if (!title) {
        const t = /<title>(.*?)<\/title>/.exec(html);
        if (t) title = t[1].split("_")[0].trim();
      }
      // 作者 / 时间（.info p.row span）
      const am = /作者：([^<]*?)(?:&nbsp;|\s)*</.exec(html);
      if (am) author = this.trim(am[1]);
      const tm = /时间：([^<]*?)(?:&nbsp;|\s)*</.exec(html);
      if (tm) updateTime = this.trim(tm[1]);
      // 标签：/category/tags/{id}
      const tagRe = /<a[^>]*href="\/category\/tags\/\d+"[^>]*>([^<]+)<\/a>/g;
      let tm2;
      while ((tm2 = tagRe.exec(html)) !== null) {
        const t = this.trim(tm2[1]);
        if (t && tagList.indexOf(t) < 0) tagList.push(t);
      }
      // 简介：内容简介 区块（详情页底部 <p class="pt-10 pb-10"> 或 .detail-desc）
      const dm = /<p[^>]*class="[^"]*pt-10[^"]*pb-10[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(html)
        || /<div[^>]*class="[^"]*detail-desc[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(html)
        || /内容简介<\/h2>\s*<div[^>]*>([\s\S]*?)<\/div>/.exec(html)
        || /内容简介<\/h2>([\s\S]*?)(?:<h2|<div class="[^"]*layout)/.exec(html);
      if (dm) description = dm[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      // 章节：只取播放列表 <ul class="...ewave-playlist-content..."> 范围内的 /chapter/ 链接。
      // 用户取证（2026-10-07 超级兵王在都市 /comic/PronlpMEJe）：页面顶部还有「最新」「立即阅读」
      // 两个 /chapter/ 链接，全页正则会把它们收进目录（首位变成最新章、立即阅读抢占首章 ID）。
      // 真实目录必须限定在 ewave-playlist 播放列表内（389 条，首章=李一飞的平凡生活）。
      const ulRe = /<ul[^>]*class="[^"]*ewave-playlist-content[^"]*"[^>]*>([\s\S]*?)<\/ul>/g;
      let um;
      while ((um = ulRe.exec(html)) !== null) {
        const epRe = /<a[^>]*href="(\/chapter\/[A-Za-z0-9]+\.html)"[^>]*>([\s\S]*?)<\/a>/g;
        let em;
        while ((em = epRe.exec(um[1])) !== null) {
          const ep = this.normalizeEpId(em[1]);
          if (!ep) continue;
          const t = this.trim(em[2]);
          if (!chapters.has(ep)) chapters.set(ep, t || ep);
        }
      }

      if (!title) throw "详情页解析失败，站点结构可能已变更";

      // 封面：.vod-info .pic img 的 data-original / src（懒加载优先）
      let cover = "";
      const cm = /<div class="pic">\s*<img[^>]*class="[^"]*lazyload[^"]*"[^>]*data-original="([^"]+)"/.exec(html)
        || /<img[^>]*class="[^"]*lazyload[^"]*"[^>]*src="([^"]+)"/.exec(html);
      if (cm && !this.isPlaceholderImage(cm[1])) cover = this.absolutize(cm[1], KuManXiong.host);

      const tags = {};
      if (tagList.length > 0) tags["标签"] = tagList;
      if (author) tags["作者"] = [author];

      return new ComicDetails({
        title: title,
        subtitle: author,
        subTitle: author,
        cover: cover,
        description: description,
        tags: tags,
        chapters: chapters,
        updateTime: updateTime,
        url: `${KuManXiong.host}/comic/${cid}`
      });
      } catch (e) {
        // 顶层兜底：详情解析/网络异常不上抛，避免客户端整屏空白
        throw "详情加载失败：" + (e && e.message ? e.message : e);
      }
    },

    loadEp: async (comicId, epId) => {
      try {
      const ep = this.normalizeEpId(epId);
      if (!ep) return { images: [] };
      const res = await Network.get(`${KuManXiong.host}/chapter/${ep}.html`, this.headers);
      if (res.status === 404 || res.status === 410) return { images: [] };
      if (res.status !== 200) throw `Invalid status code: ${res.status}`;
      const html = res.body || "";
      const m = /params\s*=\s*(['"])([\s\S]*?)\1/.exec(html);
      if (!m) return { images: [] };
      let data = null;
      try {
        data = this.decryptParams(m[2]);
      } catch (e) {
        return { images: [] };
      }
      const raw = data && Array.isArray(data.images) ? data.images : [];
      const images = [];
      const seen = {};
      for (const x of raw) {
        if (typeof x !== "string" || !x) continue;
        const u = this.imageUrl(x);
        if (!u || seen[u]) continue;
        seen[u] = true;
        images.push(u);
      }
      return { images: images };
      } catch (e) {
        // 顶层兜底：章节加载/解密异常均返回空图片，不向客户端抛错
        return { images: [] };
      }
    },

    // 图片 CDN 校验 Referer：同族实测无 Referer -> 403；固定站点域
    onImageLoad: (url) => {
      return { url: url, headers: this.imageHeaders };
    },

    onThumbnailLoad: (url) => {
      return { url: url, headers: this.imageHeaders };
    },

    link: {
      domains: ["kumanxiong.org"],
      linkToId: (url) => {
        const m = /\/comic\/([A-Za-z0-9]+)/.exec(String(url == null ? "" : url));
        return m ? m[1] : null;
      }
    }
  };

  // ---------- 纯 JS AES-128-CBC 回退实现（与同族 51漫画 同款，已在酷漫熊实测通过） ----------
  static aesDecryptToUtf8(cipher, key, iv) {
    const plain = KuManXiong.pureAesCbc(cipher, key, iv);
    return KuManXiong.bytesToUtf8(KuManXiong.stripPkcs7(plain));
  }

  static stripPkcs7(bytes) {
    if (!bytes || bytes.length === 0) return bytes;
    const pad = bytes[bytes.length - 1];
    if (pad < 1 || pad > 16 || pad > bytes.length) return bytes;
    for (let i = bytes.length - pad; i < bytes.length; i++) if (bytes[i] !== pad) return bytes;
    return bytes.slice(0, bytes.length - pad);
  }

  static pureAesCbc(cipher, key, iv) {
    const w = KuManXiong.aesKeyExpansion(key);
    const out = new Uint8Array(cipher.length);
    let prev = iv;
    for (let off = 0; off < cipher.length; off += 16) {
      const block = cipher.subarray(off, off + 16);
      const dec = KuManXiong.aesDecryptBlock(block, w);
      for (let i = 0; i < 16; i++) out[off + i] = dec[i] ^ prev[i];
      prev = block;
    }
    return out;
  }

  static aesKeyExpansion(key) {
    const Nk = 4, Nb = 4, Nr = 10;
    const w = new Uint8Array(Nb * (Nr + 1) * 4);
    for (let i = 0; i < 4 * Nk; i++) w[i] = key[i];
    const t = new Uint8Array(4);
    for (let i = Nk; i < Nb * (Nr + 1); i++) {
      for (let j = 0; j < 4; j++) t[j] = w[(i - 1) * 4 + j];
      if (i % Nk === 0) {
        const t0 = t[0];
        t[0] = KuManXiong.SBOX[t[1]] ^ KuManXiong.RCON[i / Nk];
        t[1] = KuManXiong.SBOX[t[2]];
        t[2] = KuManXiong.SBOX[t[3]];
        t[3] = KuManXiong.SBOX[t0];
      }
      for (let j = 0; j < 4; j++) w[i * 4 + j] = w[(i - Nk) * 4 + j] ^ t[j];
    }
    return w;
  }

  static gmul(a, b) {
    let p = 0;
    for (let i = 0; i < 8; i++) {
      if (b & 1) p ^= a;
      const hi = a & 0x80;
      a = (a << 1) & 0xff;
      if (hi) a ^= 0x1b;
      b >>= 1;
    }
    return p & 0xff;
  }

  static aesDecryptBlock(input, w) {
    const Nr = 10;
    const s = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (let i = 0; i < 16; i++) s[i % 4][Math.floor(i / 4)] = input[i];
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) s[r][c] ^= w[Nr * 16 + c * 4 + r];
    for (let round = Nr - 1; round >= 1; round--) {
      for (let r = 1; r < 4; r++) {
        const row = s[r].slice();
        for (let c = 0; c < 4; c++) s[r][c] = row[(c - r + 4) % 4];
      }
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s[r][c] = KuManXiong.RSBOX[s[r][c]];
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) s[r][c] ^= w[round * 16 + c * 4 + r];
      for (let c = 0; c < 4; c++) {
        const a0 = s[0][c], a1 = s[1][c], a2 = s[2][c], a3 = s[3][c];
        s[0][c] = KuManXiong.gmul(a0, 0x0e) ^ KuManXiong.gmul(a1, 0x0b) ^ KuManXiong.gmul(a2, 0x0d) ^ KuManXiong.gmul(a3, 0x09);
        s[1][c] = KuManXiong.gmul(a0, 0x09) ^ KuManXiong.gmul(a1, 0x0e) ^ KuManXiong.gmul(a2, 0x0b) ^ KuManXiong.gmul(a3, 0x0d);
        s[2][c] = KuManXiong.gmul(a0, 0x0d) ^ KuManXiong.gmul(a1, 0x09) ^ KuManXiong.gmul(a2, 0x0e) ^ KuManXiong.gmul(a3, 0x0b);
        s[3][c] = KuManXiong.gmul(a0, 0x0b) ^ KuManXiong.gmul(a1, 0x0d) ^ KuManXiong.gmul(a2, 0x09) ^ KuManXiong.gmul(a3, 0x0e);
      }
    }
    for (let r = 1; r < 4; r++) {
      const row = s[r].slice();
      for (let c = 0; c < 4; c++) s[r][c] = row[(c - r + 4) % 4];
    }
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s[r][c] = KuManXiong.RSBOX[s[r][c]];
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) s[r][c] ^= w[c * 4 + r];
    const out = new Uint8Array(16);
    for (let i = 0; i < 16; i++) out[i] = s[i % 4][Math.floor(i / 4)];
    return out;
  }

  static SBOX = (() => {
    const rotl8 = (x, n) => ((x << n) | (x >> (8 - n))) & 0xff;
    const xtime = (a) => ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff;
    const mul = (a, b) => {
      let r = 0;
      while (b) {
        if (b & 1) r ^= a;
        a = xtime(a);
        b >>= 1;
      }
      return r & 0xff;
    };
    const pow = (a, n) => {
      let r = 1;
      while (n) {
        if (n & 1) r = mul(r, a);
        a = mul(a, a);
        n >>= 1;
      }
      return r;
    };
    const inv = new Uint8Array(256);
    const sbox = new Uint8Array(256);
    for (let i = 1; i < 256; i++) inv[i] = pow(i, 254);
    for (let i = 0; i < 256; i++) {
      const x = inv[i];
      sbox[i] = (rotl8(x, 0) ^ rotl8(x, 1) ^ rotl8(x, 2) ^ rotl8(x, 3) ^ rotl8(x, 4) ^ 0x63) & 0xff;
    }
    return sbox;
  })();

  static RSBOX = (() => {
    const r = new Uint8Array(256);
    for (let i = 0; i < 256; i++) r[KuManXiong.SBOX[i]] = i;
    return r;
  })();

  static RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

  static bytesToUtf8(bytes) {
    let out = "";
    let i = 0;
    while (i < bytes.length) {
      const b1 = bytes[i];
      if (b1 < 0x80) { out += String.fromCharCode(b1); i += 1; }
      else if (b1 >= 0xc0 && b1 < 0xe0) {
        out += String.fromCharCode(((b1 & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2;
      } else if (b1 >= 0xe0 && b1 < 0xf0) {
        out += String.fromCharCode(((b1 & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)); i += 3;
      } else {
        const cp = ((b1 & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
        const v = cp - 0x10000;
        out += String.fromCharCode(0xd800 + (v >> 10)) + String.fromCharCode(0xdc00 + (v & 0x3ff));
        i += 4;
      }
    }
    return out;
  }
}