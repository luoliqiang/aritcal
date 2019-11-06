#### vue-cli 3.0的源码解析-（3）creator文件
进入到**creator.js**文件下，还是一步一步分析代码
```js
const path = require('path')
const chalk = require('chalk')
const debug = require('debug')
const execa = require('execa')
const inquirer = require('inquirer')
const semver = require('semver')
const EventEmitter = require('events')
const Generator = require('./Generator')
const cloneDeep = require('lodash.clonedeep')
const sortObject = require('./util/sortObject')
const getVersions = require('./util/getVersions')
const { installDeps } = require('./util/installDeps')
const { clearConsole } = require('./util/clearConsole')
const PromptModuleAPI = require('./PromptModuleAPI')
const writeFileTree = require('./util/writeFileTree')
const { formatFeatures } = require('./util/features')
const loadLocalPreset = require('./util/loadLocalPreset')
const loadRemotePreset = require('./util/loadRemotePreset')
const generateReadme = require('./util/generateReadme')
// loadOptions获取.vuxrc，内部经过了复制.vuxrc到admistor和格式验证
// json对象可能是{ useTaobaoRegistry: true, packageManager: 'yarn' }
const {
  defaults,
  saveOptions,
  loadOptions,
  savePreset,
  validatePreset
} = require('./options')

const {
  log,
  warn,
  error,
  hasGit,
  hasProjectGit,
  hasYarn,
  hasPnpm3OrLater,
  logWithSpinner,
  stopSpinner,
  exit,
  loadModule
} = require('@vue/cli-shared-utils')

const isManualMode = answers => answers.preset === '__manual__'
// 继承node的事件模块
module.exports = class Creator extends EventEmitter {
  constructor (name, context, promptModules) {
    super()

    this.name = name
    // context即为项目目标目录
    this.context = process.env.VUE_CLI_CONTEXT = context
    // vue-cli create语句中的preset和feature交互式命令的提示语句
    const { presetPrompt, featurePrompt } = this.resolveIntroPrompts()
    this.presetPrompt = presetPrompt
    this.featurePrompt = featurePrompt
    // vue-cli create语句中的babel,等配置文件的配置地点的交互式命令的提示语句
    this.outroPrompts = this.resolveOutroPrompts()
    this.injectedPrompts = []
    this.promptCompleteCbs = []
    this.createCompleteCbs = []
    // 对run bind this,这样在const {run} = creator();run()全局执行的时候this有指向
    this.run = this.run.bind(this)
    // PromptModuleAPI构造函数向this中注入了一个creator对象，该对象上注入了injectFeature，injectPrompt，injectOptionForPrompt，onPromptComplete方法
    // 并且将creator对象等于this对象，就相当于PromptModuleAPI的creator继承了this,并且向this注入了方法，二者是完全一致的
    const promptAPI = new PromptModuleAPI(this)
    promptModules.forEach(m => m(promptAPI))
  }

  async create (cliOptions = {}, preset = null) {
    const isTestOrDebug = process.env.VUE_CLI_TEST || process.env.VUE_CLI_DEBUG
    const { run, name, context, createCompleteCbs } = this

    if (!preset) {
      if (cliOptions.preset) {
        // vue create foo --preset bar
        // cliOptions.clone是否使用远程git clone
        // resolvePreset从配置中或文件中获取present
        preset = await this.resolvePreset(cliOptions.preset, cliOptions.clone)
      } else if (cliOptions.default) {
        // 使用default present
        // vue create foo --default
        preset = defaults.presets.default
      } else if (cliOptions.inlinePreset) {
        // 使用输入的 present 对象
        // vue create foo --inlinePreset {...}
        try {
          preset = JSON.parse(cliOptions.inlinePreset)
        } catch (e) {
          error(`CLI inline preset is not valid JSON: ${cliOptions.inlinePreset}`)
          exit(1)
        }
      } else { // 命令行提示present prompt
        preset = await this.promptAndResolvePreset()
      }
    }

    // clone before mutating
    preset = cloneDeep(preset)
    // /cli-service核心插件混入
    // inject core service
    preset.plugins['@vue/cli-service'] = Object.assign({
      projectName: name
    }, preset)
    if (cliOptions.bare) { // 跳过脚手架的介绍
      preset.plugins['@vue/cli-service'].bare = true
    }
    /**
     * preset的值
     * { router: false,
          vuex: false,
          useConfigFiles: false,
          cssPreprocessor: undefined,
          plugins:
          { '@vue/cli-plugin-babel': {},
            '@vue/cli-plugin-eslint': { config: 'base', lintOn: [Array] },
            '@vue/cli-service':
              { projectName: 'cccc',
                router: false,
                vuex: false,
                useConfigFiles: false,
                cssPreprocessor: undefined,
                plugins: [Circular] 
              }
            }
          }
     */
    // 使用的包管理器
    const packageManager = (
      cliOptions.packageManager ||
      loadOptions().packageManager ||
      (hasYarn() ? 'yarn' : null) ||
      (hasPnpm3OrLater() ? 'pnpm' : 'npm')
    )
    // 清除执行命令顶上部分的全部命令行
    await clearConsole()
    logWithSpinner(`✨`, `Creating project in ${chalk.yellow(context)}.`)
    // 发出creation钩子事件
    this.emit('creation', { event: 'creating' })

    // get latest CLI version
    // 获取vue-cli最新版本号
    const { latest } = await getVersions()
    const latestMinor = `${semver.major(latest)}.${semver.minor(latest)}.0`
    // generate package.json with plugin dependencies
    // 生成 package.json文件
    const pkg = {
      name,
      version: '0.1.0',
      private: true,
      devDependencies: {}
    }
    const deps = Object.keys(preset.plugins)
    /**
     * deps:
     * [ '@vue/cli-plugin-babel',
        '@vue/cli-plugin-eslint',
        '@vue/cli-service' ]
     */
    deps.forEach(dep => {
      if (preset.plugins[dep]._isPreset) {
        return
      }

      // Note: the default creator includes no more than `@vue/cli-*` & `@vue/babel-preset-env`,
      // so it is fine to only test `@vue` prefix.
      // Other `@vue/*` packages' version may not be in sync with the cli itself.
      // 版本号，如果未传入默认使用最新
      pkg.devDependencies[dep] = (
        preset.plugins[dep].version ||
        ((/^@vue/.test(dep)) ? `^${latestMinor}` : `latest`)
      )
    })
    // write package.json
    // 写入package.json,使用2个空格间隙
    // 写入package.json文件 字符串方式写入
    await writeFileTree(context, {
      'package.json': JSON.stringify(pkg, null, 2)
    })

    // intilaize git repository before installing deps
    // so that vue-cli-service can setup git hooks.
    // 利用execSync('git status', { stdio: 'ignore', cwd })来判断是否应该执行git init
    const shouldInitGit = this.shouldInitGit(cliOptions)
    if (shouldInitGit) {
      logWithSpinner(`🗃`, `Initializing git repository...`)
      // 事件钩子git-init
      this.emit('creation', { event: 'git-init' })
      // 启子进程执行git init初始化git
      await run('git init')
    }
    console.log(preset)
    // install plugins 安装插件
    stopSpinner()
    log(`⚙  Installing CLI plugins. This might take a while...`)
    log()
    // 事件钩子git-init
    this.emit('plugins-install', { event: 'plugins-install' })
    if (isTestOrDebug) {
      // in development, avoid installation process
      await require('./util/setupDevProject')(context)
    } else {
      // 指定packageManager的安装源安装deps,内部添加了淘宝源，child子进程进行yarn安装，自定义了进度条等
      // 核心就是执行yarn 或者npm install 进行安装
      await installDeps(context, packageManager, cliOptions.registry)
    }

    // run generator 运行生成器
    log(`🚀  Invoking generators...`)
    // 触发invoking-generators钩子事件
    this.emit('creation', { event: 'invoking-generators' })
    console.log(preset)
    /** preset值：
     * plugins:
        { '@vue/cli-plugin-babel': {},
          '@vue/cli-plugin-eslint': { config: 'base', lintOn: [Array] },
          '@vue/cli-service':
            { projectName: 'mmm',
              router: false,
              vuex: false,
              useConfigFiles: false,
              cssPreprocessor: undefined,
              plugins: [Circular] } } }
     */
    // cli 返回对象{}；默认会配置一些插件例如babel,eslint等，resolvePlugins会解析插件，将插件的propmpt执行，入口文件放到applay键值中
     /** plugins：
     * [ { id: '@vue/cli-service',
          apply: [Function],
          options:
          { projectName: 'mmmdmdd',
            router: false,
            vuex: false,
            useConfigFiles: false,
            cssPreprocessor: undefined,
            plugins: [Object] } },
        { id: '@vue/cli-plugin-babel', apply: [Function], options: {} },
        { id: '@vue/cli-plugin-eslint',
          apply: { [Function] applyTS: [Function] },
          options: { config: 'base', lintOn: [Array] } } ]
     */
    const plugins = await this.resolvePlugins(preset.plugins)
    // Generator: 插件生成器，执行vue的初始化工作，例如配置babel,eslit等，安装vuex等
    const generator = new Generator(context, {
      pkg,
      plugins,
      completeCbs: createCompleteCbs
    })
    await generator.generate({
      extractConfigFiles: preset.useConfigFiles
    })

    // install additional deps (injected by generators)
    log(`📦  Installing additional dependencies...`)
    this.emit('creation', { event: 'deps-install' })
    log()
    if (!isTestOrDebug) {
      await installDeps(context, packageManager, cliOptions.registry)
    }

    // run complete cbs if any (injected by generators)
    logWithSpinner('⚓', `Running completion hooks...`)
    this.emit('creation', { event: 'completion-hooks' })
    for (const cb of createCompleteCbs) {
      await cb()
    }

    // generate README.md
    stopSpinner()
    log()
    logWithSpinner('📄', 'Generating README.md...')
    await writeFileTree(context, {
      'README.md': generateReadme(generator.pkg, packageManager)
    })

    // generate a .npmrc file for pnpm, to persist the `shamefully-flatten` flag
    if (packageManager === 'pnpm') {
      await writeFileTree(context, {
        '.npmrc': 'shamefully-flatten=true\n'
      })
    }

    // commit initial state
    let gitCommitFailed = false
    if (shouldInitGit) {
      await run('git add -A')
      if (isTestOrDebug) {
        await run('git', ['config', 'user.name', 'test'])
        await run('git', ['config', 'user.email', 'test@test.com'])
      }
      const msg = typeof cliOptions.git === 'string' ? cliOptions.git : 'init'
      try {
        await run('git', ['commit', '-m', msg])
      } catch (e) {
        gitCommitFailed = true
      }
    }

    // log instructions
    stopSpinner()
    log()
    log(`🎉  Successfully created project ${chalk.yellow(name)}.`)
    if (!cliOptions.skipGetStarted) {
      log(
        `👉  Get started with the following commands:\n\n` +
        (this.context === process.cwd() ? `` : chalk.cyan(` ${chalk.gray('$')} cd ${name}\n`)) +
        chalk.cyan(` ${chalk.gray('$')} ${packageManager === 'yarn' ? 'yarn serve' : packageManager === 'pnpm' ? 'pnpm run serve' : 'npm run serve'}`)
      )
    }
    log()
    this.emit('creation', { event: 'done' })

    if (gitCommitFailed) {
      warn(
        `Skipped git commit due to missing username and email in git config.\n` +
        `You will need to perform the initial commit yourself.\n`
      )
    }

    generator.printExitLogs()
  }

  run (command, args) {
    // 空格分隔的command后面的元素即为参数
    if (!args) { [command, ...args] = command.split(/\s+/) }
    // execa比child_process更好用的node包
    return execa(command, args, { cwd: this.context })
  }

  async promptAndResolvePreset (answers = null) {
    // prompt
    if (!answers) {
      await clearConsole(true)
      answers = await inquirer.prompt(this.resolveFinalPrompts())
    }
    debug('vue-cli:answers')(answers)

    if (answers.packageManager) {
      saveOptions({
        packageManager: answers.packageManager
      })
    }

    let preset
    if (answers.preset && answers.preset !== '__manual__') {
      preset = await this.resolvePreset(answers.preset)
    } else {
      // manual
      preset = {
        useConfigFiles: answers.useConfigFiles === 'files',
        plugins: {}
      }
      answers.features = answers.features || []
      // run cb registered by prompt modules to finalize the preset
      this.promptCompleteCbs.forEach(cb => cb(answers, preset))
    }

    // validate
    validatePreset(preset)

    // save preset
    if (answers.save && answers.saveName) {
      savePreset(answers.saveName, preset)
    }

    debug('vue-cli:preset')(preset)
    return preset
  }

  async resolvePreset (name, clone) {
    let preset
    // 从合并的options中查询是否有presets预设置
    const savedPresets = loadOptions().presets || {}

    if (name in savedPresets) {
      preset = savedPresets[name]
      // 如果传入的name是json文件或者其他以.结尾的文件名，绝对路径地址
    } else if (name.endsWith('.json') || /^\./.test(name) || path.isAbsolute(name)) {
      // 以json格式load该preset
      preset = await loadLocalPreset(path.resolve(name))
    } else if (name.includes('/')) {
      logWithSpinner(`Fetching remote preset ${chalk.cyan(name)}...`)
      this.emit('creation', { event: 'fetch-remote-preset' })
      try {
        // 从Preset文件中获取preset
        preset = await loadRemotePreset(name, clone)
        stopSpinner()
      } catch (e) {
        stopSpinner()
        error(`Failed fetching remote preset ${chalk.cyan(name)}:`)
        throw e
      }
    }

    // use default preset if user has not overwritten it
    if (name === 'default' && !preset) {
      preset = defaults.presets.default
    }
    if (!preset) {
      error(`preset "${name}" not found.`)
      const presets = Object.keys(savedPresets)
      if (presets.length) {
        log()
        log(`available presets:\n${presets.join(`\n`)}`)
      } else {
        log(`you don't seem to have any saved preset.`)
        log(`run vue-cli in manual mode to create a preset.`)
      }
      exit(1)
    }
    return preset
  }

  // { id: options } => [{ id, apply, options }]
  async resolvePlugins (rawPlugins) {
    // ensure cli-service is invoked first
    // 把对象按照key排序，将给定的key排最前，其余按照依次或者字符编码的顺序进行排序,这里将@vue/cli-service排在第一位
    rawPlugins = sortObject(rawPlugins, ['@vue/cli-service'], true)
    const plugins = []
    for (const id of Object.keys(rawPlugins)) {
      // loadModule：先拼接绝对路径，再使用require(path)加载模块,生成路径 E:\3-jifei\vue3\mmmd\node_modules\@vue\cli-service\generator\index.js或者...@vue\cli-plugin-babel/generator.js
      // 根据context上线文和@vue\cli-service\generator目录找到对应generator文件夹下的入口index,js文件，require.resolve在process.version, '>=10.0.0'版本下直接找到，否则需要兼容处理
      // apply即为入口index.js文件，加载，即 apply = require(resolvedPath)
      const apply = loadModule(`${id}/generator`, this.context) || (() => {})
      let options = rawPlugins[id] || {}
      // 插件是否有命令行提示
      if (options.prompts) {
        // 命令行提示入口文件prompts.js
        const prompts = loadModule(`${id}/prompts`, this.context)
        if (prompts) {
          log()
          log(`${chalk.cyan(options._isPreset ? `Preset options:` : id)}`)
          // 插件安装时提示的交互式命令，相当于是插件的prompts都是配置文件在插件文件夹中
          options = await inquirer.prompt(prompts)
        }
      }
      plugins.push({ id, apply, options })
    }
    /** plugins：
     * [ { id: '@vue/cli-service',
          apply: [Function],
          options:
          { projectName: 'mmmdmdd',
            router: false,
            vuex: false,
            useConfigFiles: false,
            cssPreprocessor: undefined,
            plugins: [Object] } },
        { id: '@vue/cli-plugin-babel', apply: [Function], options: {} },
        { id: '@vue/cli-plugin-eslint',
          apply: { [Function] applyTS: [Function] },
          options: { config: 'base', lintOn: [Array] } } ]
     */
    return plugins
  }

  getPresets () {
    // { useTaobaoRegistry: true, packageManager: 'yarn' }
    const savedOptions = loadOptions()
    // 合并vue的presets上次用户设置文件的配置，所以.vuxrc可以设置用户vue-cli默认配置，项目的配置会合并.vuxrc
    /**
     * { lastChecked: undefined,
        latestVersion: undefined,
        packageManager: undefined,
        useTaobaoRegistry: undefined,
        presets:
        { default:
            { router: false,
              vuex: false,
              useConfigFiles: false,
              cssPreprocessor: undefined,
              plugins: [Object] } } }
     */
    return Object.assign({}, savedOptions.presets, defaults.presets)
  }
