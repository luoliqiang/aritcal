/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol,
  isPromise,
  remove
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'
import { currentRenderingInstance } from 'core/instance/render'

function ensureCtor (comp: any, base) {
  // 因为不组件是引用的文件加载 require(['./my-async-component'], resolve)，所以判断加载出来的对象是否是__esModule格式或者Module格式，然后取得其值，
  // 而如果取得的值是对象，那么用构造函数方法extend进行包装，否则直接返回
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) {
    comp = comp.default
  }
  return isObject(comp)
    ? base.extend(comp)
    : comp
}

export function createAsyncPlaceholder (
  factory: Function,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string
): VNode {
  const node = createEmptyVNode()
  node.asyncFactory = factory
  node.asyncMeta = { data, context, children, tag }
  return node
}
// 该函数主要是进行异步组件的加载并且传入resolve和reject回调，最后保留状态
export function resolveAsyncComponent (
  factory: Function,
  baseCtor: Class<Component>
): Class<Component> | void {
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }
  // 工厂函数异步组件第二次执行这里时会返回factory.resolved
  // 如果异步组件的状态已经resolved，则直接返回resolved
  if (isDef(factory.resolved)) {
    return factory.resolved
  }
  // currentRenderingInstance为当前异步组件将要被渲染到的实例，currentRenderingInstance在其他地方被设置成需要的实例环境
  const owner = currentRenderingInstance
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) {
    // already pending 将父环境实例添加到自身的依赖对象中
    factory.owners.push(owner)
  }

  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  if (owner && !isDef(factory.owners)) {
    const owners = factory.owners = [owner]
    let sync = true
    let timerLoading = null
    let timerTimeout = null
    // 当父组件实例被destoryed之后，在异步组件中移除对该组件的依赖
    ;(owner: any).$on('hook:destroyed', () => remove(owners, owner))

    const forceRender = (renderCompleted: boolean) => {
      for (let i = 0, l = owners.length; i < l; i++) {
        // 组件内部的所有_watcher对象中的update方法的调用，更新页面所有的数据
        (owners[i]: any).$forceUpdate()
      }

      if (renderCompleted) {
        owners.length = 0
        if (timerLoading !== null) {
          clearTimeout(timerLoading)
          timerLoading = null
        }
        if (timerTimeout !== null) {
          clearTimeout(timerTimeout)
          timerTimeout = null
        }
      }
    }
    // once利用闭包实现只调用一次该函数，resolve只能调用一次
    const resolve = once((res: Object | Class<Component>) => {
      // cache resolved
      // ensureCtor会去获取require(['./my-async-component']的默认值，确保是构造函数，否则会调用extend将其转换成沟站函数
      // 因为不组件是引用的文件加载 require(['./my-async-component'], resolve)，所以判断加载出来的对象是否是__esModule格式或者Module格式，然后取得其值，
      // 而如果取得的值是对象，那么用构造函数方法extend进行包装，否则直接返回
      factory.resolved = ensureCtor(res, baseCtor)
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      if (!sync) {
        // 强行调用拥有则的$forceUpdate进行强行渲染
        forceRender(true)
      } else {
        owners.length = 0
      }
    })

    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender(true)
      }
    })
    // 所以下面例子中的resolve和reject不是promise的，而是在上面的两个方法，其实resolve就是回调，在require加载完成后会调用resolve方法，
    // 并且将结果es6的export对象传入，然后可以取得export.default的值
    /**
     * Vue.component('async-example', function (resolve, reject) {
        require(['./my-async-component'], resolve)
      })
     *  */ 

    const res = factory(resolve, reject)

    if (isObject(res)) {
      // res也支持promise对象
      /**
       * 
        Vue.component(
          'async-webpack-example',
          // 该 `import` 函数返回一个 `Promise` 对象。
          () => import('./my-async-component')
        )
       */
      if (isPromise(res)) {
        // () => Promise
        // 如果组件自身状态还未被resolved，那么等待promise状态更改
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
      } else if (isPromise(res.component)) {
        /**
         * 高级异步组件,其内部会返回一个对象中的component promise
          const AsyncComp = () => ({
            // 需要加载的组件。应当是一个 Promise
            component: import('./MyComp.vue'),
            // 加载中应当渲染的组件
            loading: LoadingComp, 
            // 出错时渲染的组件
            error: ErrorComp,
            // 渲染加载中组件前的等待时间。默认：200ms。
            delay: 200,
            // 最长等待时间。超出此时间则渲染错误组件。默认：Infinity
            timeout: 3000
          })
          Vue.component('async-example', AsyncComp)
         */
        res.component.then(resolve, reject)

        if (isDef(res.error)) {
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }

        if (isDef(res.loading)) {
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          if (res.delay === 0) {
            factory.loading = true
          } else {
            // 加载中的组件默认的delay时间是200ms,所以200ms如果超期则认为是渲染出错，那么强行渲染组件
            timerLoading = setTimeout(() => {
              timerLoading = null
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true
                forceRender(false)
              }
            }, res.delay || 200)
          }
        }
        // 超时时间判断
        if (isDef(res.timeout)) {
          timerTimeout = setTimeout(() => {
            timerTimeout = null
            if (isUndef(factory.resolved)) {
              reject(
                process.env.NODE_ENV !== 'production'
                  ? `timeout (${res.timeout}ms)`
                  : null
              )
            }
          }, res.timeout)
        }
      }
    }

    sync = false
    // return in case resolved synchronously
    // 如果是liading状态返回loading组件，否则返回resolved组件
    return factory.loading
      ? factory.loadingComp
      : factory.resolved
  }
}
