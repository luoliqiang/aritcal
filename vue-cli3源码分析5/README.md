#### vue-cli 3.0的源码解析-（3）插件生成器generator文件
进入到**generator.js**文件下，还是一步一步分析代码
```js
const ejs = require('ejs')
const debug = require('debug')
const GeneratorAPI = require('./GeneratorAPI')
const sortObject = require('./util/sortObject')
const writeFileTree = require('./util/writeFileTree')
const inferRootOptions = require('./util/inferRootOptions')
const normalizeFilePaths = require('./util/normalizeFilePaths')
const runCodemod = require('./util/runCodemod')
const { toShortPluginId, matchesPluginId } = require('@vue/cli-shared-utils')
const ConfigTransform = require('./ConfigTransform')

const logger = require('@vue/cli-shared-utils/lib/logger')
const logTypes = {
  log: logger.log,
  info: logger.info,
  done: logger.done,
  warn: logger.warn,
  error: logger.error
}

const defaultConfigTransforms = {
  babel: new ConfigTransform({
    file: {
      js: ['babel.config.js']
    }
  }),
  postcss: new ConfigTransform({
    file: {
      js: ['postcss.config.js'],
      json: ['.postcssrc.json', '.postcssrc'],
      yaml: ['.postcssrc.yaml', '.postcssrc.yml']
    }
  }),
  eslintConfig: new ConfigTransform({
    file: {
      js: ['.eslintrc.js'],
      json: ['.eslintrc', '.eslintrc.json'],
      yaml: ['.eslintrc.yaml', '.eslintrc.yml']
    }
  }),
  jest: new ConfigTransform({
    file: {
      js: ['jest.config.js']
    }
  }),
  browserslist: new ConfigTransform({
    file: {
      lines: ['.browserslistrc']
    }
  })
}

const reservedConfigTransforms = {
  vue: new ConfigTransform({
    file: {
      js: ['vue.config.js']
    }
  })
}

const ensureEOL = str => {
  if (str.charAt(str.length - 1) !== '\n') {
    return str + '\n'
  }
  return str
}

module.exports = class Generator {
  constructor (context, {
    pkg = {},
    plugins = [],
    completeCbs = [],
    files = {},
    invoking = false
  } = {}) {
    this.context = context
    this.plugins = plugins
    this.originalPkg = pkg
    this.pkg = Object.assign({}, pkg)
    this.imports = {}
    this.rootOptions = {}
    this.completeCbs = completeCbs
    this.configTransforms = {}
    this.defaultConfigTransforms = defaultConfigTransforms
    this.reservedConfigTransforms = reservedConfigTransforms
    this.invoking = invoking
    // for conflict resolution
    this.depSources = {}
    // virtual file tree
    this.files = files
    this.fileMiddlewares = []
    this.postProcessFilesCbs = []
    // exit messages
    this.exitLogs = []

    const cliService = plugins.find(p => p.id === '@vue/cli-service')
    /** inferRootOptions 装换pkg中的数据和cliService中的option格式一致
     * options:
          { projectName: 'mmmdmdd',
            router: false,
            vuex: false,
            useConfigFiles: false,
            cssPreprocessor: undefined,
            plugins: [Object] } },
     */
    const rootOptions = cliService
      ? cliService.options
      : inferRootOptions(pkg) 
    // apply generators from plugins
    // 编译执行插件，options是插件参数，rootOptions是所有参数
    plugins.forEach(({ id, apply, options }) => {
      // GeneratorAPI处理plugin相关的数据，一些api给插件生成器使用
      /**
       * GeneratorAPI {
          id: '@vue/cli-plugin-eslint',
          generator:
          Generator {
            context: 'E:\\3-jifei\\vue3\\aaad',
            plugins: [ [Object], [Object], [Object] ],
            originalPkg:
              { name: 'aaad',
                version: '0.1.0',
                private: true,
                devDependencies: [Object] },
            pkg:
              { name: 'aaad',
                version: '0.1.0',
                private: true,
                devDependencies: [Object],
                scripts: [Object],
                dependencies: [Object],
                postcss: [Object],
                browserslist: [Array],
                babel: [Object] },
            imports: {},
            rootOptions: {},
            completeCbs: [],
            configTransforms: {},
            defaultConfigTransforms:
              { babel: [ConfigTransform],
                postcss: [ConfigTransform],
                eslintConfig: [ConfigTransform],
                jest: [ConfigTransform],
                browserslist: [ConfigTransform] },
            reservedConfigTransforms: { vue: [ConfigTransform] },
            invoking: false,
            depSources:
              { vue: '@vue/cli-service',
                'vue-template-compiler': '@vue/cli-service',
                'core-js': '@vue/cli-plugin-babel' },
            files: {},
            fileMiddlewares: [ [AsyncFunction] ],
            postProcessFilesCbs: [],
            exitLogs: [] },
          options: { config: 'base', lintOn: [ 'save' ] },
          rootOptions:
          { projectName: 'aaad',
            router: false,
            vuex: false,
            useConfigFiles: false,
            cssPreprocessor: undefined,
            plugins:
              { '@vue/cli-plugin-babel': {},
                '@vue/cli-plugin-eslint': [Object] } },
          pluginsData:
          [ { name: 'babel',
              link:
                'https://github.com/vuejs/vue-cli/tree/dev/packages/%40vue/cli-plugin-babel' },
            { name: 'eslint',
              link:
                'https://github.com/vuejs/vue-cli/tree/dev/packages/%40vue/cli-plugin-eslint' } ],
          _entryFile: undefined }
       */
      const api = new GeneratorAPI(id, this, options, rootOptions)
      
      // 执行apply函数，也就是执行插件入口函数，例如babel会执行babel中的index.js文件，eslint，如果命令行选择了vuex，router还会执行对应的router和vuex安装
      // options插件参数传入给执行文件，会合并到插件的初始化参数中
      apply(api, options, rootOptions, invoking)
    })
  }

  async generate ({
    extractConfigFiles = false,
    checkExisting = false
  } = {}) {
    // save the file system before applying plugin for comparison
    const initialFiles = Object.assign({}, this.files)
    // extract configs from package.json into dedicated files.
    this.extractConfigFiles(extractConfigFiles, checkExisting)
    // wait for file resolve
    await this.resolveFiles()
    // set package.json
    this.sortPkg()
    this.files['package.json'] = JSON.stringify(this.pkg, null, 2) + '\n'
    // write/update file tree to disk
    await writeFileTree(this.context, this.files, initialFiles)
  }

  extractConfigFiles (extractAll, checkExisting) {
    const configTransforms = Object.assign({},
      defaultConfigTransforms,
      this.configTransforms,
      reservedConfigTransforms
    )
    const extract = key => {
      if (
        configTransforms[key] &&
        this.pkg[key] &&
        // do not extract if the field exists in original package.json
        !this.originalPkg[key]
      ) {
        const value = this.pkg[key]
        const configTransform = configTransforms[key]
        const res = configTransform.transform(
          value,
          checkExisting,
          this.files,
          this.context
        )
        const { content, filename } = res
        this.files[filename] = ensureEOL(content)
        delete this.pkg[key]
      }
    }
    if (extractAll) {
      for (const key in this.pkg) {
        extract(key)
      }
    } else {
      if (!process.env.VUE_CLI_TEST) {
        // by default, always extract vue.config.js
        extract('vue')
      }
      // always extract babel.config.js as this is the only way to apply
      // project-wide configuration even to dependencies.
      // TODO: this can be removed when Babel supports root: true in package.json
      extract('babel')
    }
  }

  sortPkg () {
    // ensure package.json keys has readable order
    this.pkg.dependencies = sortObject(this.pkg.dependencies)
    this.pkg.devDependencies = sortObject(this.pkg.devDependencies)
    this.pkg.scripts = sortObject(this.pkg.scripts, [
      'serve',
      'build',
      'test',
      'e2e',
      'lint',
      'deploy'
    ])
    this.pkg = sortObject(this.pkg, [
      'name',
      'version',
      'private',
      'description',
      'author',
      'scripts',
      'main',
      'module',
      'browser',
      'jsDelivr',
      'unpkg',
      'files',
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'vue',
      'babel',
      'eslintConfig',
      'prettier',
      'postcss',
      'browserslist',
      'jest'
    ])

    debug('vue:cli-pkg')(this.pkg)
  }

  async resolveFiles () {
    const files = this.files
    for (const middleware of this.fileMiddlewares) {
      await middleware(files, ejs.render)
    }

    // normalize file paths on windows
    // all paths are converted to use / instead of \
    normalizeFilePaths(files)

    // handle imports and root option injections
    Object.keys(files).forEach(file => {
      let imports = this.imports[file]
      imports = imports instanceof Set ? Array.from(imports) : imports
      if (imports && imports.length > 0) {
        files[file] = runCodemod(
          require('./util/codemods/injectImports'),
          { path: file, source: files[file] },
          { imports }
        )
      }

      let injections = this.rootOptions[file]
      injections = injections instanceof Set ? Array.from(injections) : injections
      if (injections && injections.length > 0) {
        files[file] = runCodemod(
          require('./util/codemods/injectOptions'),
          { path: file, source: files[file] },
          { injections }
        )
      }
    })

    for (const postProcess of this.postProcessFilesCbs) {
      await postProcess(files)
    }
    debug('vue:cli-files')(this.files)
  }

  hasPlugin (_id) {
    if (_id === 'router') _id = 'vue-router'
    if (['vue-router', 'vuex'].includes(_id)) {
      const pkg = this.pkg
      return ((pkg.dependencies && pkg.dependencies[_id]) || (pkg.devDependencies && pkg.devDependencies[_id]))
    }
    return [
      ...this.plugins.map(p => p.id),
      ...Object.keys(this.pkg.devDependencies || {}),
      ...Object.keys(this.pkg.dependencies || {})
    ].some(id => matchesPluginId(_id, id))
  }

  printExitLogs () {
    if (this.exitLogs.length) {
      this.exitLogs.forEach(({ id, msg, type }) => {
        const shortId = toShortPluginId(id)
        const logFn = logTypes[type]
        if (!logFn) {
          logger.error(`Invalid api.exitLog type '${type}'.`, shortId)
        } else {
          logFn(msg, msg && shortId)
        }
      })
      logger.log()
    }
  }
}



```
#### 总结
* 差价生成器生成插件配置


  

