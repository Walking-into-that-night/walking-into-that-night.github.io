/* ==============================
   LaTeX.js 内嵌渲染

   用法：在任意页面或文章里写一行
     <div data-latex-src="/latex/demo.tex"></div>
   脚本会自动加载 LaTeX.js，把 .tex 渲染成接近原生排版效果的 HTML。
   没有这种元素时什么都不会加载，所以放在全局注入里也不影响其他页面。

   ── 关于兼容层 ──
   LaTeX.js 0.12.6 有不少结构没有实现，硬写会直接报
   “unknown environment / unknown macro”。这里做了一层预处理：
   把这些结构从源码里抽出来，原地留一个标记，等 LaTeX.js 渲染完，
   再把真正的 DOM 填回去。已支持：

     table / figure 浮动体（含 \caption）
     tabular 表格（含列对齐与横竖线）
     equation / align / align* （自动编号）
     \includegraphics（width / height / scale）
     \footnote（脚注，统一收集到文末）

   注意：单元格、图注、脚注里的 LaTeX 仍然交给 LaTeX.js 渲染，
   所以里面可以正常使用 \LaTeX、\textbf 之类的命令。
   ============================== */

(function () {
  var targets = document.querySelectorAll('[data-latex-src]')
  if (!targets.length) return

  var CDN = 'https://cdn.jsdelivr.net/npm/latex.js@0.12.6/dist/'
  var BUNDLE = CDN + 'latex.js'
  var CSS = '/css/latex.css'
  var MARKER = '@@LATEXJS'
  var SOFT_HYPHEN = /[\u00AD]/g
  // LaTeX.js 会在文本里插入不可见字符（软连字符 U+00AD、零宽空格 U+200B 等），
  // 有时会插进标记内部。这个正则允许标记的字符之间夹任意不可见字符。
  var ZW = '[\\u00AD\\u200B\\u200C\\u200D\\uFEFF\\u2060]*'
  var MARKER_RE = new RegExp(
    '@' + ZW + '@' + ZW + 'L' + ZW + 'A' + ZW + 'T' + ZW + 'E' + ZW +
    'X' + ZW + 'J' + ZW + 'S' + ZW + '(\\d+)' + ZW + '@' + ZW + '@'
  )

  /* ---------------- 基础工具 ---------------- */

  function loadScript (src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script')
      s.src = src
      s.onload = resolve
      s.onerror = function () { reject(new Error('无法加载 ' + src)) }
      document.head.appendChild(s)
    })
  }

  function loadCss (href) {
    if (document.querySelector('link[href="' + href + '"]')) return
    var l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = href
    document.head.appendChild(l)
  }

  function ensureLibrary () {
    if (window.latexjs) return Promise.resolve(window.latexjs)
    if (!window.__latexjsLoading) {
      window.__latexjsLoading = loadScript(BUNDLE).then(function () {
        return window.latexjs
      })
    }
    return window.__latexjsLoading
  }

  function fetchText (url) {
    // no-cache = 每次先向服务器校验（GitHub Pages 支持 ETag，没变就返回 304）。
    // 否则 .tex 会被缓存十分钟，改了源码重新发布后访客看到的还是旧文档。
    return fetch(url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error(url + ' 返回 HTTP ' + res.status)
      return res.text()
    })
  }

  function escapeHtml (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  /* ---------------- TeX 长度 ----------------
     CSS 本身就支持 cm / mm / in / pt / pc / em / ex，直接透传即可。
     bp（大点）CSS 里没有，按 1bp ≈ 1pt 处理。
  ------------------------------------------- */

  function texLengthToCss (value) {
    if (!value) return null
    var v = String(value).trim()
    if (/^-?[\d.]+(pt|pc|in|cm|mm|em|ex|px)$/.test(v)) return v
    if (/^-?[\d.]+bp$/.test(v)) return v.replace(/bp$/, 'pt')
    return null
  }

  function parseKeyVals (str) {
    var out = {}
    if (!str) return out
    str.replace(/^\[/, '').replace(/\]$/, '').split(',').forEach(function (pair) {
      var i = pair.indexOf('=')
      if (i > 0) out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim()
    })
    return out
  }

  /* ---------------- 一个渲染器实例 = 一份文档 ----------------
     blocks 保存抽取出来的结构，counters 用于编号，
     footnotes 收集脚注。
  --------------------------------------------------------- */

  function createRenderer (lib, tex) {
    var reg = {
      blocks: [],
      counters: { equation: 0, figure: 0, table: 0, footnote: 0 },
      footnotes: []
    }

    function push (block) {
      reg.blocks.push(block)
      return MARKER + (reg.blocks.length - 1) + '@@'
    }

    /* ---------- 抽取：浮动体 ---------- */

    function extractFloats (src) {
      return src.replace(
        /\\begin\s*\{(figure|table)\}(\*?)([\s\S]*?)\\end\s*\{\1\}/g,
        function (whole, kind, star, body) {
          var caption = null
          // 花括号要支持一层嵌套，否则 \caption{... \LaTeX{} ...} 会在
          // 内层 } 处被截断
          body = body.replace(
            /\\caption\s*(\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/,
            function (m, opt, cap) { caption = cap.trim(); return '' })
          body = body.replace(/\\centering\b/g, '').trim()

          return '\n\n' + push({
            kind: kind === 'figure' ? 'figure' : 'table-float',
            caption: caption,
            body: extractAll(body)
          }) + '\n\n'
        })
    }

    /* ---------- 抽取：tabular ---------- */

    function parseSpec (spec) {
      var align = []
      var borders = [false]
      var clean = (spec || '').replace(/[{}]/g, '')
      for (var i = 0; i < clean.length; i++) {
        var ch = clean.charAt(i)
        if (ch === '|') borders[align.length] = true
        else if (ch === 'l' || ch === 'c' || ch === 'r') {
          align.push(ch === 'l' ? 'left' : ch === 'c' ? 'center' : 'right')
          borders.push(false)
        }
      }
      return { align: align, borders: borders }
    }

    function parseRows (body) {
      var rows = []
      var bottomRule = false
      body.replace(/\r/g, '').split('\\\\').forEach(function (chunk) {
        var ruleAbove = /\\hline/.test(chunk)
        var text = chunk
          .replace(/\\hline/g, '')
          .replace(/\\cline\s*\{[^}]*\}/g, '')
          .trim()
        if (!text) {
          if (ruleAbove) bottomRule = true
          return
        }
        bottomRule = false
        rows.push({
          ruleAbove: ruleAbove,
          cells: text.split('&').map(function (c) { return c.trim() })
        })
      })
      return { rows: rows, bottomRule: bottomRule }
    }

    function extractTabular (src) {
      return src.replace(
        /\\begin\s*\{tabular\}\s*(\{[^}]*\})?([\s\S]*?)\\end\s*\{tabular\}/,
        function (whole, spec, body) {
          var parsed = parseSpec(spec)
          var rest = parseRows(body || '')
          return '\n\n' + push({
            kind: 'table',
            align: parsed.align,
            borders: parsed.borders,
            rows: rest.rows,
            bottomRule: rest.bottomRule
          }) + '\n\n'
        })
    }

    /* ---------- 抽取：equation / align ---------- */

    function extractMath (src) {
      src = src.replace(
        /\\begin\s*\{(equation|align)\}(\*?)([\s\S]*?)\\end\s*\{\1\}/g,
        function (whole, env, star, body) {
          return '\n\n' + push({
            kind: env,
            numbered: star !== '*',
            math: body.trim()
          }) + '\n\n'
        })
      return src
    }

    /* ---------- 抽取：\includegraphics ---------- */

    function extractGraphics (src) {
      return src.replace(
        /\\includegraphics\s*\*?\s*(\[[^\]]*\])?\s*\{([^}]*)\}/g,
        function (whole, optStr, file) {
          var opt = parseKeyVals(optStr)
          return '\n\n' + push({
            kind: 'image',
            url: file.trim(),
            width: texLengthToCss(opt.width),
            height: texLengthToCss(opt.height),
            scale: opt.scale ? parseFloat(opt.scale) : null
          }) + '\n\n'
        })
    }

    /* ---------- 抽取：\footnote ---------- */

    function extractFootnotes (src) {
      return src.replace(
        /\\footnote\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
        function (whole, text) {
          return push({ kind: 'footnote', text: text.trim() })
        })
    }

    /* ---------- 抽取总入口（顺序有讲究） ---------- */

    function extractAll (src) {
      src = extractFloats(src)     // 最外层，内部递归
      src = extractTabular(src)
      src = extractMath(src)
      src = extractGraphics(src)
      src = extractFootnotes(src)
      return src
    }

    /* ---------- 用 LaTeX.js 渲染一小段 LaTeX ---------- */

    function rawFragment (source) {
      var generator
      try {
        generator = lib.parse(source, {
          generator: new lib.HtmlGenerator({ hyphenate: true })
        })
      } catch (e) {
        // 出错时把出问题的片段一并报出来，方便定位
        var brief = String(source).replace(/\s+/g, ' ').trim().slice(0, 80)
        throw new Error(e.message + '  ← 片段：' + brief)
      }
      var box = document.createElement('div')
      box.appendChild(generator.domFragment())
      return box
    }

    function fragmentOf (source) {
      var box = rawFragment(source)
      normalizeText(box)
      resolveMarkers(box)
      return box
    }

    // 取出渲染结果的正文部分（去掉 .body 外壳和多余的 <p>）
    function inlineHtml (source) {
      var box = fragmentOf(source)
      var body = box.querySelector('.body') || box
      var html = body.innerHTML.trim()
      var only = html.match(/^<p>([\s\S]*)<\/p>$/)
      return only ? only[1] : html
    }

    /* ---------- 构造各种块 ---------- */

    function buildTable (block) {
      var tableEl = document.createElement('table')
      tableEl.className = 'latex-tabular'
      if (block.bottomRule) tableEl.className += ' rule-below'

      var tbody = document.createElement('tbody')
      block.rows.forEach(function (row) {
        var tr = document.createElement('tr')
        if (row.ruleAbove) tr.className = 'rule-above'

        for (var i = 0; i < block.align.length; i++) {
          var td = document.createElement('td')
          var styles = ['text-align: ' + block.align[i]]
          if (block.borders[i]) styles.push('border-left: 1px solid currentColor')
          if (block.borders[i + 1]) styles.push('border-right: 1px solid currentColor')
          td.setAttribute('style', styles.join(';'))
          td.innerHTML = inlineHtml(row.cells[i] || '')
          tr.appendChild(td)
        }
        tbody.appendChild(tr)
      })

      tableEl.appendChild(tbody)
      return tableEl
    }

    function buildDisplayMath (block) {
      var source
      if (block.kind === 'align') {
        source = '$$\n\\begin{aligned}\n' + block.math + '\n\\end{aligned}\n$$'
      } else {
        source = '$$\n' + block.math + '\n$$'
      }

      var wrap = document.createElement('div')
      wrap.className = 'latex-displaymath'

      var box = fragmentOf(source)
      var body = box.querySelector('.body') || box
      while (body.firstChild) wrap.appendChild(body.firstChild)

      if (block.numbered) {
        var no = document.createElement('span')
        no.className = 'latex-eqno'
        no.textContent = '(' + (++reg.counters.equation) + ')'
        wrap.appendChild(no)
      }
      return wrap
    }

    function buildFloat (block) {
      var wrap = document.createElement('div')
      wrap.className = 'latex-float latex-float-' +
        (block.kind === 'figure' ? 'figure' : 'table')

      var box = fragmentOf(block.body)
      var body = box.querySelector('.body') || box
      while (body.firstChild) wrap.appendChild(body.firstChild)

      if (block.caption) {
        var n = block.kind === 'figure'
          ? ++reg.counters.figure
          : ++reg.counters.table
        var label = block.kind === 'figure' ? 'Figure' : 'Table'

        var cap = document.createElement('div')
        cap.className = 'latex-caption'
        cap.innerHTML = '<span class="latex-caption-label">' + label + ' ' + n +
          ':</span> ' + inlineHtml(block.caption)
        wrap.appendChild(cap)
      }
      return wrap
    }

    function buildImage (block) {
      var img = document.createElement('img')
      img.className = 'latex-img'
      img.src = block.url
      img.alt = block.url
      img.style.maxWidth = '100%'

      if (block.width) img.style.width = block.width
      if (block.height) img.style.height = block.height

      // 只给了 scale 时，得等图片加载完才知道原始尺寸
      if (!block.width && !block.height && block.scale) {
        img.addEventListener('load', function () {
          img.style.width = Math.round(img.naturalWidth * block.scale) + 'px'
        })
      }
      return img
    }

    function buildFootnoteRef (block) {
      var n = ++reg.counters.footnote
      block.number = n
      reg.footnotes.push(block)

      var sup = document.createElement('sup')
      sup.className = 'latex-footnote-ref'
      var a = document.createElement('a')
      a.id = 'latex-fnref-' + n
      a.href = '#latex-fn-' + n
      a.textContent = n
      sup.appendChild(a)
      return sup
    }

    function buildBlock (block) {
      switch (block.kind) {
        case 'table': return buildTable(block)
        case 'equation':
        case 'align': return buildDisplayMath(block)
        case 'figure':
        case 'table-float': return buildFloat(block)
        case 'image': return buildImage(block)
        case 'footnote': return buildFootnoteRef(block)
      }
      return document.createElement('span')
    }

    /* ---------- 文本归一化与标记替换 ---------- */

    // 合并相邻文本节点并去掉断词插入的软连字符，
    // 保证标记完整地落在一个文本节点里
    function normalizeText (root) {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
      var nodes = []
      while (walker.nextNode()) nodes.push(walker.currentNode)

      nodes.forEach(function (node) {
        node.nodeValue = node.nodeValue.replace(SOFT_HYPHEN, '')
        var next = node.nextSibling
        while (next && next.nodeType === 3) {
          node.nodeValue += next.nodeValue
          next.parentNode.removeChild(next)
          next = node.nextSibling
        }
      })
    }

    function resolveMarkers (root) {
      var guard = 0
      while (guard++ < 1000) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
        var node = null
        var match = null
        while (walker.nextNode()) {
          var m = MARKER_RE.exec(walker.currentNode.nodeValue)
          if (m) { node = walker.currentNode; match = m; break }
        }
        if (!node) return

        var block = reg.blocks[Number(match[1])]
        if (!block) { node.nodeValue = node.nodeValue.replace(match[0], ''); continue }

        var el = buildBlock(block)
        var parent = node.parentNode
        if (!parent) return

        var onlyMarker = parent.textContent.trim() === match[0]

        if (block.kind === 'footnote') {
          // 行内替换：把文本从标记处切开，插入上标
          var at = node.nodeValue.indexOf(match[0])
          var rest = node.splitText(at)
          rest.nodeValue = rest.nodeValue.slice(match[0].length)
          rest.parentNode.insertBefore(el, rest)
        } else if (onlyMarker && parent.parentNode) {
          // 独占一段：整段换成块级元素
          parent.parentNode.replaceChild(el, parent)
        } else {
          // 兜底：插到最近的块级祖先之后
          node.nodeValue = node.nodeValue.replace(match[0], '')
          var anchor = parent
          while (anchor.parentNode && anchor.parentNode !== root &&
                 ['P', 'SPAN', 'A', 'EM', 'STRONG', 'CODE', 'SUP', 'SUB'].indexOf(anchor.nodeName) >= 0) {
            anchor = anchor.parentNode
          }
          var host = anchor.parentNode || parent
          host.insertBefore(el, anchor.nextSibling)
        }
      }
    }

    /* ---------- 脚注区 ---------- */

    function buildFootnotes () {
      if (!reg.footnotes.length) return null

      var box = document.createElement('div')
      box.className = 'latex-footnotes'

      reg.footnotes.forEach(function (fn) {
        var item = document.createElement('div')
        item.className = 'latex-footnote-item'
        item.id = 'latex-fn-' + fn.number
        item.innerHTML = '<span class="latex-footnote-mark">' + fn.number + '</span> ' +
          inlineHtml(fn.text)
        box.appendChild(item)
      })
      return box
    }

    /* ---------- 对外：渲染整篇文档 ---------- */

    var generator = lib.parse(extractAll(tex), {
      generator: new lib.HtmlGenerator({ hyphenate: true })
    })

    var page = document.createElement('div')
    page.className = 'latex-page'
    page.appendChild(generator.domFragment())

    normalizeText(page)
    resolveMarkers(page)

    var notes = buildFootnotes()
    if (notes) page.appendChild(notes)

    return { generator: generator, page: page, reg: reg }
  }

  /* ---------------- 主流程 ---------------- */

  loadCss(CSS)

  Array.prototype.forEach.call(targets, function (el) {
    var src = el.getAttribute('data-latex-src')
    el.classList.add('latex-loading')
    el.textContent = '正在渲染 LaTeX 文档…'

    Promise.all([ensureLibrary(), fetchText(src)])
      .then(function (result) {
        var lib = result[0]
        var rendered = createRenderer(lib, result[1])

        // 样式与字体只挂一次
        if (!window.__latexjsStylesLoaded) {
          document.head.appendChild(rendered.generator.stylesAndScripts(CDN))
          var fonts = document.createElement('link')
          fonts.rel = 'stylesheet'
          fonts.href = CDN + 'fonts/cmu.css'
          document.head.appendChild(fonts)
          window.__latexjsStylesLoaded = true
        }

        el.classList.remove('latex-loading')
        el.textContent = ''
        el.appendChild(rendered.page)
        el.__latex = rendered.reg   // 便于排查问题
      })
      .catch(function (err) {
        el.classList.remove('latex-loading')
        el.classList.add('latex-error')
        el.textContent = 'LaTeX 渲染失败：' + err.message
        console.error('[latex]', err)
      })
  })
})()
