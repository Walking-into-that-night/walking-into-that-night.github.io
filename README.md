# Liton's Blog

我的个人博客，用 [Hexo](https://hexo.io/) + [Butterfly](https://butterfly.js.org/) 构建。

- 网址：https://walking-into-that-night.github.io/
- 本仓库只存放构建结果，由 `hexo deploy` 自动生成

## 说明
1. 热力图功能依据[hexo-graph](https://github.com/codepzj/hexo-graph)实现
2. LaTex在线渲染功能依据[LaTex.js](https://github.com/michael-brade/LaTeX.js)实现
3. 标签云（类似词云功能）依据[wordcloud2.js](https://github.com/timdream/wordcloud2.js)实现
4. hello.动画灵感来自苹果公司开机欢迎界面动画
# Note
之前好奇为什么仓库里面的README.md消失了，并且也无法直接构建，deepseek给出的回答是：

---

网站是用`hexo deploy`发布的，这个部署器的工作方式是：
1. 把仓库克隆下来
2. 清空工作区（只留`.git`）
3. 把`public/`里的东西复制进去
4. 强制推送（日志里那行`HEAD -> main (forced update)`就是证据）
5. 所以它只认`public/`里的文件。你在 GitHub 网页上、或本地直接往那个仓库加的`README.md`，不在`public/`里 → 下次`hexo g -d`就被抹掉了

---