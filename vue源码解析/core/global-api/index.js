/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  // 保留了util工具方法，但是并未在文档中写出，不建议在业务代码中使用
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }
  // set对于对象中已有值直接更新，没有判断是否是响应对象，是则添加值且绑定响应，否则直接添加
  // 数组使用splice方法进行更新即可，涉及到defineReactive核心方法，内部通过dep构造函数和watcher建立联系
  Vue.set = set
  // 和set类似，数组使用splice方法，对象delete，再通过dep.notify更新视图
  Vue.delete = del
  // 使用promise,MutationObserver,setImmediate,setTimeout做一个pollyf,来执行异步任务，可以连续添加多个nextTick会放入一个数组中执行
  Vue.nextTick = nextTick

  // 2.6 explicit observable API
  // observable方法对一个对象数组进行响应包装，会添加上__ob__属性来标识是否已经响应，对象对每一个值设置getter，setter,数组对数组内的对象值进行响应，普通类型不响应，整个数组不响应
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }

  Vue.options = Object.create(null)
  // 初始化 'component','directive','filter'
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  Vue.options._base = Vue

  // Vue.options.components = {KeepAlive}
  extend(Vue.options.components, builtInComponents)

  // 插件的use方法，必须提供function或者apply值的对象
  initUse(Vue)
  // mixin方法，定义Vue.mixin()方法，会将mixin合并进来的数据全部放到Vue.options上
  initMixin(Vue)
  initExtend(Vue)
  initAssetRegisters(Vue)
}
