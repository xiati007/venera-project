/**
 * 搜搜漫画 (ssmhw.com) Venera 漫画源
 *
 * 版本: 1.0.0
 * 站点: 搜搜漫画网 https://ssmhw.com/ (帝国CMS / EmpireCMS, UTF-8, Cloudflare 前置, PHP 7.3)
 *
 * ================= 取证记录 (2026-10-05 真网取证) =================
 *
 * [P1 首页] GET https://ssmhw.com/ -> 200 (Server: cloudflare, X-Powered-By: PHP/7.3.33)
 *   - 推荐区容器 .de-cu, 内含 .normal-image1.big-imageN 共 7 张大图卡
 *     卡片: a[href="/novel{id}/"] + img[src=封面直出, 无懒加载] + h3[itemprop=name]
 *           + .chuyen-muc(分类) + .tt-status a[href=最新话]
 *   - 最近更新 .moi_cap_nhat 下 ul.truyenhot_ul_customcol, li.truyenhot_li_customcol 共 20 条
 *     li 结构: h3>a[href="/novel{id}/" title=标题] + .update_cate(分类)
 *              + .update_chap a[href="/novel{id}/chapter{N}.html" title="{标题} - {章节}"]
 *              + .update_time(更新时间)
 *     该区块 DOM 内 0 个 img (纯文字流) -> 封面用站点 favicon 占位,
 *     避免 Venera 拿到空 URL 报 "relative URL without a base"
 *   - 首页侧栏 "最新漫画" 为 .index_cate > .index-cate > a[title=完整标题] 文字列表
 *     (a 文本被站点截断, 完整标题只在 title 属性), 内容与"最近更新"高度重复,
 *     故不单独作为 explore 区块 (实测首页有效区块 = 推荐漫画 + 最近更新)
 *   - ul.truyenhot_ul_customcol.sidebar_list 仅存在于**详情页**侧栏, 首页无此类名
 *
 * [P2 搜索] GET /e/search/index.php?keyboard={kw}&show=title,writer,byr&searchget=1
 *   - 首次状态 302, Location: result/?searchid=N, 跟随后 200
 *     (curl -L 验证; Network.get 默认跟随重定向, 与 ffppt 先例一致)
 *   - 结果容器 .home-truyendecu, 每页 20 内容卡 (与分类页同构但独立取证确认)
 *   - 翻页 URL /e/search/result/index.php?page={P}&searchid={ID}, page 从 0 起
 *     (page=0 即第 1 页; 实测 page=0 与 page=1 内容不同)
 *   - 分页样本: 关键词"恋爱" -> searchid=1277, Last page=19 -> maxPage=20;
 *     复测样本: 关键词"恋爱" -> Last page=4 -> maxPage=5 (随站点更新浮动)
 *   - 单结果关键词: "秘密教学" / "高校巅峰" 均只命中 1 部且 maxPage=1
 *   - 无结果: 关键词 zzzzzqqqxxx111 -> 约 1KB 短页, 0 卡
 *   - 不依赖 session: 不带 cookie 直接访问 page=1&searchid=5845 仍 200 / 20 卡
 *   - 站点有搜索频率 cookie zmauylastsearchtime (见"已知限制")
 *
 * [P3/P4 分类] /{slug}/ 第 1 页, /{slug}/index_{N}.html 第 N 页
 *   - 每页 20 内容卡, 卡片 .home-truyendecu
 *     (注: 页面 <style> 中含 ".home-truyendecu:nth-of-type(...)" 规则,
 *      按字符串统计类名会虚高 4 次, 以解析后的 Comic 数量为准)
 *   - 分页 ul.pagination.pagination-chap, Last 链接指向真实末页 index_N
 *   - 已验证: /hanman/ -> index_209.html 有 8 卡(末页, 其分页栏最大页码 208<当前页),
 *     /latest/ -> index_50.html 有内容且 index_51.html -> 404
 *   - 越界页码异常: /hanman/index_210.html 返回 200 但为另一套模板内容
 *     (title 为"爱漫画网", 分页栏 Last=index_335), 属站点越界行为,
 *     不作为 maxPage 依据; 客户端依据第 1..末页的 Last 链接翻页, 不会请求越界页
 *
 * [P5 详情] GET /novel{id}/ -> 200
 *   - 标题 h3.title[itemprop=name] (简介区) / h2.single_title (信息区)
 *   - 封面 .info-holder img[itemprop=image], meta og:image 兜底
 *   - 作者 .info a[itemprop=author]; 分类 .info a[itemprop=genre]
 *   - 简介 .desc-text (文本前缀 "简介:")
 *   - 状态 meta og:novel:status (样本"完结"); 更新 meta og:novel:update_time
 *     (DOM 可见区无独立状态字段, 故状态取 meta)
 *   - 章节 #list-chapter > ul.list-chapter > li.chap-right5 > a[href="/novel{id}/chapter{N}.html"]
 *     * 关键: 每页只渲染 50 章, 通过 #pagination a[href="/novel{id}/?p={N}"] 翻页
 *     * novel6482 实测: p1=0..49, p2=50..99, p8=350..356 (Last=?p=8, 末页无 Last)
 *       -> 合并 8 页 = 0..356 共 357 话, 完整
 *     * #chaplist 为"最新 6 话"区块 (与末页重复, Map 去重后并入)
 *
 * [P6 章节] GET /novel{id}/chapter{N}.html -> 200
 *   - 正文图 img.comic_img 的 data-original (绝对 URL), class='comic_img lazy', 无 src
 *   - 样本 chapter356: 33 张 (img0..img32), 章节页无分页 (无 id="pagination")
 *   - 未见任何取图脚本/JSON/加密 -> 直接返回 URL, 不做解密
 *
 * [P10 图片] 
 *   - 章节图 https://img1.du8.in/hmpic/... -> 200 image/webp,
 *     文件头 52 49 46 46 .. 57 45 42 50 (RIFF/WEBP), 124882 字节
 *   - 封面 https://img1.du8.in/titlepic/... -> 200 image/jpeg,
 *     文件头 FF D8 FF E0 .. JFIF, 9153 字节
 *   - 带 Referer 与不带 Referer 均 200; 源内统一携带 (章节页/站点 Referer)
 *
 * ================= 已知限制 =================
 * - 搜索频率: 站点下发 cookie zmauylastsearchtime, 短时间高频搜索可能被临时拦截;
 *   翻页会优先复用缓存的 searchid, 缓存缺失/关键词变化时重新发起一次搜索。
 * - 详情章节: 每页 50 章需逐页抓取, 上限 MAX_CHAPTER_PAGES=60 页 (3000 章),
 *   更长分页样本未见 (待验证)。
 * - 列表分页越界: 站点对超出 Last 的页码 (如 /hanman/index_210.html) 返回 200
 *   但内容为另一套模板 (title"爱漫画网", Last=index_335)。源以各页分页栏 Last 为
 *   翻页依据, 不会主动请求越界页; 若客户端强制请求越界页, 会拿到非该分类内容。
 * - Cloudflare 前置 + 地区/TLS 问题不在源能力范围, 源不绕过任何付费/登录/版权限制。
 * - 站点返回的 eval/Function/内联脚本一律不执行。
 */

