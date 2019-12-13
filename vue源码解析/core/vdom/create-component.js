/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from 'weex/runtime/recycle-list/render-component-template'

// inline hooks to be invoked on component VNodes during patch
const componentVNodeHooks = {
  init (vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
      // createComponentInstanceForVnode创建子组件的构造函数 new Sub(options)，内部会调用prototype._init，所以子组件就开始实例化了
      // 然后接下来执行child.$mount(hydrating ? vnode.elm : undefined, hydrating)则形成了递归，又会进入到这个地方，然后就是入栈的递归调用，所以是最内部的组件先开始$mount,所以此处的child是依次的子孙组件
      // activeInstance就是上一个的this对象，也就是上一个组件的this，也就是parent
      // vnode.componentInstance指向的就是下一个子组件
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      )
      // vnode.el代表父元素的elm，第一次new Vue({el: app})后elm代表#app
      // 浏览器环境下传入undefined，则会createeElement新生产一个dom
      // 所以从父组件到子组件是递归调用child.$mount，递归生成的div dom
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
  },

  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions
    const child = vnode.componentInstance = oldVnode.componentInstance
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },

  insert (vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode
    // 调用组件中的mounted钩子函数
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true
      callHook(componentInstance, 'mounted')
    }
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance)
      } else {
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  destroy (vnode: MountedComponentVNode) {
    const { componentInstance } = vnode
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy()
      } else {
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

const hooksToMerge = Object.keys(componentVNodeHooks)
/**createComponent
 * Ctor是对象，则转换成构造函数Ctor,是异步组件，则创建异步Ctor
 * 将data和Crot中的v-modle数据转换成对象格式
 * 处理函数Ctor
 * 将默认hook合并data中的hook去
 * Ctor代表的是子组件的构造函数
 */
export function createComponent (
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) {
    return
  }
  // 根vue构造函数 new Vue()
  const baseCtor = context.$options._base

  // plain options object: turn it into a constructor
  // 如果是对象，则用extend方法转换成构造函数
  if (isObject(Ctor)) {
    Ctor = baseCtor.extend(Ctor)
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  if (typeof Ctor !== 'function') {
    if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }

  // async component
  // Ctor.cid不存在则是异步组件
  // 对于一个组件来说，比如Vue.component(component-name,obj|func)，组件的值可以是一个对象，也可以是一个函数，如果是对象，则注册时会执行Vue.extend()函数
  let asyncFactory
  if (isUndef(Ctor.cid)) {
    asyncFactory = Ctor
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor)
    if (Ctor === undefined) {
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {}

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  // 解析Ctor的options,防止在ctor后修改了父options
  resolveConstructorOptions(Ctor)

  // transform component v-model data into props & events
  // 将v-model="inpVal"的形式转换成datt.on = {inpVal: callback}的形式,并且将options中的
  /**
   * 所以data会被修改为
   * data: {
   *  attrs: {
   *    value: 'sssss',
   *  },
      on: [func1,func2],
    }
   */
  if (isDef(data.model)) {
    transformModel(Ctor.options, data)
  }

  // extract props
  // 将data中的props和attrs中的数据中有和Ctor.options中的重复的，取出来，因为data中的优先级更高
  const propsData = extractPropsFromVNodeData(data, Ctor, tag)

  // functional component
  // 函数组件
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  // listeners为该组件中的监听函数，包括了v-model转化出来的函数
  const listeners = data.on
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  data.on = data.nativeOn
  // 虚拟组件 keepalive等不会挂载的组件
  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot

    // work around flow
    const slot = data.slot
    data = {}
    if (slot) {
      data.slot = slot
    }
  }

  // install component management hooks onto the placeholder node
  // 合并data中传入的hook到原来的默认hook中，默认hook有init ,prepath,insert,destory
  // 合并策略是concat, 所以在$mounted组件的时候可以根据hook.init方法来判断是不是函数vnode
  installComponentHooks(data)

  // return a placeholder vnode
  // 利用构造函数的name来生成name
  // Ctor代表子组件
  const name = Ctor.options.name || tag
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  )

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }

  return vnode
}

// 创建一个new Vue()构造函数所用参数就是vnode中的参数
// 对子组件进行构造函数的初始化
export function createComponentInstanceForVnode (
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  parent: any, // activeInstance in lifecycle state 在lifecycle中定义的this指向
): Component {
  const options: InternalComponentOptions = {
    _isComponent: true,
    _parentVnode: vnode,
    parent
  }
  // check inline-template render functions
  // 找到tempate模板
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    // 找到render函数
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  // 调用子组件的vue构造函数并传入options
  return new vnode.componentOptions.Ctor(options)
}

function installComponentHooks (data: VNodeData) {
  // 将默认hook合并到data中传入的hook中
  const hooks = data.hook || (data.hook = {})
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i]
    const existing = hooks[key]
    const toMerge = componentVNodeHooks[key]
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}
// mergeHook的合并策略是concat
function mergeHook (f1: any, f2: any): Function {
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    f1(a, b)
    f2(a, b)
  }
  merged._merged = true
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
function transformModel (options, data: any) {
  // 取出options总的model中的prop事件属性
  const prop = (options.model && options.model.prop) || 'value'
  // 取出options总的model中的event事件名
  const event = (options.model && options.model.event) || 'input'
  // 将data.modle.value也就是v-model的值赋值给data.attrs，赋值的key为options中的属性名或者value，即data.attrs.value = value
  ;(data.attrs || (data.attrs = {}))[prop] = data.model.value
  // 获取v-model执行的绑定函数
  const on = data.on || (data.on = {})
  // 已经有的函数，有肯能多次执行reander函数那么可能已经存在了上次绑定的函数
  const existing = on[event]
  // 这次data传入的函数
  // 合并函数组或者设置现在添加的到data。on上
  const callback = data.model.callback
  if (isDef(existing)) {
    if (
      Array.isArray(existing)
        ? existing.indexOf(callback) === -1
        : existing !== callback
    ) {
      on[event] = [callback].concat(existing)
    }
  } else {
    on[event] = callback
  }

  /**
   * 所以返回应该是
   * data: {
   *  attrs: {
   *    value: 'sssss',
   *  },
      on: [func1,func2],
    }
   */
}
