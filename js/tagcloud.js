/* ==============================
   标签云页面
   读取 /tagcloud-data.json，用 wordcloud2.js 画成词云
   点击某个词会跳到对应的标签页（例如 /tags/LaTeX/）

   wordcloud2.js 的用法只有一行：WordCloud(容器元素, 选项)
   传 <canvas> 得到图片，传普通元素则生成一堆 <span>（这里用后者，
   这样能配合 CSS 做悬停效果，也方便点击跳转）。
   ============================== */

(function () {
  var box = document.getElementById('tagcloud')
  if (!box) return

  var BUNDLE = '/js/wordcloud2.js?v=1'
  var DATA = '/tagcloud-data.json'

  // 词的颜色，循环取用
  var PALETTE = ['#4C8C99', '#D74B76', '#1EAEAC', '#F5A05D', '#7C7CE0', '#5FA85F']

  box.textContent = '正在生成标签云…'

  function loadScript (src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script')
      s.src = src
      s.onload = resolve
      s.onerror = function () { reject(new Error('无法加载 ' + src)) }
      document.head.appendChild(s)
    })
  }

  // 不支持 canvas 时的退路：一个普通的标签列表
  function fallbackList (tags) {
    var html = '<ul class="tagcloud-list">'
    tags.forEach(function (t) {
      html += '<li><a href="' + t[2] + '">' + t[0] + '</a>'
      html += '<span class="tagcloud-count">' + t[1] + '</span></li>'
    })
    return html + '</ul>'
  }

  Promise.all([
    loadScript(BUNDLE),
    fetch(DATA, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error(DATA + ' 返回 HTTP ' + res.status)
      return res.json()
    })
  ]).then(function (result) {
    var WordCloud = window.WordCloud
    var tags = result[1]

    box.textContent = ''

    if (!tags || !tags.length) {
      box.innerHTML = '<p class="tagcloud-note">还没有任何标签。给文章写上 tags 之后，这里就会长出来。</p>'
      return
    }

    if (!WordCloud || WordCloud.isSupported === false) {
      box.innerHTML = fallbackList(tags)
      return
    }

    var i = 0
    WordCloud(box, {
      list: tags,
      gridSize: 14,
      // 传函数时返回值就是像素字号；文章越多字越大，但不是线性放大
      weightFactor: function (count) {
        return Math.round(14 + Math.pow(count, 0.8) * 12)
      },
      fontFamily: '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif',
      color: function () {
        return PALETTE[i++ % PALETTE.length]
      },
      rotateRatio: 0,          // 全部水平排列，中文竖着很难看
      backgroundColor: 'transparent',
      click: function (item) {
        if (item && item[2]) window.location.href = item[2]
      }
    })
  }).catch(function (err) {
    box.innerHTML = '<p class="tagcloud-note">标签云加载失败：' + err.message + '</p>'
    console.error('[tagcloud]', err)
  })
})()
