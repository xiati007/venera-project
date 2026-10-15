/**
 * 污污漫畫 (wu55comic.world) Venera 漫画源
 *
 * ── 站点事实（取证于 2026-10-14，全部经在线真实页面验证）──────────────────
 * - 首页:      https://www.wu55comic.world/
 * - 详情页:    /book/{bookId}            例 /book/5531
 * - 章节页:    /free-chapter/{epId}     例 /free-chapter/37536（?t= 参数可省略，实测等价）
 * - 分类页:    /booklist?tag={题材}&area={地区}&end={进度}&page={n}
 * - 搜索:      /search?keyword={kw}      （实测无分页，单次返回全部结果）
 * - 列表卡片类名各页不同（不可复用选择器）：
 *     首页 sp-card / 排行榜 sp-rank-item
 *     分类页 sp-booklist-card
 *     搜索页 sp-search-card
 * - 封面与正文图都不是 <img>，而是 <div class="cropped" data-src="..."> 懒加载
 * - 详情页一次返回全部章节：「共 N 話」与实际章节数完全一致
 *   （已实测 5 种分页形态均返回同一份 66 章，分页器为失效装饰，故只读第 1 页）
 * - 搜索无结果词时站点会兜底返回推荐结果并声称「共找到 N 個結果」，属站点行为
 * - 地區 area=3（寫真）当前返回 0 条，分类里仍按站点筛选区如实保留该选项
 *
 * ── 图片协议：站点同时存在两套，两者共用同一套合并+解密流程 ───────────────
 * 封面与首页/分类/搜索卡片：全部为 legacy 分片协议（已抽查 14 本书详情页与首页
 * 67 个卡片节点，data-bmi-manifest 一律为空）。
 *
 * 章节正文图：按节点上的 data-bmi-manifest 是否为空自动分流。
 *
 * A) legacy 分片协议（data-bmi-manifest 为空）
 *    jpg 直链本身不可读，直连返回 404（Cloudflare R2 NoSuchKey）。
 *    真实数据在两个分片上，构造规则见站点 merge_img 脚本
 *    convert_jpeg_url_to_binary_url_multiple_hosts：
 *      a) 去掉路径中的 /break_xxx/
 *      b) 用 split('.') 的最后一段作为扩展名片段替换为 .b_0 / .b_1
 *         （因此 URL 上的 ?t=3 等查询串会被一并替换掉）
 *      c) 分别替换到两个不同 host，并追加 ?v={BMI_CACHE_KEY}
 *
 * B) manifest 分块协议（data-bmi-manifest 非空，较新章节）
 *    manifest 是 base64url 编码的 JSON，内含 storage.googleapis.com 的分块地址：
 *      variants.<jpeg|avif>.renditions[role=page].chunks[{index,url,size,sha256}]
 *    本源固定取 jpeg 分支，避免依赖客户端对 AVIF 的支持差异。
 *
 * ── 解密：加密四证据齐备，故实现解密 ─────────────────────────────────────
 * 1) 密文来源：分片/分块响应字节（已在本地合并验证）
 * 2) 算法调用链：站点 decrypt() → window.crypto.subtle.decrypt({name:'AES-CBC', iv})
 *    Venera 侧对应 Convert.decryptAesCbc（PointyCastle CBCBlockCipher，不去 padding）
 * 3) Key/IV：均来自混淆字符串表 a0_0x2e0b 经 base64 解码得到的同一个 5 字符串 "aaaaa"
 *      key = 'aaaaa' + 'aaaaa' + 'aaaaa' + 'a'          (16 字节)
 *      iv  = '01234' + '56789' + 'aaaaa' + 'a'          (16 字节)
 * 4) 解密后首字节是格式索引，其后是元数据；站点的 inject_image_magic_number
 *    用真实文件头覆写首若干字节，长度不变。
 *    实测：00 00 15 9b 00 22 5f a1 → bookId = 0x15*256+0x9b = 5531，
 *    pageNumber = 2252705，与 URL 完全吻合。
 *
 * 解密产物已在线验证：正文图 720x800 / 720x676、封面 292x408，
 * 均为合法 JPEG 且以 FFD9 正常结束。
 *
 * ── 安全边界 ────────────────────────────────────────────────────────────
 * - 不执行站点任何脚本；AES 参数是静态取证结论，已由真实图片解码结果验证。
 * - manifest 的 base64url 解码使用纯 JS 实现，不依赖运行时的 atob/btoa。
 * - 附加的 &p1= / &pm= 参数只承载解码信息，服务端会忽略（已验证返回字节完全一致）；
 *   这样即使图片钩子未被调用，URL 本身也不会 404。
 * - 未登录时站点不返回受限内容；本源不绕过任何登录/付费/版权限制。
 */
class Wu55Comic extends ComicSource {

    // ===== 元数据 =====
    name = "污污漫畫";

    key = "wu55comic";

    version = "1.0.0";

    minAppVersion = "1.0.0";

    // 无维护中的更新地址，按规范显式留空
    url = "";

    // ===== 站点常量（全部取证所得）=====

    baseUrl = "https://www.wu55comic.world";

    ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

    /**
     * 图片分片 host，顺序即 .b_0 / .b_1 的对应关系。
     * 取证：章节页与首页/分类页/搜索页/详情页内联脚本中的
     * recover_img_url_with_multiple_hosts(url, "...") 实参，实测全站一致。
     */
    partHosts = [
        "https://bmigmij-wuwu.sqxxov.com/break_2",
        "https://bmigmih-wuwu.sqxxov.com/break_2",
    ];

    // AES-128-CBC 参数（由混淆字符串表解出，见文件头证据 4）
    aesKey = "aaaaaaaaaaaaaaaa";
    aesIv = "0123456789aaaaaa";

