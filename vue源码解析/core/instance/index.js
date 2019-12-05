import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'
// 该文件处理数据state,事件event,生命周期，render四个主题
// 主要在new Vue实例化内，和外部全局方法的定义，具体即为下面5个方法
// Vue构造函数
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // initMixin模块中会将_init方法注入到vue原型中,通过extend方法创建的实例也会调用_init
  this._init(options)
}
// 只是定义定义_init原型方法
initMixin(Vue)
// state处理相关方法，原型上挂载$data，$props，添加$set，$delete, $watch
stateMixin(Vue)
// events处理相关方法，$emit $on的订阅发布者模式，Vue.prototype.$on = fun，Vue.prototype.$emit = fun
eventsMixin(Vue)
// 生命周期相关方法 ，_update $forceUpdate $destory
lifecycleMixin(Vue)
// render相关方法，$nextTick _render会被挂载到原型对象上
renderMixin(Vue)

export default Vue
