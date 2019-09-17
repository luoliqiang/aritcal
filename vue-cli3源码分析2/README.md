#### vue-cli 3.0的源码解析-（2）入口文件bin/vue.js
进入到**nodejs\node_modules\@vue\cli\bin**目录下，打开vue.js文件
```js
#!/usr/bin/env node
// 指定node为该文件的解释器，#!/usr/bin/env代表在系统的环境变量中找寻node，而不是写死地址，防止用户没有将node安装在usr/bin目录下

// Check node version before requiring/doing anything else
// The user may be on a very old node version

const chalk = require('chalk') // 语法高亮库
const semver = require('semver') // Semver是一个专门分析Semantic Version（语义化版本）的工具，是一个版本分析器
// node版本 >=8.9
const requiredVersion = require('../package.json').engines.node
const didYouMean = require('didyoumean') // js 匹配引擎，例如输入creat，会提示是否是create

// Setting edit distance to 60% of the input string's length
// 设置didYouMean的提示的匹配距离
didYouMean.threshold = 0.6

// 检查node版本是否满足，否则退出程序，并且传入异常1,chalk.red输入警告文案
// satisfies可以直接比较>=符号；semver.satisfies('1.2.3', '1.x || >=2.5.0 || 5.0.0 - 7.2.3') // true
function checkNodeVersion (wanted, id) {
  if (!semver.satisfies(process.version, wanted)) {
    console.log(chalk.red(
      'You are using Node ' + process.version + ', but this version of ' + id +
      ' requires Node ' + wanted + '.\nPlease upgrade your Node version.'
    ))
    process.exit(1)
  }
}

checkNodeVersion(requiredVersion, 'vue-cli')

if (semver.satisfies(process.version, '9.x')) {
  console.log(chalk.red(
    `You are using Node ${process.version}.\n` +
    `Node.js 9.x has already reached end-of-life and will not be supported in future major releases.\n` +
    `It's strongly recommended to use an active LTS version instead.`
  ))
}

const fs = require('fs')
const path = require('path')
// 转换windows路径，Convert Windows backslash paths to slash paths: foo\\bar ➔ foo/bar
const slash = require('slash')
// 命令行参数解析,解析成对象
//$ node example/parse.js -x 3 -y 4 -n5 -abc --beep=boop foo bar baz
//{ _: [ 'foo', 'bar', 'baz' ],
//  x: 3,
//  y: 4,
//  n: 5,
//  a: true,
//  b: true,
//  c: true,
//  beep: 'boop' }
const minimist = require('minimist')
// enter debug mode when creating test repo
// 如果是在packages/test目录下执行vue相关命令则将开启debug模式
if (
  slash(process.cwd()).indexOf('/packages/test') > 0 && (
    fs.existsSync(path.resolve(process.cwd(), '../@vue')) ||
    fs.existsSync(path.resolve(process.cwd(), '../../@vue'))
  )
) {
  process.env.VUE_CLI_DEBUG = true
}
// commander模块，用于处理node的命令行接口，启发于Ruby's commander.
const program = require('commander')
const loadCommand = require('../lib/util/loadCommand')

// 引入vue版本，这里是3.11
// 设置vue --help的第一行说明usage
program
  .version(require('../package').version)
  .usage('<command> [options]')

