/* ==============================
   博客自定义脚本
   通过 _config.butterfly.yml 的 inject.bottom 引入，每个页面都会加载
   ============================== */

/* ---------- 1. 侧边栏作者卡片：去掉"分类"，把"标签"指向标签云页面 ---------- */

(function () {
  var links = document.querySelectorAll('.site-data a')
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href') || ''
    var label = links[i].querySelector('.headline')
    var text = label ? label.textContent.trim() : ''

    // 分类：整项删掉（侧边栏一份、移动端菜单里还有一份）
    if (/categories\/?$/.test(href) ||
        text === '分类') {
      links[i].parentNode.removeChild(links[i])
      continue
    }

    // 标签：指到标签云页面，并把名字改成"标签云"
    if (/tags\/?$/.test(href) || text === '标签' ||
        /\/TagCloud\/$/.test(href) || text === '标签云') {
      links[i].setAttribute('href', '/TagCloud/')
      if (label) label.textContent = '标签云'
    }
  }
})();

/* ---------- 2. 侧边栏"网站信息"卡片：加一个博客统计入口（所有页面生效） ---------- */

(function () {
  var webinfo = document.querySelector('.card-webinfo .webinfo')
  if (!webinfo) return
  if (webinfo.querySelector('.stats-entry')) return // 防止重复插入

  var item = document.createElement('div')
  item.className = 'webinfo-item stats-entry'
  item.innerHTML =
    '<div class="item-name">热力图 :</div>' +
    '<div class="item-count"><a href="/stats/" title="查看博客热力图">查看 →</a></div>'
  webinfo.appendChild(item)
})();

/* ---------- 3. 首页：常用工具模块 ---------- */

(function () {
  // 只在首页生效（归档页、文章页等一律跳过）
  if (typeof GLOBAL_CONFIG_SITE === 'undefined' || GLOBAL_CONFIG_SITE.pageType !== 'home') return

  var posts = document.getElementById('recent-posts')
  if (!posts) return

  // 加工具
  var tools = [
    { name: 'DeepSeek Platform', url: 'https://platform.deepseek.com/usage', icon: 'fas fa-wallet' },
    { name: '树洞', url: 'https://new-t.github.io/?###', icon: 'fas fa-tree' }
  ]

  var title = '常用' // 模块标题

  var html = '<div class="my-tools"><div class="my-tools-title">' + title + '</div><div class="my-tools-list">'
  tools.forEach(function (t) {
    html += '<a href="' + t.url + '" target="_blank" rel="noopener">' +
              '<i class="' + t.icon + '"></i> ' + t.name +
            '</a>'
  })
  html += '</div></div>'

  posts.insertAdjacentHTML('afterbegin', html)
})();

/* ---------- 4. 导航栏左上角：站点名改成带图标的"首页" ---------- */
/* 注意只改导航栏这一处。首屏大标题和浏览器标签页用的是 config.title，
   改了会把它们也一起变掉，所以这里用脚本单独处理。 */

(function () {
  var brand = document.querySelector('#blog-info .site-name')
  if (brand) {
    brand.innerHTML = '<i class="fas fa-home" style="margin-right:6px"></i>首页'
  }
})();