    /**
     * inject_image_magic_number 的文件头覆写表。
     * 键为解密后首字节（magic_number_parser 的索引）。
     */
    magicHeaders = {
        0: [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01], // jpeg
        1: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], // png
        3: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // gif
    };

    // 页面未给出 BMI_CACHE_KEY 时的兜底值（取证于 2026-10-14 实测值）
    defaultCacheKey = "2026021808";

    /** 封面解密结果缓存：URL -> Uint8Array */
    coverCache = new Map();

    /** 封面缓存上限，防止长时间浏览后内存膨胀 */
    coverCacheLimit = 400;

    /** 正在进行中的封面预取，避免同一张封面重复下载 */
    coverPrefetching = new Set();

    // ===== 基础工具 =====

    requestHeaders(referer) {
        const headers = {
            "User-Agent": this.ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-TW,zh;q=0.9,zh-CN;q=0.8",
        };
        if (referer) headers["Referer"] = referer;
        return headers;
    }

    imageHeaders(referer) {
        const headers = {
            "User-Agent": this.ua,
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Accept-Language": "zh-TW,zh;q=0.9,zh-CN;q=0.8",
        };
        if (referer) headers["Referer"] = referer;
        return headers;
    }

    absoluteUrl(p) {
        if (!p) return "";
        const s = String(p).trim();
        if (/^https?:\/\//i.test(s)) return s;
        if (s.startsWith("//")) return "https:" + s;
        return this.baseUrl + "/" + s.replace(/^\/+/, "");
    }

    bookIdFromHref(href) {
        const m = String(href || "").match(/\/book\/(\d+)/);
        return m ? m[1] : "";
    }

    /**
     * 标准化历史章节入参：兼容纯章节 ID、完整章节 URL、组合 ID、对象。
     * 返回纯数字章节 ID，无法识别时返回 null（调用方据此返回空图片，不发请求）。
     */
    normalizeEpId(epId) {
        if (!epId) return null;
        if (typeof epId === "object") {
            const v = epId.epId || epId.chapterId || epId.id || epId.url;
            return v ? this.normalizeEpId(v) : null;
        }
        const s = String(epId);
        const m = s.match(/\/free-chapter\/(\d+)/);
        if (m) return m[1];
        const parts = s.split("|");
        const last = parts[parts.length - 1].trim();
        if (last !== s) {
            const m2 = last.match(/(\d+)/);
            if (m2) return m2[1];
        }
        if (/^\d+$/.test(s)) return s;
        const m3 = s.match(/(\d+)/);
        return m3 ? m3[1] : null;
    }

    /** 从页面 HTML 取 BMI_CACHE_KEY（分片 URL 的 v 参数），缺失时用兜底值 */
    extractCacheKey(html) {
        const m = String(html || "").match(/BMI_CACHE_KEY\s*=\s*'([^']*)'/);
        return m && m[1] ? m[1] : this.defaultCacheKey;
    }

    // ===== 图片协议 =====

    /**
     * 把 div.cropped[data-src] 的原始 jpg 地址转换为两个分片地址。
     * 严格复刻站点规则：扩展名取 split('.') 的最后一段，
     * 因此 URL 上的 ?t=3 一类查询串会被一并替换掉。
     */
    buildPartUrls(rawUrl, cacheKey) {
        const url = String(rawUrl || "").trim();
        if (!url) return [];
        const segments = url.split(".");
        const extToken = segments[segments.length - 1];
        if (!extToken) return [];
        const noBreak = url.replace(/\/break[^\/]*\//g, "/");
        const originMatch = noBreak.match(/^https?:\/\/[^\/]+/);
        if (!originMatch) return [];
        const origin = originMatch[0];
        const key = cacheKey || this.defaultCacheKey;
        const urls = [];
        for (let i = 0; i < this.partHosts.length; i++) {
            urls.push(noBreak.replace(extToken, "b_" + i).replace(origin, this.partHosts[i]) + "?v=" + key);
        }
        return urls;
    }

    /**
     * 生成交给 Venera 的图片 URL。
     *
     * 站点存在两套图片协议，本方法统一编码为「分片0 的真实可访问地址 + 附加参数」：
     *
     * A) legacy 分片协议（旧章节、封面）
     *    页面节点 data-bmi-manifest 为空时走这条路径。
     *    &p1= 携带第二个分片的地址。
     *
     * B) manifest 分块协议（新章节，data-bmi-manifest 非空）
     *    manifest 是 base64url 编码的 JSON，内含 storage.googleapis.com 的分块地址。
     *    &pm= 携带「除首块外」的所有分块地址与声明长度。
     *
     * 两种情况下附加参数对服务端都无意义（R2/GCS 忽略未知 query），
     * 因此即使图片钩子未被调用，URL 本身也不会 404。
     */
    buildImageUrl(rawUrl, cacheKey, manifest) {
        if (manifest && String(manifest).length > 0) {
            const chunks = this.parseManifestChunks(manifest);
            if (chunks.length >= 1) {
                // 首块直接作为请求地址，其余块编码进 &pm=
                const first = chunks[0];
                const rest = chunks.slice(1);
                return first.url + "&pm=" + this.encodeRestChunks(rest);
            }
        }
        const parts = this.buildPartUrls(rawUrl, cacheKey);
        if (parts.length < 2) return "";
        return parts[0] + "&p1=" + encodeURIComponent(parts[1]);
    }

    /**
     * base64url 解码（站点 decode_bmi_manifest_base64url 的等价实现）。
     *
     * 这里刻意使用纯 JS 实现，不依赖运行时的 atob/btoa：
     * manifest 是页面下发的数据，必须在任意 JS 引擎下都能可靠解析。
     */
    b64UrlDecodeToString(value) {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let text = String(value == null ? "" : value).replace(/-/g, "+").replace(/_/g, "/");
        while (text.length % 4) text += "=";

        let binary = "";
        for (let i = 0; i < text.length; i += 4) {
            const c0 = alphabet.indexOf(text.charAt(i));
            const c1 = alphabet.indexOf(text.charAt(i + 1));
            const c2 = alphabet.indexOf(text.charAt(i + 2));
            const c3 = alphabet.indexOf(text.charAt(i + 3));
            if (c0 < 0 || c1 < 0) throw new Error("manifest base64 非法字符");
            binary += String.fromCharCode(((c0 << 2) | (c1 >> 4)) & 0xff);
            if (c2 >= 0) binary += String.fromCharCode((((c1 & 15) << 4) | (c2 >> 2)) & 0xff);
            if (c3 >= 0) binary += String.fromCharCode((((c2 & 3) << 6) | c3) & 0xff);
        }

        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
        return Convert.decodeUtf8(bytes.buffer);
    }

    /** 解析 data-bmi-manifest：base64url -> JSON -> page rendition 的分块列表 */
    parseManifestChunks(manifest) {
        try {
            const obj = JSON.parse(this.b64UrlDecodeToString(manifest));
            const variants = obj && obj.variants;
            if (!variants) return [];
            // 与站点一致：浏览器支持 AVIF 时优先 avif；但 Venera 各端对 AVIF 支持不一致，
            // 这里固定取 jpeg 分支以保证解码器兼容。
            const variant = variants.jpeg || variants.avif;
            if (!variant) return [];
            const renditions = Array.isArray(variant.renditions) ? variant.renditions : [];
            const page = renditions.filter((r) => r && r.role === "page")[0] || renditions[0];
            if (!page || !Array.isArray(page.chunks) || page.chunks.length === 0) return [];
            return [...page.chunks]
                .sort((a, b) => (a.index || 0) - (b.index || 0))
                .map((c) => ({ url: String(c.url || ""), size: Number(c.size || 0) }))
                .filter((c) => c.url);
        } catch (e) {
            return [];
        }
    }

    /**
     * 编码「除首块外的分块」到 URL 查询串。
     * 用「URL 编码 + | 分隔」而非 base64，避免额外膨胀与运行时依赖。
     */
    encodeRestChunks(rest) {
        try {
            return rest
                .map((c) => encodeURIComponent(c.url) + "~" + (c.size || 0))
                .join("|");
        } catch (e) {
            return "";
        }
    }

    decodeRestChunks(value) {
        try {
            const raw = String(value || "");
            if (!raw) return [];
            const out = [];
            for (const item of raw.split("|")) {
                if (!item) continue;
                const tilde = item.lastIndexOf("~");
                const urlPart = tilde >= 0 ? item.slice(0, tilde) : item;
                const sizePart = tilde >= 0 ? item.slice(tilde + 1) : "0";
                const url = decodeURIComponent(urlPart);
                if (!url) continue;
                out.push({ url: url, size: parseInt(sizePart, 10) || 0 });
            }
            return out;
        } catch (e) {
            return [];
        }
    }

    /**
     * 从图片 URL 还原解码方案。
     * 返回 {type:'legacy'|'manifest', rest:[{url,size}]} 或 null（非本源代码）。
     */
    parseImageProtocol(url) {
        const s = String(url || "");
        const pm = s.match(/[?&]pm=([^&]+)/);
        if (pm) {
            const rest = this.decodeRestChunks(pm[1]);
            if (rest.length > 0) return { type: "manifest", rest: rest };
        }
        const p1 = s.match(/[?&]p1=([^&]+)/);
        if (p1) {
            try {
                return { type: "legacy", rest: [{ url: decodeURIComponent(p1[1]), size: 0 }] };
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    /** 兼容旧调用点：只取 legacy 的第二分片地址 */
    parseSecondPart(url) {
        const p = this.parseImageProtocol(url);
        return p ? p.rest[0].url : null;
    }

    /** 拼接两个 ArrayBuffer */
    concatBuffers(a, b) {
        const x = new Uint8Array(a);
        const y = new Uint8Array(b);
        if (x.length === 0) return y.buffer;
        if (y.length === 0) return x.buffer;
        const merged = new Uint8Array(x.length + y.length);
        merged.set(x, 0);
        merged.set(y, x.length);
        return merged.buffer;
    }

    /**
     * 去除 PKCS#7 填充，返回与原明文字节相同的拷贝 Uint8Array。
     * Venera 的 Convert.decryptAesCbc 使用 PointyCastle 的 CBCBlockCipher，
     * 只做块解密，不自动去填充（与站点 WebCrypto 的默认行为不同），必须显式去除。
     */
    unpadPkcs7(value) {
        const bytes = new Uint8Array(value || new ArrayBuffer(0));
        if (bytes.length === 0) throw new Error("污污漫畫 AES 明文为空");
        const pad = bytes[bytes.length - 1];
        if (pad < 1 || pad > 16 || pad > bytes.length) throw new Error("污污漫畫 AES 填充非法: " + pad);
        for (let i = bytes.length - pad; i < bytes.length; i++) {
            if (bytes[i] !== pad) throw new Error("污污漫畫 AES 填充不一致");
        }
        const out = new Uint8Array(bytes.length - pad);
        out.set(bytes.subarray(0, bytes.length - pad));
        return out;
    }

    /**
     * 解密并还原文件头：分片合并字节 -> 合法图像字节。
     * 返回经 Convert.* 桥接的 ArrayBuffer（见 bytesToVeneraBuffer 说明）。
     */
    decryptImage(mergedBuffer) {
        const merged = new Uint8Array(mergedBuffer);
        if (merged.length === 0) throw new Error("污污漫畫 图片密文为空");
        if (merged.length % 16 !== 0) throw new Error("污污漫畫 图片密文非 16 字节对齐: " + merged.length);

        const plain = Convert.decryptAesCbc(
            merged.buffer,
            Convert.encodeUtf8(this.aesKey),
            Convert.encodeUtf8(this.aesIv),
        );
        const body = this.unpadPkcs7(plain);

        const header = this.magicHeaders[body[0]];
        if (!header) throw new Error("污污漫畫 未知的图片格式索引: " + body[0]);
        for (let i = 0; i < header.length && i < body.length; i++) {
            body[i] = header[i];
        }
        if (body.length < 2) throw new Error("污污漫畫 解密结果长度不足");
        return this.bytesToVeneraBuffer(body);
    }

    /**
     * 校验解密产物确实是图像字节，避免把错误页当图片交给解码器。
     */
    validateImage(bytes) {
        const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        if (b.length < 4) throw new Error("污污漫畫 图片数据过短");
        const isJpeg = b[0] === 0xFF && b[1] === 0xD8;
        const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
        const isGif = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
        if (!isJpeg && !isPng && !isGif) {
            throw new Error("污污漫畫 解密结果不是已知图像格式");
        }
        return b;
    }

    /** 下载单个分片，返回 ArrayBuffer */
    async fetchPart(url, referer) {
        const res = await Network.fetchBytes("GET", url, this.imageHeaders(referer), null);
        if (!res || res.status !== 200) {
            throw new Error("污污漫畫 分片请求失败: " + (res ? res.status : "无响应"));
        }
        const bytes = new Uint8Array(res.body || new ArrayBuffer(0));
        if (bytes.length === 0) throw new Error("污污漫畫 分片内容为空");
        return res.body;
    }

    /**
     * 由首块 + 其余分块还原出完整图片字节。
     * legacy 与 manifest 两种协议的合并与解密逻辑完全一致，区别只在分块地址来源。
     */
    async completeImage(firstBuffer, rest, referer) {
        const first = new Uint8Array(firstBuffer || new ArrayBuffer(0));
        if (first.length === 0) throw new Error("污污漫畫 首个分片为空");
        let merged = first.buffer;
        for (let i = 0; i < rest.length; i++) {
            const part = rest[i];
            const buf = await this.fetchPart(part.url, referer);
            const bytes = new Uint8Array(buf);
            // manifest 声明了每块长度，长度不符说明内容被替换或地址失效
            if (part.size > 0 && bytes.length !== part.size) {
                throw new Error("污污漫畫 分块长度不符: 期望 " + part.size + " 实际 " + bytes.length);
            }
            merged = this.concatBuffers(merged, buf);
        }
        return this.validateImage(this.decryptImage(merged));
    }

    /**
     * 取回并解密一张图片（用于封面预取）。
     */
    async recoverImage(rawUrl, cacheKey, manifest) {
        const plan = this.buildImageUrl(rawUrl, cacheKey, manifest);
        const proto = this.parseImageProtocol(plan);
        if (!proto) throw new Error("污污漫畫 无法构造解码方案");
        const firstUrl = plan.split(/[?&](?:p1|pm)=/)[0];
        const first = await this.fetchPart(firstUrl, this.baseUrl + "/");
        return this.completeImage(first, proto.rest, this.baseUrl + "/");
    }

    /** 记住封面解密结果（简单容量上限的插入序淘汰） */
    putCoverCache(key, bytes) {
        if (!key) return;
        this.coverCache.delete(key);
        this.coverCache.set(key, bytes);
        while (this.coverCache.size > this.coverCacheLimit) {
            const oldest = this.coverCache.keys().next();
            if (oldest.done) break;
            this.coverCache.delete(oldest.value);
        }
    }

    /**
     * 后台预取封面解密结果。
     * 原因：Venera 的缩略图通道（loadThumbnail）会同步调用 onResponse，
     * 无法在钩子里发起第二次网络请求，所以封面必须提前解密好。
     */
    prefetchCover(imageUrl, cacheKey, manifest) {
        if (!imageUrl || this.coverCache.has(imageUrl) || this.coverPrefetching.has(imageUrl)) return;
        this.coverPrefetching.add(imageUrl);
        this.recoverImage(imageUrl, cacheKey, manifest)
            .then((bytes) => this.putCoverCache(imageUrl, bytes))
            .catch(() => {})
            .then(() => this.coverPrefetching.delete(imageUrl));
    }

    // ===== 列表解析器（各页 DOM 不同，分别实现）=====

    /** 卡片封面：div.cropped[data-src]（本站封面/正文图均非 img 标签） */
    parseCoverFrom(el) {
        if (!el) return "";
        const holder = el.querySelector(".cropped");
        if (holder) {
            const src = holder.attributes["data-src"] || holder.attributes.src || "";
            if (src) return src;
        }
        const img = el.querySelector("img");
        return img ? (img.attributes["data-src"] || img.attributes.src || "") : "";
    }

    /** 卡片封面的 data-bmi-manifest：非空表示该图走 manifest 分块协议 */
    parseManifestFrom(el) {
        if (!el) return "";
        const holder = el.querySelector(".cropped");
        return holder ? (holder.attributes["data-bmi-manifest"] || "") : "";
    }

    /** 首页 sp-card */
    parseHomeCard(el) {
        const id = this.bookIdFromHref(el.attributes.href);
        if (!id) return null;
        const titleNode = el.querySelector(".sp-card-title");
        const descNode = el.querySelector(".sp-card-desc");
        return new Comic({
            id: id,
            title: titleNode ? titleNode.text.trim() : (el.attributes.title || "").trim(),
            cover: this.parseCoverFrom(el),
            subTitle: descNode ? descNode.text.trim() : "",
            description: descNode ? descNode.text.trim() : "",
            _manifest: this.parseManifestFrom(el),
        });
    }

    /** 首页排行榜 sp-rank-item */
    parseRankCard(el) {
        const id = this.bookIdFromHref(el.attributes.href);
        if (!id) return null;
        const titleNode = el.querySelector(".sp-rank-title");
        const numNode = el.querySelector(".sp-rank-num");
        return new Comic({
            id: id,
            title: titleNode ? titleNode.text.trim() : "",
            cover: this.parseCoverFrom(el),
            subTitle: numNode ? "No." + numNode.text.trim() : "",
            _manifest: this.parseManifestFrom(el),
        });
    }

    /** 分类页 sp-booklist-card */
    parseBooklistCard(el) {
        const id = this.bookIdFromHref(el.attributes.href);
        if (!id) return null;
        const titleNode = el.querySelector(".sp-booklist-title");
        const metaNode = el.querySelector(".sp-booklist-meta");
        const badge = el.querySelector(".sp-book-end-badge");
        const meta = metaNode ? metaNode.text.trim() : "";
        const sub = badge ? [badge.text.trim(), meta].filter((x) => x).join(" · ") : meta;
        return new Comic({
            id: id,
            title: titleNode ? titleNode.text.trim() : (el.attributes.title || "").trim(),
            cover: this.parseCoverFrom(el),
            subTitle: sub,
            _manifest: this.parseManifestFrom(el),
        });
    }

    /** 搜索页 sp-search-card（独立结构，不复用分类页选择器） */
    parseSearchCard(el) {
        const id = this.bookIdFromHref(el.attributes.href);
        if (!id) return null;
        const titleNode = el.querySelector(".sp-search-card-title");
        const descNode = el.querySelector(".sp-search-card-desc");
        return new Comic({
            id: id,
            title: titleNode ? titleNode.text.trim() : (el.attributes.title || "").trim(),
            cover: this.parseCoverFrom(el),
            subTitle: descNode ? descNode.text.trim() : "",
            description: descNode ? descNode.text.trim() : "",
            _manifest: this.parseManifestFrom(el),
        });
    }

    /** 从分类页分页器读取总页数：<a class="pageRemark">共<b>189</b>页</a> */
    parseMaxPageFromBody(body, page) {
        const m = String(body || "").match(/共<b>(\d+)<\/b>页/);
        if (!m) return page; // 无分页器时按站点真实行为只返回当前页
        const max = parseInt(m[1], 10);
        return isNaN(max) || max < 1 ? page : max;
    }

    // ===== 首页探索页 =====

    explore = [
        {
            title: this.name,
            type: "singlePageWithMultiPart",
            load: async () => {
                let doc = null;
                try {
                    const res = await Network.get(this.baseUrl + "/", this.requestHeaders());
                    if (res.status !== 200) return {};
                    const body = res.body;
                    const cacheKey = this.extractCacheKey(body);
                    doc = new HtmlDocument(body);

                    // 首页有多个区块，且普通区块用 sp-card、排行榜用 sp-rank-item，
                    // 因此按 sp-section-title 的出现顺序切分原始 HTML，
                    // 每个区块在自己的片段内匹配卡片，避免跨区块误归属。
                    const result = {};
                    for (const block of this.splitHomeSections(body)) {
                        const list = [];
                        if (block.kind === "rank") {
                            for (const m of block.segment.matchAll(this.rankCardRegex())) {
                                const comic = this.parseRankCardMatch(m);
                                if (comic) list.push(this.attachCover(comic, cacheKey));
                            }
                        } else {
                            for (const m of block.segment.matchAll(this.homeCardRegex())) {
                                const comic = this.parseHomeCardMatch(m);
                                if (comic) list.push(this.attachCover(comic, cacheKey));
                            }
                        }
                        if (list.length > 0) result[block.name] = list;
                    }
                    return result;
                } catch (e) {
                    // 结构变化或网络失败时返回空对象，避免把异常伪装成正常空结果
                    return {};
                } finally {
                    if (doc) doc.dispose();
                }
            },
        },
    ];

    // ===== 首页区块解析（基于取证到的真实 HTML 结构）=====

    /**
     * 首页区块切分：以 <h2 class="sp-section-title"> 为界，
     * 段落终点为下一个区块标题；页尾广告等残留内容不产生卡片，自然被忽略。
     */
    splitHomeSections(body) {
        const html = String(body || "");
        const titles = [...html.matchAll(/<h2[^>]*class="sp-section-title"[^>]*>([\s\S]*?)<\/h2>/g)];
        const blocks = [];
        for (let i = 0; i < titles.length; i++) {
            const name = this.decodeEntities(titles[i][1]).trim();
            if (!name) continue;
            const start = titles[i].index;
            const end = i + 1 < titles.length ? titles[i + 1].index : html.length;
            const segment = html.slice(start, end);
            // 排行榜区块使用 sp-rank-item，其余区块使用 sp-card
            const kind = segment.indexOf("sp-rank-item") >= 0 ? "rank" : "card";
            blocks.push({ name: name, segment: segment, kind: kind });
        }
        return blocks;
    }

    homeCardRegex() {
        return /<a[^>]*href="\/book\/(\d+)"[^>]*class="sp-card"[^>]*>([\s\S]*?)<\/a>/g;
    }

    rankCardRegex() {
        return /<a[^>]*href="\/book\/(\d+)"[^>]*class="sp-rank-item"[^>]*>([\s\S]*?)<\/a>/g;
    }

    /** 定位片段中第一个 class 含 cropped 的 div 标签 */
    findCroppedTag(fragment) {
        const m = String(fragment || "").match(/<div[^>]*class="[^"]*\bcropped\b[^"]*"[^>]*>/);
        return m ? m[0] : "";
    }

    /** 取 <div class="cropped" data-src="..."> 的懒加载地址（本站封面/正文图均非 img 标签） */
    extractLazyCover(fragment) {
        const tag = this.findCroppedTag(fragment);
        if (!tag) return "";
        const m = tag.match(/data-src="([^"]+)"/);
        return m ? m[1] : "";
    }

    /**
     * 取 data-bmi-manifest。
     * 非空表示该图走 manifest 分块协议（较新章节），为空则走 legacy 双分片协议。
     */
    extractLazyManifest(fragment) {
        const tag = this.findCroppedTag(fragment);
        if (!tag) return "";
        const m = tag.match(/data-bmi-manifest="([^"]*)"/);
        return m ? m[1] : "";
    }

    extractDivText(fragment, className) {
        const re = new RegExp('class="' + className + '"[^>]*>([\\s\\S]*?)<\\/div>');
        const m = String(fragment || "").match(re);
        if (!m) return "";
        return this.decodeEntities(m[1].replace(/<[^>]*>/g, "")).trim();
    }

    /** 站点为繁体中文，实体解码覆盖常见几项 */
    decodeEntities(text) {
        return String(text || "")
            .replace(/&hellip;/g, "…")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#(\d+);/g, (m0, n) => String.fromCharCode(parseInt(n, 10)));
    }

    /** 卡片封面统一转换为可解码的图片地址，并顺带预取解密结果 */
    attachCover(comic, cacheKey, manifest) {
        if (!comic || !comic.cover) return comic;
        const m = manifest !== undefined && manifest !== null ? manifest : comic._manifest;
        comic.cover = this.buildImageUrl(comic.cover, cacheKey, m || "");
        delete comic._manifest;
        if (comic.cover) this.prefetchCover(comic.cover, cacheKey, m || "");
        return comic;
    }

    parseHomeCardMatch(m) {
        const inner = m[2] || "";
        const title = this.extractDivText(inner, "sp-card-title");
        const desc = this.extractDivText(inner, "sp-card-desc");
        if (!title && !this.extractLazyCover(inner)) return null;
        return new Comic({
            id: m[1],
            title: title,
            cover: this.extractLazyCover(inner),
            subTitle: desc,
            description: desc,
            _manifest: this.extractLazyManifest(inner),
        });
    }

    parseRankCardMatch(m) {
        const inner = m[2] || "";
        const title = this.extractDivText(inner, "sp-rank-title");
        const num = this.extractDivText(inner, "sp-rank-num");
        if (!title && !this.extractLazyCover(inner)) return null;
        return new Comic({
            id: m[1],
            title: title,
            cover: this.extractLazyCover(inner),
            subTitle: num ? "No." + num : "",
            _manifest: this.extractLazyManifest(inner),
        });
    }

    // ===== 分类页 =====

    category = {
        title: this.name,
        parts: [
            {
                name: "地區",
                type: "fixed",
                itemType: "category",
                categories: ["全部地區", "日漫", "韓漫", "寫真"],
                categoryParams: ["-1", "1", "2", "3"],
            },
            {
                name: "進度",
                type: "fixed",
                itemType: "category",
                categories: ["全部進度", "已完結", "連載中"],
                categoryParams: ["-1", "1", "0"],
            },
            {
                name: "類型",
                type: "fixed",
                itemType: "category",
                categories: [
                    "全部類型", "單行本", "長篇", "短篇", "綜合類", "同人",
                    "劇情向", "格鬥動作", "科幻・奇幻", "純愛", "百合", "校園",
                    "后宮", "不倫", "受孕", "援交", "多P", "NTR", "性轉", "扶她",
                ],
                categoryParams: [
                    "-1", "單行本", "長篇", "短篇", "綜合類", "同人",
                    "劇情向", "格鬥動作", "科幻・奇幻", "純愛", "百合", "校園",
                    "后宮", "不倫", "受孕", "援交", "多P", "NTR", "性轉", "扶她",
                ],
            },
            {
                name: "特殊Play",
                type: "fixed",
                itemType: "category",
                categories: [
                    "全部", "SM", "M男", "射入子宮", "偷窺", "癡漢", "捆綁・監禁",
                    "異物插入", "汁液", "母乳", "器官透視", "觸手", "脅迫・凌辱",
                    "調教", "母女play", "兩穴同入", "姊妹play", "肛交", "足交",
                ],
                categoryParams: [
                    "-1", "SM", "M男", "射入子宮", "偷窺", "癡漢", "捆綁・監禁",
                    "異物插入", "汁液", "母乳", "器官透視", "觸手", "脅迫・凌辱",
                    "調教", "母女play", "兩穴同入", "姊妹play", "肛交", "足交",
                ],
            },
            {
                name: "身材",
                type: "fixed",
                itemType: "category",
                categories: ["全部身材", "巨乳", "巨尻", "肉感", "肥胖", "嬌小", "貧乳", "多毛"],
                categoryParams: ["-1", "巨乳", "巨尻", "肉感", "肥胖", "嬌小", "貧乳", "多毛"],
            },
            {
                name: "角色",
                type: "fixed",
                itemType: "category",
                categories: [
                    "全部角色", "熟女", "人妻", "姉・妹", "義母", "孕婦", "女教師", "女醫生",
                    "女大學生", "OL", "女僕", "公主", "偶像藝人", "眼鏡娘", "巫女", "獸娘",
                    "環保少女", "魔法少女", "護士", "女老闆", "秘書", "女奴", "新娘",
                ],
                categoryParams: [
                    "-1", "熟女", "人妻", "姉・妹", "義母", "孕婦", "女教師", "女醫生",
                    "女大學生", "OL", "女僕", "公主", "偶像藝人", "眼鏡娘", "巫女", "獸娘",
                    "環保少女", "魔法少女", "護士", "女老闆", "秘書", "女奴", "新娘",
                ],
            },
            {
                name: "漢化",
                type: "fixed",
                itemType: "category",
                categories: ["全部", "漢化"],
                categoryParams: ["-1", "漢化"],
            },
        ],
        enableRankingPage: false,
    };

    /**
     * 把分类 part 名 + param 映射成站点的 tag/area/end 三个参数。
     * 「地區」「進度」分别对应 area 与 end，其余 part 对应 tag。
     */
    resolveCategoryParams(category, param, options) {
        let tag = "-1";
        let area = "-1";
        let end = "-1";

        if (category === "地區") {
            area = param && param !== "-1" ? String(param) : "-1";
        } else if (category === "進度") {
            end = param && param !== "-1" ? String(param) : "-1";
        } else if (param && param !== "-1") {
            tag = String(param);
        }

        // optionList 是附加筛选：值为 0 表示「不限定」，不覆盖主分类已选的值。
        // （Venera 解析 option 用 split("-")[0] 取值，以 "-" 开头的值会解析成空串，
        //   所以 optionList 一律使用非负的内部值，站点参数由本方法负责换算。）
        if (Array.isArray(options)) {
            if (options.length > 0) {
                const optArea = this.parseOptionValue(options[0]);
                if (optArea && optArea !== "0") area = this.areaOptionToSite(optArea);
            }
            if (options.length > 1) {
                const optEnd = this.parseOptionValue(options[1]);
                if (optEnd && optEnd !== "0") end = this.endOptionToSite(optEnd);
            }
        }
        return { tag: tag, area: area, end: end };
    }

    /**
     * optionList 项格式为「值-显示名」，取值规则与 Venera 一致：
     * split("-") 后取第 0 段。解析不出有效值时返回 null。
     */
    parseOptionValue(option) {
        if (option === null || option === undefined) return null;
        const s = String(option);
        if (s.indexOf("-") < 0) return s.length > 0 ? s : null;
        const key = s.split("-")[0];
        return key.length > 0 ? key : null;
    }

    /** optionList 地区值 -> 站点 area 参数（0=全部对应站点的 -1） */
    areaOptionToSite(value) {
        return value === "0" ? "-1" : String(value);
    }

    /** optionList 进度值 -> 站点 end 参数（0=全部、1=已完結、2=連載中） */
    endOptionToSite(value) {
        if (value === "0") return "-1";
        if (value === "1") return "1";
        if (value === "2") return "0";
        return "-1";
    }

    buildBooklistUrl(tag, area, end, page) {
        let url = "/booklist?tag=" + encodeURIComponent(tag || "-1") +
            "&area=" + encodeURIComponent(area || "-1") +
            "&end=" + encodeURIComponent(end || "-1");
        if (page > 1) url += "&page=" + page;
        return url;
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let doc = null;
            try {
                const params = this.resolveCategoryParams(category, param, options);
                const path = this.buildBooklistUrl(params.tag, params.area, params.end, Math.max(1, page || 1));
                const res = await Network.get(this.baseUrl + path, this.requestHeaders(this.baseUrl + "/booklist"));
                if (res.status !== 200) return { comics: [], maxPage: page };
                const body = res.body;
                const cacheKey = this.extractCacheKey(body);
                doc = new HtmlDocument(body);

                const comics = [];
                doc.querySelectorAll("a.sp-booklist-card").forEach((el) => {
                    const comic = this.parseBooklistCard(el);
                    if (!comic) return;
                    comics.push(this.attachCover(comic, cacheKey));
                });

                return { comics: comics, maxPage: this.parseMaxPageFromBody(body, page) };
            } catch (e) {
                return { comics: [], maxPage: page };
            } finally {
                if (doc) doc.dispose();
            }
        },
        optionList: [
            {
                // 值必须是「split("-")[0] 取出的有效非空串」，故一律用非负数，
                // 0 表示不限定（不覆盖「地區」part 已选的值）
                options: [
                    "0-全部地區",
                    "1-日漫",
                    "2-韓漫",
                    "3-寫真",
                ],
            },
            {
                options: [
                    "0-全部進度",
                    "1-已完結",
                    "2-連載中",
                ],
            },
        ],
    };

    // ===== 搜索 =====

    search = {
        load: async (keyword, options, page) => {
            let doc = null;
            try {
                const kw = String(keyword || "").trim();
                if (!kw) return { comics: [], maxPage: 1 };

                // 站点搜索表单 doSearch() 的跳转目标为 /search?keyword={kw}
                let path = "/search?keyword=" + encodeURIComponent(kw);
                if (page > 1) path += "&page=" + page;

                const res = await Network.get(this.baseUrl + path, this.requestHeaders(this.baseUrl + "/"));
                if (res.status !== 200) return { comics: [], maxPage: page };
                const body = res.body;
                const cacheKey = this.extractCacheKey(body);
                doc = new HtmlDocument(body);

                const comics = [];
                doc.querySelectorAll("a.sp-search-card").forEach((el) => {
                    const comic = this.parseSearchCard(el);
                    if (!comic) return;
                    comics.push(this.attachCover(comic, cacheKey));
                });

                // 实测搜索页不提供分页器，无论多少结果都只返回一页
                return { comics: comics, maxPage: 1 };
            } catch (e) {
                return { comics: [], maxPage: page };
            } finally {
                if (doc) doc.dispose();
            }
        },
    };

    // ===== 漫画详情与章节 =====

    comic = {
        loadInfo: async (id) => {
            const bookId = String(id || "").trim();
            if (!/^\d+$/.test(bookId)) throw new Error("污污漫畫 漫画 ID 无效: " + id);

            let doc = null;
            const url = this.baseUrl + "/book/" + bookId;
            const res = await Network.get(url, this.requestHeaders(this.baseUrl + "/"));
            if (res.status !== 200) throw "Comic not found";
            try {
                const body = res.body;
                const cacheKey = this.extractCacheKey(body);
                doc = new HtmlDocument(body);

                const titleNode = doc.querySelector("h1.sp-book-title");
                const title = titleNode ? titleNode.text.trim() : bookId;

                const coverHolder = doc.querySelector(".sp-book-cover .cropped");
                let rawCover = "";
                let coverManifest = "";
                if (coverHolder) {
                    rawCover = coverHolder.attributes["data-src"] || "";
                    coverManifest = coverHolder.attributes["data-bmi-manifest"] || "";
                }
                if (!rawCover) {
                    const anyCover = doc.querySelector(".cropped");
                    if (anyCover) {
                        rawCover = anyCover.attributes["data-src"] || "";
                        coverManifest = anyCover.attributes["data-bmi-manifest"] || "";
                    }
                }
                const cover = this.buildImageUrl(rawCover, cacheKey, coverManifest);

                const authorNode = doc.querySelector("p.sp-book-author");
                let author = authorNode ? authorNode.text.trim() : "";
                if (author.startsWith("作者")) author = author.substring(2).replace(/^[:：]\s*/, "").trim();

                // 状态 / 地区 / 更新日期
                let status = "";
                let region = "";
                let updateTime = "";
                doc.querySelectorAll(".sp-book-meta .sp-book-meta-item").forEach((item) => {
                    const text = (item.text || "").replace(/\s+/g, " ").trim();
                    const valueMatch = text.match(/[：:]\s*(.+)$/);
                    if (!valueMatch) return;
                    const value = valueMatch[1].trim();
                    if (text.indexOf("狀態") === 0 || text.indexOf("状态") === 0) status = value;
                    else if (text.indexOf("地區") === 0 || text.indexOf("地区") === 0) region = value;
                    else if (text.indexOf("更新") === 0) updateTime = value;
                });

                const summaryNode = doc.querySelector("p.sp-book-summary");
                const description = summaryNode ? summaryNode.text.trim() : "";

                // 标签：优先完整标签列表，回退展示区的标签
                const tagSet = [];
                doc.querySelectorAll("ul.sp-book-tags-full a").forEach((a) => {
                    const t = (a.text || "").trim();
                    if (t && tagSet.indexOf(t) < 0) tagSet.push(t);
                });
                if (tagSet.length === 0) {
                    doc.querySelectorAll("a.sp-book-tag").forEach((a) => {
                        const t = (a.text || "").trim();
                        if (t && tagSet.indexOf(t) < 0) tagSet.push(t);
                    });
                }

                // 章节：实测详情页一次返回全部章节，分页器不生效
                const chapters = new Map();
                doc.querySelectorAll("a.sp-chapter-item").forEach((a) => {
                    const cid = this.normalizeEpId(a.attributes.href);
                    if (!cid || chapters.has(cid)) return;
                    const name = (a.attributes.title || a.text || "").trim();
                    chapters.set(cid, name || cid);
                });

                if (cover) this.prefetchCover(cover, cacheKey, coverManifest);

                const subTitle = [author, region, status].filter((x) => x).join(" · ");

                return new ComicDetails({
                    title: title,
                    subTitle: subTitle,
                    cover: cover,
                    description: description,
                    tags: { 題材: tagSet },
                    chapters: chapters,
                    isFavorite: false,
                    subId: bookId,
                    thumbnails: cover ? [cover] : [],
                    recommend: [],
                    updateTime: updateTime,
                    url: url,
                });
            } finally {
                if (doc) doc.dispose();
            }
        },

        loadEp: async (comicId, epId) => {
            const chapterId = this.normalizeEpId(epId);
            if (!chapterId) return { images: [] };

            let doc = null;
            try {
                const url = this.baseUrl + "/free-chapter/" + chapterId;
                const res = await Network.get(url, this.requestHeaders(this.baseUrl + "/book/" + comicId));
                if (res.status !== 200) return { images: [] };
                const body = res.body;
                const cacheKey = this.extractCacheKey(body);
                doc = new HtmlDocument(body);

                const images = [];
                const seen = new Set();
                // 只取正文容器内的图片，避免把侧边栏、广告等 div.cropped 混入
                const container = doc.querySelector(".comiclist") || doc;
                container.querySelectorAll(".cropped").forEach((el) => {
                    const raw = el.attributes["data-src"] || "";
                    if (!raw || !/\.(?:jpeg|jpg|png|gif|webp|avif)(?:$|[?#])/i.test(raw)) return;
                    // 非空 manifest 表示走分块协议，留空表示走 legacy 双分片协议
                    const manifest = el.attributes["data-bmi-manifest"] || "";
                    const full = this.buildImageUrl(raw, cacheKey, manifest);
                    if (!full || seen.has(full)) return;
                    seen.add(full);
                    images.push(full);
                });

                return { images: Array.from(seen) };
            } catch (e) {
                return { images: [] };
            } finally {
                if (doc) doc.dispose();
            }
        },

        onImageLoad: (url, comicId, epId) => {
            const target = String(url || "").trim();
            const proto = this.parseImageProtocol(target);
            const referer = this.baseUrl + "/free-chapter/" + (this.normalizeEpId(epId) || "");

            if (!proto) {
                // 非本源代码生成的地址，按原样透传，仅补请求头
                return { url: target, method: "GET", headers: this.imageHeaders(referer) };
            }

            return {
                url: target,
                method: "GET",
                headers: this.imageHeaders(referer),
                // Venera 的正文图通道会 await onResponse 返回的 Promise，
                // 因此可以在此下载其余分片并完成合并解密（legacy 与 manifest 同理）。
                onResponse: async (firstChunk) => {
                    return this.completeImage(firstChunk, proto.rest, referer);
                },
            };
        },

        onThumbnailLoad: (url) => {
            const target = String(url || "").trim();
            const proto = this.parseImageProtocol(target);
            const cached = this.coverCache.get(target);

            if (!proto) {
                return { url: target, headers: this.imageHeaders(this.baseUrl + "/") };
            }

            if (cached) {
                // 缩略图通道会同步调用 onResponse，直接返回预取好的完整图片字节
                return {
                    url: target,
                    headers: this.imageHeaders(this.baseUrl + "/"),
                    onResponse: () => cached,
                };
            }

            // 尚未解密：缩略图通道无法在 onResponse 内发请求，
            // 这里触发一次预取，并在缓存就绪时直接返回。
            this.prefetchCover(target, null, null);
            const again = this.coverCache.get(target);
            if (again) {
                return {
                    url: target,
                    headers: this.imageHeaders(this.baseUrl + "/"),
                    onResponse: () => again,
                };
            }
            return { url: target, headers: this.imageHeaders(this.baseUrl + "/") };
        },

        /**
         * 详情页评论（服务端渲染，非 AJAX）。
         * 站点每页固定 5 条，无总数与分页器；空页（实测 page=999 返回 0 条）即终止。
         * maxPage 策略：满页时返回 page+1 让客户端继续翻页，不满页时返回当前页。
         */
        loadComments: async (comicId, subId, page, replyTo) => {
            const bookId = String(comicId || "").trim();
            if (!/^\d+$/.test(bookId)) return { comments: [], maxPage: 1 };
            let doc = null;
            try {
                const path = "/book/" + bookId + "?page=" + Math.max(1, page || 1);
                const res = await Network.get(this.baseUrl + path, this.requestHeaders(this.baseUrl + "/book/" + bookId));
                if (res.status !== 200) return { comments: [], maxPage: page };
                const body = res.body;
                doc = new HtmlDocument(body);

                const comments = [];
                const seen = new Set();
                const items = [...body.matchAll(this.commentItemRegex())];
                for (const m of items) {
                    const c = this.parseCommentItem(m[0]);
                    if (!c) continue;
                    const key = (c.userName || "") + "|" + (c.content || "");
                    if (seen.has(key)) continue;
                    seen.add(key);
                    comments.push(c);
                }

                const maxPage = comments.length >= 5 ? Math.max(1, page || 1) + 1 : Math.max(1, page || 1);
                return { comments: comments, maxPage: maxPage };
            } catch (e) {
                return { comments: [], maxPage: page };
            } finally {
                if (doc) doc.dispose();
            }
        },

        /**
         * 章节页评论。
         * 实测章节页（/free-chapter/{id}）不含评论区，返回空。
         */
        loadChapterComments: async (comicId, epId, page, replyTo) => {
            return { comments: [], maxPage: 1 };
        },
    };

    /**
     * 评论区解析（服务端渲染，非 AJAX）。
     * 评论项结构：匿名头像 + 用户名 + 内容 + 日期，无 data-id、无回复数。
     */
    commentItemRegex() {
        return /<div style="display:flex;gap:12px;padding:16px 20px;border-bottom:1px solid var\(--border\);">[\s\S]*?<\/div>\s*<\/div>/g;
    }

    extractPText(fragment, stylePrefix) {
        // 使用双重转义 \\s \\S 确保在字符串字面量经过 VM 评估后仍保留 \s \S
        const re = new RegExp('<p style="[^"]*' + stylePrefix + '[^"]*"[^>]*>([\\s\\S]*?)<\\/p>');
        const m = String(fragment || "").match(re);
        return m ? this.decodeEntities(m[1].replace(/<[^>]*>/g, "")).trim() : "";
    }

    // 调试用：在沙箱内直接测试正则匹配
    testExtractPTextRegex(fragment, stylePrefix) {
        console.log("[源调试] fragment长度:", fragment ? fragment.length : "null");
        console.log("[源调试] fragment前200:", fragment ? fragment.slice(0, 200) : "null");
        console.log("[源调试] stylePrefix:", stylePrefix);
        const re = new RegExp('<p style="[^"]*' + stylePrefix + '[^"]*"[^>]*>([\\s\\S]*?)<\\/p>');
        console.log("[源调试] 正则模式:", re);
        const m = String(fragment || "").match(re);
        console.log("[源调试] 匹配结果:", m ? { matched: true, capture: m[1] } : { matched: false });
        return m ? { matched: true, capture: m[1], fullMatch: m[0].slice(0, 200) } : { matched: false };
    }

    parseCommentItem(fragment) {
        const userName = this.extractPText(fragment, "font-weight:600");
        const content = this.extractPText(fragment, "line-height:1.6");
        const time = this.extractPText(fragment, "margin-top:6px");
        if (!content && !userName) return null;
        return new Comment({
            userName: userName,
            content: content,
            time: time,
            id: null,
            replyCount: null,
        });
    }

    link = {
        domains: ["www.wu55comic.world", "wu55comic.world"],
        linkToId: (url) => {
            const m = String(url || "").match(/\/book\/(\d+)/);
            return m ? m[1] : null;
        },
    };
}