# bossapp 商城移动端总结

## 技术栈
webpack+vue全家桶+vant-ui
## 错误监控
fundebug，资源本地引用

## hybird交互思路
* 单页应用+bossapp_api的混合开发模式
* bossapp_api底层采用jsbridge库安装在app端，h5端代码使用模块化开发，rollup打包，支持es6模块方式引入，发布到git私库进行版本管理 npm install git+https://username:password@github.com/luoliqiang/bossapp_api.git#master，团队成员配置权限进行安装，修改提交。
* 业务代码对api进一步封装，利用promise和属性代理简化ready等方法调用
```js
const native = Object.assign({}, WK, {
  install: function (Vue) {
    Vue.prototype.WK = this
    Vue.prototype.native = this
  },
  hideLeftArrow: function () {
    this.ui.setHeader({
      opacity: 0,
      hiddenBackButton: 1,
      left: {}
    })
  },
  showNativeTab: function () {
    this.ui.visibleNativeTabBar({
      state: 1
    })
  },
  hideNativeTab: function () {
    this.ui.visibleNativeTabBar({
      state: 0
    })
  },
  abilityOfVisibleNativeTab: WK.env.compareVersion('1.5.8') >= 0,
  abilityOfPhoneCall: WK.env.compareVersion('1.5.7') >= 0
})
// 代理方法，简化ready函数的调用
const isBar = native.env.isBar
let isReady = false
const proxy = function (target) {
  for (let key in target) {
    let val = target[key]
    if (typeof val === 'object' && val !== null) {
      proxy(val)
    }
    // 属性可以访问，方法必须在app环境才能访问
    if (typeof val === 'function' && key !== 'ready' && key !== 'install') {
      Object.defineProperty(target, key, {
        get: function () {
          if (typeof val === 'function' && !isBar) {
            console.error('WK is not bossapp env')
            return noop
          }
          if (isReady) {
            return val.bind(native)
          } else {
            return function (...args) {
              native.ready(() => {
                isReady = true
                val.apply(native, args)
              })
            }
          }
        }
      })
    }
  }
}

proxy(native)
export default native
```

## 移动端调试
* chrome inspect调试功能，开启开发者模式能调试android设备，能inspect dom，控制台，请求监控等，功能齐全
* safria调试工具，能调试iphone，需要mac pc支持，`'babel-polyfill' 在iphone6上有兼容性bug`，`（iphone部分机型出现font-size为0导致的页面白屏现象）`都是通过safria调试工具发现的。
* Vconsole进行控制台输出，能打印调试信息，查看请求，抛出错误等，小巧好用
```js
import Vconsole from 'vconsole'
new Vconsole() // console 日志
```
### 页面布局
* less作为预处理css语言，提供mixin,variable等功能，
  * vant库样式使用less引入, `theme.less`用于修改vant配置主题变量
  * 引入webpack包`sass-resources-loader`,让variable变量可以在局部组件中使用
  * `iphone-only.less`，通过media来处理iphoneX等刘海屏的兼容性，或许有更好方案，待研究？
