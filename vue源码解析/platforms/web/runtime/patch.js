/* @flow */

import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
// refs和directive两个方法
import baseModules from 'core/vdom/modules/index'
// 一些vdom的dom操作函数例如 klass,events,domProps,style, transition等方法每个方法都是一个对象提供
//{create: _enter, activate: _enter,remove}等前面2中或三种方法，对应于数据变化时的更新方法是create还是update
// 
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
const modules = platformModules.concat(baseModules)
// nodeOps提供了dom操作方法的简写，例如 createTextNode createComment insertBefore appendChild setTextContent等
export const patch: Function = createPatchFunction({ nodeOps, modules })
