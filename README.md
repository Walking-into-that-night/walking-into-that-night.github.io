# Liton's Blog

我的个人博客，用 [Hexo](https://hexo.io/) + [Butterfly](https://butterfly.js.org/) 构建。

- 网址：https://walking-into-that-night.github.io/
- 本仓库只存放构建结果，由 `hexo deploy` 自动生成，请勿直接修改。

## 说明
本仓库内容为自动生成，任何直接提交都可能被下一次部署覆盖。

## Note
之前好奇为什么仓库里面的README.md消失了，并且也无法直接构建，deepseek给出的回答是：

---

网站是用`hexo deploy`发布的，这个部署器的工作方式是：
1. 把仓库克隆下来
2. 清空工作区（只留`.git`）
3. 把`public/`里的东西复制进去
4. 强制推送（日志里那行`HEAD -> main (forced update)`就是证据）
5. 所以它只认`public/`里的文件。你在 GitHub 网页上、或本地直接往那个仓库加的`README.md`，不在`public/`里 → 下次`hexo g -d`就被抹掉了

---