Venera 漫画源开发技能卡 v3
==================

> 可复用工作流 · 取证规范 · 安全边界 · 验收矩阵 适用：为新站点开发、审查、修复 Venera 漫画源 原则：**先取证后实现，先回归后发布；无证据标“待验证”，不写“已支持”。**

* * *

0\. 硬规则
-------

}
1. 站点特定的 URL、选择器、密钥、图片路径、路由**不跨站复制**。
}
2. 没有真实样本验证的功能，只能标“待验证”。
}
3. 图片加密必须满足四证据：密文来源、算法调用链、Key/IV 来源、解密后有效图像/JSON。
}
4. 禁止执行站点返回的 `eval` / `Function` / 任意脚本。
}
5. `maxPage` 必须有真实页面/API 依据，禁用 `page + 1` 猜。
}
6. 分类、搜索、详情、章节、图片分别建解析器，不能假设 DOM 共用。
}
7. `loadEp` 必须兼容历史入参；非法参数安全返回空图片，不发畸形请求。
}
8. 封面、正文图、缩略图、历史封面分开验证。
}
9. 权限字段明确不可读时返回空，不绕过付费/登录/版权限制。
}
10. 网络瞬态错误有限重试；403/404/权限错误不盲目重试。

* * *

1\. Venera 契约速查
---------------

| 项 | 规则 |
| --- | --- |
| 源类 | 文件中唯一 class X extends ComicSource，不手动实例化/注册 |
| 元数据 | name / key（稳定英文数字下划线）/ version / minAppVersion（三段纯数字，显式设置）/ url（无维护地址显式留空） |
| 文件命名 | 源文件名 = `name` 属性值 + `.js`（如 `name="开心看漫画"` → `开心看漫画.js`）；与显示名一一对应，不保留旧名副本 |
| 首页 | singlePageWithMultiPart 返回 { 区块名: Comic[] }；或 multiPartPage 返回 [{title, comics, viewMore}] |
| 分类 | category.parts + categoryComics.load 返回 { comics, maxPage } |
| 搜索 | search.load(keyword, options, page) 返回 { comics, maxPage } |
| 详情 | comic.loadInfo(id) 返回 new ComicDetails({...}) |
| 章节 | comic.loadEp(comicId, epId) 返回 { images: string[] } |
| 图片回调 | comic.onImageLoad(url, comicId, epId) / comic.onThumbnailLoad(url) |
| 异常返回 | 列表 { comics: [], maxPage: page }；图片 { images: [] }；不返回 null/字符串 |
| 资源清理 | 每个 HtmlDocument 完成后 dispose() |

* * *

2\. 开发工作流
---------

    0 规范学习 → 1 首页取证 → 2 搜索取证 → 3 分类取证
    → 4 详情取证 → 5 图片取证 → 6 加密判断 → 7 编码测试
    → 8 语法检查 → 9 类加载 → 10 在线真实页面验证 → 11 客户端导入 → 12 发布日志
    

### 阶段闸门

| 闸门 | 必须回答 | 未满足 |
| --- | --- | --- |
| G1 可达 | 拿到真实 HTML/响应，不是错误页/摘要 | 索要 HTML/HAR，停止猜测 |
| G2 结构 | 首页/搜索/分类/详情/章节/图片容器已确认 | 继续取证，不写完整源 |
| G3 契约 | Venera 类、返回类型、API 签名已确认 | 读官方文档/同类源 |
| G4 功能 | 分类和章节详情均有真实 URL 与样本 | 不允许只交首页/搜索源 |
| G5 协议 | 图片是直链/懒加载/脚本/JSON/加密 | 记录真实响应字段，禁止凭经验加解密 |
| G6 编译 | 语法、类加载、对象实例化通过 | 修复导入/类型后再回归 |
| G7 回归 | 首页/搜索/分类/详情/三话/封面/历史入参**在线真实页面**验证通过（退出码 0） | 标失败/待验证，不得称完成 |
| G8 交付 | 源、测试、日志、限制说明齐全；源文件按 `name.js` 命名 | 补齐，禁止只发源文件 |