// cue-cli create中的presets和feature的命令行提示语句的配置
  resolveIntroPrompts () {
    // 配置中的default.present,也就是缓存的vue相关配置,default出了包含present还包含registry npm ,yarn等配置
    // formatFeatures对present配置添加前缀等，例如 router: -> vue-router等,输出了'babel, eslint'
    const presets = this.getPresets()
    // 最后输入了defalt设置的present     [ { name:'default (babel, eslint),value: 'default' } ],其中的两个值对应'babel, eslint'
    const presetChoices = Object.keys(presets).map(name => {
      return {
        name: `${name} (${formatFeatures(presets[name])})`,
        value: name
      }
    })
    // 命令框提示选择一个存在的模板配置，可选择上面的默认presetChoices或者Manually
    const presetPrompt = {
      name: 'preset',
      type: 'list',
      message: `Please pick a preset:`,
      choices: [
        ...presetChoices,
        {
          name: 'Manually select features',
          value: '__manual__'
        }
      ]
    }
    const featurePrompt = {
      name: 'features',
      when: isManualMode,
      type: 'checkbox',
      message: 'Check the features needed for your project:',
      choices: [],
      pageSize: 10
    }
    return {
      presetPrompt,
      featurePrompt
    }
  }

  resolveOutroPrompts () {
    const outroPrompts = [
      {
        name: 'useConfigFiles',
        when: isManualMode,
        type: 'list',
        message: 'Where do you prefer placing config for Babel, PostCSS, ESLint, etc.?',
        choices: [
          {
            name: 'In dedicated config files',
            value: 'files'
          },
          {
            name: 'In package.json',
            value: 'pkg'
          }
        ]
      },
      {
        name: 'save',
        when: isManualMode,
        type: 'confirm',
        message: 'Save this as a preset for future projects?',
        default: false
      },
      {
        name: 'saveName',
        when: answers => answers.save,
        type: 'input',
        message: 'Save preset as:'
      }
    ]

    // ask for packageManager once
    const savedOptions = loadOptions()
    if (!savedOptions.packageManager && (hasYarn() || hasPnpm3OrLater())) {
      const packageManagerChoices = []

      if (hasYarn()) {
        packageManagerChoices.push({
          name: 'Use Yarn',
          value: 'yarn',
          short: 'Yarn'
        })
      }

      if (hasPnpm3OrLater()) {
        packageManagerChoices.push({
          name: 'Use PNPM',
          value: 'pnpm',
          short: 'PNPM'
        })
      }

      packageManagerChoices.push({
        name: 'Use NPM',
        value: 'npm',
        short: 'NPM'
      })

      outroPrompts.push({
        name: 'packageManager',
        type: 'list',
        message: 'Pick the package manager to use when installing dependencies:',
        choices: packageManagerChoices
      })
    }

    return outroPrompts
  }

  resolveFinalPrompts () {
    // patch generator-injected prompts to only show in manual mode
    this.injectedPrompts.forEach(prompt => {
      const originalWhen = prompt.when || (() => true)
      prompt.when = answers => {
        return isManualMode(answers) && originalWhen(answers)
      }
    })
    const prompts = [
      this.presetPrompt,
      this.featurePrompt,
      ...this.injectedPrompts,
      ...this.outroPrompts
    ]
    debug('vue-cli:prompts')(prompts)
    return prompts
  }

  shouldInitGit (cliOptions) {
    // 通过执行execSync('git --version', { stdio: 'ignore' })来判断是否安装了git
    if (!hasGit()) {
      return false
    }
    // --git
    if (cliOptions.forceGit) {
      return true
    }
    // --no-git
    if (cliOptions.git === false || cliOptions.git === 'false') {
      return false
    }
    // default: true unless already in a git repo
    return !hasProjectGit(this.context)
  }
}


```
#### 总结
主要步骤：
* installDeps安装依赖包
* 命令行提示交互
* 调用Generator差价生成器生成对应插件

接下来分析Generator构造函数


  

