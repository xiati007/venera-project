// 非常爱漫 veryim.com 最小成本在线验证：真实页面 + 正则断言
// 运行：node verify.js   （退出码 0 = 全通过）
// 关键点：图片断言必须「先 decodeBase64 再 split」，$qingtiandy$ 是解码后的字符；
//         String.match(/g/) 不含捕获组，必须用 matchAll。
const https = require("https");
const vm = require("vm");
const fs = require("fs");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";
const HOST = "https://www.veryim.com";
const SRC = "漫画源/非常爱漫.js";
const CID = "72639";

function getHtml(url, { timeout = 25000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": UA, "Referer": HOST + "/" } }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        let b = Buffer.concat(chunks);
        if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.slice(3);
        const txt = b.toString("utf8");
        if (res.statusCode >= 400) return reject(new Error("HTTP " + res.statusCode + " " + url));
        resolve(txt);
      });
    });
    req.on("error", reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error("timeout " + url)); });
  });
}

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  OK   " + name); }
  else { fail++; console.error("  FAIL " + name + (detail ? "  <<< " + detail : "")); }
};

// 用 <br> 切断卡片，避免 [\s\S]*? 跨卡片误匹配
const CARD = /class="media"[\s\S]*?<a href="\/manhua\/(\d+)\/"[\s\S]*?<img src="(https:[^"]+)"[\s\S]*?<\/a><br>/g;
const cardIds = h => [...h.matchAll(CARD)].map(m => m[1]);
const cardCovers = h => [...h.matchAll(CARD)].map(m => m[2]);

// class 是词法声明，不绑定到全局对象 => 访问代码必须在同一 vm 上下文执行
function vmEval(expr, vars) {
  const ctx = {
    ComicSource: class {},
    Comic: class { constructor(o) { Object.assign(this, o); } },
    ComicDetails: class { constructor(o) { Object.assign(this, o); } },
  };
  if (vars) Object.assign(ctx, vars);
  vm.runInNewContext(fs.readFileSync(SRC, "utf8"), ctx, { filename: SRC, timeout: 5000 });
  return vm.runInNewContext(expr, ctx, { filename: SRC, timeout: 5000 });
}

// 源的真实章节图片逻辑：decodeBase64 -> split($qingtiandy$) -> absoluteUrl -> 去重
const epUrls = html => vmEval(`(() => {
  const i = new FeiChangAiMan();
  const m = html.match(/qTcms_S_m_murl_e\\s*=\\s*"([A-Za-z0-9+\\/=]+)"/);
  if (!m) return null;
  const seen = new Set(); const out = [];
  for (const u of i.decodeBase64(m[1]).split("$qingtiandy$").filter(Boolean)) {
    const a = i.absoluteUrl(u);
    if (a && !seen.has(a)) { seen.add(a); out.push(a); }
  }
  return out;
})()`, { html });

