/* ==============================
   博客热力图
   读取 /heatmap-data.json，用 ECharts 画出"每天发表几篇文章"的日历热力图

   两种用法：
     1. 页面里自己写了 <div id="heatmapChart">（例如 /stats/），直接画进去
     2. 归档页：自动在 #archive 最前面建一个卡片容器并画进去
   其他页面会立刻退出，什么都不做。

   参考 hexo-graph 的 lib/charts/heatmap_chart.js 改写
   ============================== */

(function () {
  var ECHARTS_URL = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js'

  // 优先用页面里已有的容器；没有的话，如果这是归档页就在文章树上方建一个
  var chartDom = document.getElementById('heatmapChart')
  if (!chartDom) chartDom = createOnArchivePage()
  if (!chartDom) return

  function createOnArchivePage () {
    var archive = document.getElementById('archive')
    if (!archive) return null

    var card = document.createElement('div')
    card.className = 'heatmap-card'

    var box = document.createElement('div')
    box.id = 'heatmapChart'
    box.style.cssText = 'width:100%;height:220px;overflow-x:auto;overflow-y:hidden'

    card.appendChild(box)
    archive.insertBefore(card, archive.firstChild)   // 插到"全部文章 - N"上面
    return box
  }

  function ensureEcharts () {
    if (window.echarts) return Promise.resolve()
    if (!window.__echartsLoading) {
      window.__echartsLoading = new Promise(function (resolve, reject) {
        var s = document.createElement('script')
        s.src = ECHARTS_URL
        s.onload = resolve
        s.onerror = function () { reject(new Error('ECharts 加载失败')) }
        document.head.appendChild(s)
      })
    }
    return window.__echartsLoading
  }

  // 颜色由浅到深，改这里就能换配色
  var COLORS = ['#E8F4FB', '#A3DFF7', '#7BC8E8', '#F7C9B7', '#F5A9A9']

  function currentTheme () {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  }

  // 把 [['2026-09-16', 1], ...] 按年份分组
  function groupByYear (data) {
    var result = {}
    data.forEach(function (item) {
      var year = item[0].slice(0, 4)
      if (!result[year]) result[year] = []
      result[year].push(item)
    })
    return result
  }

  function maxOf (list) {
    return list.reduce(function (max, item) {
      return Math.max(max, item[1])
    }, 0)
  }

  function draw (data) {
    var grouped = groupByYear(data)
    var years = Object.keys(grouped).sort().reverse()

    function series (selectedYear) {
      return years.map(function (year) {
        return {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: grouped[year],
          name: year,
          emphasis: { disabled: true },
          silent: year !== selectedYear
        }
      })
    }

    // 默认显示当前年份；如果那年没有文章，就退回最近有数据的一年
    var initYear = chartDom.getAttribute('year') || String(new Date().getFullYear())
    if (!grouped[initYear]) initYear = years[0]

    var chart = echarts.init(chartDom, currentTheme())

    chart.setOption({
      grid: {},
      tooltip: {
        position: 'top',
        formatter: function (params) {
          return params.value[0] + '：' + params.value[1] + ' 篇'
        }
      },
      calendar: {
        top: '10%',
        left: 40, // 左边留出空间给 Mon/Wed/Fri 标签，否则会被画到画布外裁掉
        right: '8%',
        range: initYear,
        cellSize: [18, 18],
        splitLine: { lineStyle: { color: '#E0E0E0', width: 1 } },
        itemStyle: { borderWidth: 1, borderColor: '#E0E0E0' },
        // 左侧星期标签：一行代表一周。
        // nameMap 按"实际星期几"索引（0=周日），留空字符串的那几行就不显示文字，
        // 于是只留下 Mon / Wed / Fri，和 GitHub 的贡献图一样。
        dayLabel: {
          show: true,
          firstDay: 1,
          nameMap: ['', 'Mon', '', 'Wed', '', 'Fri', '']
        },
        // 月份标签用英文缩写
        monthLabel: {
          show: true,
          nameMap: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        },
        yearLabel: { show: false }
      },
      visualMap: {
        show: true,
        right: '8%',
        bottom: '5%',
        type: 'piecewise',
        orient: 'horizontal',
        text: ['多', '少'],
        min: 0,
        max: maxOf(grouped[initYear]),
        inRange: { color: COLORS }
      },
      legend: {
        type: 'scroll',
        icon: 'none',
        data: years,
        orient: 'vertical',
        top: '5%',
        right: 'right',
        itemWidth: 20,
        itemHeight: 20,
        itemGap: 10,
        pageIconSize: 10,
        pageTextStyle: { fontSize: 14 },
        selectedMode: 'single'
      },
      series: series(initYear)
    })

    chart.dispatchAction({ type: 'legendSelect', name: initYear })

    // 右侧点击年份切换
    chart.on('legendselectchanged', function (params) {
      var selected = Object.keys(params.selected).filter(function (key) {
        return params.selected[key]
      })[0]
      if (!selected || !grouped[selected]) return
      chart.setOption({
        calendar: { range: selected },
        visualMap: { max: maxOf(grouped[selected]) },
        series: series(selected)
      })
    })

    // 点击某一天跳转到对应月份的归档
    chart.on('click', function (params) {
      if (params.componentType !== 'series') return
      var parts = params.value[0].split('-')
      window.location.href = '/archives/' + parts[0] + '/' + parts[1] + '/'
    })

    return chart
  }

  ensureEcharts()
    .then(function () { return fetch('/heatmap-data.json', { cache: 'no-cache' }) })
    .then(function (res) { return res.json() })
    .then(function (data) {
      if (!data || !data.length) return
      var chart = draw(data)

      // 跟随明暗模式切换重新渲染
      var lastTheme = currentTheme()
      new MutationObserver(function () {
        var now = currentTheme()
        if (now === lastTheme) return
        lastTheme = now
        chart.dispose()
        chart = draw(data)
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    })
    .catch(function (err) { console.error('[heatmap]', err) })
})()