* * *

3\. 证据矩阵（新站点必取）
---------------

| 编号 | 页面 | 必记录 |
| --- | --- | --- |
| P1 | 首页 | 分区容器、卡片、标题、详情 ID、封面、懒加载字段 |
| P2 | 搜索第 1 页 | method/action、字段名、首次状态、Location、最终 URL、结果容器 |
| P3 | 分类第 1 页 | 分类名、参数、URL、卡片、分页 |
| P4 | 分类第 2 页/终止页 | 页码链接、maxPage 依据、终止状态 |
| P5 | 详情 | 标题、可信封面、作者、简介、标签、章节节点 |
| P6–P8 | 最新/中间/较早章节 | 章节 ID、标题、页数、图片字段、权限字段 |
| P9 | 整话/单页阅读页 | 普通页、整话页、预加载、上下页 |
| P10 | 真实图片二进制 | 状态、Content-Type、文件头、尺寸、视觉内容 |

**每个样本记录：** URL、最终 URL、状态码、响应字节摘要、UA/Referer、取证时间、证据等级。

**取证样本 ≠ 回归样本。** 取证阶段的真实响应用于**一次性**确认页面结构与字段来源（第 3 章证据矩阵）；确认之后，回归一律改为第 12 章的在线真实页面正则验证，**不再把响应落盘成 samples/ 目录供回归使用**。原因：落盘样本会随站点刷新而漂移，且维护样本目录本身就是重复成本。

* * *

4\. 图片协议判定顺序
------------

    1. DOM 里 img src / data-src / data-original / srcset
    2. 内联脚本、全局变量、JSON-LD、播放器对象
    3. Network 响应 JSON / Base64 / 压缩内容 / ArrayBuffer
    4. 下载封面 1 张 + 章节图 2 张，查状态/文件头/尺寸
    5. 只有确认不是普通图像，才追 AES/RSA/XOR/Base64/nonce
    

| 现象 | 先查 | 结论 |
| --- | --- | --- |
| <img src> 真实 URL | 实际请求 | 直接返回绝对 URL |
| <img src> 是占位图 | data-original/data-src/srcset | 解析懒加载字段 |
| 无图片标签 | 内联 script / window 变量 | 解析脚本变量 |
| 接口返回 Base64 | JSON 字段 + 解码 | Convert.decodeBase64 |
| 脚本存在 AES 调用 | 算法/模式/Key/IV 生成 | 匹配 Convert.decryptAes* |
| URL 正常但字节乱码 | 响应头 + 前端响应解密 | onResponse(buffer) 解密 |

* * *

5\. 加密四证据规则
-----------

要写成“站点使用 AES/XOR/…”，必须**同时**具备：

}
1. 真实密文来源（内联变量 / JSON 字段 / 图片响应字节）
}
2. 站点前端或接口中可追踪的算法调用链
}
3. Key / IV / XOR Key 的来源
}
4. 解密后得到合法 JSON / URL / 真实图像的验证结果

缺任意一项 → 只能标“待分析”。

**取证技巧：** 运行混淆脚本 + 拦截 `CryptoJS.AES.decrypt` 直接拿真实 key/iv，不手推混淆字符串。

**签名 ≠ 加密：** URL 里带 `key`/`sign`（32 位 hex 等）通常是服务端签名，直接提取即可。

**Venera CBC padding：** `Convert.decryptAesCbc` 只返回原始 CBC 块明文，不自动去 PKCS#7；源中必须显式去 padding。

* * *

6\. 历史阅读参数矩阵
------------

`loadEp(comicId, epId)` 必须标准化：

