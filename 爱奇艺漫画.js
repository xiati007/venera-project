/** @type {import('./_venera_.js')} */
class IQIYIComicSource extends ComicSource {
  // 爱奇艺漫画当前是 SPA。列表、详情、目录和阅读页都通过 comic.iqiyi.com
  // 的 JSON 接口加载，接口需要按前端规则补齐公共参数和 md5 请求头。
  name = "爱奇艺漫画";
  key = "iqiyi_comic";
  version = "1.1.0";
  minAppVersion = "1.0.0";
  url = "";

  siteBase = "https://manhua.iqiyi.com";
  apiBase = "https://comic.iqiyi.com";
  legacyBase = "https://www.iqiyi.com";
  apiKey = "0n9wdzm8pcyl1obxe0n9qdzm2pcyf1ob";
  apiVersion = "100.0.0";
  apiSrcPlatform = "23";
  apiAgentVersion = "h5";
  _qiyiId = "";
  userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif," +
      "image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9",
  };

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _unescape(value) {
    return String(value || "")
      .replace(/\\u0026/g, "&")
      .replace(/\\u003d/g, "=")
      .replace(/\\u002f/g, "/")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  _stripHtml(value) {
    return this._unescape(String(value || ""))
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  _attribute(tag, name) {
    const re = new RegExp(
      "\\b" + name + "\\s*=\\s*([\"'])([\\s\\S]*?)\\1",
      "i"
    );
    const match = String(tag || "").match(re);
    return match ? this._unescape(match[2]).trim() : "";
  }

  _absoluteUrl(value, base) {
    let url = this._unescape(value).trim();
    if (!url) return "";
    if (/^data:/i.test(url)) return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf("//") === 0) return "https:" + url;
    return String(base || this.siteBase).replace(/\/$/, "") + "/" +
      url.replace(/^\/+/, "");
  }

  _comicIdFromHref(href) {
    const value = this._unescape(href);
    let match = value.match(/[?&]comicId=([^&#]+)/i);
    if (match) return decodeURIComponent(match[1]);
    match = value.match(/\/detail[_/]([^/?#\.]+)(?:\.html)?/i);
    if (match) return decodeURIComponent(match[1]);
    return "";
  }

  _normaliseComicId(id) {
    const value = String(id || "").trim();
    const fromHref = this._comicIdFromHref(value);
    if (fromHref) return fromHref;
    let match = value.match(/detail[_/]([^/?#\.]+)(?:\.html)?/i);
    if (match) return decodeURIComponent(match[1]);
    return value.replace(/^\/+|\/+$/g, "");
  }

  _episodeIdFromHref(href, comicId) {
    const value = this._unescape(href);
    let match = value.match(/[?&]episodeId=([^&#]+)/i);
    if (match) return decodeURIComponent(match[1]);
    match = value.match(/\/reader\/([^_/?#]+)_([^/?#\.]+)(?:\.html)?/i);
    if (match) {
      if (!comicId || decodeURIComponent(match[1]) === String(comicId)) {
        return decodeURIComponent(match[2]);
      }
    }
    return "";
  }

  _normaliseEpisodeId(epId, comicId) {
    const value = String(epId || "").trim();
    const fromHref = this._episodeIdFromHref(value, comicId);
    if (fromHref) return fromHref;
    return value;
  }

  async _get(url, referer, extraHeaders) {
    let lastError = "请求失败：" + url;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await Network.get(url, {
          ...this.headers,
          ...(extraHeaders || {}),
          Referer: referer || this.siteBase + "/",
        });
        if (response.status === 200) return response;
        lastError = "HTTP " + response.status + "：" + url;
        // 4xx 是明确的路由/权限结果，不重复请求；网络错误和 5xx 才重试。
        if (response.status >= 400 && response.status < 500) break;
      } catch (error) {
        lastError = error && error.message ? error.message : String(error);
      }
      if (attempt === 0) await this._delay(500);
    }
    throw lastError;
  }

  _md5(value) {
    if (typeof Convert === "undefined" || !Convert.encodeUtf8 || !Convert.md5 || !Convert.hexEncode) {
      throw "爱奇艺接口需要 Venera Convert API";
    }
    return Convert.hexEncode(Convert.md5(Convert.encodeUtf8(String(value))));
  }

  _getQiyiId() {
    if (!this._qiyiId) {
      this._qiyiId = this._md5(
        this.name + "-" + new Date().getTime() + "-" + Math.random()
      );
    }
    return this._qiyiId;
  }

  _appendQuery(url, params) {
    const entries = [];
    for (const key of Object.keys(params || {})) {
      const value = params[key];
      if (value === undefined || value === null || value === "") continue;
      entries.push(String(key) + "=" + String(value));
    }
    if (!entries.length) return String(url);
    return String(url) + (String(url).indexOf("?") >= 0 ? "&" : "?") + entries.join("&");
  }

  async _apiRequest(path, params, referer) {
    const url = this._appendQuery(this.apiBase + path, params);
    const fullUrl = this._appendQuery(url, {
      qiyiId: this._getQiyiId(),
      timeStamp: new Date().getTime(),
      srcPlatform: this.apiSrcPlatform,
      appVer: this.apiVersion,
      agentVersion: this.apiAgentVersion,
    });
    const parsed = fullUrl.match(/^https?:\/\/[^/]+([^?#]*)(?:\?([^#]*))?/i);
    const pathname = parsed && parsed[1] ? parsed[1] : "/";
    const query = parsed && parsed[2] ? parsed[2] : "";
    const response = await this._get(fullUrl, referer || this.siteBase + "/", {
      Accept: "application/json,text/plain,*/*",
      "Content-Type": "application/json;",
      md5: this._md5(pathname + query + this.apiKey),
    });
    let payload;
    try {
      payload = JSON.parse(String(response.body || "").replace(/^\uFEFF/, ""));
    } catch (error) {
      throw "爱奇艺接口返回了无效 JSON：" + path;
    }
    if (!payload || payload.data === undefined || payload.data === null) {
      throw "爱奇艺接口无数据：" + (payload && payload.code ? payload.code : path);
    }
    return payload;
  }

  _imageUrl(value) {
    const url = this._absoluteUrl(value, this.apiBase);
    return url.replace(/^http:\/\/([^/]*(?:iqiyipic|qiyipic)\.com)/i, "https://$1");
  }

  _text(value) {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return value.map((item) => this._text(item)).filter(Boolean).join(", ");
    if (typeof value === "object") {
      return this._text(value.title || value.name || value.tagName || value.value || "");
    }
    return this._stripHtml(String(value));
  }

  _tagTexts(value) {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    const result = [];
    for (const item of values) {
      const text = this._text(item);
      if (text && result.indexOf(text) < 0) result.push(text);
    }
    return result;
  }

  _parseApiFeed(payload) {
    const pages = payload && payload.data && Array.isArray(payload.data.pageBody)
      ? payload.data.pageBody
      : [];
    const comics = [];
    const seen = new Set();
    for (const page of pages) {
      const body = page && page.cardBody && Array.isArray(page.cardBody.bodyData)
        ? page.cardBody.bodyData
        : [];
      for (const item of body) {
        const block = item && item.blockData ? item.blockData : item;
        if (!block || String(block.business) !== "2") continue;
        const id = this._normaliseComicId(block.id || block.comicId);
        const cover = this._imageUrl(block.image || block.cover || block.imageUrl);
        if (!id || !cover || seen.has(id)) continue;
        seen.add(id);
        const update = this._text(block.subTitle || block.subtitle || block.updateInfo);
        comics.push(new Comic({
          id: id,
          title: this._text(block.title || block.imageText) || id,
          cover: cover,
          subtitle: update,
          description: this._text(block.brief || block.description),
          tags: this._tagTexts(block.tag),
        }));
      }
    }
    return comics;
  }

  _parseApiCategory(payload) {
    const list = payload && payload.data && Array.isArray(payload.data.comics)
      ? payload.data.comics
      : [];
    return list.map((item) => {
      const id = this._normaliseComicId(item.id || item.comicId || item.bookId);
      const author = this._text(item.author_name || item.authorsName);
      const update = item.newest_item_number || item.last_chapter_order
        ? "更新至：第" + (item.newest_item_number || item.last_chapter_order) + "话"
        : "";
      return new Comic({
        id: id,
        title: this._text(item.title || item.name) || id,
        cover: this._imageUrl(item.image_url || item.cover || item.icon),
        subtitle: update,
        description: this._text(item.description || item.brief),
        tags: author ? ["作者：" + author] : [],
      });
    }).filter((item) => item.id && item.cover);
  }

  _parseApiSearch(payload) {
    const list = payload && payload.data && Array.isArray(payload.data.elements)
      ? payload.data.elements
      : [];
    return list.filter((item) => String(item.business) === "2").map((item) => {
      const id = this._normaliseComicId(item.bookId || item.comicId || item.id);
      const author = this._text(item.authorsName || item.authorName);
      const count = item.chapterCount || item.lastChapterOrder;
      return new Comic({
        id: id,
        title: this._text(item.title || item.name) || id,
        cover: this._imageUrl(item.cover || item.icon || item.image),
        subtitle: count ? "全" + count + "话" : "",
        description: this._text(item.brief || item.description),
        tags: author ? ["作者：" + author].concat(this._tagTexts(item.tagArr)) : this._tagTexts(item.tagArr),
      });
    }).filter((item) => item.id && item.cover);
  }

  _parseApiDetail(payload, id) {
    const data = payload && payload.data ? payload.data : {};
    const statusValue = data.serializeStatus !== undefined
      ? data.serializeStatus
      : data.comicSerializeStatus;
    const status = String(statusValue) === "1"
      ? "已完结"
      : String(statusValue) === "2" ? "连载中" : this._text(data.serializeStatusName);
    return {
      title: this._text(data.title || data.comicTitle) || id,
      cover: this._imageUrl(data.pic || data.comicCover || data.cover),
      author: this._text(data.authorsName || data.comicAuthorsName),
      description: this._text(data.brief || data.description),
      status: status,
      tags: this._tagTexts(data.comicTagList || data.comicTags || data.tags),
      episodes: Array.isArray(data.episodes) ? data.episodes : [],
    };
  }

  _parseApiCatalog(payload) {
    const data = payload && payload.data ? payload.data : {};
    const catalog = data.allCatalog || data;
    const episodes = Array.isArray(catalog.comicEpisodes)
      ? catalog.comicEpisodes
      : Array.isArray(catalog.episodes) ? catalog.episodes : [];
    return episodes.map((item, index) => {
      const id = item.episodeId || item.episode_id || item.epId || item.id;
      const order = item.episodeOrder || item.episode_order || item.order || index + 1;
      const title = item.episodeTitle || item.episode_title || item.title || ("第" + order + "话");
      return id === undefined || id === null ? null : {
        id: String(id),
        title: this._text(title) || ("第" + order + "话"),
        order: Number(order) || index + 1,
      };
    }).filter(Boolean).sort((a, b) => a.order - b.order);
  }

  _parseApiImages(payload) {
    const data = payload && payload.data ? payload.data : {};
    const episodes = Array.isArray(data.episodes) ? data.episodes : [];
    const pictures = episodes[0] && Array.isArray(episodes[0].episodePicture)
      ? episodes[0].episodePicture : [];
    const images = [];
    const seen = new Set();
    for (const picture of pictures) {
      const candidates = Array.isArray(picture.imageUrlList) ? picture.imageUrlList : [];
      let value = "";
      if (candidates[1]) value = candidates[1].imageUrl || candidates[1].url || "";
      for (const candidate of candidates) {
        if (value) break;
        value = candidate && (candidate.imageUrl || candidate.url);
        if (value) break;
      }
      value = value || picture.imageUrl || picture.url;
      const url = this._imageUrl(value);
      if (url && !seen.has(url)) {
        seen.add(url);
        images.push(url);
      }
    }
    return images;
  }

  async _firstSuccessful(urls, referer) {
    let lastError = "";
    for (const url of urls) {
      try {
        return { url: url, response: await this._get(url, referer) };
      } catch (error) {
        lastError = error && error.message ? error.message : String(error);
      }
    }
    throw lastError || "爱奇艺漫画页面不可用";
  }

  _parseImgTag(tag, base) {
    const attrs = ["data-original", "data-src", "data-url", "src"];
    for (const name of attrs) {
      const value = this._attribute(tag, name);
      if (!value) continue;
      const url = this._absoluteUrl(value, base);
      if (!url || /^data:image\/gif/i.test(url)) continue;
      if (/(?:logo|icon|avatar|qrcode|erweima|loading|default)/i.test(url)) {
        continue;
      }
      return url;
    }
    return "";
  }

  _parseList(body, base) {
    const html = String(body || "");
    const comics = [];
    const seen = new Set();
    const addItem = (item) => {
      const linkRe = /<a\b[^>]*>/gi;
      let linkMatch;
      let href = "";
      let title = "";
      while ((linkMatch = linkRe.exec(item)) !== null) {
        const tag = linkMatch[0];
        const candidate = this._attribute(tag, "href");
        const comicId = this._comicIdFromHref(candidate);
        if (!comicId) continue;
        href = candidate;
        title =
          this._attribute(tag, "title") ||
          this._attribute(tag, "aria-label");
        break;
      }
      const id = this._comicIdFromHref(href);
      if (!id || seen.has(id)) return;

      const titleMatch =
        item.match(
          /class=["'][^"']*(?:stacksBook-tit|cartoon-item-tit|book-title|comic-title|comic-name)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/i
        ) ||
        item.match(
          /<h[1-4][^>]*>([\s\S]*?)<\/[hH][1-4]>/i
        );
      if (titleMatch) title = this._stripHtml(titleMatch[1]);
      if (!title) {
        const imageTag = (item.match(/<img\b[^>]*>/i) || [])[0] || "";
        title =
          this._attribute(imageTag, "alt") ||
          this._attribute(imageTag, "title");
      }
      if (!title) {
        const anchor = item.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i);
        title = anchor ? this._stripHtml(anchor[1]) : "";
      }
      if (!title) title = id;

      let cover = "";
      const imageRe = /<img\b[^>]*>/gi;
      let imageMatch;
      while ((imageMatch = imageRe.exec(item)) !== null && !cover) {
        cover = this._parseImgTag(imageMatch[0], base);
      }
      if (!cover) return;

      const authorMatch = item.match(
        /class=["'][^"']*(?:writerName|author)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/i
      );
      const updateMatch = item.match(
        /class=["'][^"']*(?:cartoon-update-h|stacksBook-newchapter|last-chapter)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/i
      );
      const author = authorMatch ? this._stripHtml(authorMatch[1]) : "";
      const update = updateMatch ? this._stripHtml(updateMatch[1]) : "";
      seen.add(id);
      comics.push(
        new Comic({
          id: id,
          title: this._stripHtml(title),
          cover: cover,
          subtitle: update,
          tags: author ? ["作者：" + author] : [],
          description: update ? "更新至：" + update : "",
        })
      );
    };

    const itemRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let itemMatch;
    while ((itemMatch = itemRe.exec(html)) !== null) addItem(itemMatch[0]);

    // 新版前端卡片不一定使用 li；只在 li 没有结果时按带漫画详情链接的
    // div 片段补一次，避免把整页的推荐图片混入结果。
    if (comics.length === 0) {
      const divRe =
        /<div\b[^>]*class=["'][^"']*(?:cartoon|comic|stacks)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi;
      while ((itemMatch = divRe.exec(html)) !== null) addItem(itemMatch[0]);
    }
    return comics;
  }

  _parseCover(body, base, title) {
    const html = String(body || "");
    const preferred =
      html.match(
        /<(?:div|section)[^>]*class=["'][^"']*(?:detail|comic|book)[^"']*(?:cover|img|pic)[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*>/i
      ) ||
      html.match(
        /<img\b[^>]*class=["'][^"']*(?:cover|detail-img|comic-img|book-img)[^"']*["'][^>]*>/i
      );
    if (preferred) {
      const url = this._parseImgTag(preferred[0], base);
      if (url) return url;
    }
    const imageRe = /<img\b[^>]*>/gi;
    let match;
    while ((match = imageRe.exec(html)) !== null) {
      const tag = match[0];
      const alt = this._attribute(tag, "alt");
      const url = this._parseImgTag(tag, base);
      if (url && (alt === title || /cover|封面/i.test(tag))) return url;
    }
    imageRe.lastIndex = 0;
    while ((match = imageRe.exec(html)) !== null) {
      const url = this._parseImgTag(match[0], base);
      if (url) return url;
    }
    return "";
  }

  _parseDetail(body, base, id) {
    const html = String(body || "");
    const titleMatch =
      html.match(
        /class=["'][^"']*detail-tit[^"']*["'][^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i
      ) ||
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? this._stripHtml(titleMatch[1]) : id;
    const authorMatch =
      html.match(
        /class=["'][^"']*author[^"']*["'][^>]*>[\s\S]{0,500}?<span[^>]*>([\s\S]*?)<\/span>/i
      ) ||
      html.match(
        /class=["'][^"']*(?:writerName|author)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/i
      );
    const descriptionMatch = html.match(
      /class=["'][^"']*detail-docu[^"']*["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/i
    );
    const statusMatch = html.match(/(已完结|完结|连载中|连载)/);
    const tagMatches = [];
    const tagRe =
      /<(?:a|span)[^>]*class=["'][^"']*(?:tag|kind|genre)[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|span)>/gi;
    let tagMatch;
    while ((tagMatch = tagRe.exec(html)) !== null) {
      const value = this._stripHtml(tagMatch[1]);
      if (value && tagMatches.indexOf(value) < 0) tagMatches.push(value);
    }
    return {
      title: title || id,
      cover: this._parseCover(html, base, title),
      author: authorMatch ? this._stripHtml(authorMatch[1]) : "",
      description: descriptionMatch
        ? this._stripHtml(descriptionMatch[1])
        : "",
      status: statusMatch ? statusMatch[1] : "",
      tags: tagMatches,
    };
  }

  _findEpisodeArray(value, depth) {
    if (!value || depth > 8) return [];
    if (Array.isArray(value)) {
      const useful = value.filter((item) => {
        if (!item || typeof item !== "object") return false;
        return (
          item.episodeId !== undefined ||
          item.episode_id !== undefined ||
          item.epId !== undefined ||
          item.episodeTitle !== undefined ||
          item.episodeOrder !== undefined
        );
      });
      if (useful.length) return useful;
      for (const item of value) {
        const nested = this._findEpisodeArray(item, depth + 1);
        if (nested.length) return nested;
      }
      return [];
    }
    if (typeof value !== "object") return [];
    const priority = ["episodes", "episodeList", "chapterList", "chapters", "list", "data"];
    for (const key of priority) {
      if (value[key] !== undefined) {
        const nested = this._findEpisodeArray(value[key], depth + 1);
        if (nested.length) return nested;
      }
    }
    for (const key of Object.keys(value)) {
      if (priority.indexOf(key) >= 0) continue;
      const nested = this._findEpisodeArray(value[key], depth + 1);
      if (nested.length) return nested;
    }
    return [];
  }

  _parseCatalog(body) {
    let value;
    try {
      const text = String(body || "").replace(/^\uFEFF/, "").trim();
      value = JSON.parse(text);
    } catch (error) {
      const jsonp = String(body || "").match(/^[a-zA-Z_$][\w$]*\(([\s\S]*)\)\s*;?$/);
      if (!jsonp) return [];
      try {
        value = JSON.parse(jsonp[1]);
      } catch (error2) {
        return [];
      }
    }
    const episodes = this._findEpisodeArray(value, 0);
    return episodes
      .map((item, index) => {
        const id =
          item.episodeId ??
          item.episode_id ??
          item.epId ??
          item.eid ??
          item.id;
        const order =
          item.episodeOrder ??
          item.episode_order ??
          item.order ??
          item.sort ??
          index + 1;
        const title =
          item.episodeTitle ??
          item.episode_title ??
          item.name ??
          item.title ??
          ("第" + order + "话");
        return id === undefined || id === null
          ? null
          : { id: String(id), title: this._stripHtml(String(title)), order: Number(order) || index + 1 };
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order);
  }

  _parseChapterLinks(body, comicId) {
    const chapters = [];
    const linkRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    const seen = new Set();
    while ((match = linkRe.exec(String(body || ""))) !== null) {
      const id = this._episodeIdFromHref(match[1], comicId);
      if (!id || seen.has(id)) continue;
      const title = this._stripHtml(match[2]);
      if (!title || /开始阅读|继续阅读|下一章|上一章/i.test(title)) continue;
      seen.add(id);
      chapters.push({ id: id, title: title, order: chapters.length + 1 });
    }
    return chapters;
  }

  _maxPage(body) {
    const values = [];
    let match;
    const weeklyRe = /weekly_update\/(\d+)_1_50\.html/gi;
    while ((match = weeklyRe.exec(String(body || ""))) !== null) {
      const page = parseInt(match[1], 10);
      if (page > 0 && page < 10000) values.push(page);
    }
    const categoryRe = /category\/[^"'<\s/]+_\d+_\d+_(\d+)\//gi;
    while ((match = categoryRe.exec(String(body || ""))) !== null) {
      const page = parseInt(match[1], 10);
      if (page > 0 && page < 10000) values.push(page);
    }
    const last = String(body || "").match(
      /(?:尾页|最后一页)[^>]*href=["'][^"']*(?:_|\/)(\d+)(?:\.html|\/)/i
    );
    if (last) values.push(parseInt(last[1], 10));
    return values.length ? Math.max.apply(null, values) : 1;
  }

  async _loadList(urls) {
    const result = await this._firstSuccessful(urls);
    let comics = this._parseList(result.response.body, result.url.indexOf(this.legacyBase) >= 0 ? this.legacyBase : this.siteBase);
    // 新版首页可能只返回应用壳，列表为空时回退到同站旧版 SSR 页面。
    if (comics.length === 0 && result.url.indexOf(this.legacyBase) < 0) {
      const fallback = await this._firstSuccessful([this.legacyBase + "/manhua/weekly_update/1_1_50.html"]);
      comics = this._parseList(fallback.response.body, this.legacyBase);
      return { comics: comics, maxPage: this._maxPage(fallback.response.body) };
    }
    return { comics: comics, maxPage: this._maxPage(result.response.body) };
  }

  explore = [
    {
      title: "首页推荐",
      type: "multiPartPage",
      load: async () => {
        const payload = await this._apiRequest(
          "/card/miniProgram/homFeed",
          { deviceId: this._getQiyiId(), pageSize: 18 },
          this.siteBase + "/comic/index"
        );
        return [{ title: "推荐漫画", comics: this._parseApiFeed(payload) }];
      },
    },
    {
      title: "热门作品",
      type: "multiPageComicList",
      load: async (page) => {
        const currentPage = page && page > 0 ? page : 1;
        const pageSize = 20;
        const payload = await this._apiRequest(
          "/views/1.0/classify/detail",
          {
            three_category: encodeURIComponent("-1"),
            pageSize: pageSize,
            pageNum: currentPage,
            if: "comics",
            type: "list",
            mode: 9,
            serialize_status: -1,
            pay_status: -1,
            data_type: 21,
          },
          this.siteBase + "/comic/index"
        );
        const comics = this._parseApiCategory(payload);
        return { comics: comics, maxPage: comics.length === pageSize ? currentPage + 1 : currentPage };
      },
    },
  ];

  category = {
    title: "爱奇艺漫画",
    parts: [
      {
        name: "分类",
        type: "fixed",
        categories: [
          "全部", "恋爱", "古装", "玄幻", "悬疑", "科幻", "搞笑", "热血",
          "都市", "校园", "治愈", "竞技", "冒险",
        ],
        itemType: "category",
        categoryParams: [
          "-1", "恋爱", "古装", "玄幻", "悬疑", "科幻", "搞笑", "热血",
          "都市", "校园", "治愈", "竞技", "冒险",
        ],
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const currentPage = page && page > 0 ? page : 1;
      const pageSize = 20;
      const optionValue = options && options[0] !== undefined ? String(options[0]) : "";
      const mode = optionValue ? optionValue.split("-")[0] : 9;
      const categoryParam = param || category || "-1";
      const payload = await this._apiRequest(
        "/views/1.0/classify/detail",
        {
          three_category: encodeURIComponent(String(categoryParam)),
          pageSize: pageSize,
          pageNum: currentPage,
          if: "comics",
          type: "list",
          mode: mode,
          serialize_status: -1,
          pay_status: -1,
          data_type: 21,
        },
        this.siteBase + "/comic/category"
      );
      const comics = this._parseApiCategory(payload);
      return { comics: comics, maxPage: comics.length === pageSize ? currentPage + 1 : currentPage };
    },
    optionList: [
      {
        label: "排序",
        options: ["9-人气最高", "4-最近更新", "14-最新上线"],
      },
    ],
  };

  search = {
    load: async (keyword, options, page) => {
      const currentPage = page && page > 0 ? page : 1;
      const pageSize = 10;
      const payload = await this._apiRequest(
        "/acgn/books/acnKeyword",
        {
          platform: "IOS",
          keyword: encodeURIComponent(String(keyword || "")),
          page: currentPage,
          size: pageSize,
          category: 4,
        },
        this.siteBase + "/comic/search"
      );
      const comics = this._parseApiSearch(payload);
      const total = Number(payload.data && payload.data.total) || comics.length;
      return { comics: comics, maxPage: Math.max(1, Math.ceil(total / pageSize)) };
    },
  };

  comic = {
    loadInfo: async (id) => {
      const comicId = this._normaliseComicId(id);
      if (!comicId) throw "漫画 ID 缺失";
      const currentUrl =
        this.siteBase + "/comic/detail?comicId=" + encodeURIComponent(comicId);
      const detailPayload = await this._apiRequest(
        "/views/1.0/comicDetail",
        { comicId: comicId },
        this.siteBase + "/comic/index"
      );
      const detail = this._parseApiDetail(detailPayload, comicId);
      let episodeItems = this._parseApiCatalog({ data: { episodes: detail.episodes } });
      try {
        const catalog = await this._apiRequest(
          "/views/comicCatalog",
          { comicId: comicId, episodeId: 0, episodeIndex: 0, order: 0, size: 10000 },
          currentUrl
        );
        const parsedCatalog = this._parseApiCatalog(catalog);
        if (parsedCatalog.length) episodeItems = parsedCatalog;
      } catch (error) {
        // 详情接口自带 episodes 时可继续展示目录，否则将错误交给调用方。
      }

      const chapters = new Map();
      for (const item of episodeItems) {
        if (item.id && item.title) chapters.set(item.id, item.title);
      }
      const tags = {};
      if (detail.author) tags["作者"] = [detail.author];
      if (detail.status) tags["状态"] = [detail.status];
      if (detail.tags.length) tags["标签"] = detail.tags;
      return new ComicDetails({
        title: detail.title || comicId,
        cover: detail.cover || "",
        description: detail.description || "",
        tags: tags,
        chapters: chapters,
        url: currentUrl,
      });
    },

    loadEp: async (comicId, epId) => {
      const id = this._normaliseComicId(comicId);
      const episodeId = this._normaliseEpisodeId(epId, id);
      if (!id || !episodeId) throw "章节 ID 缺失";

      const currentUrl =
        this.siteBase +
        "/comic/reader?comicId=" +
        encodeURIComponent(id) +
        "&episodeId=" +
        encodeURIComponent(episodeId);
      const payload = await this._apiRequest(
        "/read/1.0/batchRead",
        { comicId: id, episodeId: episodeId, order: 0, size: 0 },
        currentUrl
      );
      const images = this._parseApiImages(payload);
      if (!images.length) {
        throw "章节页面未返回图片，可能需要登录、购买或该章节已下架";
      }
      return { images: images };
    },

    onImageLoad: (url, comicId, epId) => {
      const id = this._normaliseComicId(comicId);
      const episodeId = this._normaliseEpisodeId(epId, id);
      return {
        headers: {
          "User-Agent": this.userAgent,
          Referer:
            this.siteBase +
            "/comic/reader?comicId=" +
            encodeURIComponent(id) +
            "&episodeId=" +
            encodeURIComponent(episodeId),
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      };
    },
  };

  _parseImageUrls(body, base) {
    const html = String(body || "");
    const images = [];
    const seen = new Set();
    const add = (value) => {
      const url = this._absoluteUrl(value, base);
      if (!url || seen.has(url)) return;
      if (/(?:logo|icon|avatar|qrcode|erweima|loading|default|sprite)/i.test(url)) {
        return;
      }
      if (!/^https?:\/\//i.test(url)) return;
      if (
        !/\.(?:jpg|jpeg|png|webp|gif)(?:[?#]|$)/i.test(url) &&
        !/(?:qiyipic|iqiyi).*?(?:image|pic|comic)/i.test(url)
      ) {
        return;
      }
      seen.add(url);
      images.push(url);
    };

    const imageRe = /<img\b[^>]*>/gi;
    let match;
    while ((match = imageRe.exec(html)) !== null) {
      add(
        this._attribute(match[0], "data-original") ||
          this._attribute(match[0], "data-src") ||
          this._attribute(match[0], "data-url") ||
          this._attribute(match[0], "src")
      );
    }

    // 兼容图片 URL 被放在阅读页内联 JSON/脚本中的情况。
    const urlRe =
      /(?:https?:)?\/\/[^"'\\s<>\\\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\s<>\\\\]*)?/gi;
    while ((match = urlRe.exec(html)) !== null) add(match[0]);
    return images;
  }
}
