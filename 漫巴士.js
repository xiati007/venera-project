class ManBashi extends ComicSource {
    name = "漫巴士"
    key = "manbashi"
    version = "1.0.0"
    minAppVersion = "1.0.0"
    url = ""

    baseUrl = "https://manbashi.com"

    // 站点为 Next.js SSR，数据既在明文 DOM，也在 self.__next_f.push 的 RSC flight 里。
    // 本源全程用字符串正则解析：明文 DOM 取卡片/og/作者，flight 取章节列表与图片清单。

    // ---------- 通用工具 ----------

    // 章节标题里带未反转义的 HTML 实体（&hellip; &hearts; 等），这里做最小集合解码。
    decodeEntities(text) {
        if (!text) return "";
        return String(text)
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, "\"")
            .replace(/&#0?39;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&hearts;/g, "♥")
            .replace(/&hellip;/g, "…")
            .replace(/&mdash;/g, "—")
            .replace(/&ndash;/g, "–")
            .replace(/&middot;/g, "·")
            .replace(/&copy;/g, "©")
            .replace(/&reg;/g, "®")
            .replace(/&trade;/g, "™")
            .replace(/&#(\d+);/g, (_, d) => {
                const n = parseInt(d, 10);
                return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
            });
    }

    stripTags(html) {
        return this.decodeEntities(String(html).replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
    }

    // 拼接所有 self.__next_f.push([1,"..."]) 的载荷，并对每个 JS 字符串做反转义。
    extractFlight(html) {
        const text = String(html || "");
        const key = 'self.__next_f.push([1,"';
        let out = "";
        let i = 0;
        while ((i = text.indexOf(key, i)) !== -1) {
            let j = i + key.length;
            while (j < text.length) {
                const ch = text[j];
                if (ch === "\\") { j += 2; continue; }
                if (ch === '"') break;
                j++;
            }
            if (j >= text.length) break;
            const raw = text.slice(i + key.length, j);
            try {
                out += JSON.parse('"' + raw + '"');
            } catch (e) {
                out += raw;
            }
            i = j + 1;
        }
        return out;
    }

    // 明文 HTML 的漫画卡片：<a href="/comic/MBSxxx">…<img src=…><h3>标题</h3></a>
    parseCards(html) {
        const text = String(html || "");
        const comics = [];
        const seen = new Set();
        const anchor = /<a\b[^>]*\bhref="\/comic\/(MBS\d+)"[^>]*>/g;
        let m;
        while ((m = anchor.exec(text)) !== null) {
            const id = m[1];
            if (seen.has(id)) continue;
            const end = text.indexOf("</a>", m.index);
            const seg = text.slice(m.index, end > 0 ? end : m.index + 4000);
            const img = /<img\b[^>]*\ssrc="(https?:\/\/[^"]+)"/.exec(seg);
            const h3 = /<h3\b[^>]*>([\s\S]{0,400}?)<\/h3>/.exec(seg);
            const title = h3 ? this.stripTags(h3[1]) : "";
            if (!title && !img) continue;
            seen.add(id);
            comics.push(new Comic({
                id: id,
                title: title || id,
                cover: img ? img[1] : "",
            }));
        }
        return comics;
    }

    // maxPage 取分页器里出现过的最大页码，有真实页面依据，不用 page + 1 猜。
    // 明文 DOM 里的 href 是 &amp;page=N，flight 里是 &page=N，两种都要认。
    parseMaxPage(html, page) {
        let max = page;
        const re = /[?&](?:amp;)?page=(\d+)/g;
        let m;
        while ((m = re.exec(String(html || ""))) !== null) {
            const n = parseInt(m[1], 10);
            if (n > max) max = n;
        }
        return max;
    }

    async getBody(url) {
        const res = await Network.get(url, {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "Referer": this.baseUrl + "/",
        });
        if (!res || res.status !== 200 || !res.body) {
            throw "Invalid status: " + (res ? res.status : "empty");
        }
        return String(res.body);
    }

    // 兼容历史入参：普通 documentId / 完整章节 URL / 组合 ID / 对象
    normalizeComicId(comicId) {
        if (comicId === null || comicId === undefined) return "";
        const s = String(comicId).trim();
        const m = s.match(/\/comic\/(MBS\d+)/i) || s.match(/\b(MBS\d+)\b/i);
        // 站点 slug 固定大写 MBS 前缀，历史数据里可能出现小写
        if (m) return m[1].toUpperCase();
        return "";
    }

    normalizeEpId(epId) {
        if (epId === null || epId === undefined) return "";
        if (typeof epId === "object") {
            const o = epId;
            return this.normalizeEpId(o.epId ?? o.chapterId ?? o.id ?? o.documentId ?? o.url ?? "");
        }
        let s = String(epId).trim().replace(/&amp;/g, "&");
        if (!s) return "";
        try { s = decodeURIComponent(s); } catch (e) { /* 保留原串 */ }
        s = s.split("#")[0].split("?")[0];
        const m = s.match(/\/chapter\/([0-9a-z]{24})(?:$|\/)/i) || s.match(/([0-9a-z]{24})$/i);
        if (m) return m[1];
        const bare = s.match(/^[0-9a-z]{24}$/i);
        return bare ? bare[0] : "";
    }

    // ---------- 首页 ----------

    explore = [
        {
            title: "漫巴士",
            type: "singlePageWithMultiPart",
            load: async () => {
                let html = "";
                try {
                    html = await this.getBody(this.baseUrl + "/");
                } catch (e) {
                    return {};
                }
                const result = {};
                const heads = [...html.matchAll(/<h2\b[^>]*>([\s\S]{0,300}?)<\/h2>/g)];
                if (heads.length === 0) {
                    const comics = this.parseCards(html);
                    if (comics.length > 0) result["最新更新"] = comics;
                    return result;
                }
                for (let k = 0; k < heads.length; k++) {
                    const title = this.stripTags(heads[k][1]);
                    const start = heads[k].index + heads[k][0].length;
                    const end = k + 1 < heads.length ? html.indexOf("<h2", start) : html.length;
                    const seg = html.slice(start, end > 0 ? end : html.length);
                    const comics = this.parseCards(seg);
                    if (comics.length > 0 && title) result[title] = comics;
                }
                return result;
            },
        },
    ]

    // ---------- 分类 ----------

    category = {
        title: "漫巴士",
        parts: [
            {
                name: "题材",
                type: "fixed",
                categories: ["全部", "同人志", "单行本", "杂志&短篇", "CG图集", "AI图集", "韩漫", "3D"],
                categoryParams: ["all", "doujinshi", "offprint", "shortstory", "artistcg", "aigenerated", "Manhwa", "3dcomic"],
                itemType: "category",
            },
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            try {
                const slug = encodeURIComponent(String(param || "all"));
                const url = `${this.baseUrl}/categories?category=${slug}&sort=${encodeURIComponent("updatedAt:desc")}&page=${page}`;
                const html = await this.getBody(url);
                const comics = this.parseCards(html);
                if (comics.length === 0) return { comics: [], maxPage: page };
                return { comics: comics, maxPage: this.parseMaxPage(html, page) };
            } catch (e) {
                return { comics: [], maxPage: page };
            }
        },
    }

    // ---------- 搜索 ----------

    search = {
        load: async (keyword, options, page) => {
            const kw = String(keyword ?? "").trim();
            if (!kw) return { comics: [], maxPage: page };
            try {
                const url = `${this.baseUrl}/search?q=${encodeURIComponent(kw)}&page=${page}`;
                const html = await this.getBody(url);
                const comics = this.parseCards(html);
                if (comics.length === 0) return { comics: [], maxPage: page };
                return { comics: comics, maxPage: this.parseMaxPage(html, page) };
            } catch (e) {
                return { comics: [], maxPage: page };
            }
        },
    }

    // ---------- 详情 / 章节 ----------

    comic = {
        loadInfo: async (id) => {
            const cid = this.normalizeComicId(id);
            if (!cid) throw "Invalid comic id";
            let html = "";
            try {
                html = await this.getBody(this.baseUrl + "/comic/" + cid);
            } catch (e) {
                throw "Failed to load comic: " + e;
            }

            const og = (key) => {
                const m = html.match(new RegExp('<meta\\s+property="' + key + '"\\s+content="([^"]*)"'));
                return m ? this.decodeEntities(m[1]) : "";
            };

            const title = og("og:title");
            if (!title) throw "Comic not found";

            const cover = og("og:image");

            // JSON-LD ComicSeries：description 常为空串，缺失时回退 og:description
            let description = "";
            const ld = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
            if (ld) {
                try {
                    const obj = JSON.parse(ld[1]);
                    description = this.decodeEntities(obj.description || "");
                } catch (e) { /* 忽略 */ }
            }
            if (!description) description = og("og:description");

            // 作者：详情页作者栏是 /author/Xxx 链接
            const authors = [];
            const authorRe = /<a[^>]*href="\/author\/([^"]+)"/g;
            let am;
            while ((am = authorRe.exec(html)) !== null) {
                const name = this.decodeEntities(am[1]);
                if (name && !authors.includes(name)) authors.push(name);
            }

            // 分类：<span class="text-muted-foreground mr-2">分类:</span>XXX
            let genre = "";
            const gm = html.match(/分类:<\/span>\s*([^<]{1,40})/);
            if (gm) genre = this.decodeEntities(gm[1]).trim();

            // 标签与章节：来自 RSC flight
            const flight = this.extractFlight(html);

            const tags = {};
            if (authors.length > 0) tags["作者"] = authors;
            if (genre) tags["分类"] = [genre];
            const tagNames = [];
            const relBlock = flight.match(/"initialRelations":(\[[\s\S]*?\]),"variant"/);
            if (relBlock) {
                const re = /"tag":\{"id":\d+,"documentId":"[0-9a-z]+","name":"((?:[^"\\]|\\.)*)"\}/g;
                let tm;
                while ((tm = re.exec(relBlock[1])) !== null) {
                    let name = tm[1];
                    try { name = JSON.parse('"' + name + '"'); } catch (e) { }
                    name = this.decodeEntities(name).trim();
                    if (name && !tagNames.includes(name)) tagNames.push(name);
                }
            }
            if (tagNames.length > 0) tags["作品标签"] = tagNames;

            const chapters = new Map();
            const chBlock = flight.match(/"chapters":(\[[\s\S]*?\]),"comicSlug":"(MBS\d+)"/);
            if (chBlock && chBlock[2] === cid) {
                const re = /\{"id":(\d+),"documentId":"([0-9a-z]{24})","title":"((?:[^"\\]|\\.)*)","chapterNumber":(\d+)\}/g;
                let cm;
                const list = [];
                while ((cm = re.exec(chBlock[1])) !== null) {
                    let t = cm[3];
                    try { t = JSON.parse('"' + t + '"'); } catch (e) { }
                    list.push({
                        doc: cm[2],
                        title: this.decodeEntities(t).trim() || ("第 " + cm[4] + " 话"),
                        n: parseInt(cm[4], 10),
                    });
                }
                list.sort((a, b) => a.n - b.n);
                for (const c of list) {
                    if (!c.doc) continue;
                    chapters.set(c.doc, c.title);
                }
            }

            const updated = (html.match(/"dateModified":"([^"]+)"/) || [])[1] || "";

            return new ComicDetails({
                title: title,
                cover: cover,
                description: description,
                tags: tags,
                updateTime: updated,
                uploader: authors.length > 0 ? authors.join(", ") : "",
                chapters: chapters,
            });
        },

        loadEp: async (comicId, epId) => {
            const cid = this.normalizeComicId(comicId);
            const docId = this.normalizeEpId(epId);
            if (!cid || !docId) return { images: [] };

            let html = "";
            try {
                html = await this.getBody(`${this.baseUrl}/comic/${cid}/chapter/${docId}`);
            } catch (e) {
                return { images: [] };
            }

            const flight = this.extractFlight(html);
            // 站点直接下发 basePath 与线路 baseUrl，两种页名格式（MBSxxx-001 / 001-xxxxxxxxxx）都由站点给出，
            // 这里只做拼接，不自行推断路径规则。
            const block = flight.match(/"pages":(\[[\s\S]*?\]),"basePath":"([^"]*)","lines":(\[[\s\S]*?\]),"comicSlug":"(MBS\d+)"/);
            if (!block) return { images: [] };

            // 站点按 documentId 定位章节，URL 里的 slug 只被回显、不参与查询，
            // 因此图片一律以站点下发的 lines[0].baseUrl + basePath + pages[].f 拼成，不自行推断路径规则。
            // 约束：basePath 必须是 "{MBS数字}/chapter-{数字}"、baseUrl 必须是 https，防止串图或畸形请求。
            const basePath = block[2];
            if (!/^MBS\d+\/chapter-\d+$/.test(basePath)) return { images: [] };

            const lines = [...block[3].matchAll(/"baseUrl":"(https?:\\?\/\\?\/[^"]+)"/g)]
                .map((m) => m[1].replace(/\\?\//g, "/"));
            const baseUrl = lines.length > 0 ? lines[0] : "";
            if (!/^https:\/\/[^/\s"]+/.test(baseUrl)) return { images: [] };

            const images = [];
            const seen = new Set();
            const re = /\{"f":"([^"]+)"/g;
            let pm;
            while ((pm = re.exec(block[1])) !== null) {
                const f = pm[1];
                if (!f || seen.has(f)) continue;
                seen.add(f);
                images.push(`${baseUrl}/images/${basePath}/${f}`);
            }
            if (images.length === 0) return { images: [] };
            return { images: images };
        },

        // 正文图 CDN 无 Referer 时返回 403（已实测），必须带上站点 Referer。
        onImageLoad: (url, comicId, epId) => {
            const cid = this.normalizeComicId(comicId);
            const docId = this.normalizeEpId(epId);
            const referer = cid && docId
                ? `${this.baseUrl}/comic/${cid}/chapter/${docId}`
                : this.baseUrl + "/";
            return {
                headers: {
                    "Referer": referer,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                },
            };
        },

        onThumbnailLoad: (url) => {
            if (!url) return {};
            return {
                headers: {
                    "Referer": this.baseUrl + "/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                },
            };
        },
    }
}