* 采用rem进行自适应布局，vant官方建议使用`lib-flexibles`设置基准值和`postcss-pxtorem`进行rem转换
**第三方组件内的不能适配**
**lib-flexibles官方已经建议使用viewport代替lib-flexibles**
```js
/**
 * webpack 配置750px设计稿宽度为例
 * 
 */
// .postcssrc.js
'postcss-pxtorem':{
  rootValue: 75, // 根大小75, 将75px转换成1rem，根据设计稿大小尺寸10等分匹配
  propList:['*'], //  属性的选择器，*表示通用
  replace: true,
  selectorBlackList:['van', 'vue-content-placeholders'] // 忽略的选择器.ig-表示.ig-开头的都不会转换
}

// main.js
import 'lib-flexible/flexible' // 将屏幕10等分，ipone6中1rem=37.5px，所以75px的设计稿在iphone6手机最终转换成1rem=37.5
```
* 由于ios中页面滑动到顶部后还能够弹性下拉，体验不好，所以设置整体高度100%，整体flex布局，中间容器滑动，并且预留class**scroll-wrapper**在页面转场缓存时设置scrollTop
### 首屏加载优化和容错
**已做**
* 骨架页面，进行首页，商品页等骨架屏渲染，转场原生会有loading动画
* 利用app端进行首页缓存
* http缓存强缓存和协商缓存cache-control
* 第三方cdn放到本地，vant的字体图标，fundebug.js，开发过程发现vant的字体图标有时存在加载失败的情况！
* 首页图片懒加载，默认只加载首页和精品页前两行，前4列图片。
* 首页图片大小压缩
* 首页分类tab会一次性加载所有分类，但是会有1s左右的延时加载，这样做的目的是在切换tab的时候不会有延迟，考虑到是B端用户，性能可以抗住，**（做法略low,后期将进行优化）**
* 新版本单页中，路由改为同步路由
* 首页加载白屏异常处理
  * https解决页面劫持的问题
  * h5通知app页面资源加载正常回调，时间为15s,15s后会展示错误页面并且有重新加载按钮，所以将bossapp_api单独打包提出，优先于所有资源加载，在最短时间通知native
  * 点击商城tab时若还未回调native，则native重新加载一次页面
  * font-size为0导致的白屏，首页interTimer轮询机制，每隔一秒进行一次dom查询，有dom则重设font-size，停止轮询

**计划做**
* 服务端ssr渲染，考虑到移动端商城的重要性，不排除会放到首页tab展示，所以ssr可以考虑加入
* server-worker缓存，功能已经实现，现阶段不是很需要，但是动画卡顿问题的终极解决方案还是用原生转场加server-worder做资源缓存的方式
```js
  // h5通知app页面资源加载正常回调
  <script>
    WK.ready(function() {
      WK.page.pageLoaded({state: true})
    })
  </script>
```
### main.js入口文件
* 主要采用vue插件形式进行模块代码的导出和对Vue对象原型属性的添加
* 第三方组件全局引入且包含样式时一定要放于`自己的css模块代码前面`，这样打包出来的第三方样式会在自己的css-link前面，避免打包后由于css引入顺序和权重导致的bug（在开发模式下css都是以style的形式注入到header，不会出现问题）
* FastClick会导致滑动bug，原因是其将touchend事件重写成了click，所以在banner快速滑动的时候一定会触发其点击事件，解决方案是对滑动元素添加touchend的`阻止冒泡`即可
```js
import Vue from 'vue'
import App from './App'
import router from './router'
import Vconsole from 'vconsole'
import Vant, {Lazyload} from 'vant'
import touchBack from '@/common/js/touchBack' // 左滑返回功能
import store from './store'
import native from '@/common/js/native' // bossapp_api二次包装
import 'lib-flexible/flexible'
import './common/styles/index.less'
import 'vant/lib/icon/local.css'
import api from '../src/api'
import { util } from '@/common/js/util' // 公告方法
import stat from '@/common/js/stat'
import nodb from '@/assets/img/empty.png'
import VueContentPlaceholders from 'vue-content-placeholders'
import globalComponents from '@/components/index.js'
import mixin from '@/mixin/index.js'

Vue.use(VueContentPlaceholders)
Vue.use(Vant)
Vue.use(Lazyload)
Vue.use(api)
Vue.use(native)
Vue.use(globalComponents)
Vue.use(stat, router)
Vue.mixin(mixin)
/* eslint-disable no-new */
new Vconsole() // console 日志
// document.querySelector('.van-swipe').addEventListener('touchend', e => {
//     e.stopPropagation()
//   }, false)
const FastClick = require('fastclick') // 300ms点击优化
FastClick.attach(document.body)


Vue.prototype.util = util
Vue.prototype.nodb = nodb
Vue.config.productionTip = false
// 隐藏左侧原生按钮
native.hideLeftArrow()
// 右滑返回上一页
touchBack(router)

new Vue({
  el: '#app',
  store,
  router,
  components: { App },
  template: '<App/>'
})
```
## 导航设计
线上现在有两个页面导航方案，需要做兼容
* h5<->h5跳转
* native<->h5跳转

