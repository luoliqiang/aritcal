/* @flow */

import { isDef, isUndef, extend, toNumber } from 'shared/util'
import { isSVG } from 'web/util/index'

let svgContainer

function updateDOMProps (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  //如果oldVnode和vnode的data上都没有domProps属性
  if (isUndef(oldVnode.data.domProps) && isUndef(vnode.data.domProps)) {
    return
  }
  let key, cur
  const elm: any = vnode.elm
  const oldProps = oldVnode.data.domProps || {}
  let props = vnode.data.domProps || {}
  // clone observed objects, as the user probably wants to mutate it
  if (isDef(props.__ob__)) {
    props = vnode.data.domProps = extend({}, props)
  }

  for (key in oldProps) {
    if (!(key in props)) {
      elm[key] = ''
    }
  }

  for (key in props) { //遍历props 对于<p v-html="message">{{message}}</p>这个节点来说，这里的key等于:innerHTML
    cur = props[key] //获取对应的值,对于<p v-html="message">{{message}}</p>这个节点来说，cur等于:"<span style="color:#f00">Hell World!</span>" 
    // ignore children if the node has textContent or innerHTML,
    // as these will throw away existing DOM nodes and cause removal errors
    // on subsequent patches (#3360)
    if (key === 'textContent' || key === 'innerHTML') { //如果key等于textContent或innerHTML，这里是对指令v-html和v-text的
      if (vnode.children) vnode.children.length = 0 //如果有子节点，则删除它们
      if (cur === oldProps[key]) continue
      // #6601 work around Chrome version <= 55 bug where single textNode
      // replaced by innerHTML/textContent retains its parentNode property
      if (elm.childNodes.length === 1) {
        elm.removeChild(elm.childNodes[0])
      }
    }

    if (key === 'value' && elm.tagName !== 'PROGRESS') {
      // store value as _value as well since
      // non-string values will be stringified
      elm._value = cur
      // avoid resetting cursor position when value is the same
      const strCur = isUndef(cur) ? '' : String(cur)
      if (shouldUpdateValue(elm, strCur)) {
        elm.value = strCur
      }
    } else if (key === 'innerHTML' && isSVG(elm.tagName) && isUndef(elm.innerHTML)) {
      // IE doesn't support innerHTML for SVG elements
      svgContainer = svgContainer || document.createElement('div')
      svgContainer.innerHTML = `<svg>${cur}</svg>`
      const svg = svgContainer.firstChild
      while (elm.firstChild) {
        elm.removeChild(elm.firstChild)
      }
      while (svg.firstChild) {
        elm.appendChild(svg.firstChild)
      }
    } else if (
      // skip the update if old and new VDOM state is the same.
      // `value` is handled separately because the DOM value may be temporarily
      // out of sync with VDOM state due to focus, composition and modifiers.
      // This  #4521 by skipping the unnecesarry `checked` update.
      cur !== oldProps[key]
    ) {
      // some property updates can throw
      // e.g. `value` on <progress> w/ non-finite value
      try { // 对于v-html和v-text来说，Vue是通过设置元素原生的innerHTML或textContent这两个属性来实现的
        elm[key] = cur  //否则直接设置elm的key属性值为cur，也就是设置元素的innerHTML或textContent属性 
      } catch (e) {}
    }
  }
}

// check platforms/web/util/attrs.js acceptValue
type acceptValueElm = HTMLInputElement | HTMLSelectElement | HTMLOptionElement;

function shouldUpdateValue (elm: acceptValueElm, checkVal: string): boolean {
  return (!elm.composing && (
    elm.tagName === 'OPTION' ||
    isNotInFocusAndDirty(elm, checkVal) ||
    isDirtyWithModifiers(elm, checkVal)
  ))
}

function isNotInFocusAndDirty (elm: acceptValueElm, checkVal: string): boolean {
  // return true when textbox (.number and .trim) loses focus and its value is
  // not equal to the updated value
  let notInFocus = true
  // #6157
  // work around IE bug when accessing document.activeElement in an iframe
  try { notInFocus = document.activeElement !== elm } catch (e) {}
  return notInFocus && elm.value !== checkVal
}

function isDirtyWithModifiers (elm: any, newVal: string): boolean {
  const value = elm.value
  const modifiers = elm._vModifiers // injected by v-model runtime
  if (isDef(modifiers)) {
    if (modifiers.number) {
      return toNumber(value) !== toNumber(newVal)
    }
    if (modifiers.trim) {
      return value.trim() !== newVal.trim()
    }
  }
  return value !== newVal
}

export default {
  create: updateDOMProps,
  update: updateDOMProps
}
