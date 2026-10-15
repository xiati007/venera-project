/**
 * 顶通禁漫屋（dtjm6.com）Venera 漫画源
 *
 * 真实取证结论（2026-10-06）：
 * 1. 站点使用 MIP 框架，图片元素为 mip-img 而非 img；解析器同时兼容标准 img。
 * 2. 卡片结构：.stui-vodlist__item，封面 .stui-vodlist__thumb，标题 .stui-vodlist__title。
 * 3. 更新页：/zuixin-manhua（最新更新）、/zuixin-manhua/newbook（新书上架）、
 *    /zuixin-manhua/recommend（推荐漫画）；三页均**无分页**（实测 /zuixin-manhua/page/2 → 404）。
 * 4. 排行页：/manhua-paihang/{weekly|daily|monthly|all}；**无分页**（单页 100 卡）。
 * 5. 分类页：/manhua-fenlei/{类型}/ob/{排序}/st/{进度}，第 n 页追加 /page/{n}；
 *    分页链接在 .stui-page，尾页 href 携带真实页码（实测尾页 38、111）。
 *    类型：all、韩漫、日漫、3D漫画、真人、短篇；排序：time、hits；进度：all、completed、serialized。
 * 6. 搜索：GET /manhua-sousuo/{关键词}/ob/{排序}/st/{进度}/page/{n}（实测 page/1 与 page/2 内容不同、
 *    尾页 19；不带 /page/1 等价第 1 页；0 结果词返回 200 + 0 卡）。
 *    /cata.php?key={关键词} 仅为第 1 页入口，**无 page 参数**，故翻页统一走 manhua-sousuo 路由。
 *    关键词边界（实测）：空格 → 403（WAF）；"/" → 404；"%" → 500；"#" → 关键词被截断；
 *    "+" → 服务器解码为空格（%2B 正常 200）；"?"、中文标点 → 正常 200。
 *    因此关键词先清洗（空白转 +、删除 / % # \\），再 encodeURIComponent。
 * 7. 详情路由：/manhua-xiangqing/{comicId}；章节 .stui-content__playlist li a，
 *    链接 /manhua-yuedu/{comicId}/{章节token}（18 位字母数字）。
 * 8. 阅读页：图片在 center 内 mip-img 中，为明文直链 JPEG（img.nnpic.xyz），**无加密**，
 *    故源中不含任何解密逻辑；封面域名 thumb.niaopic.com / new.niaopic.com。
 * 9. 页面内联广告/年龄验证脚本（含 eval、new Function）一律不执行。
 */
class DingTongJinManWu extends ComicSource {
    name = "顶通禁漫屋"
    key = "dingtong_jinmanwu"
    version = "1.1.0"
    minAppVersion = "1.0.0"
    url = ""

    baseUrl = "https://dtjm6.com"

