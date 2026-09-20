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

/* ---------- 2. 首页：常用工具模块 ---------- */

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

/* ---------- 3. 导航栏左上角：站点名改成带图标的"首页" ---------- */
/* 注意只改导航栏这一处。首屏大标题和浏览器标签页用的是 config.title，
   改了会把它们也一起变掉，所以这里用脚本单独处理。 */

(function () {
  var brand = document.querySelector('#blog-info .site-name')
  if (brand) {
    brand.innerHTML = '<i class="fas fa-home" style="margin-right:6px"></i>首页'
  }
})();

/* ---------- 4. 导航栏右上角：日夜模式 + 简繁切换 ---------- */
/* 主题的点击逻辑绑定在 #rightside 容器上（main.js 第 738 行），按钮不能直接
   搬走，否则点击会失效。所以原按钮留在原地、用 CSS 隐藏，这里在导航栏放一份
   "镜像"，点击时转发给原按钮。 */

(function () {
  var menuItems = document.querySelector('#menus .menus_items')
  if (!menuItems) return

  function addMirror (sourceId, iconClass, withLabel) {
    var source = document.getElementById(sourceId)
    if (!source) return

    var btn = document.createElement('a')
    btn.className = 'site-page nav-mirror'
    btn.href = 'javascript:;'
    btn.title = source.getAttribute('title') || ''

    function refresh () {
      // 简繁按钮的文字会在 简 / 繁 之间切换，这里跟着同步
      var label = withLabel ? source.textContent.trim() : ''
      btn.innerHTML = '<i class="' + iconClass + '"></i>' +
        (label ? '<span> ' + label + '</span>' : '')
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault()
      source.click()            // 转发给右下角那个真按钮
      setTimeout(refresh, 60)   // 等主题更新完文字再同步
    })

    refresh()
    menuItems.appendChild(btn)
  }

  addMirror('darkmode', 'fas fa-adjust', false)
  addMirror('translateLink', 'fas fa-language', true)
})();
