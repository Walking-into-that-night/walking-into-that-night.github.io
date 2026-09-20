/* ==============================
   液体玻璃 UI（Liquid Glass）
   改造自 Shu Ding 的 liquid-glass 项目：
   https://github.com/shuding/liquid-glass

   原理：用 canvas 逐像素计算「圆角矩形有符号距离场(SDF)」生成一张位移贴图，
   交给 SVG 的 feDisplacementMap 滤镜，再用 backdrop-filter: url(#滤镜)
   作用到元素上。靠近边缘的像素会被朝中心方向拉扯，于是背后的内容就像
   透过一块厚玻璃一样发生折射。

   原版是一个能用鼠标拖着跑的玻璃块；这里改成给站内已有的毛玻璃元素使用。
   如果浏览器不支持用 SVG 滤镜做 backdrop-filter，脚本会直接退出，
   元素保留 CSS 里原有的普通毛玻璃效果，不会变样。
   ============================== */

(function () {
  'use strict'

  // 不支持 url() 形式的 backdrop-filter 就放弃，保留 CSS 的毛玻璃
  var supportsUrlFilter = false
  try {
    supportsUrlFilter = !!(window.CSS && CSS.supports &&
      (CSS.supports('backdrop-filter', 'url(#x)') ||
       CSS.supports('-webkit-backdrop-filter', 'url(#x)')))
  } catch (e) { supportsUrlFilter = false }
  if (!supportsUrlFilter) return

  // 要应用液体玻璃的元素（和 custom.css 里做毛玻璃的那批一致，另加导航栏）
  var SELECTOR = [
    '#aside-content .card-widget',
    '#recent-posts > .recent-post-item',
    '#footer'
  ].join(', ')

  // 折射强度。原项目是给 300x200 的小方块调的，这里的元素要宽得多，
  // 直接套用会夸张到变形，所以按比例压一下。想要更明显就调大，0.2~0.8 之间比较合理。
  var STRENGTH = 0.8

  var NS = 'http://www.w3.org/2000/svg'
  var XLINK = 'http://www.w3.org/1999/xlink'

  /* ---------- 和原项目一致的数学工具 ---------- */

  function smoothStep (a, b, t) {
    t = Math.max(0, Math.min(1, (t - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }

  function len (x, y) {
    return Math.sqrt(x * x + y * y)
  }

  function roundedRectSDF (x, y, width, height, radius) {
    var qx = Math.abs(x) - width + radius
    var qy = Math.abs(y) - height + radius
    return Math.min(Math.max(qx, qy), 0) +
      len(Math.max(qx, 0), Math.max(qy, 0)) - radius
  }

  /* ---------- 生成位移贴图 ---------- */

  function buildMap (w, h, dpi) {
    var cw = Math.max(1, Math.round(w * dpi))
    var ch = Math.max(1, Math.round(h * dpi))

    var canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    var ctx = canvas.getContext('2d')

    var data = new Uint8ClampedArray(cw * ch * 4)
    var raw = []
    var maxScale = 0
    var i, x, y, ix, iy, d, disp, scaled, px, py, dx, dy

    for (i = 0; i < data.length; i += 4) {
      x = (i / 4) % cw
      y = Math.floor(i / 4 / cw)

      // 归一化到 [-0.5, 0.5]
      ix = x / cw - 0.5
      iy = y / ch - 0.5

      // 圆角矩形的距离场（参数沿用原项目）
      d = roundedRectSDF(ix, iy, 0.3, 0.2, 0.6)
      disp = smoothStep(0.8, 0, d - 0.15)
      scaled = smoothStep(0, 1, disp)

      px = ix * scaled + 0.5
      py = iy * scaled + 0.5

      dx = px * cw - x
      dy = py * ch - y

      if (Math.abs(dx) > maxScale) maxScale = Math.abs(dx)
      if (Math.abs(dy) > maxScale) maxScale = Math.abs(dy)
      raw.push(dx, dy)
    }

    maxScale *= 0.5

    var idx = 0
    for (i = 0; i < data.length; i += 4) {
      // 位移编码进 R/G 通道：128 表示"不偏移"
      data[i] = raw[idx++] / maxScale * 255 + 127.5
      data[i + 1] = raw[idx++] / maxScale * 255 + 127.5
      data[i + 2] = 0
      data[i + 3] = 255
    }

    ctx.putImageData(new ImageData(data, cw, ch), 0, 0)
    return { url: canvas.toDataURL(), scale: maxScale / dpi * STRENGTH }
  }

  /* ---------- 给一个元素挂上滤镜 ---------- */

  var seq = 0

  function applyGlass (el) {
    var w = el.offsetWidth
    var h = el.offsetHeight
    if (!w || !h) return

    // 太大的元素降低贴图分辨率，省一点计算量
    var dpi = (w * h > 260000) ? 0.5 : 1

    var map
    try {
      map = buildMap(w, h, dpi)
    } catch (e) {
      return   // canvas / ImageData 出问题就安静放弃
    }

    var id = 'liquid-glass-' + (++seq)
    var mapId = id + '-map'

    var svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('xmlns', NS)
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.setAttribute('aria-hidden', 'true')
    svg.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;pointer-events:none'

    var defs = document.createElementNS(NS, 'defs')
    var filter = document.createElementNS(NS, 'filter')
    filter.setAttribute('id', id)
    filter.setAttribute('filterUnits', 'userSpaceOnUse')
    filter.setAttribute('colorInterpolationFilters', 'sRGB')
    filter.setAttribute('x', '0')
    filter.setAttribute('y', '0')
    filter.setAttribute('width', String(w))
    filter.setAttribute('height', String(h))

    var feImage = document.createElementNS(NS, 'feImage')
    feImage.setAttribute('id', mapId)
    feImage.setAttribute('width', String(w))
    feImage.setAttribute('height', String(h))
    feImage.setAttributeNS(XLINK, 'xlink:href', map.url)
    feImage.setAttribute('href', map.url)

    var feDisp = document.createElementNS(NS, 'feDisplacementMap')
    feDisp.setAttribute('in', 'SourceGraphic')
    feDisp.setAttribute('in2', mapId)
    feDisp.setAttribute('xChannelSelector', 'R')
    feDisp.setAttribute('yChannelSelector', 'G')
    feDisp.setAttribute('scale', String(map.scale))

    filter.appendChild(feImage)
    filter.appendChild(feDisp)
    defs.appendChild(filter)
    svg.appendChild(defs)
    document.body.appendChild(svg)

    // 折射 + 原有的模糊一起用；不支持时浏览器会忽略这行，保留 CSS 里的毛玻璃
    var value = 'url(#' + id + ') blur(12px) saturate(180%)'
    el.style.backdropFilter = value
    el.style.webkitBackdropFilter = value

    el.__liquidGlass = { svg: svg, id: id }
  }

  function refresh () {
    var els = document.querySelectorAll(SELECTOR)
    var i

    for (i = 0; i < els.length; i++) {
      var old = els[i].__liquidGlass
      if (old && old.svg.parentNode) old.svg.parentNode.removeChild(old.svg)
      els[i].__liquidGlass = null
    }
    for (i = 0; i < els.length; i++) {
      applyGlass(els[i])
    }
  }

  // 等首屏渲染完再算，避免阻塞
  if (window.requestAnimationFrame) {
    requestAnimationFrame(function () { setTimeout(refresh, 300) })
  } else {
    setTimeout(refresh, 300)
  }

  // 窗口尺寸变化后元素尺寸变了，重新生成贴图
  var resizeTimer = null
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(refresh, 400)
  })
})()