    defaultHeaders = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Referer": "https://dtjm6.com/"
    };

    // ---- 筛选白名单（每一项都有上文取证的真实 URL）----
    updatePaths = {
        latest: "/zuixin-manhua",
        new: "/zuixin-manhua/newbook",
        recommend: "/zuixin-manhua/recommend"
    };
    rankSlugs = ["weekly", "daily", "monthly", "all"];
    cateValues = ["all", "韩漫", "日漫", "3D漫画", "真人", "短篇"];
    statusValues = ["all", "completed", "serialized"];
    orderValues = ["time", "hits"];

    // ============================ 通用工具 ============================

    absoluteUrl(path) {
        if (!path) return "";
        if (/^https?:\/\//i.test(path)) return path;
        if (path.startsWith("//")) return "https:" + path;
        if (path.startsWith("/")) return this.baseUrl + path;
        return this.baseUrl + "/" + path;
    }

    comicIdFromHref(href) {
        if (!href) return "";
        const match = href.match(/\/manhua-xiangqing\/(\d+)/);
        return match ? match[1] : "";
    }

    chapterTokenFromHref(href) {
        if (!href) return "";
        const match = href.match(/\/manhua-yuedu\/\d+\/([A-Za-z0-9]+)/);
        return match ? match[1] : "";
    }

    /**
     * 从 .stui-page 分页链接提取最大页码（href 形如 .../page/38、尾页链接同理）。
     * 无分页元素或解析失败时返回 fallback；不使用 page + 1 猜测。
     */
    parseMaxPage(doc, fallback = 1) {
        let maxPage = fallback;
        const pageLinks = doc.querySelectorAll(".stui-page a");
        for (const link of pageLinks) {
            const href = String(link.attributes.href || "");
            const match = href.match(/\/page\/(\d+)/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxPage) maxPage = num;
            }
        }
        return maxPage;
    }

    /**
     * 读取 optionList 选中值："value-显示名" 取 "-" 前的部分。
     * 防御历史入参：数组、组合字符串、JSON 字符串、空值一律安全回退到 fallback。
     */
    optValue(option, fallback, allowed) {
        let raw = "";
        if (Array.isArray(option)) {
            raw = option.length > 0 ? option[0] : "";
        } else if (option != null) {
            raw = option;
        }
        const value = String(raw).split("-")[0].trim();
        return allowed.indexOf(value) >= 0 ? value : fallback;
    }

    /**
     * 搜索关键词清洗（全部为实测边界）：
     * - 空白转 "+"：直接发空格（%20）会被 WAF 403；"+"（%2B）可通过且服务器解码为空格。
     * - 删除 "/"（404）、"%"（500）、"#"（关键词被截断）、"\\"（路径风险）。
     * - 去掉首尾 "+"；清洗后为空则视为无效关键词。
     */
    cleanSearchKeyword(keyword) {
        let s = keyword == null ? "" : String(keyword);
        s = s.replace(/\s+/g, "+");
        s = s.replace(/[/%#\\]/g, "");
        s = s.replace(/^\++|\++$/g, "");
        return s.trim();
    }

    /** 解析 categoryParams（形如 "cate|韩漫"），非法返回 null（不发请求）。 */
    parseCategoryParam(param) {
        const s = param == null ? "" : String(param);
        const idx = s.indexOf("|");
        if (idx <= 0 || idx === s.length - 1) return null;
        return { section: s.slice(0, idx), value: s.slice(idx + 1) };
    }

    /** param 白名单：非白名单值一律拒绝（不向站点发畸形请求）。 */
    isAllowedParam(section, value) {
        if (section === "update") return Object.prototype.hasOwnProperty.call(this.updatePaths, value);
        if (section === "rank") return this.rankSlugs.indexOf(value) >= 0;
        if (section === "cate") return this.cateValues.indexOf(value) >= 0;
        return false;
    }

    // ============================ 列表解析 ============================

    parseVodItem(item) {
        const thumb = item.querySelector(".stui-vodlist__thumb");
        const titleEl = item.querySelector(".stui-vodlist__title a");
        if (!thumb || !titleEl) return null;

        const href = thumb.attributes.href || "";
        const id = this.comicIdFromHref(href);
        if (!id) return null;

        const coverImg = thumb.querySelector("mip-img") || thumb.querySelector("img");
        const cover = this.absoluteUrl(coverImg?.attributes.src || coverImg?.attributes["data-src"] || "");
        const subTitle = item.querySelector(".pic-text")?.text?.trim() || "";

        return new Comic({
            id,
            title: titleEl.text.trim(),
            cover,
            subTitle
        });
    }

    parseList(doc) {
        const comics = [];
        const items = doc.querySelectorAll(".stui-vodlist__item");
        for (const item of items) {
            const comic = this.parseVodItem(item);
            if (comic) comics.push(comic);
        }
        return comics;
    }

    /**
     * 拉取一个列表页并解析。
     * maxPageMode："parse" 解析分页链接（分类、搜索）；"single" 单页无分页（更新、排行）。
     * HtmlDocument 在 finally 中 dispose。
     */
    async loadList(url, maxPageMode = "parse") {
        const res = await Network.get(url, this.defaultHeaders);
        if (res.status !== 200) throw `Invalid status: ${res.status}`;
        const doc = new HtmlDocument(res.body);
        try {
            const comics = this.parseList(doc);
            const maxPage = maxPageMode === "parse" ? this.parseMaxPage(doc, 1) : 1;
            return { comics, maxPage };
        } finally {
            doc.dispose();
        }
    }

    /**
     * 按分类选项拼接 URL：
     * - update / rank：站点无进度与排序参数，忽略 optionList（取证页面仅支持子页切换）；
     * - cate：/manhua-fenlei/{类型}/ob/{排序}/st/{进度}，第 2 页起追加 /page/{n}。
     */
    buildCategoryUrl(section, value, options, page) {
        if (section === "update") {
            return this.baseUrl + this.updatePaths[value];
        }
        if (section === "rank") {
            return this.baseUrl + "/manhua-paihang/" + value;
        }
        const status = this.optValue(options?.[0], "all", this.statusValues);
        const order = this.optValue(options?.[1], "time", this.orderValues);
        let url = this.baseUrl + "/manhua-fenlei/" + encodeURIComponent(value)
            + "/ob/" + order + "/st/" + status;
        if (page > 1) url += "/page/" + page;
        return url;
    }

    // ============================ 分类入口 ============================

    /**
     * 三个独立分类（更新 / 排行 / 分类），每组内部即为该分类的筛选项：
     * - 更新：最新更新 / 新书上架 / 推荐漫画；
     * - 排行：周榜 / 日榜 / 月榜 / 总榜；
     * - 分类：全部 / 韩漫 / 日漫 / 3D漫画 / 真人 / 短篇，
     *   进入后的「进度」「排序」由 categoryComics.optionList 承载（可与类型自由组合）。
     */
    category = {
        title: this.name,
        parts: [
            {
                name: "更新",
                type: "fixed",
                categories: ["最新更新", "新书上架", "推荐漫画"],
                itemType: "category",
                categoryParams: ["update|latest", "update|new", "update|recommend"]
            },
            {
                name: "排行",
                type: "fixed",
                categories: ["周榜", "日榜", "月榜", "总榜"],
                itemType: "category",
                categoryParams: ["rank|weekly", "rank|daily", "rank|monthly", "rank|all"]
            },
            {
                name: "分类",
                type: "fixed",
                categories: ["全部", "韩漫", "日漫", "3D漫画", "真人", "短篇"],
                itemType: "category",
                categoryParams: ["cate|all", "cate|韩漫", "cate|日漫", "cate|3D漫画", "cate|真人", "cate|短篇"]
            }
        ],
        enableRankingPage: false
    };

    categoryComics = {
        // 站点分类页筛选行：进度（全部/已完结/更新中）、排序（按时间/按人气），顺序与页面一致。
        // 注意：更新、排行两个入口的站点 URL 不接受这两项，加载时会忽略。
        optionList: [
            { label: "进度", options: ["all-全部", "completed-已完结", "serialized-更新中"] },
            { label: "排序", options: ["time-按时间", "hits-按人气"] }
        ],
        load: async (category, param, options, page) => {
            const safePage = Math.max(1, Number(page) || 1);
            const parsed = this.parseCategoryParam(param);
            if (!parsed || !this.isAllowedParam(parsed.section, parsed.value)) {
                return { comics: [], maxPage: safePage };
            }
            try {
                const url = this.buildCategoryUrl(parsed.section, parsed.value, options, safePage);
                // 更新 / 排行为单页列表（无分页），分类页解析尾页真实页码。
                const mode = parsed.section === "cate" ? "parse" : "single";
                return await this.loadList(url, mode);
            } catch (e) {
                console.error(`顶通禁漫屋分类「${category}」加载失败：`, e);
                return { comics: [], maxPage: safePage };
            }
        }
    };

    // ============================ 首页 ============================

    explore = {
        title: "顶通禁漫屋",
        type: "singlePageWithMultiPart",
        load: async () => {
            let doc = null;
            try {
                const res = await Network.get(this.baseUrl + "/", this.defaultHeaders);
                if (res.status !== 200) throw `Invalid status: ${res.status}`;
                doc = new HtmlDocument(res.body);

                const result = {};
                const panels = doc.querySelectorAll(".stui-pannel");

                for (const panel of panels) {
                    const titleEl = panel.querySelector(".stui-pannel__head h3.title");
                    const sectionTitle = titleEl?.text?.trim();
                    if (!sectionTitle) continue;

                    const list = panel.querySelector(".stui-vodlist");
                    if (!list) continue;

                    const comics = [];
                    const items = list.querySelectorAll(".stui-vodlist__item");
                    for (const item of items) {
                        const comic = this.parseVodItem(item);
                        if (comic) comics.push(comic);
                    }

                    if (comics.length > 0) {
                        result[sectionTitle] = comics;
                    }
                }

                return result;
            } finally {
                doc?.dispose();
            }
        }
    };

    // ============================ 搜索 ============================

    search = {
        // 站点搜索页筛选行：进度、排序（「分类」行指向分类页，不作为搜索筛选）。
        optionList: [
            { label: "进度", options: ["all-全部", "completed-已完结", "serialized-更新中"] },
            { label: "排序", options: ["time-按时间", "hits-按人气"] }
        ],
        load: async (keyword, options, page) => {
            const safePage = Math.max(1, Number(page) || 1);
            const kw = this.cleanSearchKeyword(keyword);
            // 关键词清洗后为空：不发请求，直接返回空结果。
            if (!kw) return { comics: [], maxPage: 1 };
            try {
                const status = this.optValue(Array.isArray(options) ? options[0] : null, "all", this.statusValues);
                const order = this.optValue(Array.isArray(options) ? options[1] : null, "time", this.orderValues);
                // 翻页与筛选共用 manhua-sousuo 路由（cata.php 无 page 参数，实测仅第 1 页）。
                const url = this.baseUrl + "/manhua-sousuo/" + encodeURIComponent(kw)
                    + "/ob/" + order + "/st/" + status + "/page/" + safePage;
                return await this.loadList(url, "parse");
            } catch (e) {
                console.error(`顶通禁漫屋搜索「${keyword}」加载失败：`, e);
                return { comics: [], maxPage: safePage };
            }
        }
    };

    // ============================ 详情与章节 ============================

    comic = {
        loadInfo: async (id) => {
            let doc = null;
            try {
                const url = this.absoluteUrl("/manhua-xiangqing/" + id);
                const res = await Network.get(url, this.defaultHeaders);
                if (res.status !== 200) throw `Invalid status: ${res.status}`;
                doc = new HtmlDocument(res.body);

                // 标题
                const titleEl = doc.querySelector("h1.title");
                let title = titleEl?.text?.trim() || "";
                title = title.replace(/[《》]/g, "").trim() || "未知漫画";

                // 封面
                const coverEl = doc.querySelector(".stui-content__thumb mip-img, .stui-content__thumb img");
                const cover = this.absoluteUrl(coverEl?.attributes.src || coverEl?.attributes["data-src"] || "");

                // 作者
                const authorEl = doc.querySelector(".stui-content__detail p.data:nth-of-type(2) a");
                const author = authorEl?.text?.trim() || "";

                // 简介
                const descEl = doc.querySelector(".stui-content__detail .desc");
                let desc = descEl?.text?.trim() || "";
                desc = desc.replace(/^简介[：:]\s*/, "").trim();

                // 类型标签
                const tags = [];
                const tagEls = doc.querySelectorAll(".stui-content__detail p.data:nth-of-type(1) a");
                for (const tagEl of tagEls) {
                    const tagText = tagEl.text.trim();
                    if (tagText) tags.push(tagText);
                }

                // 状态
                const updateEl = doc.querySelector(".stui-content__detail p.data:nth-of-type(3)");
                let status = updateEl?.text?.trim() || "";
                status = status.replace(/^更新[：:]\s*/, "").trim();

                // 章节列表
                const chapters = new Map();
                const chapterLinks = doc.querySelectorAll(".stui-content__playlist li a");
                for (const link of chapterLinks) {
                    const href = link.attributes.href || "";
                    const token = this.chapterTokenFromHref(href);
                    const chapterTitle = link.text.trim();
                    if (token && chapterTitle) {
                        // key 采用 comicId|token 组合，保证与 loadEp 入参自洽
                        chapters.set(id + "|" + token, chapterTitle);
                    }
                }

                return new ComicDetails({
                    title,
                    cover,
                    author,
                    description: desc,
                    tags: tags.length > 0 ? tags : undefined,
                    status,
                    chapters
                });
            } finally {
                doc?.dispose();
            }
        },

        loadEp: async (comicId, epId) => {
            let doc = null;
            try {
                // 兼容历史入参：comicId|token 组合、完整 URL、纯 token
                const epStr = epId == null ? "" : String(epId);
                let token = "";

                const comboMatch = epStr.match(/^(\d+)\|([A-Za-z0-9]+)$/);
                if (comboMatch) {
                    token = comboMatch[2];
                } else {
                    const urlMatch = epStr.match(/\/manhua-yuedu\/\d+\/([A-Za-z0-9]+)/);
                    if (urlMatch) {
                        token = urlMatch[1];
                    } else {
                        token = epStr;
                    }
                }

                if (!token || !/^[A-Za-z0-9]+$/.test(token)) {
                    return { images: [] };
                }

                const url = this.absoluteUrl("/manhua-yuedu/" + comicId + "/" + token);
                const res = await Network.get(url, this.defaultHeaders);
                if (res.status !== 200) throw `Invalid status: ${res.status}`;
                doc = new HtmlDocument(res.body);

                // 图片为明文直链（center > mip-img），无加密，不执行任何解密
                const images = [];
                const imgEls = doc.querySelectorAll("mip-img, img");
                for (const imgEl of imgEls) {
                    const src = imgEl.attributes.src;
                    if (src && /^https?:\/\//i.test(src)) {
                        images.push(src);
                    }
                }

                return { images: [...new Set(images)] };
            } catch (e) {
                console.error(`顶通禁漫屋章节加载失败：`, e);
                return { images: [] };
            } finally {
                doc?.dispose();
            }
        },

        onImageLoad: (url, comicId, epId) => {
            return {
                headers: {
                    "Referer": this.baseUrl + "/",
                    "User-Agent": this.defaultHeaders["User-Agent"]
                }
            };
        },

        onThumbnailLoad: (url) => {
            return {
                headers: {
                    "Referer": this.baseUrl + "/",
                    "User-Agent": this.defaultHeaders["User-Agent"]
                }
            };
        }
    };
}
