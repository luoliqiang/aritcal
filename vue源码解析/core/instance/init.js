/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  // _init初始化方法
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // a uid
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    // 利用window.performance做一些性能监控
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
    // merge options
    // 如果是extend的组件对象，则会有_isComponent字段，则合并二者的参数
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options)
    } else {
      // 将构造函数属性，传入的属性，将一些属性代理到实例的$options上，mergeOptions是继承父类属性并且和options进行合并
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    // 设置vm值的代理
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
    // 设置vm的 $parent $root $refs $children，
    // 并且设置生命周期初始值vm._watcher = null vm._inactive = null vm._directInactive = false vm._isMounted = false vm._isDestroyed = false vm._isBeingDestroyed = false
    initLifecycle(vm)
    // 处理父组件传递给子组件的@hook @click等event事件，转换成各个组件实例上的事件绑定
    initEvents(vm)
    initRender(vm)
    callHook(vm, 'beforeCreate')
    initInjections(vm) // resolve injections before data/props
    initState(vm)
    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // opts初始值为构造函数中中的options
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  // 有super属性，说明Ctor是Vue.extend构建的子类
  if (Ctor.super) {
    // superOptions递归获取继承父级的options
    const superOptions = resolveConstructorOptions(Ctor.super)
    // 当前构造函数的已存储的父属性options，判断而且是否相等来确定父属性是否发生了变化
    // 例如下面的例子，Profile后又进行了mixin混入了属性，name在new的时候就要去检查父属性是否有更改
    
    /**
     * var Profile = Vue.extend({
        template: '<p>{{firstName}} {{lastName}} aka {{alias}}</p>'
      })
      Vue.mixin({ data: function () {
        return {
          firstName: 'Walter',
          lastName: 'White',
          alias: 'Heisenberg'
        }
      }})
        new Profile().$mount('#example')
     */
     // Ctor.superOptions ,Vue构造函数的options,入directive,filters等在extend方法中添加到Ctor中的
    const cachedSuperOptions = Ctor.superOptions 
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      // 更新当前构造函数的superOptions为最新的superOptions
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      // 找出Ctor自身变化了的的属性值
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // 再将变化了的值添加到extendOptions上
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      // 因为父和自身都有option发生变化，所以合并新值到Ctor.options上
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  // 未有supor说明是根Vue构造器，直接返回options，options在initGlobalApi和platforms/runtime/index中进行了包装
  // initGlobalApi添加了filters,base,components属性，runtime/index中包装了filters，components
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  // Ctor.sealedOptions = extend({}, Sub.options)
  // 执行Vue.extend时封装的"自身"options，这个属性就是方便检查"自身"的options有没有变化
 // 遍历当前构造器上的options属性，如果在"自身"封装的options里没有，则证明是新添加的。执行if内的语句。调用dedupe方法，最终返回modified变量(即”自身新添加的options“)
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
