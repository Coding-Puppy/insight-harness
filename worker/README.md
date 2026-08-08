# Insight Harness Proxy

Cloudflare Worker 代理：把 Gemini API Key 放在服务端，让 GitHub Pages / 分享链接上的访客也能直接使用 Live Mode。

## Deploy

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
# 粘贴你的 Gemini API Key
npm run deploy
```

部署成功后会得到类似：

```text
https://insight-harness-proxy.<subdomain>.workers.dev
```

然后回到仓库根目录，编辑 `config.public.js`：

```js
proxyUrl: "https://insight-harness-proxy.<subdomain>.workers.dev/api/gemini",
liveModeDefault: true,
```

再把前端推到 GitHub Pages。访客打开页面即可 Live，无需填写 Key。

## Local Dev

```bash
cd worker
npm install
npx wrangler secret put GEMINI_API_KEY   # 首次
npm run dev
```

默认本地地址：`http://127.0.0.1:8787/api/gemini`

可在 `config.local.js` 里临时写：

```js
proxyUrl: "http://127.0.0.1:8787/api/gemini",
```

## Safety

- Key 只存在 Cloudflare Secret，不进 Git
- 内置每 IP 每小时约 40 次请求限制（大约几次完整 Run）
- 可用 `ALLOWED_ORIGINS` 限制仅你的 Pages 域名可调用