**需要解决的问题**
* 记录页面缓存
* direction控制动画方向
* 记录页面高度
* 页面间通信（h5<->h5, h5<->native）

**策略：**
* 对vue路由进行拦截
* 对vue路由方法进行重写
* android物理返回键的返回对window.onpopstate事件进行监听
* keepalive缓存路由，router.meta保存路由高度
* vuex、util提供事件发布模式，h5之间通信使用普通订阅发布模式，native通信使用`window.storage`事件
```js
  // 路由拦截
  router.beforeEach((to, from, next) => {
    // 老版本兼容首页进入其他页面,原生跳转, 搜索页除外
    if (native.env.isBar && !native.abilityOfVisibleNativeTab && from.path === '/home' && to.path !== '/home') {
      next(false)
      native.page.open(window.location.origin + window.location.pathname + '?_wv=8/#' + to.fullPath + (to.fullPath.indexOf('?') >= 0 ? '&' : '?') + 'rootpage=1&t=' + (+new Date()))
      return
    }
  } eles {
    // 新版本进行底部tab的显示与隐藏
    native.hideNativeTab() // native.showNativeTab()
    next()
  }

  // 路由重写
  methods.forEach(key => {
    let method = router[key].bind(router)
    router[key] = function (...args) {
      // 重写back 页面所有的返回用back方法
      if ((key === 'back' || (key === 'go' && args[0] < 0))) {
        isBack = true // 控制转场动画
        if (native.env.isBar && (window.location.hash.indexOf('rootpage') >= 0)) { // 判断rootpage
          // 使用localstorage进行页面通信,更新tab页面数据
          util.pageEmit('updateCart')
          return native.page.back()
        }
      }
      method.apply(null, args)
    }
  })

  // 移动端监听物理返回键，不会触发路由方法，但是会进入路由钩子
  window.onpopstate = function (event) {
    isBack = true // 控制转场动画
  }

```

**转场动画方向控制**
* 默认动画方向为`forward`
* 如果通过back等方法或者物理返回键返回则设置`isBack`,然后在钩子函数中通过该参数或者其他自定义配置进行路由方向的设定
* 路由参数可以配置方向进行更加细粒度的控制`to.params.direction`，（使用场景考虑地址选择列表后返回的情况，返回后需要修改订单页的url参数，只能使用push方法，但是必须使用回退动画）
```js
router.beforeEach((to, from, next) => {
    if (isBack === false) {
      if ((from.path === '/' &&
        (to.path === '/home' || to.path === '/')) ||
        (to.path === '/search' && util.deviceInfo().os !== 'ios') ||
        from.path === '/search' ||
        to.query.rootpage
      ) {
        direction = ''
      } else {
        direction = 'forward'
      }
    } else {
      direction = 'reverse'
    }
    // 有参数控制动画方向
    if (to.params.direction) {
      direction = to.params.direction
    }

    store.dispatch('setDirection', direction)
    next()
```
**转场的缓存**
* 转场的页面缓存`keepalive`
* 页面高度的缓存
* 动画优化