(async () => {
  const t0 = Date.now();
  console.log("== 1. 语法 + 类加载 + 纯函数 ==");
  try {
    require("child_process").execFileSync("node", ["--check", SRC], { stdio: "pipe" });
    check("node --check", true);
  } catch (e) { check("node --check", false, (e.stderr || "").toString().slice(0, 120)); }

  const m1 = vmEval(`(() => {
    const i = new FeiChangAiMan();
    return {
      name: i.name, key: i.key, version: i.version, url: i.url,
      ranking: !!i.categoryComics.ranking, rankingPage: i.category.enableRankingPage,
      parts: i.category.parts.length, opt: i.categoryComics.optionList.length,
      optLen: [i.categoryComics.optionList[0].options.length, i.categoryComics.optionList[1].options.length],
      epId: i.normalizeEpId("/manhua/72639/2051300.html"),
      epComb: i.normalizeEpId("72639|2051300"),
      epBad: i.normalizeEpId("abc"),
      cid: i.normalizeComicId("/manhua/72639/"),
      b64: i.decodeBase64("aGVsbG8=").trim()
    };
  })()`);
  check("name", m1.name === "非常爱漫", m1.name);
  check("key", m1.key === "veryim", m1.key);
  check("version 三段式", /^\d+\.\d+\.\d+$/.test(m1.version), m1.version);
  check("url", m1.url === HOST, m1.url);
  check("已移除 ranking 页", !m1.ranking);
  check("enableRankingPage=false", m1.rankingPage === false);
  check("分类单入口", m1.parts === 1, m1.parts);
  check("筛选面板 2 组", m1.opt === 2, m1.opt);
  check("题材/状态保留未扩充", JSON.stringify(m1.optLen) === JSON.stringify([14, 3]), JSON.stringify(m1.optLen));
  check("normalizeEpId 路径", m1.epId === "2051300", m1.epId);
  check("normalizeEpId 组合", m1.epComb === "2051300", m1.epComb);
  check("normalizeEpId 非法=null", m1.epBad === null, m1.epBad);
  check("normalizeComicId", m1.cid === "72639", m1.cid);
  check("decodeBase64", m1.b64 === "hello", m1.b64);

  console.log("== 2. hasNextPage（相对链接分页器） ==");
  const m2 = vmEval(`(() => {
    const f = new FeiChangAiMan().hasNextPage.bind(new FeiChangAiMan());
    return {
      yesRel: f('<a href="3.html" class="btn">下一页</a>'),
      noPager: f('<a href="./" class="btn">上一页</a>'),
      yesRelBom: f('<a href="./">上一页</a><a href="2.html">下一页</a>')
    };
  })()`);
  check("相对 href=3.html 判真", m2.yesRel === true);
  check("仅上一页判假(末页)", m2.noPager === false);
  check("上一页+下一页判真", m2.yesRelBom === true);

  console.log("== 3. 首页 ==");
  try {
    const home = await getHtml(HOST + "/");
    const ids = cardIds(home);
    const cov = cardCovers(home);
    check("卡片数 >= 10", ids.length >= 10, ids.length);
    check("卡片 ID 全为数字", ids.every(x => /^\d+$/.test(x)), ids[0]);
    check("封面全为绝对 https", cov.length > 0 && cov.every(x => /^https:\/\/www\.veryim\.com\/upload2\//.test(x)), cov[0]);
    check("区块面板 >= 2", (home.match(/class="panel impanel-default"/g) || []).length >= 2);
  } catch (e) { check("首页请求", false, e.message); }

  console.log("== 4. 搜索 ==");
  try {
    const s1 = await getHtml(HOST + "/statics/search.aspx?key=" + encodeURIComponent("都市"));
    check("URL 中文编码", s1.indexOf("key=" + encodeURIComponent("都市")) >= 0 || s1.indexOf("key=都市") >= 0);
    check("有结果 >= 5", (s1.match(/\/manhua\/\d+\/"/g) || []).length >= 5,
          (s1.match(/\/manhua\/\d+\/"/g) || []).length);
    const s2 = await getHtml(HOST + "/statics/search.aspx?key=zzzzzzqqqqq");
    check("空结果无卡片", (s2.match(/\/manhua\/\d+\/"/g) || []).length === 0,
          (s2.match(/\/manhua\/\d+\/"/g) || []).length);
  } catch (e) { check("搜索请求", false, e.message); }

  console.log("== 5. 分类（页码写死，第 1 页也用 .html） ==");
  try {
    const c1 = await getHtml(HOST + "/list/rexue/1.html");
    const ids = cardIds(c1);
    check("p1 卡片 >= 20", ids.length >= 20, ids.length);
    check("p1 卡片 ID 全为数字", ids.every(x => /^\d+$/.test(x)), ids[0]);
    check("p1 封面全 https", cardCovers(c1).every(x => /^https:\/\//.test(x)));
    check("p1 下一页=相对 href=2.html", c1.includes(">下一页</a>") && c1.includes('href="2.html"'));
    check("p1 卡片带更新日期", /<p class="ph12">20\d\d-\d\d-\d\d<\/p>/.test(c1));
    check("源 hasNextPage 对 p1 判真", vmEval('new FeiChangAiMan().hasNextPage(h)', { h: c1 }) === true);
    check("源 hasNextPage 对 p2 判真",
          vmEval('new FeiChangAiMan().hasNextPage(h)', { h: await getHtml(HOST + "/list/rexue/2.html") }) === true);
    const c2 = await getHtml(HOST + "/list/rexue/2.html");
    check("p2 下一页=3.html", c2.includes('href="3.html"'));
    check("p2 上一页=./", c2.includes('href="./"'));
    check("p2 卡片 >= 20", cardIds(c2).length >= 20, cardIds(c2).length);
    check("p1/p2 无重复卡片", new Set(ids.concat(cardIds(c2))).size === ids.length + cardIds(c2).length);
  } catch (e) { check("分类请求", false, e.message.slice(0, 120)); }

  console.log("== 6. 详情（og 字段 + 章节，限定 play_0 容器） ==");
  let eps = [], names = [];
  try {
    const d = await getHtml(HOST + "/manhua/" + CID + "/");
    const og = k => { const x = d.match(new RegExp(k + '" content="([^"]*)"')); return x ? x[1] : null; };
    check("og:title", !!og("og:title"), og("og:title"));
    check("og:image", og("og:image") && og("og:image").startsWith("https://"));
    check("封面非 favicon/share-icon", (og("og:image") || "").indexOf("upload2") >= 0);
    check("og:novel:category", !!og("og:novel:category"), og("og:novel:category"));
    check("og:novel:status", !!og("og:novel:status"), og("og:novel:status"));
    check("og:novel:author 字段存在", og("og:novel:author") !== null);

    // 与源选择器一致：只在 #play_0 ul.list-charts 内提取，容忍 <li> 前空白
    const i = d.indexOf('id="play_0"');
    const j = d.indexOf("</ul>", i);
    const lis = [...d.slice(i, j).matchAll(/<li>\s*<a href="\/manhua\/\d+\/(\d+)\.html"[^>]*>([^<]+)<\/a>/g)]
      .map(x => ({ id: x[1], name: x[2].trim() }));
    eps = lis.map(x => x.id);
    names = lis.map(x => x.name);
    check("章节数 >= 8", lis.length >= 8, lis.length);
    const num = n => parseInt(n.replace(/\D/g, ""), 10);
    check("页面倒序(最新在前)", num(names[0]) > num(names[names.length - 1]), names[0] + " → " + names[names.length - 1]);
    // 源用 DOM 顺序整体反转
    const rev = [...lis].reverse();
    check("反转后首项=最早一话", rev[0].name === names[names.length - 1], rev[0].name);
    check("反转后末页=最新一话", rev[rev.length - 1].name === names[0], rev[rev.length - 1].name);
    check("反转不改变 ID 集合", JSON.stringify(rev.map(x => x.id)) === JSON.stringify([...eps].reverse()));
  } catch (e) { check("详情请求", false, e.message.slice(0, 120)); }

  console.log("== 7. 章节页（三话，走源真实解码逻辑） ==");
  try {
    const three = eps.length >= 3 ? [eps[0], eps[Math.floor(eps.length / 2)], eps[eps.length - 1]] : [];
    check("三话已选定", three.length === 3, three.join(","));
    for (const ep of three) {
      const h = await getHtml(HOST + "/manhua/" + CID + "/" + ep + ".html");
      const urls = epUrls(h);
      check("murl_e 存在 " + ep, Array.isArray(urls));
      if (!urls) continue;
      check("图片 >= 10 " + ep, urls.length >= 10, urls.length);
      check("首图 https " + ep, /^https:\/\/img\d+\.du8\.in\//.test(urls[0]), urls[0].slice(0, 50));
      check("尾图 https " + ep, /^https:\/\/img\d+\.du8\.in\//.test(urls[urls.length - 1]));
      check("首尾不同 " + ep, urls[0] !== urls[urls.length - 1]);
      check("已去重 " + ep, new Set(urls).size === urls.length);
      check("全部 webp " + ep, urls.every(x => /\.webp($|\?)/.test(x)));
      const hdr = vmEval('new FeiChangAiMan().comic.onImageLoad(u, "' + CID + '", "' + ep + '").headers', { u: urls[0] });
      check("onImageLoad 带 Referer " + ep,
            !!(hdr && hdr.Referer) && hdr.Referer.indexOf("/manhua/" + CID + "/" + ep + ".html") >= 0, hdr && hdr.Referer);
      check("onImageLoad 带 UA " + ep, !!(hdr && hdr["User-Agent"]));
    }
  } catch (e) { check("章节请求", false, e.message.slice(0, 120)); }

  console.log("\n==== 通过 " + pass + " / 失败 " + fail + " ====");
  console.log("耗时 " + ((Date.now() - t0) / 1000).toFixed(1) + "s");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH", e.message); process.exit(2); });