| 输入形态 | 示例 | 处理 |
| --- | --- | --- |
| 普通章节 ID | 111861 | 直接用 |
| 完整章节 URL | https://host/comic/1/111861.html | 提取章节 ID |
| 组合 ID | 388762|111861 | 取最后一段 |
| 对象参数 | {epId: "..."} / {chapterId: "..."} / {url: ...} | 读白名单字段 |
| 漫画 ID 不一致 | 388695|111861 用于 388762 | 拒绝 |
| 缺失/未知 | 空值、无法识别对象 | 返回 { images: [] }，不发请求 |

**发布前必测：** 普通 ID、完整 URL、组合 ID、非法值四组。

* * *

7\. 错误分层
--------

| 日志现象 | 所属层 | 处理 |
| --- | --- | --- |
| tls handshake eof | CDN/TLS | 换已验证代理或加浏览器头 |
| 403 region denied | 地区限制 | 提示用户，源无法绕过 |
| 302 + 5 字节重定向体 | 请求入口 | 改请求最终 URL |
| HTTP 200 但正文“不存在” | 详情内容 | 识别错误页，安全抛错 |
| UnexpectedEof / timeout | 网络瞬态 | 有限重试一次 |
| params 解密成功 | 阅读协议 | 返回图片数组 |
| 静态 DOM 空 | 页面渲染 | 检查内联脚本/接口 |
| Null is not subtype of String | Venera 应用层 | 检查客户端设置/版本，非源问题 |
| 图片 200 但内容非图像 | 图片响应 | onResponse 前置校验文件头 |

**瞬态错误关键词：** `timeout` / `timed out` / `connection reset` / `connection closed` / `peer closed` / `broken pipe` / `UnexpectedEof` / `network error` / `aborted` / `temporary`

* * *

8\. 安全边界
--------

*   **禁止执行：** 站点返回的 `eval`、`Function`、内联脚本、任意远程代码。
*   **仅允许：** 白名单数字表达式求值、已取证的字符串字面量拼接、最小协议重放。
*   **未知 token / 未闭合括号 / 非数字结果 / 未识别属性** → 安全失败。
*   **权限：** `canRead === false` / `is_locked === 1` / `can_view === 0` 等明确不可读信号必须返回空。
*   **不绕过：** 付费、登录、VIP、版权地区限制。

* * *

9\. 回归矩阵
--------

「类加载」只需把源文件读进 Node 的 vm 上下文并 `new` 一次实例，**不构造任何 DOM / Network 桩**；
解析逻辑全部用第 12 章的最小成本在线验证完成。

| 层级 | 必测 | 执行方式 | 通过标准 |
| --- | --- | --- | --- |
| 语法 | node --check | `node --check 源.js` | 无报错 |
| 类加载 | 源类可实例化 | vm 读源文件 + `new XXX()`，检查 name/key/version/url | 可实例化、元数据合法 |
| 首页 | 推荐区块 | 在线 GET 首页真实页面 | 至少 1 个区块、多个卡片、封面为完整 https URL |
| 搜索 | 中文关键词 + 无结果词 | 在线 GET 搜索 URL | 有结果 + 空结果安全返回空 |
| 分类 | 2 个分类 + 第 1/2 页 | 在线 GET 分类 URL | 非空、分页链接存在、卡片含 ID/标题/封面/日期 |
| 详情 | 漫画 ID | 在线 GET 详情页 | og 字段齐全、章节 Map 非空、顺序正确 |
| 章节 | 最新 / 中间 / 较早三话 | 在线 GET 章节页 | 图片数非零、首图尾图正确、已去重 |
| 图片 | 封面 + 首图 + 尾图 | HEAD 或 Range GET 图片 | 2xx、Content-Type 为图像、字节数 > 0 |
| 历史 | ID / URL / 文件名 / 组合 / 非法值 | 本地纯函数调用 | 合法一致，非法安全失败 |
| 权限 | 可读 / 不可读分支 | 在线 GET 受限页 | 不返回受限图片 |
| 安全 | 未知动态表达式 | 构造畸形输入 | 不执行远程代码，安全返回 |
| 客户端 | Venera 实机导入 | 真机操作 | 分类 / 搜索 / 详情 / 章节图片可用 |