使用keepalive缓存页面，配合参数include进行页面缓存与释放
A->**B**->路径中C页面不需要缓存，A页面需要缓存
```js
  // 所有通过 router-view 加载的页面组件都会被缓存
  <keep-alive :include="virtualTaskStack">
    <router-view />
  </keep-alive>
  // 观察router
  watch: {
    // 监听路由对象，决定使用哪种过渡效果
    '$route' (to, from) {
     // 获取到携带的标记
      if (this.direction === 'forward' || this.direction === '') {
        // 当进入新页面的时候，保存新页面名称到虚拟任务栈
        this.virtualTaskStack.push(to.name)
        // 跳转页面
      } else {
        // 执行后退操作的时候，把最后一个页面从任务栈中弹出
        this.virtualTaskStack.pop()
      }
      this.virtualTaskStack = [...new Set(this.virtualTaskStack)]
      /**
       * 初始化虚拟任务栈
       */
      if (to.params.clearTask) {
        this.virtualTaskStack = ['home']
      }
    }
  },
```
对于更细粒度的控制，例如**购物车页面->下单页面->下单结果页**（有返回按钮），当点击返回按钮时需要回到购物车页面，这是需要更新购物车的数据等操作，所以页面不适合做缓存，所以，`清除该页面的缓存virtualTaskStack`。
利用全局事件订阅者方法移除该页面缓存
```js
methods: {
    listenStacksChange () {
      this.util.pageOff('updateVertialTaskStack')
      this.util.pageOn('updateVertialTaskStack', (opts) => {
        this.virtualTaskStack.splice(idx, 1)
      })
    },
  }
```
高度缓存因为要监听active构造函数，所以写在全局组件进行混入,将上个页面缓存的scrollTop存入路由meta中，后退时清除当前页高度，页面重新刷新
```js
// 前进时记录上一个页面滚动条高度，在keepalive组件中可以恢复滚动条位置
const recordAlivePageScroll = function (direction, from) {
  if (direction !== 'reverse') {
    const $scrollWrapper = document.querySelector('.scroll-wrapper')
    const scrollTop = $scrollWrapper ? $scrollWrapper.scrollTop : 0
    from.meta.scrollTop = scrollTop
  } else { // 后退则清除上一个页面的高度
    from.meta.scrollTop = 0
  }
}
// 页面恢复高度
const mixin = {
  activated () {
    if (alivePages.includes(this.$options.name)) {
      const scrollTop = this.$route.meta.scrollTop
      // 必须使用当前组件的scroll-wrapper,因为在在执行动画的时候可能同时存在两个组件，两个scroll-wrapper
      let $content = this.$refs['scroll-wrapper']
      if (!$content || $content._isVue) { // vue子组件
        $content = this.$el.querySelector('.scroll-wrapper')
      }
      if ($content) {
        $content.scrollTop = scrollTop
      }
    }
  }
}
```
## 动画性能优化
* transfrom3D开启了硬件加速，但是还是会出现卡顿的现象，在动画初始位置，速度上，页面内容加载时间上做过尝试感觉无解，可能最好的方案还是用原生做动画，http或者server-worker，ssr做缓存
## 搜索页面优化
* 原生隐藏底部tab，资源单页加载方案
* ios中input无法autofocus的问题在router间跳转的时候，如果前一个页面有input触发了键盘，那么切入到下一个路由的时候，其input的auto属性会触发，刚好解决改bug，但是focus会导致被聚焦的元素立马出现在屏幕，导致动画滚动出现异常，所以在ios中的search页面是默认有动画的，但是在android中无动画。
* ios在搜索结果页回到搜索页不会触发输入框的autofocus，不过可以接受。
## 数据埋点
* 页面数据埋点提供了指令和全局方法两种方式埋点
* pv的统计放在路由钩子中
* 将统计字段放在一个公共地方，业务层提供统计类型和数据即可
```js
const statMaps = {
  pv: (data) => {
    return {
      eventName: '页面进入',
      pageUrl: data.pageUrl,
      pageName: title,
      fromUrl: data.fromUrl
    }
  },
  recom: (data) => {
    return {
      eventName: '栏目点击',
      pageName: title,
      jumpUrl: `/recom?productColumnId=${data.productColumnId}&productName=${data.productColumnName}`,
      name: data.productColumnName || data.activityName
    }
  }
  ...
}

// 函数使用
this.$log('pv') // this.$log('recom'， data)
// 指令使用
<div v-log="{type: 'pv'}">
```






