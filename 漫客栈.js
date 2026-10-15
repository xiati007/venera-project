/** @type {import('./_venera_.js')} */
class MkzhanComicSource extends ComicSource {
  name = "漫客栈";
  key = "mkzhan";
  version = "1.0.0";
  minAppVersion = "1.0.0";
  url = "https://www.mkzhan.com/";

  siteBase = "https://www.mkzhan.com";
  apiBase = "https://comic.mkzcdn.com";
  userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: "application/json,text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9",
  };

  themeNames = {
    "0": "全部",
    "1": "霸总",
    "2": "修真",
    "3": "恋爱",
    "4": "校园",
    "5": "冒险",
    "6": "搞笑",
    "7": "生活",
    "8": "热血",
    "9": "架空",
    "10": "后宫",
    "12": "玄幻",
    "13": "悬疑",
    "14": "恐怖",
    "15": "灵异",
    "16": "动作",
    "17": "科幻",
    "18": "战争",
    "19": "古风",
    "20": "穿越",
    "21": "竞技",
    "23": "励志",
    "24": "同人",
    "26": "真人",
  };

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _unescape(value) {
    return String(value || "")
      .replace(/\\u0026/g, "&")
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
    const url = this._unescape(value).trim();
    if (!url || /^data:/i.test(url)) return "";
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf("//") === 0) return "https:" + url;
    return String(base || this.siteBase).replace(/\/$/, "") + "/" +
      url.replace(/^\/+/, "");
  }

  _imageUrl(value) {
    return this._absoluteUrl(value, this.apiBase).replace(
      /^http:\/\/([^/]*mkzcdn\.com)/i,
      "https://$1"
    );
  }

  _normaliseComicId(value) {
    const text = this._unescape(value).trim();
    if (!text) return "";
    let match = text.match(/[?&](?:comic_id|comicId)=([^&#]+)/i);
    if (match) return decodeURIComponent(match[1]);
    match = text.match(/\/([0-9]+)(?:\/|$)/);
    if (match) return match[1];
    return /^[0-9]+$/.test(text) ? text : "";
  }

  _normaliseEpisodeId(value, comicId) {
    const text = this._unescape(value).trim();
    if (!text) return "";
    let match = text.match(/[?&](?:chapter_id|episode_id|episodeId)=([^&#]+)/i);
    if (match) return decodeURIComponent(match[1]);
    match = text.match(new RegExp("/" + String(comicId || "\\d+") + "/([^/?#]+)\\.html", "i"));
    if (match) return decodeURIComponent(match[1]);
    return /^[0-9]+$/.test(text) ? text : "";
  }

  async _get(url, referer) {
    let lastError = "请求失败：" + url;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await Network.get(url, {
          ...this.headers,
          Referer: referer || this.siteBase + "/",
        });
        if (Number(response.status) === 200) return response;
        lastError = "HTTP " + response.status + "：" + url;
        if (Number(response.status) >= 400 && Number(response.status) < 500) break;
      } catch (error) {
        lastError = error && error.message ? error.message : String(error);
      }
      if (attempt === 0) await this._delay(400);
    }
    throw lastError;
  }

  _appendQuery(url, params) {
    const values = [];
    for (const key of Object.keys(params || {})) {
      const value = params[key];
      if (value === undefined || value === null || value === "") continue;
      values.push(String(key) + "=" + String(value));
    }
    if (!values.length) return String(url);
    return String(url) + (String(url).indexOf("?") >= 0 ? "&" : "?") + values.join("&");
  }

  _parseJson(body) {
    const text = String(body || "").replace(/^\uFEFF/, "").trim();
    try {
      return JSON.parse(text);
    } catch (error) {
      const match = text.match(/^[a-zA-Z_$][\w$]*\(([\s\S]*)\)\s*;?$/);
      if (!match) return null;
      try {
        return JSON.parse(match[1]);
      } catch (error2) {
        return null;
      }
    }
  }

  async _getJson(path, params, referer) {
    const url = this._appendQuery(this.apiBase + path, params);
    const response = await this._get(url, referer || this.siteBase + "/");
    const payload = this._parseJson(response.body);
    if (!payload || payload.data === undefined) {
      throw "漫客栈接口返回了无效数据：" + path;
    }
    return payload;
  }

  _text(value) {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return value.map((item) => this._text(item)).filter(Boolean).join(", ");
    if (typeof value === "object") {
      return this._text(value.title || value.name || value.text || value.value || "");
    }
    return this._stripHtml(String(value));
  }

  _themeTexts(value) {
    const raw = Array.isArray(value) ? value : String(value || "").split(",");
    const result = [];
    for (const item of raw) {
      const key = this._text(item);
      const text = this.themeNames[key] || key;
      if (text && text !== "0" && result.indexOf(text) < 0) result.push(text);
    }
    return result;
  }

  _comicFromItem(item) {
    const id = this._normaliseComicId(
      item.comic_id || item.comicId || item.book_id || item.id
    );
    const title = this._text(item.title || item.name || item.comic_name) || id;
    const cover = this._imageUrl(
      item.cover || item.cover_vertical || item.cover_url || item.image
    );
    const author = this._text(item.author_title || item.author_name || item.author);
    const update = this._text(item.chapter_title || item.last_chapter || item.lastChapter);
    const tags = this._themeTexts(item.theme_id || item.themeId || item.theme);
    if (author) tags.unshift("作者：" + author);
    return new Comic({
      id: id,
      title: title,
      cover: cover,
      subtitle: update,
      description: this._text(item.feature || item.description || item.intro),
      tags: tags,
    });
  }

  _listFromPayload(payload) {
    const data = payload && payload.data;
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return [];
    if (Array.isArray(data.list)) return data.list;
    if (Array.isArray(data.comics)) return data.comics;
    return [];
  }

  _parseListJson(payload) {
    return this._listFromPayload(payload)
      .map((item) => this._comicFromItem(item))
      .filter((item) => item.id && item.title);
  }

  _parseImageTag(tag, base) {
    const value =
      this._attribute(tag, "data-src") ||
      this._attribute(tag, "data-original") ||
      this._attribute(tag, "src");
    const url = this._imageUrl(this._absoluteUrl(value, base));
    if (!url || /(?:logo|avatar|qrcode|loading|lazyload|default)/i.test(url)) return "";
    if (!/(?:mkzcdn\.com|mkzhan\.com)/i.test(url)) return "";
    return url;
  }

  _parseListHtml(body) {
    const comics = [];
    const seen = new Set();
    const add = (fragment) => {
      const link = String(fragment || "").match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/i);
      const id = link ? this._normaliseComicId(link[1]) : "";
      if (!id || seen.has(id)) return;
      const titleMatch = String(fragment).match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
      const imageMatch = String(fragment).match(/<img\b[^>]*>/i);
      const title = titleMatch
        ? this._stripHtml(titleMatch[1])
        : imageMatch
          ? this._attribute(imageMatch[0], "alt") || this._attribute(imageMatch[0], "title")
          : "";
      const cover = imageMatch ? this._parseImageTag(imageMatch[0], this.siteBase) : "";
      if (!title || !cover) return;
      const updateMatch = String(fragment).match(/(?:更至|更新至)[：:]?\s*([^<]+)/i);
      seen.add(id);
      comics.push(new Comic({
        id: id,
        title: title,
        cover: cover,
        subtitle: updateMatch ? this._stripHtml(updateMatch[1]) : "",
        tags: [],
        description: "",
      }));
    };
    const html = String(body || "");
    const itemRe = /<li\b[^>]*>[\s\S]*?<\/li>/gi;
    let match;
    while ((match = itemRe.exec(html)) !== null) add(match[0]);
    if (!comics.length) {
      const linkRe = /<a\b[^>]*href=["'][^"']*\/\d+\/?["'][^>]*>[\s\S]*?<\/a>/gi;
      while ((match = linkRe.exec(html)) !== null) add(match[0]);
    }
    return comics;
  }

  _parseDetailJson(payload, id) {
    const data = payload && payload.data && typeof payload.data === "object"
      ? payload.data : {};
    const finish = String(data.finish || "");
    return {
      title: this._text(data.title || data.comic_name) || id,
      cover: this._imageUrl(data.cover || data.cover_vertical || data.cover_lateral),
      author: this._text(data.author_title || data.author_name),
      description: this._text(data.content || data.description || data.intro),
      status: finish === "2" ? "已完结" : finish === "1" ? "连载中" : "",
      tags: this._themeTexts(data.theme_id || data.theme),
    };
  }

  _parseDetailHtml(body, id) {
    const html = String(body || "");
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? this._stripHtml(titleMatch[1]).replace(/漫画.*$/, "") : id;
    const images = [];
    let cover = "";
    const imageRe = /<img\b[^>]*>/gi;
    let imageMatch;
    while ((imageMatch = imageRe.exec(html)) !== null) {
      const image = this._parseImageTag(imageMatch[0], this.siteBase);
      if (!image) continue;
      images.push(image);
      const alt = this._attribute(imageMatch[0], "alt");
      if (!cover && alt && alt === title) cover = image;
      if (!cover && /(?:comic|cover)/i.test(image)) cover = image;
    }
    const authorMatch = html.match(/href=["'][^"']*\/author\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    const descriptionMatch = html.match(/(?:简介|内容)[：:]?[\s\S]{0,200}?<p[^>]*>([\s\S]*?)<\/p>/i);
    const statusMatch = html.match(/(连载|完结)/);
    return {
      title: title || id,
      cover: cover || (images.length ? images[0] : ""),
      author: authorMatch ? this._stripHtml(authorMatch[1]) : "",
      description: descriptionMatch ? this._stripHtml(descriptionMatch[1]) : "",
      status: statusMatch ? statusMatch[1] === "完结" ? "已完结" : "连载中" : "",
      tags: [],
    };
  }

  _findChapterArray(value, depth) {
    if (!value || depth > 6) return [];
    if (Array.isArray(value)) {
      if (value.some((item) => item && typeof item === "object" && (item.chapter_id !== undefined || item.chapterId !== undefined || item.chapter_title !== undefined || item.title !== undefined))) return value;
      for (const item of value) {
        const nested = this._findChapterArray(item, depth + 1);
        if (nested.length) return nested;
      }
      return [];
    }
    if (typeof value !== "object") return [];
    const priority = ["list", "chapters", "chapterList", "data"];
    for (const key of priority) {
      if (value[key] !== undefined) {
        const nested = this._findChapterArray(value[key], depth + 1);
        if (nested.length) return nested;
      }
    }
    return [];
  }

  _parseCatalogJson(payload) {
    const episodes = this._findChapterArray(payload && payload.data, 0);
    return episodes.map((item, index) => {
      const id = item.chapter_id || item.chapterId || item.episode_id || item.id;
      const order = Number(item.number || item.chapter_number || item.order || index + 1);
      const title = item.title || item.chapter_title || item.chapter_name || ("第" + order + "话");
      return id === undefined || id === null ? null : {
        id: String(id),
        title: this._text(title),
        order: order || index + 1,
      };
    }).filter((item) => item && item.id && item.title).sort((a, b) => a.order - b.order);
  }

  _parseChapterLinks(body, comicId) {
    const chapters = [];
    const seen = new Set();
    const linkRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRe.exec(String(body || ""))) !== null) {
      const id = this._normaliseComicId(match[1]);
      const episodeId = this._normaliseEpisodeId(match[1], comicId);
      if (id !== String(comicId) || !episodeId || seen.has(episodeId)) continue;
      const title = this._stripHtml(match[2]);
      if (!title || /开始阅读|查看所有章节|下一话|上一话/i.test(title)) continue;
      seen.add(episodeId);
      chapters.push({ id: episodeId, title: title, order: chapters.length + 1 });
    }
    return chapters;
  }

  _parseImagesJson(payload) {
    const data = payload && payload.data;
    const pages = Array.isArray(data)
      ? data
      : data && Array.isArray(data.page) ? data.page : [];
    const images = [];
    const seen = new Set();
    for (const page of pages) {
      const values = typeof page === "string" ? page.split(/\s*[\r\n]+\s*/) : [page && page.image];
      for (const value of values) {
        const image = this._imageUrl(value);
        if (image && !seen.has(image)) {
          seen.add(image);
          images.push(image);
        }
      }
    }
    return images;
  }

  _parseImagesHtml(body) {
    const html = String(body || "");
    const images = [];
    const seen = new Set();
    const imageRe = /<img\b[^>]*>/gi;
    let match;
    while ((match = imageRe.exec(html)) !== null) {
      const image = this._parseImageTag(match[0], this.siteBase);
      if (image && /content\.mkzcdn\.com/i.test(image) && !seen.has(image)) {
        seen.add(image);
        images.push(image);
      }
    }
    return images;
  }

  _maxPage(payload, length, page, pageSize) {
    const data = payload && payload.data;
    const count = data && typeof data === "object" ? Number(data.count || data.total) : 0;
    if (count > 0) return Math.max(1, Math.ceil(count / pageSize));
    return length === pageSize ? page + 1 : page;
  }

  async _loadRank(order, page) {
    const currentPage = page && page > 0 ? page : 1;
    const pageSize = 12;
    try {
      const payload = await this._getJson(
        "/search/filter/",
        { order: order, page_num: currentPage, page_size: pageSize },
        this.siteBase + "/"
      );
      const comics = this._parseListJson(payload);
      return { comics: comics, maxPage: this._maxPage(payload, comics.length, currentPage, pageSize) };
    } catch (error) {
      const response = await this._get(this.siteBase + "/category/?page=" + currentPage, this.siteBase + "/");
      const comics = this._parseListHtml(response.body);
      return { comics: comics, maxPage: currentPage };
    }
  }

  explore = [
    {
      title: "热门人气",
      type: "multiPageComicList",
      load: async (page) => this._loadRank(1, page),
    },
    {
      title: "更新时间",
      type: "multiPageComicList",
      load: async (page) => this._loadRank(2, page),
    },
  ];

  category = {
    title: "漫客栈漫画",
    parts: [
      {
        name: "题材",
        type: "fixed",
        categories: [
          "全部", "霸总", "修真", "恋爱", "校园", "冒险", "搞笑", "生活", "热血",
          "架空", "后宫", "玄幻", "悬疑", "恐怖", "灵异", "动作", "科幻", "战争",
          "古风", "穿越", "竞技", "励志", "同人", "真人",
        ],
        itemType: "category",
        categoryParams: [
          "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "12", "13", "14",
          "15", "16", "17", "18", "19", "20", "21", "23", "24", "26",
        ],
      },
      {
        name: "进度",
        type: "fixed",
        categories: ["全部", "连载", "完结"],
        itemType: "category",
        categoryParams: ["0", "1", "2"],
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const currentPage = page && page > 0 ? page : 1;
      const pageSize = 12;
      const option = options && options[0] ? String(options[0]).split("-")[0] : "1";
      const params = {
        order: option,
        page_num: currentPage,
        page_size: pageSize,
      };
      if (category === "连载" || category === "完结") {
        params.finish = param || (category === "连载" ? 1 : 2);
      } else {
        params.theme_id = param || 0;
      }
      const payload = await this._getJson(
        "/search/filter/",
        params,
        this.siteBase + "/category/"
      );
      const comics = this._parseListJson(payload);
      return { comics: comics, maxPage: this._maxPage(payload, comics.length, currentPage, pageSize) };
    },
    optionList: [
      {
        label: "排序",
        options: ["1-热门人气", "2-更新时间"],
      },
    ],
  };

  search = {
    load: async (keyword, options, page) => {
      const currentPage = page && page > 0 ? page : 1;
      const pageSize = 20;
      const payload = await this._getJson(
        "/search/keyword/",
        {
          keyword: encodeURIComponent(String(keyword || "")),
          page_num: currentPage,
          page_size: pageSize,
        },
        this.siteBase + "/"
      );
      const comics = this._parseListJson(payload);
      return { comics: comics, maxPage: this._maxPage(payload, comics.length, currentPage, pageSize) };
    },
  };

  comic = {
    loadInfo: async (id) => {
      const comicId = this._normaliseComicId(id);
      if (!comicId) throw "漫画 ID 缺失";
      const comicUrl = this.siteBase + "/" + encodeURIComponent(comicId) + "/";
      let detail;
      try {
        const payload = await this._getJson(
          "/comic/info/",
          { comic_id: comicId },
          this.siteBase + "/"
        );
        detail = this._parseDetailJson(payload, comicId);
      } catch (error) {
        const response = await this._get(comicUrl, this.siteBase + "/");
        detail = this._parseDetailHtml(response.body, comicId);
      }

      let episodeItems = [];
      try {
        const catalog = await this._getJson(
          "/chapter/v1/",
          { comic_id: comicId },
          comicUrl
        );
        episodeItems = this._parseCatalogJson(catalog);
      } catch (error) {
        try {
          const response = await this._get(comicUrl, this.siteBase + "/");
          episodeItems = this._parseChapterLinks(response.body, comicId);
        } catch (error2) {
          episodeItems = [];
        }
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
        url: comicUrl,
      });
    },

    loadEp: async (comicId, epId) => {
      const id = this._normaliseComicId(comicId);
      const episodeId = this._normaliseEpisodeId(epId, id);
      if (!id || !episodeId) throw "章节 ID 缺失";
      const readerUrl = this.siteBase + "/" + encodeURIComponent(id) + "/" + encodeURIComponent(episodeId) + ".html";
      let images = [];
      try {
        const payload = await this._getJson(
          "/chapter/content/v1/",
          { chapter_id: episodeId, comic_id: id, format: 1, quality: 1, sign: 0, type: 1, uid: 0 },
          readerUrl
        );
        images = this._parseImagesJson(payload);
      } catch (error) {
        images = [];
      }
      if (!images.length) {
        const response = await this._get(readerUrl, this.siteBase + "/" + encodeURIComponent(id) + "/");
        images = this._parseImagesHtml(response.body);
      }
      if (!images.length) throw "章节页面未返回图片，可能需要登录、购买或该章节已下架";
      return { images: images };
    },

    onImageLoad: (url, comicId, epId) => {
      const id = this._normaliseComicId(comicId);
      const episodeId = this._normaliseEpisodeId(epId, id);
      return {
        headers: {
          "User-Agent": this.userAgent,
          Referer: this.siteBase + "/" + encodeURIComponent(id) + "/" + encodeURIComponent(episodeId) + ".html",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      };
    },

    idMatch: "\\d+",
    link: {
      domains: ["mkzhan.com", "mkzcdn.com"],
      linkToId: (url) => this._normaliseComicId(url) || null,
    },
  };
}
