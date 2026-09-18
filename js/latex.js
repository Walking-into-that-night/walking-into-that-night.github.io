/* ==============================
   LaTeX.js 内嵌渲染

   用法：在任意页面或文章里写一行
     <div data-latex-src="/latex/demo.tex"></div>
   脚本会自动加载 LaTeX.js，把 .tex 渲染成接近原生排版效果的 HTML。

   没有这种元素时什么都不会加载，所以放在全局注入里也不影响其他页面。

   关于表格：
   LaTeX.js 0.12.6 没有实现 tabular 环境（会报 unknown environment），
   而且它的解析器遇到 & 会直接失败。所以这里先把 tabular 从源码里抽出来，
   留一个占位标记，等 LaTeX.js 渲染完再把真正的 <table> 填回去。
   单元格内容仍然交给 LaTeX.js 单独渲染，因此格子里可以正常使用 \LaTeX、
   \textbf 之类的命令。
   ============================== */

(function () {
  var targets = document.querySelectorAll('[data-latex-src]')
  if (!targets.length) return

  var CDN = 'https://cdn.jsdelivr.net/npm/latex.js@0.12.6/dist/'
  var BUNDLE = CDN + 'latex.js'
  var CSS = '/css/latex.css'
  var MARKER = '@@LATEXJSTABLE'
  var SOFT_HYPHEN = /[\u00AD]/g

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
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error(url + ' 返回 HTTP ' + res.status)
      return res.text()
    })
  }

  /* ---------------- tabular 预处理 ---------------- */

  // 解析形如 |l|c|r| 的列格式
  function parseSpec (spec) {
    var align = []
    var borders = [false] // borders[i] 表示第 i 条竖线是否存在
    var clean = (spec || '').replace(/[{}]/g, '')

    for (var i = 0; i < clean.length; i++) {
      var ch = clean.charAt(i)
      if (ch === '|') {
        borders[align.length] = true
      } else if (ch === 'l' || ch === 'c' || ch === 'r') {
        align.push(ch === 'l' ? 'left' : ch === 'c' ? 'center' : 'right')
        borders.push(false)
      }
    }
    return { align: align, borders: borders }
  }

  // 解析表格正文，得到若干行
  function parseBody (body) {
    var rows = []
    var bottomRule = false

    body.replace(/\r/g, '').split('\\\\').forEach(function (chunk) {
      var ruleAbove = /\\hline/.test(chunk)
      var text = chunk
        .replace(/\\hline/g, '')
        .replace(/\\cline\s*\{[^}]*\}/g, '')
        .trim()

      if (!text) {
        if (ruleAbove) bottomRule = true // 结尾单独一行 \hline，就是底部横线
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

  // 把源码里的 tabular 换成占位标记
  function extractTables (tex) {
    var tables = []
    var re = /\\begin\s*\{tabular\}\s*(\{[^}]*\})?([\s\S]*?)\\end\s*\{tabular\}/

    var out = tex.replace(re, function (whole, spec, body) {
      var parsed = parseSpec(spec)
      var rest = parseBody(body || '')
      tables.push({
        align: parsed.align,
        borders: parsed.borders,
        rows: rest.rows,
        bottomRule: rest.bottomRule
      })
      return '\n\n' + MARKER + (tables.length - 1) + '@@\n\n'
    })

    return { tex: out, tables: tables }
  }

  /* ---------------- 表格渲染 ---------------- */

  // 用 LaTeX.js 渲染单元格里的内容，这样格子里也能用 LaTeX 命令
  function renderCell (lib, text) {
    if (!text) return ''
    var src = '\\documentclass{article}\n\\begin{document}\n' + text +
              '\n\\end{document}'
    var gen = lib.parse(src, {
      generator: new lib.HtmlGenerator({ hyphenate: false })
    })
    var frag = gen.domFragment()
    var body = frag.querySelector ? frag.querySelector('.body') : null

    if (!body) {
      var box = document.createElement('div')
      box.appendChild(frag)
      body = box
    }

    var html = body.innerHTML.trim()
    var onlyParagraph = html.match(/^<p>([\s\S]*)<\/p>$/)
    return onlyParagraph ? onlyParagraph[1] : html
  }

  function buildTable (lib, table) {
    var tableEl = document.createElement('table')
    tableEl.className = 'latex-tabular'
    if (table.bottomRule) tableEl.className += ' rule-below'

    var tbody = document.createElement('tbody')
    table.rows.forEach(function (row) {
      var tr = document.createElement('tr')
      if (row.ruleAbove) tr.className = 'rule-above'

      for (var i = 0; i < table.align.length; i++) {
        var td = document.createElement('td')
        var styles = ['text-align: ' + table.align[i]]
        if (table.borders[i]) styles.push('border-left: 1px solid currentColor')
        if (table.borders[i + 1]) styles.push('border-right: 1px solid currentColor')
        td.setAttribute('style', styles.join(';'))
        td.innerHTML = renderCell(lib, row.cells[i] || '')
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    })

    tableEl.appendChild(tbody)
    return tableEl
  }

  /* ---------------- 占位标记的定位与替换 ---------------- */

  // 合并相邻文本节点并去掉断词插入的软连字符，
  // 这样标记一定完整地落在一个文本节点里
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

  function replaceMarkers (root, tables, lib) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
    var found = []

    while (walker.nextNode()) {
      var node = walker.currentNode
      var m = new RegExp(MARKER + '(\\d+)@@').exec(node.nodeValue)
      if (m) found.push({ node: node, whole: m[0], index: Number(m[1]) })
    }

    found.forEach(function (item) {
      if (!tables[item.index]) return
      var tableEl = buildTable(lib, tables[item.index])
      var parent = item.node.parentNode
      if (!parent) return

      // 正常情况下标记独占一个段落，直接把整个段落换成表格
      if (parent.textContent.trim() === item.whole && parent.parentNode) {
        parent.parentNode.replaceChild(tableEl, parent)
      } else {
        item.node.nodeValue = item.node.nodeValue.replace(item.whole, '')
        parent.parentNode.insertBefore(tableEl, parent.nextSibling)
      }
    })
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
        var extracted = extractTables(result[1])

        var generator = lib.parse(extracted.tex, {
          generator: new lib.HtmlGenerator({ hyphenate: true })
        })

        // 样式与字体只挂一次
        if (!window.__latexjsStylesLoaded) {
          document.head.appendChild(generator.stylesAndScripts(CDN))
          var fonts = document.createElement('link')
          fonts.rel = 'stylesheet'
          fonts.href = CDN + 'fonts/cmu.css'
          document.head.appendChild(fonts)
          window.__latexjsStylesLoaded = true
        }

        el.classList.remove('latex-loading')
        el.textContent = ''

        var page = document.createElement('div')
        page.className = 'latex-page'
        page.appendChild(generator.domFragment())
        el.appendChild(page)

        if (extracted.tables.length) {
          normalizeText(page)
          replaceMarkers(page, extracted.tables, lib)
        }
      })
      .catch(function (err) {
        el.classList.remove('latex-loading')
        el.classList.add('latex-error')
        el.textContent = 'LaTeX 渲染失败：' + err.message
        console.error('[latex]', err)
      })
  })
})()