**输出三态：** 通过 / 失败 / 待验证。不用“理论上支持”替代真实结果。

* * *

10\. AI 任务模板
------------

    请按照《Venera 漫画源开发技能卡》为 {目标网址} 开发一个 Venera 漫画源。
    
    第一阶段：检查可达性。记录最终 URL、状态、Location、Content-Type、UA/Referer 要求、站点名称。得到 403/验证码/登录页/区域限制时停止猜测，向我索要 HTML/HAR。
    
    第二阶段：分别保存首页、搜索第 1 页、至少两个真实分类、第 2 页或终止页、详情、最新章节、中间章节、较早章节、整话/单页阅读页和至少三张真实图片。每份样本记录实际 URL、选择器、字段、样本数量、保存路径。
    
    第三阶段：建立字段矩阵。确认首页推荐、搜索表单和最终搜索 URL、分类名与参数、分类分页、详情标题/可信封面/简介/作者/标签/状态、完整章节 Map、稳定章节 ID、章节图片来源、权限字段、图片请求头。不假设不同页面共用选择器。
    
    第四阶段：必须实现 explore、search、至少一组真实分类 category/categoryComics、comic.loadInfo、comic.loadEp、必要的 onImageLoad/onThumbnailLoad。分类不能省略，章节详情不能只返回链接。
    
    第五阶段：分析图片协议。先查 img、懒加载属性、内联脚本、JSON/API、图片响应和文件头。只有同时有密文、算法调用、Key/IV 或 XOR Key 来源、解密后合法图片四类证据才实现解密。禁止 eval、Function、任意执行站点脚本和未经证实的 AES/XOR/Base64 兜底。
    
    第六阶段：node --check / 等效编译、类加载、对象契约检查。每个 HtmlDocument dispose；异常返回合规空结构；URL、编码、相对路径、完整 URL、历史参数标准化；版本递增但非必要不改 key。
    
    第七阶段：真实回归。至少验证：首页多个卡片；中文搜索和无结果搜索；两个分类和第 1/2 页或终止页；详情封面、元数据和完整章节；最新/中间/较早三话；封面、首图、尾图和去重；普通 ID、完整 URL、文件名、组合 ID、非法历史参数；权限分支；未识别动态协议安全失败；Venera 客户端实际导入。
    
    第八阶段：交付源文件、回归脚本或命令、专项开发日志、主日志更新和发布说明。发布说明使用“通过/失败/待验证”三态，写出根因、修复、真实样本、测试输出、已知限制和用户刷新动作。任何无真实样本验证的功能不得写成“已支持”。
    

* * *

11\. 发布说明最小结构
-------------

    ## v{版本} 发布说明
    
    本次范围：{首页/搜索/分类/详情/目录/封面/历史/章节协议}。
    
    ### 已取证并验证
    | 功能 | 真实样本 | 断言 | 结果 |
    |---|---|---|---|
    
    ### 本次协议或字段变更
    | 变更 | 根因 | 实现边界 | 回归样本 |
    |---|---|---|---|
    
    ### 安全与权限
    - 不执行：{站点响应中的哪些动态代码}
    - 仅支持：{已取证的解码/表达式形式}
    - 不返回：{站点明确不可读或受限的内容}
    
    ### 已知限制与用户操作
    - 待验证：{仅列未取得真实样本的功能}
    - 旧历史处理：{是否需要刷新信息/刷新全部历史}
    

* * *

12\. 最小成本在线验证：真实页面 + 正则断言
------------------------------------

**核心原则：最小成本 = Node 原生 https 模块 + 真实页面 + 正则断言。**
不引入测试框架，不构造离线样本，不做 DOM 桩。

