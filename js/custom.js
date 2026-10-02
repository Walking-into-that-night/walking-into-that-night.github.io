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

/* ---------- 4. 导航栏右上角：简繁切换 ---------- */
/* 主题的点击逻辑绑定在 #rightside 容器上（main.js 第 738 行），按钮不能直接
   搬走，否则点击会失效。所以原按钮留在原地、用 CSS 隐藏，这里在导航栏放一份
   "镜像"，点击时转发给原按钮。日夜切换镜像已删：站点强制夜间模式。 */

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

  addMirror('translateLink', 'fas fa-language', true)
})();

/* ---------- 回到顶部按钮的滚动进度圆环 ---------- */
;(function () {
  var RING_SIZE = 35
  var CENTER = 17.5
  var RADIUS = 16 // 半径 + 半线宽(1.5) = 17.5，弧线外缘正好贴齐 35px 按钮边缘
  var CIRC = 2 * Math.PI * RADIUS // 圆环周长，进度 0% 时弧长为 0

  function buildRing (btn) {
    var old = btn.querySelector('.scroll-progress-ring')
    if (old) return old.querySelector('.ring-progress')

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'scroll-progress-ring')
    svg.setAttribute('viewBox', '0 0 ' + RING_SIZE + ' ' + RING_SIZE)

    var track = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    track.setAttribute('class', 'ring-track')
    var bar = track.cloneNode(false)
    bar.setAttribute('class', 'ring-progress')
    ;[track, bar].forEach(function (c) {
      c.setAttribute('cx', CENTER)
      c.setAttribute('cy', CENTER)
      c.setAttribute('r', RADIUS)
      svg.appendChild(c)
    })

    bar.style.strokeDasharray = CIRC.toFixed(2)
    bar.style.strokeDashoffset = CIRC.toFixed(2)
    btn.appendChild(svg)
    return bar
  }

  var btn = document.getElementById('go-up')
  if (!btn) return
  var bar = buildRing(btn)
  var ticking = false

  function update () {
    ticking = false
    var max = document.documentElement.scrollHeight - window.innerHeight
    var p = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0
    bar.style.strokeDashoffset = (CIRC * (1 - p)).toFixed(2)
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true
      requestAnimationFrame(update)
    }
  }, { passive: true })
  window.addEventListener('resize', update)
  update()
})();
