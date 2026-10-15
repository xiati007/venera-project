class Wnacg extends ComicSource {
    // Note: The fields which are marked as [Optional] should be removed if not used

    // name of the source
    name = "紳士漫畫"

    // unique id of the source
    key = "wnacg"

    // v1.2.0：
    // 1) 排行榜时间筛选新增「今年」(type=year)，URL 形态 albums-favorite_ranking-type-year[-cate-N].html
    //    （已取证：type-year-cate.html = 本年，type-year-cate-5.html = 本年+同人誌，分页 page-N-type-year-cate-5.html）
    // 2) 合集（多章节）适配：photos-index-page-1-aid-{合集id}.html 实际返回「章節目錄」页，
    //    旧实现按单话解析且 loadEp 用合集 id 取图，导致合集无法阅读。
    //    现在 loadInfo 解析章節目錄为 chapters，loadEp 按章节自身 aid 取图。
    // 3) 详情页评论：站点评论区由 /statics/comment/comment.js 驱动，列表片段接口为
    //    GET /?ctl=comment&act=frag&aid={漫画id}&sort={hot|new}&page={N}（每页 10 条），
    //    主评论内嵌楼中楼回复（.plReplies .plRe）。新增 comic.loadComments。
    version = "1.3.0"

    minAppVersion = "1.0.0"

    // url（远程更新检测地址）：已删除，不使用远程更新，仅本地维护


    // 永久发布页（发布最新漫画域名）：主 + 备用
    landingPage = "https://wnacg01.link/"
    backupLandingPage = "https://wnacg02.link/"
    // 默认漫画站域名（发布页都不可用时的回退）
    base = "https://www.wn001.cfd"

    get baseUrl() {
        return this.base
    }

    /**
     * 从永久发布页提取最新漫画域名
     * @param body {string} 发布页 HTML
     * @returns {string} 提取到的域名，失败返回空串
     */
    extractDomainFromLanding(body) {
        let doc = new HtmlDocument(body)
        let domain = ""
        doc.querySelectorAll("a").forEach(a => {
            if (domain) return
            let href = a.attributes["href"] || ""
            // 匹配 wn0xx.cfd / wnacg0x.cfd 系列漫画域名（排除发布页自身 wnacg0x.link）
            let m = href.match(/https?:\/\/((?:www\.)?wn(?:acg)?\d*\.(?:cfd|com))[^\/\s"'<>]*/)
            if (m && !/\.link$/i.test(m[1])) domain = m[1]
        })
        doc.dispose()
        return domain
    }

    /**
     * 确保域名已解析（缓存 24 小时，惰性执行）
     */
    async ensureDomain() {
        if (this._domainResolved) return
        this._domainResolved = true

        let cached = this.loadData("resolved_domain")
        if (cached) {
            try {
                let obj = JSON.parse(cached)
                if (obj.domain && (!obj.t || (Date.now() - obj.t) < 24 * 3600 * 1000)) {
                    this.base = "https://" + obj.domain
                    return
                }
            } catch (e) { }
        }

        // 依次尝试主发布页和备用发布页，取第一个成功的域名
        let pages = [this.landingPage, this.backupLandingPage]
        for (let i = 0; i < pages.length; i++) {
            try {
                let res = await Network.get(pages[i], this.pageHeaders())
                if (res.status !== 200) continue
                let domain = this.extractDomainFromLanding(res.body)
                if (domain) {
                    this.base = "https://" + domain
                    this.saveData("resolved_domain", JSON.stringify({
                        t: Date.now(),
                        domain: domain
                    }))
                    return
                }
            } catch (e) {
                // 当前发布页不可用，尝试下一个
            }
        }
        // 发布页都不可用，保持默认域名
    }

    /**
     * 页面请求头：固定桌面 UA，确保拿到桌面版页面结构
     */
    pageHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        }
    }

    // [Optional] account related
    account = {
        /**
         * login, return any value to indicate success
         * @param account {string}
         * @param pwd {string}
         * @returns {Promise<any>}
         */
        login: async (account, pwd) => {
            let res = await Network.post(
                `${this.baseUrl}/users-check_login.html`,
                { ...this.pageHeaders(), 'content-type': 'application/x-www-form-urlencoded' },
                `login_name=${encodeURIComponent(account)}&login_pass=${encodeURIComponent(pwd)}`
            )
            if (res.status !== 200) {
                throw 'Login failed'
            }
            let json = JSON.parse(res.body)
            if (json['html'].includes('登錄成功')) {
                return 'ok'
            }
            throw 'Login failed'
        },

        /**
         * logout function, clear account related data
         */
        logout: () => {
            Network.deleteCookies(this.baseUrl)
        },

        // {string?} - register url
        registerWebsite: null
    }

    async init() {
        await this.ensureDomain()
    }

    /**
     * 刷新域名：清除缓存并从永久发布页重新拉取最新域名
     * @returns {string} 提示信息
     */
    async refreshDomain() {
        this.deleteData("resolved_domain")
        this._domainResolved = false
        await this.ensureDomain()
        return "已刷新，当前域名: " + this.base
    }

    parseComic(c) {
        let link = c.querySelector("div.pic_box > a").attributes["href"];
        let id = RegExp("(?<=-aid-)[0-9]+").exec(link)[0];
        let image =
            c.querySelector("div.pic_box > a > img").attributes["src"];
        image = `https:${image}`;
        let name = c.querySelector("div.info > div.title > a").text;
        let info = c.querySelector("div.info > div.info_col").text.trim();
        info = info.replaceAll('\n', '');
        info = info.replaceAll('\t', '');
        return new Comic({
            id: id,
            title: name,
            cover: image,
            description: info,
        })
    }

    /**
     * 章节参数标准化：把历史/不同形态的 epId 统一还原为 { aid, sid }
     * - 纯章节 ID：            "364284"                              -> aid=364284
     * - 章节阅读页完整 URL：    ".../photos-slide-aid-364284-sid-390977.html" -> aid=364284, sid=390977
     * - 组合 ID：              "390977|364284" / "390977-364284"     -> aid=364284, sid=390977
     * - 对象参数：             { epId: ... } / { chapterId: ... } / { url: ... }
     * - 非法/缺失/疑似页码：    返回 null，调用方回退到漫画自身 ID，且不发出畸形请求
     * @param epId {any}
     * @returns {{aid: string, sid: string|null}|null}
     */
    normalizeEpId(epId) {
        if (epId === null || epId === undefined) return null
        if (typeof epId === 'object') {
            return this.normalizeEpId(epId.epId || epId.chapterId || epId.id || epId.url)
        }
        let s = String(epId).trim()
        if (!s) return null

        let aid = null
        let sid = null
        let aidMatch = s.match(/aid-(\d+)/i)
        let sidMatch = s.match(/sid-(\d+)/i)
        if (aidMatch) aid = aidMatch[1]
        if (sidMatch) sid = sidMatch[1]

        if (!aid) {
            let nums = s.match(/\d+/g) || []
            if (nums.length === 1) {
                aid = nums[0]
            } else if (nums.length >= 2) {
                // 组合串：前面是漫画/合集 ID，最后一段是章节 ID
                aid = nums[nums.length - 1]
                sid = nums[0]
            }
        }
        // wnacg 的 aid 为多位数字；一位/两位数字多为页码类脏值，按非法处理
        if (!aid || aid.length < 4) return null
        return { aid: aid, sid: sid }
    }

    /**
     * 从阅读页响应中提取正文图片 URL
     * 阅读页（photos-gallery-* / photos-slide-*）用 document.writeln 输出 <img>，图片为 CDN 绝对/协议相对地址
     * @param body {string}
     * @returns {string[]}
     */
    extractImages(body) {
        if (!body) return []
        let images = []
        let seen = {}
        let re = /(?:https?:)?\/\/[^\s"'<>()\\]+?\.(?:jpg|jpeg|png|webp|gif|bmp|avif)(?:\?[^\s"'<>()\\]*)?/gi
        let m
        while ((m = re.exec(body)) !== null) {
            let url = m[0].replace(/&amp;/g, '&')
            // 站点主题资源、头像、占位图不是正文
            if (/\/(themes|userpic)\//i.test(url)) continue
            if (!/^https?:\/\//i.test(url)) url = 'https:' + url
            if (seen[url]) continue
            seen[url] = true
            images.push(url)
        }
        return images
    }

    /**
     * 相对地址补全为绝对地址（站点存在 `/xxx` 与 `xxx` 两种相对写法）
     * @param p {string}
     * @returns {string}
     */
    absoluteUrl(p) {
        if (!p) return ""
        if (/^https?:\/\//i.test(p)) return p
        if (p.startsWith("//")) return "https:" + p
        if (p.startsWith("/")) return this.baseUrl + p
        return this.baseUrl + "/" + p
    }

    /**
     * 安全取节点文本：节点或文本缺失时返回空串，避免整条评论解析失败
     * @param node
     * @param selector {string}
     * @returns {string}
     */
    nodeText(node, selector) {
        let el = node.querySelector(selector)
        if (!el) return ""
        return (el.text || "").replace(/\s+/g, " ").trim()
    }

    /**
     * 评论片段中的一条主评论 -> Venera Comment
     * @param node {HtmlNode} div.plItem
     * @param page {number} 当前页，用于生成可回查的评论 id
     */
    parseComment(node, page) {
        let avatarNode = node.querySelector("img.plAv")
        let likes = Number(this.nodeText(node, "div.plBody > div.plMeta > a.plUp > i")) || 0
        return new Comment({
            id: `${node.attributes["data-id"] || ""}//${page}`,
            userName: this.nodeText(node, "div.plBody > div.plHead > span.plName") || "匿名",
            avatar: avatarNode ? this.absoluteUrl(avatarNode.attributes["src"] || "") : "",
            content: this.nodeText(node, "div.plBody > div.plText"),
            time: this.nodeText(node, "div.plBody > div.plHead > span.plTime"),
            // likeCount 与 score 是既有源中同时存在的两种点赞字段名，一并提供以兼容不同版本
            likeCount: likes,
            score: likes,
            replyCount: node.querySelectorAll("div.plReplies div.plRe").length,
        })
    }

    /**
     * 主评论内嵌的楼中楼回复 -> Venera Comment 列表
     * `.plReHot` 与 `.plReFull` 可能包含重复条目，按 data-id 去重
     * @param node {HtmlNode} div.plItem
     * @param page {number}
     */
    parseReplies(node, page) {
        let replies = []
        let seen = {}
        let nodes = node.querySelectorAll("div.plReplies div.plRe")
        for (let i = 0; i < nodes.length; i++) {
            let r = nodes[i]
            let id = r.attributes["data-id"] || ""
            if (!id || seen[id]) continue
            seen[id] = true
            let avatarNode = r.querySelector("img.plReAv")
            let likes = Number(this.nodeText(r, "div.plReBody > div.plMeta > a.plUp > i")) || 0
            replies.push(new Comment({
                id: `${id}//${page}`,
                userName: this.nodeText(r, "div.plReBody > div.plHead > span.plName") || "匿名",
                avatar: avatarNode ? this.absoluteUrl(avatarNode.attributes["src"] || "") : "",
                content: this.nodeText(r, "div.plReBody > div.plText"),
                time: this.nodeText(r, "div.plReBody > div.plHead > span.plTime"),
                likeCount: likes,
                score: likes,
                replyCount: 0,
            }))
        }
        return replies
    }

    // explore page list
    explore = [
        {
            // title of the page.
            // title is used to identify the page, it should be unique
            title: "紳士漫畫",

            /// multiPartPage or multiPageComicList or mixed
            type: "multiPartPage",

            /**
             * load function
             * @param page {number | null} - page number, null for `singlePageWithMultiPart` type
             * @returns {{}}
             * - for `multiPartPage` type, return [{title: string, comics: Comic[], viewMore: string?}]
             * - for `multiPageComicList` type, for each page(1-based), return {comics: Comic[], maxPage: number}
             * - for `mixed` type, use param `page` as index. for each index(0-based), return {data: [], maxPage: number?}, data is an array contains Comic[] or {title: string, comics: Comic[], viewMore: string?}
             */
            load: async (page) => {
                await this.ensureDomain()
                let res = await Network.get(this.baseUrl, this.pageHeaders())
                if (res.status !== 200) {
                    throw `Invalid Status Code ${res.status}`
                }
                let document = new HtmlDocument(res.body)
                let titleBlocks = document.querySelectorAll("div.title_sort");
                let comicBlocks = document.querySelectorAll("div.bodywrap");
                if (titleBlocks.length !== comicBlocks.length) {
                    throw "Invalid Page"
                }
                let result = []
                for (let i = 0; i < titleBlocks.length; i++) {
                    let title = titleBlocks[i].querySelector("div.title_h2").text.replaceAll(/\s+/g, '')
                    let link = titleBlocks[i].querySelector("div.r > a").attributes["href"]
                    let comics = []
                    let comicBlock = comicBlocks[i]
                    let comicElements = comicBlock.querySelectorAll("div.gallary_wrap > ul.cc > li")
                    for (let comicElement of comicElements) {
                        comics.push(this.parseComic(comicElement))
                    }
                    result.push({
                        title: title,
                        comics: comics,
                        viewMore: `category:${title}@${link}`
                    })
                }
                document.dispose()
                return result
            }
        }
    ]

    // categories
    category = {
        /// title of the category page, used to identify the page, it should be unique
        title: "紳士漫畫",
        parts: [
            {
                // title of the part
                name: "排行榜",

                // fixed or random
                type: "fixed",

                // number of comics to display at the same time
                categories: ["排行榜"],

                // category or search
                // if `category`, use categoryComics.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: ["rank"],
            },
            {
                // title of the part
                name: "最新",

                // fixed or random
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                type: "fixed",

                // number of comics to display at the same time
                // randomNumber: 5,

                categories: ["最新"],

                // category or search
                // if `category`, use categoryComics.load to load comics
                // if `search`, use search.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: ["/albums.html"],

                // [Optional] {string} cannot be used with `categoryParams`, set all category params to this value
                groupParam: null,
            },
            {
                // title of the part
                name: "同人誌",

                // fixed or random
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                type: "fixed",

                // number of comics to display at the same time
                // randomNumber: 5,

                categories: ["同人誌", "漢化", "日語", "English", "CG畫集", "3D漫畫", "寫真Cosplay"],

                // category or search
                // if `category`, use categoryComics.load to load comics
                // if `search`, use search.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: [
                    "/albums-index-cate-5.html",
                    "/albums-index-cate-1.html",
                    "/albums-index-cate-12.html",
                    "/albums-index-cate-16.html",
                    "/albums-index-cate-2.html",
                    "/albums-index-cate-22.html",
                    "/albums-index-cate-3.html",
                ],

                // [Optional] {string} cannot be used with `categoryParams`, set all category params to this value
                groupParam: null,
            },
            {
                // title of the part
                name: "單行本",

                // fixed or random
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                type: "fixed",

                // number of comics to display at the same time
                // randomNumber: 5,

                categories: ["單行本", "漢化", "日語", "English",],

                // category or search
                // if `category`, use categoryComics.load to load comics
                // if `search`, use search.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: [
                    "/albums-index-cate-6.html",
                    "/albums-index-cate-9.html",
                    "/albums-index-cate-13.html",
                    "/albums-index-cate-17.html",
                ],

                // [Optional] {string} cannot be used with `categoryParams`, set all category params to this value
                groupParam: null,
            },
            {
                // title of the part
                name: "雜誌短篇",

                // fixed or random
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                type: "fixed",

                // number of comics to display at the same time
                // randomNumber: 5,

                categories: ["雜誌短篇", "漢化", "日語", "English",],

                // category or search
                // if `category`, use categoryComics.load to load comics
                // if `search`, use search.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: [
                    "/albums-index-cate-7.html",
                    "/albums-index-cate-10.html",
                    "/albums-index-cate-14.html",
                    "/albums-index-cate-18.html",
                ],

                // [Optional] {string} cannot be used with `categoryParams`, set all category params to this value
                groupParam: null,
            },
            {
                // title of the part
                name: "韓漫",

                // fixed or random
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                type: "fixed",

                // number of comics to display at the same time
                // randomNumber: 5,

                categories: ["韓漫", "漢化", "生肉",],

                // category or search
                // if `category`, use categoryComics.load to load comics
                // if `search`, use search.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: [
                    "/albums-index-cate-19.html",
                    "/albums-index-cate-20.html",
                    "/albums-index-cate-21.html",
                ],

                // [Optional] {string} cannot be used with `categoryParams`, set all category params to this value
                groupParam: null,
            },
        ],
        // enable ranking page (榜单已作为独立分类入口，故关闭系统排行页)
        enableRankingPage: false,
    }

    /// category comic loading related
    categoryComics = {
        /**
         * load comics of a category
         * @param category {string} - category name
         * @param param {string?} - category param
         * @param options {string[]} - options from optionList
         * @param page {number} - page number
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        load: async (category, param, options, page) => {
            await this.ensureDomain()
            // 排行榜分类：param === "rank"
            if (param === "rank") {
                return await this.loadRankOptions(options, page)
            }
            let url = this.baseUrl + param
            if (page !== 0) {
                if (!url.includes("-")) {
                    url = url.replaceAll(".html", "-.html");
                }
                url = url.replaceAll("index", "");
                let lr = url.split("albums-");
                lr[1] = `index-page-${page}${lr[1]}`;
                url = `${lr[0]}albums-${lr[1]}`;
            }

            let res = await Network.get(url, this.pageHeaders())
            if (res.status !== 200) {
                throw `Invalid Status Code ${res.status}`
            }
            let document = new HtmlDocument(res.body)
            let comicElements = document.querySelectorAll("div.grid div.gallary_wrap > ul.cc > li")
            let comics = []
            for (let comicElement of comicElements) {
                comics.push(this.parseComic(comicElement))
            }
            let pagesLink = document.querySelectorAll("div.f_left.paginator > a");
            let pages = Number(pagesLink[pagesLink.length - 1].text)
            document.dispose()
            return {
                comics: comics,
                maxPage: pages,
            }
        },
        optionList: [
            {
                // 时间筛选：今日/本周/本月/今年，仅在排行榜分类显示
                // 站点真实路由：albums-favorite_ranking-type-{day|week|month|year}[-cate-N].html
                label: "時間",
                type: "select",
                showWhen: ["排行榜"],
                options: [
                    "day-今日",
                    "week-本周",
                    "month-本月",
                    "year-今年",
                ],
            },
            {
                // 分类筛选：仅排行榜分类显示
                label: "分類",
                type: "select",
                showWhen: ["排行榜"],
                options: [
                    "0-全部",
                    "5-同人誌",
                    "1-同人誌·漢化",
                    "12-同人誌·日語",
                    "16-同人誌·English",
                    "2-CG畫集",
                    "37-AI圖集",
                    "22-3D漫畫",
                    "3-寫真Cosplay",
                    "6-單行本",
                    "9-單行本·漢化",
                    "13-單行本·日語",
                    "17-單行本·English",
                    "7-雜誌短篇",
                    "10-雜誌短篇·漢化",
                    "14-雜誌短篇·日語",
                    "18-雜誌短篇·English",
                    "19-韓漫",
                    "20-韓漫·漢化",
                    "21-韓漫·生肉",
                    "38-韓漫·合集",
                    "23-3D漫畫·漢化",
                    "24-3D漫畫·其他",
                ],
            },
        ],
    }

    /**
     * 加载排行榜：options 为 [時間, 分類]，分别拼进 URL
     * @param options {string[]}
     * @param page {number}
     * @returns {Promise<{comics: Comic[], maxPage: number}>}
     */
    async loadRankOptions(options, page) {
        const opts = Array.isArray(options) ? options : []
        let time = opts[0] || "day"
        let cate = opts[1] || ""   // "0" 表示全部或不筛选
        if (cate === "0") cate = ""

        let cateStr = cate ? `-cate-${cate}` : ""
        let url = `${this.baseUrl}/albums-favorite_ranking-type-${time}${cateStr}.html`
        if (page !== 0) {
            url = `${this.baseUrl}/albums-favorite_ranking-page-${page}-type-${time}${cateStr}.html`
        }

        let res = await Network.get(url, this.pageHeaders())
        if (res.status !== 200) {
            throw `Invalid Status Code ${res.status}`
        }
        let document = new HtmlDocument(res.body)
        let comicElements = document.querySelectorAll("div.grid div.gallary_wrap > ul.cc > li")
        let comics = []
        for (let comicElement of comicElements) {
            comics.push(this.parseComic(comicElement))
        }
        let pagesLink = document.querySelectorAll("div.f_left.paginator > a")
        let pages = 1
        if (pagesLink.length > 0) {
            pages = Number(pagesLink[pagesLink.length - 1].text)
        }
        document.dispose()
        return {
            comics: comics,
            maxPage: pages,
        }
    }

    /// search related
    search = {
        /**
         * load search result
         * @param keyword {string}
         * @param options {string[]} - options from optionList
         * @param page {number}
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        load: async (keyword, options, page) => {
            await this.ensureDomain()
            let url = `${this.baseUrl}/search/?q=${encodeURIComponent(keyword)}&f=_all&s=create_time_DESC&syn=yes`
            if (page !== 0) {
                url += `&p=${page}`
            }
            let res = await Network.get(url, this.pageHeaders())
            if (res.status !== 200) {
                throw `Invalid Status Code ${res.status}`
            }
            let document = new HtmlDocument(res.body)
            let comicElements = document.querySelectorAll("div.grid div.gallary_wrap > ul.cc > li")
            let comics = []
            for (let comicElement of comicElements) {
                comics.push(this.parseComic(comicElement))
            }
            let total = document.querySelectorAll("p.result > b")[0].text.replaceAll(',', '')
            const comicsPerPage = 24
            let pages = Math.ceil(Number(total) / comicsPerPage)
            document.dispose()
            return {
                comics: comics,
                maxPage: pages,
            }
        },
    }

    // favorite related
    favorites = {
        // whether support multi folders
        multiFolder: true,
        isOldToNewSort: true,
        /**
         * add or delete favorite.
         * throw `Login expired` to indicate login expired, App will automatically re-login and re-add/delete favorite
         * @param comicId {string}
         * @param folderId {string}
         * @param isAdding {boolean} - true for add, false for delete
         * @param favoriteId {string?} - [Comic.favoriteId]
         * @returns {Promise<any>} - return any value to indicate success
         */
        addOrDelFavorite: async (comicId, folderId, isAdding, favoriteId) => {
            await this.ensureDomain()
            if (!isAdding) {
                let res = await Network.get(`${this.baseUrl}/users-fav_del-id-${favoriteId}.html?ajax=true&_t=${randomDouble(0, 1)}`, this.pageHeaders())
                if (res.status !== 200) {
                    throw 'Delete failed'
                }
            } else {
                let res = await Network.post(`${this.baseUrl}/users-save_fav-id-${comicId}.html`, {
                    ...this.pageHeaders(), 'content-type': 'application/x-www-form-urlencoded'
                }, `favc_id=${folderId}`)
                if (res.status !== 200) {
                    throw 'Delete failed'
                }
            }
            return 'ok'
        },
        /**
         * load favorite folders.
         * throw `Login expired` to indicate login expired, App will automatically re-login retry.
         * if comicId is not null, return favorite folders which contains the comic.
         * @param comicId {string?}
         * @returns {Promise<{folders: {[p: string]: string}, favorited: string[]}>} - `folders` is a map of folder id to folder name, `favorited` is a list of folder id which contains the comic
         */
        loadFolders: async (comicId) => {
            await this.ensureDomain()
            let res = await Network.get(`${this.baseUrl}/users-addfav-id-210814.html`, this.pageHeaders())
            if (res.status !== 200) {
                throw 'Load failed'
            }
            let document = new HtmlDocument(res.body)
            let data = {}
            document.querySelectorAll("option").forEach((option => {
                if (option.attributes["value"] === "") return
                data[option.attributes["value"]] = option.text
            }))
            return {
                folders: data,
                favorited: []
            }
        },
        /**
         * add a folder
         * @param name {string}
         * @returns {Promise<any>} - return any value to indicate success
         */
        addFolder: async (name) => {
            await this.ensureDomain()
            let res = await Network.post(`${this.baseUrl}/users-favc_save-id.html`, {
                ...this.pageHeaders(), 'content-type': 'application/x-www-form-urlencoded'
            }, `favc_name=${encodeURIComponent(name)}`)
            if (res.status !== 200) {
                throw 'Add failed'
            }
            return 'ok'
        },
        /**
         * delete a folder
         * @param folderId {string}
         * @returns {Promise<void>} - return any value to indicate success
         */
        deleteFolder: async (folderId) => {
            await this.ensureDomain()
            let res = await Network.get(`${this.baseUrl}/users-favclass_del-id-${folderId}.html?ajax=true&_t=${randomDouble()}`, this.pageHeaders())
            if (res.status !== 200) {
                throw 'Delete failed'
            }
            return 'ok'
        },
        /**
         * load comics in a folder
         * throw `Login expired` to indicate login expired, App will automatically re-login retry.
         * @param page {number}
         * @param folder {string?} - folder id, null for non-multi-folder
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        loadComics: async (page, folder) => {
            await this.ensureDomain()
            let url = `${this.baseUrl}/users-users_fav-page-${page}-c-${folder}.html.html`
            let res = await Network.get(url, this.pageHeaders())
            if (res.status !== 200) {
                throw `Invalid Status Code ${res.status}`
            }
            let document = new HtmlDocument(res.body)
            let comicBlocks = document.querySelectorAll("div.asTB")
            let comics = comicBlocks.map((comic) => {
                let cover = comic.querySelector("div.asTBcell.thumb > div > img").attributes["src"]
                cover = 'https:' + cover
                let time = comic.querySelector("div.box_cel.u_listcon > p.l_catg > span").text.replaceAll("創建時間：", "")
                let name = comic.querySelector("div.box_cel.u_listcon > p.l_title > a").text;
                let link = comic.querySelector("div.box_cel.u_listcon > p.l_title > a").attributes["href"];
                let id = RegExp("(?<=-aid-)[0-9]+").exec(link)[0];
                let info = comic.querySelector("div.box_cel.u_listcon > p.l_detla").text;
                let pages = Number(RegExp("(?<=頁數：)[0-9]+").exec(info)[0])
                let delUrl = comic.querySelector("div.box_cel.u_listcon > p.alopt > a").attributes["onclick"];
                let favoriteId = RegExp("(?<=del-id-)[0-9]+").exec(delUrl)[0];
                return new Comic({
                    id: id,
                    title: name,
                    subtitle: time,
                    cover: cover,
                    pages: pages,
                    favoriteId: favoriteId,
                })
            })
            let pages = 1
            let pagesLink = document.querySelectorAll("div.f_left.paginator > a")
            if (pagesLink.length > 0) {
                pages = Number(pagesLink[pagesLink.length - 1].text)
            }
            document.dispose()
            return {
                comics: comics,
                maxPage: pages,
            }
        }
    }

    /// single comic related
    comic = {
        /**
         * load comic info
         * @param id {string}
         * @returns {Promise<ComicDetails>}
         */
        loadInfo: async (id) => {
            await this.ensureDomain()
            // 单话与合集共用同一详情路由：
            // - 单话：返回该话详情 + 缩略图分页（photos-index-page-N-aid-{id}.html 可用）
            // - 合集：返回「章節目錄」，每一话为 photos-slide-aid-{章节id}-sid-{合集id}.html
            let res = await Network.get(`${this.baseUrl}/photos-index-page-1-aid-${id}.html`, this.pageHeaders())
            if (res.status !== 200) {
                throw `Invalid Status Code ${res.status}`
            }
            let document = new HtmlDocument(res.body)
            let title = document.querySelector("div.userwrap > h2").text
            let cover = document.querySelector("div.userwrap > div.asTB > div.asTBcell.uwthumb > img").attributes["src"]
            cover = 'https:' + cover
            cover = cover.substring(0, 6) + cover.substring(8)
            let labels = document.querySelectorAll("div.asTBcell.uwconn > label")
            let category = labels[0].text.split("：")[1]
            // 单话为「頁數：53P」，合集为「章節：N 話」，位置不固定，按标签名取值
            let pages = ""
            let chapterCount = ""
            for (let i = 0; i < labels.length; i++) {
                let text = labels[i].text
                if (text.startsWith("頁數")) {
                    pages = text.split("：")[1] || ""
                } else if (text.startsWith("章節")) {
                    chapterCount = text.split("：")[1] || ""
                }
            }
            if (!pages && !chapterCount && labels.length > 1) {
                // 兜底：保持旧版按位置取值的兼容行为
                pages = labels[1].text.split("：")[1] || ""
            }

            // 章节目录：合集详情页把每一话列成 photos-slide-aid-{章节id}-sid-{合集id}.html
            // 「開始閱讀」「下拉閱讀」等按钮为同一 URL 形态，用已知 UI 文案排除，并按 aid 去重
            const uiTexts = ["開始閱讀", "开始阅读", "下拉閱讀", "下拉阅读", "加入書架", "加入书架", "列表", "縮略圖", "缩略图"]
            let chapters = new Map()
            const collectChapters = (doc) => {
                let links = doc.querySelectorAll("a")
                for (let i = 0; i < links.length; i++) {
                    let href = links[i].attributes["href"] || ""
                    let m = href.match(/photos-slide-aid-(\d+)-sid-(\d+)\.html/)
                    if (!m) continue
                    if (chapters.has(m[1])) continue
                    let name = (links[i].text || "").replace(/\s+/g, " ").trim()
                    if (!name || uiTexts.indexOf(name) >= 0) continue
                    chapters.set(m[1], name)
                }
            }
            collectChapters(document)

            // 章节目录本身会分页：photos-index-aid-{合集id}-page-{N}.html（每页 12 话）
            // 只抓第一页会漏掉后续章节，这里按目录分页链接补齐（有上限，单页失败不影响已解析部分）
            const MAX_CHAPTER_PAGE = 50
            if (chapters.size > 0) {
                let maxChapterPage = 1
                let pageLinkNodes = document.querySelectorAll("a")
                for (let i = 0; i < pageLinkNodes.length; i++) {
                    let m = (pageLinkNodes[i].attributes["href"] || "").match(/photos-index-aid-\d+-page-(\d+)\.html/)
                    if (!m) continue
                    let p = Number(m[1])
                    if (p > maxChapterPage && p <= MAX_CHAPTER_PAGE) maxChapterPage = p
                }
                for (let p = 2; p <= maxChapterPage; p++) {
                    try {
                        let pageRes = await Network.get(`${this.baseUrl}/photos-index-aid-${id}-page-${p}.html`, this.pageHeaders())
                        if (pageRes.status !== 200) continue
                        let pageDoc = new HtmlDocument(pageRes.body)
                        collectChapters(pageDoc)
                        pageDoc.dispose()
                    } catch (e) {
                        // 目录某一页失败时保留已解析的章节，不整体失败
                    }
                }
            }

            let tagsDom = document.querySelectorAll("a.tagshow");
            let tags = new Map()
            if (pages) {
                tags.set("頁數", [pages])
            }
            if (chapterCount) {
                tags.set("章節", [chapterCount])
            }
            tags.set("分類", [category])
            if (tagsDom.length > 0) {
                tags.set("標籤", tagsDom.map((e) => e.text))
            }
            let description = document.querySelector("div.asTBcell.uwconn > p").text;
            let uploader = document.querySelector("div.asTBcell.uwuinfo > a > p").text;
            document.dispose()

            let details = {
                id: id,
                title: title,
                cover: cover,
                tags: tags,
                description: description,
                uploader: uploader,
            }
            if (pages) {
                details.pages = pages
            }
            // 非空章节目录 = 合集漫画；单话漫画不设置 chapters，保持原有的直接阅读行为
            if (chapters.size > 0) {
                details.chapters = chapters
            }
            return new ComicDetails(details)
        },
        /**
         * [Optional] load thumbnails of a comic
         * @param id {string}
         * @param next {string | null | undefined} - next page token, null for first page
         * @returns {Promise<{thumbnails: string[], next: string?}>} - `next` is next page token, null for no more
         */
        loadThumbnails: async (id, next) => {
            await this.ensureDomain()
            next = next || '1'
            let res = await Network.get(`${this.baseUrl}/photos-index-page-${next}-aid-${id}.html`, this.pageHeaders());
            if (res.status !== 200) {
                throw `Invalid Status Code ${res.status}`
            }
            let document = new HtmlDocument(res.body)
            try {
                let thumbnails = document.querySelectorAll("div.pic_box.tb > a > img").map((e) => {
                    return 'https:' + e.attributes["src"]
                })
                // 合集漫画返回的是章節目錄页，没有缩略图列表：安全返回空，不再向下解析分页
                if (thumbnails.length === 0) {
                    return { thumbnails: [], next: null }
                }
                next = (Number(next) + 1).toString()
                let pagesLink = document.querySelector("div.f_left.paginator").children
                if (pagesLink[pagesLink.length - 1].classNames.includes("thispage")) {
                    next = null
                }
                return {
                    thumbnails: thumbnails,
                    next: next
                }
            } finally {
                document.dispose()
            }
        },
        /**
         * load images of a chapter
         * @param comicId {string}
         * @param epId {string?}
         * @returns {Promise<{images: string[]}>}
         */
        loadEp: async (comicId, epId) => {
            await this.ensureDomain()
            // 合集漫画：epId 是章节自身的 aid，必须用它取图；直接用合集 id 只会拿到目录页
            let norm = this.normalizeEpId(epId)
            let comicAid = String(comicId === null || comicId === undefined ? "" : comicId).replace(/\D/g, "")
            if (comicAid && comicAid.length < 4) comicAid = ""
            let aid = (norm && norm.aid) ? norm.aid : comicAid
            if (!aid) {
                return { images: [] }
            }
            let sid = (norm && norm.sid) ? norm.sid : null

            // 阅读页候选：画廊页为主（单话已验证可用），带 sid / 下拉页依次兜底
            let candidates = [`${this.baseUrl}/photos-gallery-aid-${aid}.html`]
            if (sid) {
                candidates.push(`${this.baseUrl}/photos-gallery-aid-${aid}-sid-${sid}.html`)
            }
            candidates.push(`${this.baseUrl}/photos-slide-aid-${aid}${sid ? `-sid-${sid}` : ""}.html`)

            let lastError = null
            let gotResponse = false
            for (let i = 0; i < candidates.length; i++) {
                try {
                    let res = await Network.get(candidates[i], this.pageHeaders())
                    if (res.status !== 200) {
                        lastError = `Invalid Status Code ${res.status}`
                        continue
                    }
                    gotResponse = true
                    let images = this.extractImages(res.body)
                    if (images.length > 0) {
                        return { images: images }
                    }
                } catch (e) {
                    // 当前候选不可用，尝试下一个
                    lastError = e
                }
            }
            // 所有候选都请求失败时保留错误；页面正常但没有图片则安全返回空数组
            if (!gotResponse && lastError) {
                throw lastError
            }
            return { images: [] }
        },
        /**
         * [Optional] load comments
         * 站点评论区由 /statics/comment/comment.js 驱动：
         *   列表片段 GET /?ctl=comment&act=frag&aid={漫画id}&sort={hot|new}&page={N}（每页 10 条）
         *   主评论 id 编码为 "{评论id}//{页码}"，replyTo 时可直接定位到所属页
         * @param comicId {string}
         * @param subId {string?} - ComicDetails.subId
         * @param page {number}
         * @param replyTo {string?} - 主评论 id，非空时返回该评论的楼中楼回复
         * @returns {Promise<{comments: Comment[], maxPage: number?}>}
         */
        loadComments: async (comicId, subId, page, replyTo) => {
            await this.ensureDomain()
            let targetId = null
            let currentPage = Number(page) > 0 ? Number(page) : 1
            if (replyTo) {
                let parts = String(replyTo).split("//")
                targetId = parts[0]
                let p = Number(parts[1])
                if (p > 0) currentPage = p
            }

            // 站点默认排序为 hot（热门），评论片段每页 10 条
            let url = `${this.baseUrl}/?ctl=comment&act=frag&aid=${encodeURIComponent(comicId)}&sort=hot&page=${currentPage}`
            let res = await Network.get(url, this.pageHeaders())
            if (res.status !== 200) {
                throw `Invalid Status Code ${res.status}`
            }
            let document = new HtmlDocument(res.body)
            try {
                let items = document.querySelectorAll("div.plItem")

                // 楼中楼：返回被回复主评论内嵌的回复（找不到时安全返回空）
                if (targetId) {
                    for (let i = 0; i < items.length; i++) {
                        if (items[i].attributes["data-id"] !== targetId) continue
                        return {
                            comments: this.parseReplies(items[i], currentPage),
                            maxPage: 1,
                        }
                    }
                    return { comments: [], maxPage: 1 }
                }

                let comments = []
                for (let i = 0; i < items.length; i++) {
                    comments.push(this.parseComment(items[i], currentPage))
                }
                return {
                    comments: comments,
                    // 片段接口不返回总数：满一页（10 条）说明可能还有下一页
                    maxPage: items.length >= 10 ? currentPage + 1 : currentPage,
                }
            } finally {
                document.dispose()
            }
        },
        /**
         * [Optional] Handle tag click event
         * @param namespace {string}
         * @param tag {string}
         * @returns {{action: string, keyword: string, param: string?}}
         */
        onClickTag: (namespace, tag) => {
            return {
                action: 'search',
                keyword: tag,
            }
        },
    }

    get settings() {
        return {
            refresh_domain: {
                title: "刷新域名",
                type: "callback",
                buttonText: "从永久发布页刷新最新域名",
                callback: () => this.refreshDomain()
            }
        }
    }

    translation = {
        'zh_CN': {
            '刷新域名': '刷新域名',
            '从永久发布页刷新最新域名': '从永久发布页刷新最新域名',
            'Day': '日',
            'Week': '周',
            'Month': '月',
            'Year': '年',
        },
        'zh_TW': {
            '刷新域名': '刷新域名',
            '从永久发布页刷新最新域名': '從永久發布頁刷新最新域名',
            'Day': '日',
            'Week': '周',
            'Month': '月',
            'Year': '年',
        },
    }
}