// 创建create的command命令，并且设置可选参数和参数的--help说明
// -p代表参数简写，-abc会认为传入的是-a -b -c; action是cmd键入enter后的执行函数
program
  .command('create <app-name>')
  .description('create a new project powered by vue-cli-service')
  .option('-p, --preset <presetName>', 'Skip prompts and use saved or remote preset')
  .option('-d, --default', 'Skip prompts and use default preset')
  .option('-i, --inlinePreset <json>', 'Skip prompts and use inline JSON string as preset')
  .option('-m, --packageManager <command>', 'Use specified npm client when installing dependencies')
  .option('-r, --registry <url>', 'Use specified npm registry when installing dependencies (only for npm)')
  .option('-g, --git [message]', 'Force git initialization with initial commit message')
  .option('-n, --no-git', 'Skip git initialization')
  .option('-f, --force', 'Overwrite target directory if it exists')
  .option('-c, --clone', 'Use git clone when fetching remote preset')
  .option('-x, --proxy', 'Use specified proxy when creating project')
  .option('-b, --bare', 'Scaffold project without beginner instructions')
  .option('--skipGetStarted', 'Skip displaying "Get started" instructions')
  .action((name, cmd) => {
    // name为输入的create后的<app-name>名称。cmd是一个包含以上参数的cmd object对象,其中参数可以直接通过cmd.name获取，例如cmd.force能获取到--force参数
    // 获取设置的option参数
    const options = cleanArgs(cmd)
    // 获取 create <app-name>后的第三个非参数的app-name，如果有，说明<app-name>重复了，将会忽略
    // minimist会将传入的参数分类，不带-的会放在_数组中，其余作为对象
    //$ node example/parse.js -x 3 -y 4 -n5 -abc --beep=boop foo bar baz会输出{ _: [ 'foo', 'bar', 'baz' ],x: 3,y: 4,.....
    if (minimist(process.argv.slice(3))._.length > 1) {
      console.log(chalk.yellow('\n Info: You provided more than one argument. The first one will be used as the app\'s name, the rest are ignored.'))
    }
    // --git makes commander to default git to true
    // 设置强制使用git仓库地址为true
    if (process.argv.includes('-g') || process.argv.includes('--git')) {
      options.forceGit = true
    }
    // 开始创建流程，传入name和传入的参数options
    require('../lib/create')(name, options)
  })
// 添加add命令，plugin为必须传入，pluginOptions选传
// 指定npm源registry,
// 例如执行 vue add cccc会去拉取https://registry.npm.taobao.org/vue-cli-plugin-cccc文件
program
  .command('add <plugin> [pluginOptions]')
  .description('install a plugin and invoke its generator in an already created project')
  .option('--registry <url>', 'Use specified npm registry when installing dependencies (only for npm)')
  .allowUnknownOption()
  .action((plugin) => {
    require('../lib/add')(plugin, minimist(process.argv.slice(3)))
  })
// 在已有的项目中重新跑一遍cli初始化流程
program
  .command('invoke <plugin> [pluginOptions]')
  .description('invoke the generator of a plugin in an already created project')
  .option('--registry <url>', 'Use specified npm registry when installing dependencies (only for npm)')
  .allowUnknownOption()
  .action((plugin) => {
    require('../lib/invoke')(plugin, minimist(process.argv.slice(3)))
  })
// vue-cli-service监控webpack 的配置
// 在一个已经本地安装了vue-cli-service的项目中执行inspect,将会打印出webpack的所有config配置，方便我们查看,可以带参数可以过滤想看的配置
// 例如vue inspect --rules将会输出['vue','images','svg','media','fonts','pug','css','postcss','scss','sass','less','stylus','js','eslint']
program
  .command('inspect [paths...]')
  .description('inspect the webpack config in a project with vue-cli-service')
  .option('--mode <mode>')
  .option('--rule <ruleName>', 'inspect a specific module rule')
  .option('--plugin <pluginName>', 'inspect a specific plugin')
  .option('--rules', 'list all module rule names')
  .option('--plugins', 'list all plugin names')
  .option('-v --verbose', 'Show full function definitions in output')
  .action((paths, cmd) => {
    require('../lib/inspect')(paths, cleanArgs(cmd))
  })
// 0配置build一个js或者.vue的文件,用于快速创建原型
program
  .command('build [entry]')
  .description('build a .js or .vue file in production mode with zero config')
  .option('-t, --target <target>', 'Build target (app | lib | wc | wc-async, default: app)')
  .option('-n, --name <name>', 'name for lib or web-component mode (default: entry filename)')
  .option('-d, --dest <dir>', 'output directory (default: dist)')
  .action((entry, cmd) => {
    loadCommand('build', '@vue/cli-service-global').build(entry, cleanArgs(cmd))
  })
