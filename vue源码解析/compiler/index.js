/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  /**
   * ast的值
   * attrs: [{...}]
   * attrsList: [{...}]
   * attrsMap: {id: "test"}
   * children:[{},{},{}}]
   */
  const ast = parse(template.trim(), options)
  // 标记节点静态缓存属性
  if (options.optimize !== false) {
    optimize(ast, options)
  }
  /** code
   * return {
      render: `with(this){return ${code}}`,
      staticRenderFns: state.staticRenderFns
    }
   */
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