为什么不要 DOM 桩：桩是对真实 DOM 的近似，桩通过不代表 Venera 实机通过；
而且每次都要维护一套选择器引擎。直接用真实页面原始 HTML 做正则断言，
成本更低、失败信号更直接，还能顺带验证「真实响应是否仍符合预期」。

> **最关键一条：取证明文与验证明文必须共用同一份正则。**
> 取证阶段用 `getHtml()` + 正则定位字段；验证阶段用同一份正则断言字段。
> 不要让两个脚本各写一份正则，否则两边都会漂移。

### 12.1 通用工具函数（与站点无关，可复制）

```js
const https = require("https"), http = require("http");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";

function getHtml(url, { method = "GET", body, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = (url.startsWith("https:") ? https : http).request(
      url,
      { method, headers: { "User-Agent": UA, "Referer": url, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) } },
      res => {
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => {
          let b = Buffer.concat(chunks);
          // 去掉 UTF-8 BOM，否则首个 < 匹配不到
          if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.slice(3);
          const txt = b.toString("utf8");
          if (res.statusCode >= 400) return reject(new Error("HTTP " + res.statusCode + " " + url));
          resolve(txt);
        });
      })
    );
    req.on("error", reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error("timeout " + url)); });
    if (body) req.write(body);
    req.end();
  });
}

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.error("FAIL " + name + " " + detail); }
};
```

### 12.2 验证骨架（HOST / 正则按站点替换）

```js
(async () => {
  const HOST = "https://HOST";

  /* ---- 首页：区块 + 卡片 ---- */
  const home = await getHtml(HOST + "/");
  const CARD = /class="media"[\s\S]{0,600}?href="\/manhua\/(\d+)\/"[\s\S]{0,300}?src="(https:[^"]+)"/g;
  const homeCards = home.match(CARD) || [];
  check("首页卡片数 >= 10", homeCards.length >= 10, homeCards.length);

  /* ---- 搜索：中文关键词 + 无结果词 ---- */
  const kw = encodeURIComponent("都市");
  const s1 = await getHtml(HOST + "/statics/search.aspx?key=" + kw);
  check("搜索URL编码正确", s1.includes("key=" + kw));
  check("搜索结果非空", (s1.match(/\/manhua\/\d+\//g) || []).length >= 5);
  const s2 = await getHtml(HOST + "/statics/search.aspx?key=zzzzzzqqqqq");
  check("空结果无卡片", (s2.match(/\/manhua\/\d+\//g) || []).length === 0);

  /* ---- 分类：页码写死，第 1 页也用 .html ---- */
  const c1 = await getHtml(HOST + "/list/rexue/1.html");
  const c1Cards = (c1.match(CARD) || []);
  check("分类p1卡片 >= 20", c1Cards.length >= 20, c1Cards.length);
  // 关键：分页器 href 是相对链接，必须断言 href="2.html" 而非 /list/2.html
  check("分类p1有下一页(相对链接)", c1.includes(">下一页</a>") && c1.includes('href="2.html"'));
  check("分类p1卡片带日期", /<p class="ph12">20\d\d-\d\d-\d\d<\/p>/.test(c1));
  const c2 = await getHtml(HOST + "/list/rexue/2.html");
  check("分类p2下一页是3.html", c2.includes('href="3.html"'));
  check("分类p2上一页是./", c2.includes('href="./"'));

  /* ---- 详情：og 字段 + 章节 ---- */
  const d = await getHtml(HOST + "/manhua/72639/");
  const og = k => { const m = d.match(new RegExp(k + "\" content=\"([^\"]*)\"")); return m ? m[1] : ""; };
  check("详情og:title", og("og:title").length > 0, og("og:title"));
  check("详情og:image", og("og:image").startsWith("https://"));
  check("详情og:novel:author", og("og:novel:author").length >= 0);  // 可为空但必须存在
  check("详情og:novel:category", og("og:novel:category").length > 0);
  const eps = [...new Set((d.match(/\/manhua\/72639\/(\d+)\.html/g) || []).map(u => u.match(/(\d+)\.html/)[1]))];
  check("详情章节数 >= 8", eps.length >= 8, eps.length);

  /* ---- 章节页：三话 + 图片 ---- */
  for (const ep of [eps[0], eps[Math.floor(eps.length / 2)], eps[eps.length - 1]]) {
    const e = await getHtml(HOST + "/manhua/72639/" + ep + ".html");
    const m = e.match(/qTcms_S_m_murl_e="([^"]+)"/
    check("章节有murl_e " + ep, !!m);
    if (m) {
      const urls = m[1].split("\$qingtiandy\$").filter(Boolean);
      check("章节图片 >= 10 " + ep, urls.length >= 10, urls.length);
      check("首图https " + ep, urls[0] && urls[0].startsWith("https://"));
      check("已去重 " + ep, new Set(urls).size === urls.length);
      // Range 探测图片真实可读
      await getHtml(urls[0], { method: "HEAD" });
    }
  }

  /* ---- 类加载（vm 读源文件，不构造桩） ---- */
  const vm = require("vm"), fs = require("fs");
  vm.runInNewContext(fs.readFileSync("漫画源/非常爱漫.js", "utf8"),
    { ComicSource: class {}, Comic: class {}, ComicDetails: class {} }, { timeout: 5000 });
  check("源可加载", true);

  console.log("通过 " + pass + " / 失败 " + fail);
  process.exit(fail ? 1 : 0);   // 必须用退出码
})().catch(e => { console.error("CRASH", e.message); process.exit(2); });
```