class Ssmhw extends ComicSource {
    name = "搜搜漫画";
    key = "ssmhw";
    version = "1.0.0";
    minAppVersion = "1.0.0";
    url = "";

    HOST = "https://ssmhw.com";
    UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    PLACEHOLDER_COVER = "https://ssmhw.com/favicon.ico";
    // 详情章节数分页抓取上限 (每页 50 章, 60 页 = 3000 章)
    MAX_CHAPTER_PAGES = 60;
    // 章节分页抓取并发度
    CHAPTER_PAGE_CONCURRENCY = 4;

    // 搜索 searchid 缓存: { keyword, searchId } —— 供翻页复用, 关键词变化即失效
    _searchCache = null;

    // ---------------- 请求与通用工具 ----------------

    _headers(referer) {
        const h = {
            "User-Agent": this.UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        };
        if (referer) h["Referer"] = referer;
        return h;
    }

    /** HTML 实体解码 (幂等; 覆盖站点实际出现的实体与数字实体) */
    _decode(s) {
        if (s === null || s === undefined) return "";
        const table = {
            amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
            hellip: "…", mdash: "—", ndash: "–", middot: "·",
            rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
            copy: "©", reg: "®", trade: "™",
        };
        return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code) => {
            try {
                if (code.charAt(0) === "#") {
                    const hex = code.charAt(1) === "x" || code.charAt(1) === "X";
                    const num = hex ? parseInt(code.substring(2), 16) : parseInt(code.substring(1), 10);
                    if (!isNaN(num) && num >= 0 && num <= 0x10FFFF) return String.fromCodePoint(num);
                    return m;
                }
                const key = code.toLowerCase();
                if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
            } catch (e) { /* 非法码点: 保留原文 */ }
            return m;
        });
    }

    _trim(s) {
        return this._decode(s).replace(/\s+/g, " ").trim();
    }

    /** 补全相对 URL 为绝对 URL */
    absoluteUrl(url) {
        const s = String(url == null ? "" : url).trim();
        if (!s) return "";
        if (s.indexOf("http://") === 0 || s.indexOf("https://") === 0) return s;
        if (s.indexOf("//") === 0) return "https:" + s;
        if (s.indexOf("/") === 0) return this.HOST + s;
        return this.HOST + "/" + s;
    }

    /** 从 /novel{id}/ 或完整 URL 提取漫画 ID */
    comicIdFromHref(href) {
        const m = String(href == null ? "" : href).match(/\/novel(\d+)\//);
        return m ? m[1] : null;
    }

    /** 标准化漫画 ID: 支持 "6482" / 6482 / "novel6482" / "https://ssmhw.com/novel6482/" */
    normalizeComicId(id) {
        if (id === null || id === undefined) return null;
        if (typeof id === "number") {
            return isFinite(id) && id >= 0 ? String(Math.trunc(id)) : null;
        }
        const s = String(id).trim();
        if (!s) return null;
        const mNovel = s.match(/novel(\d+)/);
        if (mNovel) return mNovel[1];
        if (/^\d+$/.test(s)) return s;
        return null;
    }

    /**
     * 标准化章节入参 (历史阅读参数矩阵):
     *   "356" / 356                        -> { epId:"356" }
     *   "/novel6482/chapter356.html" / URL -> { epId:"356", comicId:"6482" }
     *   "6482|356"                         -> { epId:"356", comicId:"6482" }
     *   {epId|chapterId|id|url: ...}       -> 递归读白名单字段
     *   非法/无法识别                      -> null
     */
    _parseEpParam(epId) {
        if (epId === null || epId === undefined) return null;
        if (typeof epId === "number") {
            return isFinite(epId) && epId >= 0 ? { epId: String(Math.trunc(epId)), comicId: null } : null;
        }
        if (typeof epId === "object") {
            const keys = ["epId", "chapterId", "id", "url"];
            for (let i = 0; i < keys.length; i++) {
                if (Object.prototype.hasOwnProperty.call(epId, keys[i])) {
                    const r = this._parseEpParam(epId[keys[i]]);
                    if (r) return r;
                }
            }
            return null;
        }
        let s = String(epId).trim();
        if (!s) return null;
        if (s.indexOf("|") >= 0) {
            // 组合形态 comicId|epId: 章节号取最后一段, 首段若为漫画 ID 则一并保留,
            // 供 loadEp 校验漫画 ID 一致性 (不一致直接拒绝, 不发请求)
            const parts = s.split("|");
            const tail = parts[parts.length - 1].trim();
            const head = parts[0].trim();
            let comboComicId = null;
            if (/^\d+$/.test(head)) comboComicId = head;
            else {
                const mHead = head.match(/\/novel(\d+)\//);
                if (mHead) comboComicId = mHead[1];
            }
            const rest = this._parseEpParam(tail);
            if (!rest) return null;
            return { epId: rest.epId, comicId: rest.comicId || comboComicId };
        }
        let comicId = null;
        const mUrl = s.match(/\/novel(\d+)\/chapter(\d+)\.html/);
        if (mUrl) return { epId: mUrl[2], comicId: mUrl[1] };
        const mAnyUrl = s.match(/\/novel(\d+)\//);
        if (mAnyUrl) comicId = mAnyUrl[1];
        const mChap = s.match(/chapter(\d+)/);
        if (mChap) return { epId: mChap[1], comicId: comicId };
        if (/^\d+$/.test(s)) return { epId: s, comicId: comicId };
        return null;
    }

    // ---------------- 列表/卡片解析 ----------------

    /** 列表卡 (分类页 / 搜索页 / 排行页同构: .home-truyendecu) —— 各页面独立取证 */
    parseListCard(card) {
        if (!card) return null;
        let link = null;
        try { link = card.querySelector("a[itemprop=url]"); } catch (e) { link = null; }
        if (!link) {
            const links = card.querySelectorAll("a[href*='/novel']");
            for (let i = 0; i < links.length; i++) {
                if (this.comicIdFromHref(links[i].attributes.href)) { link = links[i]; break; }
            }
        }
        if (!link) return null;
        const id = this.comicIdFromHref(link.attributes.href);
        if (!id) return null;

        let title = "";
        try {
            const h3 = card.querySelector("h3[itemprop=name]");
            if (h3) title = this._trim(h3.text);
        } catch (e) { /* 选择器异常: 继续兜底 */ }
        if (!title) title = this._trim(link.attributes.title);
        if (!title) title = this._trim(link.text);
        if (!title) return null;

        // 封面: 列表卡 img 为直出 src (alt 属性存在站点自带的多余引号, 故不依赖 itemprop 匹配)
        let cover = "";
        try {
            const img = card.querySelector("img[itemprop=image]") || card.querySelector("img");
            if (img) cover = img.attributes.src || img.attributes["data-original"] || "";
        } catch (e) { cover = ""; }
        if (!cover) {
            const imgs = card.querySelectorAll("img");
            for (let i = 0; i < imgs.length; i++) {
                const src = imgs[i].attributes.src || "";
                if (src && src.indexOf("/novel/images/") < 0) { cover = src; break; }
            }
        }
        cover = this.absoluteUrl(cover);
        if (cover && cover.indexOf("/novel/images/") >= 0) cover = "";

        const subParts = [];
        const cate = card.querySelector(".chuyen-muc");
        if (cate) {
            const t = this._trim(cate.attributes.title || cate.text);
            if (t) subParts.push(t);
        }
        const tt = card.querySelector(".tt-status");
        if (tt) {
            const t = this._trim(tt.text);
            if (t && t.length <= 40) subParts.push(t);
        }

        return new Comic({
            id: id,
            title: title,
            subTitle: subParts.join(" · "),
            cover: cover || this.PLACEHOLDER_COVER,
            description: "",
            tags: [],
        });
    }

    /** 解析列表页全部卡片 */
    parseListCards(doc) {
        const comics = [];
        if (!doc) return comics;
        const cards = doc.querySelectorAll(".home-truyendecu");
        for (let i = 0; i < cards.length; i++) {
            const c = this.parseListCard(cards[i]);
            if (c) comics.push(c);
        }
        return comics;
    }

    /** 首页推荐大图卡 (.normal-image1) */
    parseHomeCard(card) {
        if (!card) return null;
        let link = null;
        try { link = card.querySelector("a[itemprop=url]"); } catch (e) { link = null; }
        if (!link) {
            const links = card.querySelectorAll("a[href*='/novel']");
            for (let i = 0; i < links.length; i++) {
                if (this.comicIdFromHref(links[i].attributes.href)) { link = links[i]; break; }
            }
        }
        if (!link) return null;
        const id = this.comicIdFromHref(link.attributes.href);
        if (!id) return null;

        let title = "";
        try {
            const h3 = card.querySelector("h3[itemprop=name]");
            if (h3) title = this._trim(h3.text);
        } catch (e) { title = ""; }
        if (!title) title = this._trim(link.attributes.title);
        if (!title) return null;

        let cover = "";
        try {
            const img = card.querySelector("img[itemprop=image]") || card.querySelector("img");
            if (img) cover = img.attributes.src || img.attributes["data-original"] || "";
        } catch (e) { cover = ""; }
        cover = this.absoluteUrl(cover);

        const subParts = [];
        const cate = card.querySelector(".chuyen-muc");
        if (cate) {
            const t = this._trim(cate.attributes.title || cate.text);
            if (t) subParts.push(t);
        }

        return new Comic({
            id: id,
            title: title,
            subTitle: subParts.join(" · "),
            cover: cover || this.PLACEHOLDER_COVER,
            description: "",
            tags: [],
        });
    }

    /**
     * 文字列表条目 (li.truyenhot_li_customcol)
     * 主形态为首页"最近更新": .update_cate + .update_chap + .update_time
     * 同时兼容站点其它同构列表 (.can-phai + .tien_to_full a, 如详情页侧栏)
     * 标题优先取 a[title] (侧栏 a 文本被站点截断, 完整标题只在 title 属性)
     */
    parseLatestItem(li) {
        if (!li) return null;
        let a = null;
        try { a = li.querySelector("h3 a"); } catch (e) { a = null; }
        if (!a) a = li.querySelector("a[href*='/novel']");
        if (!a) return null;
        const id = this.comicIdFromHref(a.attributes.href);
        if (!id) return null;

        // 侧栏条目 h3>a 内含 Hot/New 徽标 span, title 属性更干净
        let title = this._trim(a.attributes.title);
        if (!title) title = this._trim(a.text);
        if (!title) return null;

        const parts = [];
        const cate = li.querySelector(".update_cate");
        if (cate) {
            const t = this._trim(cate.attributes.title || cate.text);
            if (t) parts.push(t);
        }
        let chapA = null;
        try { chapA = li.querySelector(".update_chap a"); } catch (e) { chapA = null; }
        if (!chapA) chapA = li.querySelector(".tien_to_full a");
        if (chapA) {
            let t = this._trim(chapA.attributes.title);
            if (!t) t = this._trim(chapA.text);
            const idx = t.indexOf(" - ");
            if (idx >= 0) t = t.substring(idx + 3).trim();
            if (t) parts.push(t);
        }

        return new Comic({
            id: id,
            title: title,
            subTitle: parts.join(" · "),
            // 该区块 DOM 内无 img (取证 P1), 用 favicon 占位避免空 URL 异常
            cover: this.PLACEHOLDER_COVER,
            description: "",
            tags: [],
        });
    }

    /** 分类页分页: 从 ul.pagination 的 index_N 链接取真实末页号 */
    parseIndexMaxPage(doc, current) {
        let pag = null;
        try { pag = doc.querySelector("ul.pagination"); } catch (e) { pag = null; }
        if (!pag) return current;
        let max = current;
        const links = pag.querySelectorAll("a[href*='index_']");
        for (let i = 0; i < links.length; i++) {
            const m = String(links[i].attributes.href || "").match(/index_(\d+)\.html/);
            if (m) {
                const n = parseInt(m[1], 10);
                if (!isNaN(n) && n > max) max = n;
            }
        }
        return max;
    }

    /** 搜索分页: page 从 0 起, Last page=N => 共 N+1 页; 无分页栏 => 1 页 */
    parseSearchMeta(doc) {
        const out = { maxPage: 1, searchId: null };
        if (!doc) return out;
        let pag = null;
        try { pag = doc.querySelector("ul.pagination"); } catch (e) { pag = null; }
        if (!pag) return out;
        const links = pag.querySelectorAll("a[href]");
        let maxPage = 0;
        for (let i = 0; i < links.length; i++) {
            const href = String(links[i].attributes.href || "");
            const mPage = href.match(/[?&]page=(\d+)/);
            if (mPage) {
                const n = parseInt(mPage[1], 10) + 1; // 0 基页码 -> 页数
                if (!isNaN(n) && n > maxPage) maxPage = n;
            }
            const mSid = href.match(/[?&]searchid=(\d+)/);
            if (mSid) out.searchId = mSid[1];
        }
        if (maxPage > 0) out.maxPage = maxPage;
        return out;
    }

    // ---------------- 首页 explore ----------------

    explore = [
        {
            title: "搜搜漫画",
            type: "multiPartPage",
            load: async (page) => {
                const parts = [];
                let doc = null;
                try {
                    const res = await Network.get(this.HOST + "/", this._headers(this.HOST + "/"));
                    if (!res || res.status !== 200 || !res.body) return parts;
                    doc = new HtmlDocument(res.body);

                    // 区块 1: 推荐大图卡
                    const recommend = [];
                    let cards = doc.querySelectorAll(".de-cu .normal-image1");
                    if (!cards || cards.length === 0) cards = doc.querySelectorAll(".normal-image1");
                    for (let i = 0; i < cards.length; i++) {
                        const c = this.parseHomeCard(cards[i]);
                        if (c) recommend.push(c);
                    }
                    if (recommend.length > 0) {
                        parts.push({ title: "推荐漫画", comics: recommend, viewMore: "热门排行" });
                    }

                    // 区块 2: 最近更新 (文字流)
                    const latest = [];
                    let latestUl = null;
                    try { latestUl = doc.querySelector(".moi_cap_nhat ul.truyenhot_ul_customcol"); } catch (e) { latestUl = null; }
                    if (!latestUl) latestUl = doc.querySelector("ul.truyenhot_ul_customcol");
                    if (latestUl) {
                        const lis = latestUl.querySelectorAll("li");
                        for (let i = 0; i < lis.length; i++) {
                            const c = this.parseLatestItem(lis[i]);
                            if (c) latest.push(c);
                        }
                    }
                    if (latest.length > 0) {
                        parts.push({ title: "最近更新", comics: latest, viewMore: "最新更新" });
                    }
                } catch (e) {
                    console.log("ssmhw explore error: " + e);
                } finally {
                    if (doc) doc.dispose();
                }
                return parts;
            },
        },
    ];

    // ---------------- 分类 ----------------

    category = {
        title: "搜搜漫画",
        parts: [
            {
                name: "漫画分类",
                type: "fixed",
                categories: ["韩国漫画", "日本漫画", "3D漫画", "同人誌", "单行本", "杂志短篇", "Cosplay写真", "CG漫画"],
                itemType: "category",
                categoryParams: ["hanman", "riman", "3d", "tongrenzhi", "single", "short", "cosplay", "cg"],
            },
            {
                name: "排行与状态",
                type: "fixed",
                categories: ["最新更新", "最新入库", "热门排行", "完本漫画"],
                itemType: "category",
                categoryParams: ["latest", "release", "popular", "completed"],
            },
        ],
        enableRankingPage: false,
    };

    categoryComics = {
        load: async (category, param, options, page) => {
            return await this.loadListPage(param, page);
        },
    };

    /** 列表页: 第 1 页 /{slug}/, 第 N 页 /{slug}/index_{N}.html (取证 P3/P4) */
    async loadListPage(slug, page) {
        const s = String(slug == null ? "" : slug).trim().replace(/^\/+|\/+$/g, "");
        const p = parseInt(page, 10) || 1;
        if (!s || p < 1) return { comics: [], maxPage: 1 };

        const base = this.HOST + "/" + s + "/";
        const url = p <= 1 ? base : base + "index_" + p + ".html";
        let doc = null;
        try {
            const res = await Network.get(url, this._headers(base));
            if (!res || res.status !== 200 || !res.body) return { comics: [], maxPage: p };
            doc = new HtmlDocument(res.body);
            const comics = this.parseListCards(doc);
            const maxPage = this.parseIndexMaxPage(doc, p);
            return { comics: comics, maxPage: maxPage };
        } catch (e) {
            console.log("ssmhw loadListPage error: " + e);
            return { comics: [], maxPage: p };
        } finally {
            if (doc) doc.dispose();
        }
    }

    // ---------------- 搜索 ----------------

    search = {
        load: async (keyword, options, page) => {
            const kw = String(keyword == null ? "" : keyword).trim();
            const p = parseInt(page, 10) || 1;
            if (!kw || p < 1) return { comics: [], maxPage: 1 };

            const firstUrl = this.HOST + "/e/search/index.php?keyboard=" + encodeURIComponent(kw)
                + "&show=title,writer,byr&searchget=1";

            // 第 1 页: 直接发起搜索 (302 -> /e/search/result/?searchid=N, Network.get 自动跟随)
            if (p === 1) {
                let doc = null;
                try {
                    const res = await Network.get(firstUrl, this._headers(this.HOST + "/"));
                    if (!res || res.status !== 200 || !res.body) {
                        console.log("ssmhw search first status=" + (res ? res.status : "null"));
                        return { comics: [], maxPage: 1 };
                    }
                    doc = new HtmlDocument(res.body);
                    const comics = this.parseListCards(doc);
                    const meta = this.parseSearchMeta(doc);
                    this._searchCache = meta.searchId ? { keyword: kw, searchId: meta.searchId } : null;
                    return { comics: comics, maxPage: meta.maxPage };
                } catch (e) {
                    console.log("ssmhw search error: " + e);
                    return { comics: [], maxPage: 1 };
                } finally {
                    if (doc) doc.dispose();
                }
            }

            // 第 N 页: 需要 searchid; 缓存命中且关键词一致则复用, 否则重新搜索建立缓存
            let sid = null;
            if (this._searchCache && this._searchCache.keyword === kw && this._searchCache.searchId) {
                sid = this._searchCache.searchId;
            } else {
                let firstDoc = null;
                try {
                    const res = await Network.get(firstUrl, this._headers(this.HOST + "/"));
                    if (!res || res.status !== 200 || !res.body) return { comics: [], maxPage: p };
                    firstDoc = new HtmlDocument(res.body);
                    const meta = this.parseSearchMeta(firstDoc);
                    sid = meta.searchId;
                } catch (e) {
                    console.log("ssmhw search page>1 bootstrap error: " + e);
                    return { comics: [], maxPage: p };
                } finally {
                    if (firstDoc) firstDoc.dispose();
                }
                if (!sid) return { comics: [], maxPage: 1 };
                this._searchCache = { keyword: kw, searchId: sid };
            }

            const pageUrl = this.HOST + "/e/search/result/index.php?page=" + (p - 1) + "&searchid=" + sid;
            let doc = null;
            try {
                const res = await Network.get(pageUrl, this._headers(this.HOST + "/e/search/result/"));
                if (!res || res.status !== 200 || !res.body) {
                    console.log("ssmhw search page=" + p + " status=" + (res ? res.status : "null"));
                    return { comics: [], maxPage: p };
                }
                doc = new HtmlDocument(res.body);
                const comics = this.parseListCards(doc);
                if (comics.length === 0) {
                    // searchid 失效或该页为空: 不猜测, 安全返回空
                    return { comics: [], maxPage: p };
                }
                const meta = this.parseSearchMeta(doc);
                return { comics: comics, maxPage: meta.maxPage };
            } catch (e) {
                console.log("ssmhw search page error: " + e);
                return { comics: [], maxPage: p };
            } finally {
                if (doc) doc.dispose();
            }
        },
    };

    // ---------------- 详情 / 章节 ----------------

    comic = {
        loadInfo: async (id) => {
            return await this.loadComicInfo(id);
        },
        loadEp: async (comicId, epId) => {
            return await this.loadChapterImages(comicId, epId);
        },
        onImageLoad: (url, comicId, epId) => {
            const cid = this.normalizeComicId(comicId);
            const parsed = this._parseEpParam(epId);
            let referer = this.HOST + "/";
            if (cid && parsed && parsed.epId) {
                referer = this.HOST + "/novel" + cid + "/chapter" + parsed.epId + ".html";
            }
            return {
                headers: {
                    "User-Agent": this.UA,
                    "Referer": referer,
                    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                },
            };
        },
        onThumbnailLoad: (url) => {
            return {
                headers: {
                    "User-Agent": this.UA,
                    "Referer": this.HOST + "/",
                    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                },
            };
        },
    };

    /** 读取 meta 属性 content (兼容属性选择器实现差异) */
    _metaContent(doc, prop) {
        let el = null;
        try { el = doc.querySelector("meta[property='" + prop + "']"); } catch (e) { el = null; }
        if (!el) {
            try { el = doc.querySelector("meta[property=" + prop + "]"); } catch (e) { el = null; }
        }
        if (!el) {
            const all = doc.querySelectorAll("meta");
            for (let i = 0; i < all.length; i++) {
                const v = all[i].attributes.property || all[i].attributes.itemprop || "";
                if (v === prop) { el = all[i]; break; }
            }
        }
        return el ? this._trim(el.attributes.content) : "";
    }

    /**
     * 从指定容器收集本漫画的章节 { epId: 标题 }
     * 只接受 /novel{comicId}/chapter{N}.html 精确前缀, 避免相关推荐/侧栏的跨漫画链接污染
     */
    _collectChapters(container, comicId, out) {
        if (!container || !comicId) return out;
        const links = container.querySelectorAll("a[href*='chapter']");
        const prefix = "/novel" + comicId + "/chapter";
        for (let i = 0; i < links.length; i++) {
            const href = String(links[i].attributes.href || "").trim();
            if (!href || href.indexOf(prefix) !== 0) continue;
            const m = href.match(/chapter(\d+)\.html/);
            if (!m) continue;
            const epId = m[1];
            if (Object.prototype.hasOwnProperty.call(out, epId)) continue;
            let t = "";
            try {
                const ct = links[i].querySelector(".chapter-text");
                if (ct) t = this._trim(ct.text);
            } catch (e) { t = ""; }
            if (!t) t = this._trim(links[i].attributes.title);
            if (!t) t = this._trim(links[i].text);
            out[epId] = t || ("第" + epId + "话");
        }
        return out;
    }

    /** 章节分页数: #list-chapter 内 /?p=N 的最大值 (无分页 => 1) */
    _chapterPageCount(doc, comicId) {
        let container = null;
        try { container = doc.querySelector("#list-chapter"); } catch (e) { container = null; }
        if (!container) return 1;
        const links = container.querySelectorAll("a[href*='?p=']");
        let max = 1;
        const prefix = "/novel" + comicId + "/?p=";
        for (let i = 0; i < links.length; i++) {
            const href = String(links[i].attributes.href || "").trim();
            if (href.indexOf(prefix) !== 0) continue;
            const m = href.match(/[?&]p=(\d+)/);
            if (m) {
                const n = parseInt(m[1], 10);
                if (!isNaN(n) && n > max) max = n;
            }
        }
        return max > this.MAX_CHAPTER_PAGES ? this.MAX_CHAPTER_PAGES : max;
    }

    /** 有限并发 map */
    async _mapLimit(items, limit, worker) {
        const results = new Array(items.length);
        let cursor = 0;
        const runners = [];
        const n = Math.max(1, Math.min(limit, items.length));
        for (let k = 0; k < n; k++) {
            runners.push((async () => {
                while (true) {
                    const idx = cursor++;
                    if (idx >= items.length) break;
                    try {
                        results[idx] = await worker(items[idx], idx);
                    } catch (e) {
                        results[idx] = null;
                    }
                }
            })());
        }
        await Promise.all(runners);
        return results;
    }

    /** 抓取详情页第 N 章节分页, 返回 { epId: 标题 } */
    async _loadChapterPage(comicId, p) {
        const url = p <= 1
            ? this.HOST + "/novel" + comicId + "/"
            : this.HOST + "/novel" + comicId + "/?p=" + p;
        const res = await Network.get(url, this._headers(this.HOST + "/"));
        if (!res || res.status !== 200 || !res.body) return null;
        let doc = null;
        try {
            doc = new HtmlDocument(res.body);
            let container = null;
            try { container = doc.querySelector("#list-chapter"); } catch (e) { container = null; }
            if (!container) return null;
            return this._collectChapters(container, comicId, {});
        } finally {
            if (doc) doc.dispose();
        }
    }

    async loadComicInfo(id) {
        const comicId = this.normalizeComicId(id);
        if (!comicId) throw "Invalid comic id";

        let doc = null;
        let chapters = {};
        let chapterPages = 1;
        // 元数据变量在 try 外声明: 返回值与 tags 构建位于 try 之外, 必须可见
        let title = "";
        let cover = "";
        let author = "";
        let genre = "";
        let status = "";
        let updateTime = "";
        let description = "";
        try {
            const res = await Network.get(
                this.HOST + "/novel" + comicId + "/",
                this._headers(this.HOST + "/")
            );
            if (!res || res.status !== 200 || !res.body) throw "Comic not found";
            const body = String(res.body);
            // 站点 404/错误页以非 200 状态返回; 另做正文兜底检测
            if (body.indexOf("漫画不存在") >= 0 || body.indexOf("已被删除") >= 0) {
                throw "Comic not found";
            }

            doc = new HtmlDocument(body);

            title = "";
            try {
                const h3 = doc.querySelector("h3.title[itemprop=name]");
                if (h3) title = this._trim(h3.text);
            } catch (e) { title = ""; }
            if (!title) {
                try {
                    const h2 = doc.querySelector("h2.single_title");
                    if (h2) title = this._trim(h2.text);
                } catch (e) { /* 忽略 */ }
            }
            if (!title) {
                const t = this._trim(String(doc.querySelector("title") ? doc.querySelector("title").text : ""));
                title = t.split("_")[0].trim();
            }
            if (!title) title = "novel" + comicId;

            cover = "";
            try {
                const img = doc.querySelector(".info-holder img[itemprop=image]")
                    || doc.querySelector("img[itemprop=image]")
                    || doc.querySelector(".info-holder img");
                if (img) cover = img.attributes.src || img.attributes["data-original"] || "";
            } catch (e) { cover = ""; }
            if (!cover) cover = this._metaContent(doc, "og:image");
            cover = this.absoluteUrl(cover);

            author = "";
            try {
                const a = doc.querySelector(".info a[itemprop=author]");
                if (a) author = this._trim(a.text) || this._trim(a.attributes.title);
            } catch (e) { author = ""; }
            if (!author) author = this._metaContent(doc, "og:novel:author");

            genre = "";
            try {
                const g = doc.querySelector(".info a[itemprop=genre]");
                if (g) genre = this._trim(g.text);
            } catch (e) { genre = ""; }
            if (!genre) genre = this._metaContent(doc, "og:novel:category");

            status = this._metaContent(doc, "og:novel:status");
            updateTime = this._metaContent(doc, "og:novel:update_time");

            description = "";
            try {
                const d = doc.querySelector(".desc-text");
                if (d) description = this._trim(d.text);
            } catch (e) { description = ""; }
            if (!description) description = this._metaContent(doc, "description");
            description = description.replace(/^(?:简介|漫画介绍|内容简介|內容簡介)\s*[:：]?\s*/, "").trim();

            // 章节: 第 1 页(详情页本身) + #chaplist 最新话
            let listContainer = null;
            try { listContainer = doc.querySelector("#list-chapter"); } catch (e) { listContainer = null; }
            if (listContainer) this._collectChapters(listContainer, comicId, chapters);
            let chapList = null;
            try { chapList = doc.querySelector("#chaplist"); } catch (e) { chapList = null; }
            if (chapList) this._collectChapters(chapList, comicId, chapters);
            chapterPages = this._chapterPageCount(doc, comicId);
        } catch (e) {
            if (doc) { doc.dispose(); doc = null; }
            throw (typeof e === "string" && e) ? e : "Comic not found";
        } finally {
            if (doc) doc.dispose();
        }

        // 章节分页 p=2..N (每页 50 章, 取证 P5), 有限并发
        if (chapterPages > 1) {
            const pages = [];
            for (let p = 2; p <= chapterPages; p++) pages.push(p);
            const parts = await this._mapLimit(pages, this.CHAPTER_PAGE_CONCURRENCY, (p) =>
                this._loadChapterPage(comicId, p)
            );
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (!part) continue;
                for (const k in part) {
                    if (Object.prototype.hasOwnProperty.call(part, k) && !Object.prototype.hasOwnProperty.call(chapters, k)) {
                        chapters[k] = part[k];
                    }
                }
            }
        }

        const epCount = Object.keys(chapters).length;
        if (epCount === 0) throw "Comic not found";

        const tags = {};
        if (author) tags["作者"] = [author];
        if (genre) tags["分类"] = [genre];
        if (status) tags["状态"] = [status];

        return new ComicDetails({
            title: title,
            subTitle: author ? author : (genre || ""),
            cover: cover,
            description: description,
            tags: tags,
            chapters: chapters,
            isFavorite: false,
            subId: comicId,
            thumbnails: cover ? [cover] : [],
            recommend: [],
            updateTime: updateTime || "",
            status: status || "",
            url: this.HOST + "/novel" + comicId + "/",
        });
    }

    /**
     * 章节图片: img.comic_img 的 data-original 懒加载属性 (取证 P6, 绝对 URL, 无加密)
     * 兼容历史入参 (矩阵见 _parseEpParam); 漫画 ID 不一致或非法入参直接返回空, 不发畸形请求
     */
    async loadChapterImages(comicId, epId) {
        const cid = this.normalizeComicId(comicId);
        const parsed = this._parseEpParam(epId);
        if (!cid || !parsed || !parsed.epId) return { images: [] };
        if (parsed.comicId && parsed.comicId !== cid) {
            // 组合 ID 中的漫画 ID 与当前漫画不一致: 拒绝
            return { images: [] };
        }

        const url = this.HOST + "/novel" + cid + "/chapter" + parsed.epId + ".html";
        let doc = null;
        try {
            const res = await Network.get(url, this._headers(this.HOST + "/novel" + cid + "/"));
            if (!res || res.status !== 200 || !res.body) return { images: [] };
            const body = String(res.body);
            if (body.indexOf("漫画不存在") >= 0 || body.indexOf("已被删除") >= 0) {
                return { images: [] };
            }
            doc = new HtmlDocument(body);
            const imgs = doc.querySelectorAll("img.comic_img");
            const images = [];
            for (let i = 0; i < imgs.length; i++) {
                let src = imgs[i].attributes["data-original"]
                    || imgs[i].attributes["data-src"]
                    || imgs[i].attributes.src
                    || "";
                src = String(src).trim();
                if (!src) continue;
                // 排除站点图标与 lazyload 占位图
                if (src.indexOf("imgloading.gif") >= 0) continue;
                if (src.indexOf("/novel/images/") >= 0) continue;
                if (src.indexOf("http://") !== 0 && src.indexOf("https://") !== 0) continue;
                if (images.indexOf(src) < 0) images.push(src);
            }
            return { images: images };
        } catch (e) {
            console.log("ssmhw loadEp error: " + e);
            return { images: [] };
        } finally {
            if (doc) doc.dispose();
        }
    }
}
