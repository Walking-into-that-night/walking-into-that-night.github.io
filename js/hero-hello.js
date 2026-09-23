/* ==============================
   首页大标题：手写签名动画

   把原来的 H1 "Liton's Blog" 隐藏，在同一个位置放一段"一笔写成"的
   SVG 描边动画（来自 位图-pen.html）。

   动画原理和原文件一致：先用 stroke-dasharray/dashoffset 把整条线藏起来，
   再用 Web Animations API 把 dashoffset 从"全长"动画到 0，线条就一点点
   画出来；多条路径之间留一点停顿，画完停一秒再循环。

   SVG 的路径数据有 11 KB，不适合塞进 JS，所以放在 /anim/hello.html 里，
   运行时抓取、只取出 <svg> 部分插进页面。
   ============================== */

(function () {
  // 只有首页大图区域有这个容器；其他页面直接退出
  var info = document.getElementById('site-info')
  if (!info) return
  if (info.querySelector('.hero-hello')) return   // 防止重复插入

  // 1. 把原来的文字标题藏掉（保留元素，只是不显示）
  var title = document.getElementById('site-title')
  if (title) title.style.display = 'none'

  // 2. 在原标题的位置建一个容器
  var holder = document.createElement('div')
  holder.className = 'hero-hello'
  info.insertBefore(holder, info.firstChild)

  // 3. 取出 SVG 放进来，然后开始画
  fetch('/anim/hello.html', { cache: 'no-cache' })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return res.text()
    })
    .then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html')
      var svg = doc.querySelector('svg')
      if (!svg) throw new Error('没找到 svg')

      holder.appendChild(document.importNode(svg, true))
      startDrawing(holder)
    })
    .catch(function (err) {
      console.error('[hero-hello]', err)
      // 拿不到动画就把标题放回去，至少别让首页空着
      // 注意用 'block' 而不是 ''：CSS 里有 #site-info #site-title{display:none}，
      // 清空行内样式挡不住它，必须用行内样式显式覆盖回去
      if (title) title.style.display = 'block'
      if (holder.parentNode) holder.parentNode.removeChild(holder)
    })

  /* ---------- 逐笔画出 ---------- */

  function startDrawing (root) {
    var TOTAL_MS = 2600   // 一遍写完的时长
    var GAP_MS = 120      // 每笔之间的停顿
    var PAUSE_MS = 1000   // 两遍之间的停顿

    var paths = Array.prototype.slice.call(root.querySelectorAll('path'))
    if (!paths.length) return

    var lens = paths.map(function (p) { return p.getTotalLength() })
    var sum = lens.reduce(function (a, b) { return a + b }, 0)
    if (!sum) return

    // 按各段长度分配时间，长的一笔花的时间也长
    var scale = (TOTAL_MS - GAP_MS * (paths.length - 1)) / sum

    // 静态样式：未播放时整条藏起来
    paths.forEach(function (p, i) {
      p.style.strokeDasharray = lens[i]
      p.style.strokeDashoffset = lens[i]
    })

    var anims = []

    function play () {
      anims.forEach(function (a) { a.cancel() })
      var at = 0
      anims = paths.map(function (p, i) {
        var anim = p.animate(
          [{ strokeDashoffset: lens[i] }, { strokeDashoffset: 0 }],
          {
            duration: lens[i] * scale,
            delay: at,
            easing: 'linear',
            fill: 'both'
          }
        )
        at += lens[i] * scale + GAP_MS
        return anim
      })
    }

    // 循环播放
    ;(function loop () {
      play()
      setTimeout(loop, TOTAL_MS + PAUSE_MS)
    })()
  }
})()
