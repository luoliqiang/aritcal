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
    // 如果是extend的组件对象，则会有_isComponent字段，子组件也会有，则合并二者的参数
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
    // $on,$emit等方法是定义在vue.prototype上的，所以每个组件会继承这些方法，然后该组件的vm.$options._parentListeners可以拿到父对象绑定的@on方法，
    // 组件拿到父方法后在合并到自身的on回调中，这样就能在自己内部操作该方法，实现$emit的通信了
    initEvents(vm)
    // 创建createElement函数到vm上,createElement会处理异步组件，扁平化组件child等操作最后返回虚拟dom
    initRender(vm)
    // 钩子函数beforeCreate 在实例初始化之后，数据观测 (data observer) 和 event/watcher 事件配置之前被调用。
    callHook(vm, 'beforeCreate')
    // provide.inject两个方法的解析，和props类似，递归找到最近的provide值或者默认值，然后赋值
    initInjections(vm) // resolve injections before data/props
    // 初始化props methods data computed watch，分别调用其各自入口方法initProps initMeth InitData initCompute initWatch
    initState(vm)
    // 很简单，直接执行initProvide返回工厂函数内的值或者provide对象
    initProvide(vm) // resolve provide after data/props
    // 在实例创建完成后被立即调用。在这一步，实例已完成以下的配置：数据观测 (data observer)，属性和方法的运算，watch/event 事件回调。然而，挂载阶段还没开始，$el 属性目前不可见
    callHook(vm, 'created')
    // 监控页面性能
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }
    // dom挂载，挂载会调用原型上的￥mount方法，这个时候会一次掉用mountComponent，patch(render()),所以会先执行组件的render，然后在patch进行初次挂载和更新挂载
    // 父子组件的渲染是一个入栈的顺序，所以组件的渲染顺序是 父created->子created->孙created mounted->子mounted->父mounted
    // 只有new Vue({el: 'xx'})才有vm.$options.el, 而子组件是通过var c = vue.entend()在new c()的方式创建的，所以不会有el，
    // 而且子组件应该挂载到父元素上，所以将会在create-component.js中child.$mount(hydrating ? vnode.elm : undefined, hydrating)渲染
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // opts初始值为构造函数中中的options
  /** options._parentVnode代码在create-compontent.js中，递归渲染子元素的时候传入
   * export function createComponentInstanceForVnode (
    vnode: any, // we know it's MountedComponentVNode but flow doesn't
    parent: any, // activeInstance in lifecycle state 在lifecycle中定义的this指向
  ): Component {
    const options: InternalComponentOptions = {
      _isComponent: true,
      _parentVnode: vnode,
      parent
    }
   */
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
