# GitHub 发布检查清单

## 1. 发布前验证

在仓库根目录运行：

```bash
npm run check
npm test
```

然后在 Chrome 中加载 `chrome` 文件夹，手动检查：

- 网易云未登录、已登录和登录过期状态
- 最近播放为空、正常和网络失败状态
- 飞书检查、首次绑定、账号不一致、改绑与解除绑定
- 立即同步成功、重复签名和接口失败状态
- 每日同步开关、时间修改与浏览器重启后的闹钟
- 长昵称、长歌名以及键盘 Tab / Enter 操作

## 2. 隐私与仓库内容

- 确认仓库中没有 Cookie、请求头、账号 ID、`.pem`、`.crx` 或本机环境文件。
- 确认 `PRIVACY.md` 与实际代码的数据用途一致。
- 在仓库设置中启用 **Private vulnerability reporting**。
- 确认 `LICENSE`、`NOTICE` 与 `TRADEMARKS.md` 已包含在仓库和发布包中。

## 3. 创建发布包

发布包的根目录必须直接包含 `manifest.json`，不要再套一层 `chrome` 文件夹：

```bash
mkdir -p dist
cd chrome
zip -r ../dist/netease-feishu-signature-3.0.0.zip . \
  -x '*.DS_Store'
cd ..
zip -j dist/netease-feishu-signature-3.0.0.zip \
  LICENSE NOTICE TRADEMARKS.md
```

解压后再次确认 `manifest.json` 位于包的最外层。

## 4. GitHub Release

1. 创建标签 `v3.0.0`。
2. Release 标题使用 `网易云听歌同步飞书签名 3.0.0`。
3. 发布说明引用 `CHANGELOG.md` 的 3.0.0 内容。
4. 可附加 `dist/netease-feishu-signature-3.0.0.zip`，同时保留源码下载。

## 5. Chrome 应用商店说明

本扩展需要 Cookie 权限，并使用飞书网页版内部接口。提交商店前应单独核对届时的 Chrome Web Store 政策、填写准确的单一用途与数据使用披露，并准备可公开访问的隐私政策。GitHub 可公开发布不代表商店审核一定通过。