### 12.3 使用规则

| 情形 | 做法 |
| --- | --- |
| 改了解析正则 | 只跑对应小节（改分类正则就跑分类段） |
| 改了 URL 规则 | 必须跑全部小节 |
| 改了图片协议 | 必须跑章节段 + HEAD 探测 |
| 网络超时 | 重跑；重跑仍超时才怀疑站点，不算源失败 |

**在线验证的唯一代价是依赖网络**，但它换来的是：断言对象与客户端实机完全一致。
**判断标准：一次验证如果依赖「测试桩写得多像真的」，它就不是有效验证。**

### 12.4 与 DOM 桩方案对比（veryim 实测）

| 指标 | DOM 桩 + 离线样本 | 在线验证（推荐） |
| --- | --- | --- |
| 设施代码 | `mini_dom.js` + `venera_stub.js` + `regression.js` + `samples/` ≈ **30KB** | `verify.js` **11KB 单文件** |
| 依赖 | 需自建 DOM 引擎（复合/属性选择器、`el.text`、`attributes`、`dispose()`） | 0，仅 Node 内建 |
| 持久性 | 工作区重置即全部丢失 | 只依赖一个文件 |
| 单次运行 | 本地毫秒级（更快） | 约 10s（含网络往返） |
| 保真度 | **低**：桩静默消化相对链接、302、BOM、越界页重定向 | **高**：断言对象与客户端实机字节一致 |

**结论：在线验证不是「更快的同类测试」，而是同时更简单且保真度更高。**
省下的是搭桩成本 + 维护桩成本 + 桩带来的虚假安全感。
更快的本地运行给的是**错误结论**——见 12.5 的 V1。

### 12.5 断言自身的坑（都会伪装成「源代码有 bug」）

| 坑 | 错误写法 | 现象 | 正确做法 |
| --- | --- | --- | --- |
| `match` 无捕获组 | `s.match(/g/)` 取 `m[1]` | 取到完整匹配串的第 2 个字符 | 用 `[...s.matchAll(/g/)]` |
| 解码前分隔 | 对 Base64 密文直接 `split` | 永远 1 项，首图是密文原文 | 先 `decodeBase64` 再 `split` |
| 硬编码期望值 | 断言末尾 `=== "第1话"` | 该漫画缺第 1 话，误报 | 用相对断言：反转后首项 == 原末项 |
| 只测一种编码形态 | 只查 `key=%E9%83%BD%E5%B8%82` | 站点 canonical 解码成明文 | 编码与明文都接受 |