// 代开vue-cli ui浏览器配置,可以指定端口号，host等,需要node版本大于等于8.6
program
  .command('ui')
  .description('start and open the vue-cli ui')
  .option('-H, --host <host>', 'Host used for the UI server (default: localhost)')
  .option('-p, --port <port>', 'Port used for the UI server (by default search for available port)')
  .option('-D, --dev', 'Run in dev mode')
  .option('--quiet', `Don't output starting messages`)
  .option('--headless', `Don't open browser on start and output port`)
  .action((cmd) => {
    checkNodeVersion('>=8.6', 'vue ui')
    require('../lib/ui')(cleanArgs(cmd))
  })
// 和vue-cli2一样，从远程地址初始化一个init项目，可以指定从远程下载或者本地缓存
program
  .command('init <template> <app-name>')
  .description('generate a project from a remote template (legacy API, requires @vue/cli-init)')
  .option('-c, --clone', 'Use git clone when fetching remote template')
  .option('--offline', 'Use cached template')
  .action(() => {
    loadCommand('init', '@vue/cli-init')
  })
// 修改C:\Users\Administrator\.vuerc 内的配置，该配置指定了cli脚手架的默认配置，例如{"useTaobaoRegistry": true,"packageManager": "yarn"}；可以获取，设置，或者用默认编辑器打开等
program
  .command('config [value]')
  .description('inspect and modify the config')
  .option('-g, --get <path>', 'get value from option')
  .option('-s, --set <path> <value>', 'set option value')
  .option('-d, --delete <path>', 'delete option from config')
  .option('-e, --edit', 'open config with default editor')
  .option('--json', 'outputs JSON result only')
  .action((value, cmd) => {
    require('../lib/config')(value, cleanArgs(cmd))
  })
// 升级cli 的service,plugin
program
  .command('upgrade [semverLevel]')
  .description('upgrade vue cli service / plugins (default semverLevel: minor)')
  .action((semverLevel, cmd) => {
    loadCommand('upgrade', '@vue/cli-upgrade')(semverLevel, cleanArgs(cmd))
  })
// 打印debugg环境信息,调用envinfo库打印出相关信息
program
  .command('info')
  .description('print debugging information about your environment')
  .action((cmd) => {
    console.log(chalk.bold('\nEnvironment Info:'))
    require('envinfo').run(
      {
        System: ['OS', 'CPU'],
        Binaries: ['Node', 'Yarn', 'npm'],
        Browsers: ['Chrome', 'Edge', 'Firefox', 'Safari'],
        npmPackages: '/**/{typescript,*vue*,@vue/*/}',
        npmGlobalPackages: ['@vue/cli']
      },
      {
        showNotFound: true,
        duplicates: true,
        fullTree: true
      }
    ).then(console.log)
  })
// output help information on unknown commands
// 顶级命令，未知命令调用help，并且提供suggest commands相似命令
program
  .arguments('<command>')
  .action((cmd) => {
    program.outputHelp()
    console.log(`  ` + chalk.red(`Unknown command ${chalk.yellow(cmd)}.`))
    console.log()
    suggestCommands(cmd)
  })

// add some useful info on help 
// 添加一些额外的help信息
program.on('--help', () => {
  console.log()
  console.log(`  Run ${chalk.cyan(`vue <command> --help`)} for detailed usage of given command.`)
  console.log()
})
// 给每一个指令添加一个--help参数的输出，例如vue create --help可以输出该command的相关help信息
program.commands.forEach(c => c.on('--help', () => console.log()))
// enhance common error messages
// 对通用错误进行包装
const enhanceErrorMessages = require('../lib/util/enhanceErrorMessages')
enhanceErrorMessages('missingArgument', argName => {
  return `Missing required argument ${chalk.yellow(`<${argName}>`)}.`
})

enhanceErrorMessages('unknownOption', optionName => {
  return `Unknown option ${chalk.yellow(optionName)}.`
})

enhanceErrorMessages('optionMissingArgument', (option, flag) => {
  return `Missing required argument for option ${chalk.yellow(option.flags)}` + (
    flag ? `, got ${chalk.yellow(flag)}` : ``
  )
})
// 处理参数，将任何未被program.option选项列出的用户输入参数放到program.args数组中
program.parse(process.argv)
// 传入参数少于2则输出help
if (!process.argv.slice(2).length) {
  program.outputHelp()
}
```


  

