// 导出vue实例，并且添加了原型上的方法力图prototype.$emit等
import Vue from './instance/index'
// VUE的静态方法，也是全局方法extend，set，delete, nextTick observable use mixin component directive等方法
import { initGlobalAPI } from './global-api/index'
// isServerRendering判断是否是服务端渲染，根据inWeex和 inBrowser process来判断环境
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'

initGlobalAPI(Vue)

Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

Object.defineProperty(Vue.prototype, '$ssrContext', {
  get () {
    /* istanbul ignore next */
    return this.$vnode && this.$vnode.ssrContext
  }
})

// expose FunctionalRenderContext for ssr runtime helper installation
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

Vue.version = '__VERSION__'

export default Vue