**区分「断言写错」与「源真错」的唯一方法：对比源的输出与断言的独立读数。**

本案例关键证据：`源解码图片数 <<< 45 vs 1` —— 源正确解出 45 张，断言只读到 1 张，
错在断言的解码时机。没有这种双读数对比，只会反复改源代码去迁就错误断言，把好源改坏。

**规则：断言里尽量写「源输出」与「独立读数」的对比项，二者不一致即断言可疑，而非源可疑。**



---
13\. 快速检查清单（打印版）
----------------

    □ 站点可达，拿到真实 HTML/响应
    □ 首页/搜索/分类/详情/章节/图片各自独立取证
    □ 搜索检查了 302 和最终 URL
    □ 分类检查了参数、分页、maxPage 依据
    □ 详情封面是真实漫画封面（非 share-icon / favicon）
    □ 章节 Map key 与 loadEp 参数一致
    □ 历史入参四组测试通过
    □ 图片协议已判定（直链/懒加载/脚本/JSON/加密）
    □ 加密满足四证据，否则不加解密
    □ 未执行远程 eval / Function
    □ 权限不可读分支返回空
    □ maxPage 有真实依据，非 page+1
    □ node --check 通过
    □ vm 读源文件 + new 一次可实例化（不构造 DOM 桩）
    □ 在线真实页面正则验证通过、退出码为 0
    □ 验证用的正则与取证明文是同一份
    □ 三话章节真实图片验证
    □ 封面/首图/尾图 HTTP 状态与 Content-Type 验证
    □ 异常返回合规空结构
    □ 客户端实机导入确认
    □ 发布说明含通过/失败/待验证三态
    

* * *

14\. 常用代码骨架
-----------

    class XxxSource extends ComicSource {
      name = "站点名";
      key = "stable_key";
      version = "1.0.0";
      minAppVersion = "1.0.0";
      url = "";
    
      absoluteUrl(p) {
        if (!p) return "";
        if (/^https?:\/\//i.test(p)) return p;
        if (p.startsWith("//")) return "https:" + p;
        if (p.startsWith("/")) return this.baseUrl + p;
        return this.baseUrl + "/" + p;
      }
    
      normalizeEpId(epId) {
        if (!epId) return null;
        if (typeof epId === "object") return this.normalizeEpId(epId.epId || epId.chapterId || epId.id || epId.url);
        const s = String(epId);
        const m = s.match(/\/chapter\/\d+\/(\d+)/) || s.match(/(\d+)$/);
        return m ? m[1] : null;
      }
    
      async getDocument(url) {
        const res = await Network.get(url, this.headers);
        if (res.status !== 200) throw `Invalid status: ${res.status}`;
        return new HtmlDocument(res.body);
      }
    
      comic = {
        loadInfo: async (id) => {
          let doc = null;
          try {
            doc = await this.getDocument(this.absoluteUrl("/comic/" + id));
            const chapters = new Map();
            // ... 解析章节
            return new ComicDetails({ title, cover, chapters });
          } finally {
            doc?.dispose();
          }
        },
        loadEp: async (comicId, epId) => {
          const cid = this.normalizeEpId(epId);
          if (!cid) return { images: [] };
          try {
            // ... 解析图片
            return { images };
          } catch (e) {
            return { images: [] };
          }
        },
        onImageLoad: (url, comicId, epId) => ({
          headers: { "Referer": this.absoluteUrl(epId || "/") },
        }),
      };
    }
    

* * *

**技能卡结束。** 使用方式：新站点直接套用工作流 + 任务模板；排错时按错误分层定位；发布前逐项走回归矩阵与检查清单。